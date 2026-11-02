/**
 * Live column probe and vertical cross-section.
 *
 * Packed on the worker from the current fields. The main thread never
 * holds those arrays during a live run.
 */
import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import { columnIndices, type ColumnIndices } from "./mapDerived";
import {
  coldReflectivityMass,
  reflectivityDbz,
  writeReflectivityRgba,
} from "./mapProducts";
import { columnBaseK } from "./surface";
import { CP, LV, TFromTheta, dewpointFromE } from "./thermo";

export interface ProbeRequest {
  i: number;
  j: number;
}

export type SectionVariable = "refl" | "thetae" | "w";

export interface SectionRequest {
  i0: number;
  j0: number;
  i1: number;
  j1: number;
  variable: SectionVariable;
}

/** One column: levels are nz × 6 (z m, p hPa, T °C, Td °C, u, v m/s). */
export interface ColumnProbe {
  i: number;
  j: number;
  xKm: number;
  yKm: number;
  nz: number;
  levels: Float32Array;
  indices: ColumnIndices;
  t: number;
  dbz: number;
  w: number;
  rain: number;
}

export interface SectionImage {
  width: number;
  nz: number;
  lengthKm: number;
  variable: SectionVariable;
  rgba: Uint8Array;
}

const THETAE_STOPS: [number, number, number, number][] = [
  [0, 43, 108, 179],
  [0.35, 167, 200, 206],
  [0.55, 232, 209, 134],
  [0.75, 226, 123, 18],
  [1, 220, 65, 16],
];

const W_STOPS: [number, number, number, number][] = [
  [0, 43, 108, 179],
  [0.25, 128, 165, 210],
  [0.5, 238, 238, 238],
  [0.75, 226, 123, 18],
  [1, 220, 65, 16],
];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function paintRamp(
  t: number,
  stops: [number, number, number, number][],
  out: Uint8Array,
  o: number,
): void {
  const u = clamp(t, 0, 1);
  let i = 0;
  while (i < stops.length - 1 && u > stops[i + 1][0]) i++;
  const a = stops[i];
  const b = stops[Math.min(stops.length - 1, i + 1)];
  const span = Math.max(1e-6, b[0] - a[0]);
  const f = (u - a[0]) / span;
  out[o] = Math.round(a[1] + (b[1] - a[1]) * f);
  out[o + 1] = Math.round(a[2] + (b[2] - a[2]) * f);
  out[o + 2] = Math.round(a[3] + (b[3] - a[3]) * f);
  out[o + 3] = 255;
}

function dewpointC(qv: number, p: number): number {
  if (qv <= 1e-12) return -80;
  const e = (qv * p) / (0.622 + qv);
  return dewpointFromE(Math.max(1, e));
}

export function sampleColumn(
  grid: Grid3D,
  f: SimFields,
  i: number,
  j: number,
  time: number,
): ColumnProbe | null {
  if (i < 0 || j < 0 || i >= grid.nx || j >= grid.ny) return null;
  const { nz, dx, dy } = grid;
  const levels = new Float32Array(nz * 6);
  const k0 = columnBaseK(grid.nx, i, j);
  let dbz = -30;
  let wMax = 0;
  const openId = grid.idx(i, j, k0);
  const openP = f.p0[k0];
  const openT = TFromTheta(f.theta[openId], openP);
  const openQv = Math.max(0, f.qv[openId]);
  const openU = grid.uCenter(f.u, i, j, k0);
  const openV = grid.vCenter(f.v, i, j, k0);
  for (let k = 0; k < nz; k++) {
    const blocked = k < k0;
    const id = blocked ? openId : grid.idx(i, j, k);
    const p = blocked ? openP : f.p0[k];
    const T = blocked ? openT : TFromTheta(f.theta[id], p);
    const qv = blocked ? openQv : Math.max(0, f.qv[id]);
    const u = blocked ? openU : grid.uCenter(f.u, i, j, k);
    const v = blocked ? openV : grid.vCenter(f.v, i, j, k);
    const w = blocked ? 0 : grid.wCenter(f.w, i, j, k);
    const o = k * 6;
    levels[o] = (k + 0.5) * grid.dz;
    levels[o + 1] = p / 100;
    levels[o + 2] = T - 273.15;
    levels[o + 3] = Math.min(T - 273.15, dewpointC(qv, p));
    levels[o + 4] = u;
    levels[o + 5] = v;
    if (blocked) continue;
    if (w > wMax) wMax = w;
    const refl = reflectivityDbz(f.qr[id], f.qc[id], w, coldReflectivityMass(f, id));
    if (refl > dbz) dbz = refl;
  }
  return {
    i,
    j,
    xKm: ((i + 0.5) * dx) / 1000,
    yKm: ((j + 0.5) * dy) / 1000,
    nz,
    levels,
    indices: columnIndices(grid, f, i, j),
    t: time,
    dbz,
    w: wMax,
    rain: Math.max(0, f.precipRate[i + j * grid.nx] || 0),
  };
}

function thetaE(f: SimFields, id: number, k: number): number {
  const p = f.p0[k];
  const T = TFromTheta(f.theta[id], p);
  const qv = Math.max(0, f.qv[id]);
  return f.theta[id] * Math.exp((LV * qv) / (CP * Math.max(T, 1)));
}

/** Nearest-cell curtain, at most 160 columns. Row 0 of the image is the top. */
export function sampleSection(
  grid: Grid3D,
  f: SimFields,
  req: SectionRequest,
): SectionImage {
  const { nx, ny, nz } = grid;
  const i0 = clamp(Math.round(req.i0), 0, nx - 1);
  const j0 = clamp(Math.round(req.j0), 0, ny - 1);
  const i1 = clamp(Math.round(req.i1), 0, nx - 1);
  const j1 = clamp(Math.round(req.j1), 0, ny - 1);
  const cells = Math.hypot(i1 - i0, j1 - j0);
  const width = clamp(Math.round(cells) + 1, 2, 160);
  const rgba = new Uint8Array(width * nz * 4);
  const variable = req.variable;
  for (let s = 0; s < width; s++) {
    const t = width === 1 ? 0 : s / (width - 1);
    const i = clamp(Math.round(i0 + (i1 - i0) * t), 0, nx - 1);
    const j = clamp(Math.round(j0 + (j1 - j0) * t), 0, ny - 1);
    const k0 = columnBaseK(nx, i, j);
    for (let k = 0; k < nz; k++) {
      const id = grid.idx(i, j, k);
      const o = (s + (nz - 1 - k) * width) * 4;
      if (k < k0) {
        rgba[o] = 90;
        rgba[o + 1] = 78;
        rgba[o + 2] = 62;
        rgba[o + 3] = 255;
        continue;
      }
      if (variable === "refl") {
        const w = grid.wCenter(f.w, i, j, k);
        writeReflectivityRgba(
          reflectivityDbz(f.qr[id], f.qc[id], w, coldReflectivityMass(f, id)),
          rgba,
          o,
        );
      } else if (variable === "thetae") {
        const te = thetaE(f, id, k);
        paintRamp((te - 320) / 60, THETAE_STOPS, rgba, o);
      } else {
        const w = grid.wCenter(f.w, i, j, k);
        paintRamp((w + 20) / 40, W_STOPS, rgba, o);
      }
    }
  }
  const lengthKm =
    Math.hypot((i1 - i0) * grid.dx, (j1 - j0) * grid.dy) / 1000;
  return { width, nz, lengthKm, variable, rgba };
}
