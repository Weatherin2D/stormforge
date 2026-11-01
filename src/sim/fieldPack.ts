import { Grid3D, volumeDisplaySize } from "./Grid3D";
import type { SimFields } from "./InitFromSounding";
import { qsat, TFromTheta } from "./thermo";
import {
  type OverlayField,
  FIELD_INFO,
  SWATH_COLORS,
} from "../render/fields";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Pack rain+snow accumulation into an RGBA swath (nx×ny), MeteoLAB colours. */
export function packRainSwath(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
): void {
  const { nx, ny } = grid;
  const n = nx * ny;
  if (out.length < n * 4) return;
  for (let i = 0; i < n; i++) {
    const mm =
      Math.max(0, f.rainAccum[i] || 0) + Math.max(0, f.snowAccum[i] || 0);
    const rgb =
      SWATH_COLORS.find(([limit]) => mm < limit)?.[1] ??
      SWATH_COLORS[SWATH_COLORS.length - 1][1];
    const o = i * 4;
    out[o] = rgb[0];
    out[o + 1] = rgb[1];
    out[o + 2] = rgb[2];
    out[o + 3] = mm < 0.5 ? 0 : Math.min(230, 120 + mm * 10);
  }
}

/** Surface cold-pool shade: θ deficit vs base state (nx×ny RGBA). */
export function packColdPoolMap(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
): void {
  const { nx, ny } = grid;
  const th0 = f.theta0[0];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const deficit = Math.max(0, th0 - f.theta[grid.idx(i, j, 0)]);
      const t = clamp01(deficit / 8);
      const o = (i + j * nx) * 4;
      // Cool blue over cold air; transparent when warm.
      out[o] = 30;
      out[o + 1] = 80 + t * 40;
      out[o + 2] = 160 + t * 60;
      out[o + 3] = t < 0.08 ? 0 : Math.min(160, 40 + t * 180);
    }
  }
}

function sampleW(f: SimFields, grid: Grid3D, i: number, j: number, k: number): number {
  // Cell-center w ≈ average of faces.
  const a = f.w[grid.wIdx(i, j, k)];
  const b = f.w[grid.wIdx(i, j, k + 1)];
  return 0.5 * (a + b);
}

function sampleZeta(
  f: SimFields,
  grid: Grid3D,
  i: number,
  j: number,
  k: number,
): number {
  // ζ ≈ ∂v/∂x − ∂u/∂y at cell centre from C-grid faces.
  const { nx, ny, dx, dy } = grid;
  const im = Math.max(0, i - 1);
  const ip = Math.min(nx - 1, i + 1);
  const jm = Math.max(0, j - 1);
  const jp = Math.min(ny - 1, j + 1);
  const vR = f.v[grid.vIdx(ip, j, k)];
  const vL = f.v[grid.vIdx(im, j, k)];
  const uN = f.u[grid.uIdx(i, jp, k)];
  const uS = f.u[grid.uIdx(i, jm, k)];
  return (vR - vL) / (2 * dx) - (uN - uS) / (2 * dy);
}

function fieldAt(
  mode: Exclude<OverlayField, "off">,
  grid: Grid3D,
  f: SimFields,
  i: number,
  j: number,
  k: number,
): number {
  const id = grid.idx(i, j, k);
  switch (mode) {
    case "updraft":
      return sampleW(f, grid, i, j, k);
    case "theta":
      return f.theta[id] - f.theta0[k];
    case "moisture": {
      const T = TFromTheta(f.theta[id], f.p0[k]);
      const qs = qsat(T, f.p0[k]);
      return qs > 1e-8 ? Math.min(1, f.qv[id] / qs) * 100 : 0;
    }
    case "vorticity":
      return sampleZeta(f, grid, i, j, k) * 1e3;
    case "coldpool":
      return Math.max(0, f.theta0[k] - f.theta[id]);
  }
}

/**
 * Pack a scalar field into a display-sized Red volume (1 byte/voxel) or RGBA
 * with the value in R (preferred — Three Data3DTexture RedFormat support varies).
 * Layout matches packVolumeRGBA: X east, Y up in texture Z, north = −world Z.
 */
export function packFieldVolume(
  mode: Exclude<OverlayField, "off">,
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
): void {
  const info = FIELD_INFO[mode];
  const span = info.max - info.min || 1;
  const d = volumeDisplaySize(grid.nx, grid.ny, grid.nz);
  const need = d.nx * d.ny * d.nz * 4;
  if (out.length < need) return;

  const write = (i: number, j: number, k: number, o: number) => {
    const v = fieldAt(mode, grid, f, i, j, k);
    const n = clamp01((v - info.min) / span);
    const b = (n * 255) | 0;
    out[o] = b;
    out[o + 1] = b;
    out[o + 2] = b;
    out[o + 3] = 255;
  };

  for (let k = 0; k < d.nz; k++) {
    const ks = Math.min(grid.nz - 1, k * d.sz);
    for (let j = 0; j < d.ny; j++) {
      const js = Math.min(grid.ny - 1, j * d.sy);
      const row = k + d.nz * (d.ny - 1 - j);
      for (let i = 0; i < d.nx; i++) {
        const is = Math.min(grid.nx - 1, i * d.sx);
        write(is, js, ks, (i + d.nx * row) * 4);
      }
    }
  }
}

export interface VortexLevel {
  /** Domain metres from SW corner: x east, y north, z up. */
  x: number;
  y: number;
  z: number;
  radius: number;
  zeta: number;
}

/**
 * Find the strongest rotating updraft column (2–5 km) and return rings for it.
 * Simplified stand-in for MeteoLAB's CellTracker vortex.
 */
export function findVortexColumn(
  grid: Grid3D,
  f: SimFields,
): VortexLevel[] {
  const { nx, ny, nz, dx, dy, dz } = grid;
  const kLo = Math.max(1, Math.floor(2000 / dz));
  const kHi = Math.min(nz - 2, Math.ceil(5000 / dz));
  let bestI = -1;
  let bestJ = -1;
  let bestUh = 0;
  for (let j = 1; j < ny - 1; j++) {
    for (let i = 1; i < nx - 1; i++) {
      let uh = 0;
      for (let k = kLo; k <= kHi; k++) {
        const w = sampleW(f, grid, i, j, k);
        if (w < 5) continue;
        const z = sampleZeta(f, grid, i, j, k);
        uh += w * z * dz;
      }
      if (uh > bestUh) {
        bestUh = uh;
        bestI = i;
        bestJ = j;
      }
    }
  }
  if (bestI < 0 || bestUh < 40) return [];

  const levels: VortexLevel[] = [];
  const ZETA_MIN = 0.008;
  for (let k = 1; k < nz - 1; k++) {
    const w = sampleW(f, grid, bestI, bestJ, k);
    const zeta = sampleZeta(f, grid, bestI, bestJ, k);
    if (w < 3 || zeta < ZETA_MIN) continue;
    // Radius from how far ζ stays strong around the core.
    let radius = dx;
    for (let r = 1; r <= 6; r++) {
      let ok = 0;
      let n = 0;
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        const ii = Math.round(bestI + r * Math.cos(ang));
        const jj = Math.round(bestJ + r * Math.sin(ang));
        if (ii < 1 || jj < 1 || ii >= nx - 1 || jj >= ny - 1) continue;
        n++;
        if (sampleZeta(f, grid, ii, jj, k) > ZETA_MIN * 0.5) ok++;
      }
      if (n && ok / n >= 0.4) radius = r * dx;
      else break;
    }
    levels.push({
      x: (bestI + 0.5) * dx,
      y: (bestJ + 0.5) * dy,
      z: (k + 0.5) * dz,
      radius,
      zeta,
    });
  }
  return levels;
}

/** Flatten vortex levels for worker transfer: [x,y,z,r,zeta, ...]. */
export function packVortexLevels(levels: VortexLevel[]): Float32Array {
  const out = new Float32Array(levels.length * 5);
  for (let i = 0; i < levels.length; i++) {
    const l = levels[i];
    const o = i * 5;
    out[o] = l.x;
    out[o + 1] = l.y;
    out[o + 2] = l.z;
    out[o + 3] = l.radius;
    out[o + 4] = l.zeta;
  }
  return out;
}

export function unpackVortexLevels(data: Float32Array | null): VortexLevel[] {
  if (!data || data.length < 5) return [];
  const out: VortexLevel[] = [];
  for (let i = 0; i + 4 < data.length; i += 5) {
    out.push({
      x: data[i],
      y: data[i + 1],
      z: data[i + 2],
      radius: data[i + 3],
      zeta: data[i + 4],
    });
  }
  return out;
}
