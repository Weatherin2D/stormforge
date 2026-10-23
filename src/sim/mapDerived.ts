/**
 * Derived 2D map products built from the live model state.
 *
 * Every product here is computed from fields the solver actually carries.
 * The matching catalog entry in `viewCatalog.ts` documents the formula and
 * assumptions.  Nothing in this file invents a field the model does not have:
 * terrain, soil, radiation, electric charge, and object-tracking products stay
 * "planned" until their inputs exist.
 */
import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import {
  CP,
  G,
  LV,
  P0,
  RD,
  RV,
  TFromTheta,
  dewpointFromE,
  esatFast,
  qsat,
} from "./thermo";

export type DerivedProductId =
  // Instability and parcel diagnostics
  | "mlcape"
  | "mucape"
  | "li"
  | "showalter"
  | "kindex"
  | "totaltotals"
  | "lapse700500"
  | "lapse03"
  | "wbz"
  | "convtemp"
  | "dcape"
  | "capeshear"
  // Moisture and surface thermodynamics
  | "dptdep"
  | "qsfc"
  | "mixratio"
  | "mflux"
  | "dryint"
  | "blrh"
  | "wetbulb"
  | "evappot"
  // Clouds
  | "cice"
  | "iwp"
  | "cttemp"
  | "cdepth"
  | "overshoot"
  | "ctdiv"
  | "downdraft"
  // Wind and dynamics
  | "w925"
  | "w700"
  | "w500"
  | "w300"
  | "w200"
  | "omega"
  | "shear08"
  | "srh01"
  | "srh03"
  | "srw"
  | "brn"
  | "llj"
  | "ulj"
  | "ucomp"
  | "vcomp"
  // Precipitation and synoptic
  | "virga"
  | "vildensity"
  | "hydrometeor"
  | "rainrate"
  | "snowrate"
  | "z500"
  | "thickness"
  | "tropopause"
  | "vortadv"
  | "coldpool"
  | "pgrad"
  | "tgrad"
  | "tdgrad";

type Stop = [number, number, number, number];

/** Same dark map-panel background used by the main product packer. */
const BG: Stop = [0, 10, 16, 28];

/** Normalized ramps, position 0..1. */
const SCALAR_RAMP: Stop[] = [
  [0, 0, 10, 16],
  [0.12, 28, 58, 116],
  [0.32, 34, 132, 196],
  [0.5, 48, 186, 148],
  [0.68, 214, 220, 74],
  [0.84, 244, 134, 38],
  [0.95, 220, 40, 60],
  [1, 208, 92, 226],
];

const DIVERGING_RAMP: Stop[] = [
  [0, 36, 70, 236],
  [0.25, 118, 176, 246],
  [0.5, 238, 238, 238],
  [0.75, 248, 156, 132],
  [1, 238, 32, 32],
];

const COLD_RAMP: Stop[] = [
  [0, 164, 0, 210],
  [0.2, 86, 84, 230],
  [0.38, 48, 150, 240],
  [0.55, 56, 210, 210],
  [0.7, 80, 200, 92],
  [0.84, 250, 220, 54],
  [0.94, 248, 138, 42],
  [1, 224, 36, 36],
];

const HYDRO_STOPS: Stop[] = [
  [0, 20, 26, 36],
  [1, 64, 128, 220],
  [2, 56, 176, 96],
  [3, 90, 206, 226],
  [4, 236, 242, 250],
  [5, 244, 154, 42],
  [6, 220, 72, 232],
];

/** CSS gradients used by the legend bar.  The ramps above match them. */
export const DERIVED_LEGENDS = {
  scalar:
    "linear-gradient(90deg,#000a10 0%,#1c3a74 12%,#2284c4 32%,#30ba94 50%,#d6dc4a 68%,#f48626 84%,#dc283c 95%,#d05ce2 100%)",
  diverging:
    "linear-gradient(90deg,#2446ec 0%,#76b0f6 25%,#eeeeee 50%,#f89c84 75%,#ee2020 100%)",
  cold:
    "linear-gradient(90deg,#a400d2 0%,#5654e6 20%,#3096f0 38%,#38d2d2 55%,#50c85c 70%,#fadc36 84%,#f88a2a 94%,#e02424 100%)",
  hydro:
    "linear-gradient(90deg,#141a24 0%,#4080dc 16.7%,#38b060 33.3%,#5acee2 50%,#ecf2fa 66.7%,#f49a2a 83.3%,#dc48e8 100%)",
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function mapPix(i: number, j: number, nx: number, ny: number): number {
  return (i + (ny - 1 - j) * nx) * 4;
}

function lerpStops(
  value: number,
  stops: Stop[],
  out: Uint8Array,
  o: number,
): void {
  let i = 0;
  while (i < stops.length - 1 && value > stops[i + 1][0]) i++;
  const a = stops[i];
  const b = stops[Math.min(stops.length - 1, i + 1)];
  const t =
    a[0] === b[0] ? 0 : (value - a[0]) / Math.max(1e-6, b[0] - a[0]);
  out[o] = (a[1] + (b[1] - a[1]) * t) | 0;
  out[o + 1] = (a[2] + (b[2] - a[2]) * t) | 0;
  out[o + 2] = (a[3] + (b[3] - a[3]) * t) | 0;
  out[o + 3] = 255;
}

function paintNorm(
  value: number,
  min: number,
  max: number,
  ramp: Stop[],
  out: Uint8Array,
  o: number,
): void {
  const finite = Number.isFinite(value) ? value : min;
  const t = (finite - min) / Math.max(1e-6, max - min);
  lerpStops(clamp(t, 0, 1), ramp, out, o);
}

function paintSigned(
  value: number,
  maxAbs: number,
  out: Uint8Array,
  o: number,
): void {
  paintNorm(value, -maxAbs, maxAbs, DIVERGING_RAMP, out, o);
}

function paintCold(
  tempC: number,
  out: Uint8Array,
  o: number,
): void {
  paintNorm(tempC, -80, 20, COLD_RAMP, out, o);
}

function paintBackground(out: Uint8Array, o: number): void {
  out[o] = BG[1];
  out[o + 1] = BG[2];
  out[o + 2] = BG[3];
  out[o + 3] = 255;
}

/** Index of the model level whose pressure is closest to `pPa`. */
function pressureLevelK(f: SimFields, pPa: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < f.p0.length; k++) {
    const d = Math.abs(f.p0[k] - pPa);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/** Interpolate the scratch profile pressure at geometric height `z`. */
function pressureAtHeight(z: number): number {
  if (profZ.length === 0) return P0;
  if (z <= profZ[0]) return profP[0];
  for (let k = 1; k < profZ.length; k++) {
    if (profZ[k] >= z) {
      const dz = Math.max(1e-3, profZ[k] - profZ[k - 1]);
      const t = (z - profZ[k - 1]) / dz;
      return profP[k - 1] + (profP[k] - profP[k - 1]) * t;
    }
  }
  return profP[profP.length - 1];
}

function tempAt(f: SimFields, id: number, k: number): number {
  return TFromTheta(f.theta[id], f.p0[k]);
}

function dewpointAt(f: SimFields, id: number, k: number): number {
  const qv = Math.max(0, f.qv[id]);
  if (qv <= 1e-12) return 100; // K, effectively -173 °C
  const e = (qv * f.p0[k]) / (0.622 + qv);
  return dewpointFromE(Math.max(1, e)) + 273.15;
}

function rhAt(f: SimFields, id: number, k: number): number {
  const T = tempAt(f, id, k);
  const qs = qsat(T, f.p0[k]);
  return qs > 1e-12 ? clamp((Math.max(0, f.qv[id]) / qs) * 100, 0, 100) : 0;
}

/* ── parcel machinery ───────────────────────────────────────────────────── */

let profZ = new Float64Array(0);
let profP = new Float64Array(0);
let profT = new Float64Array(0);
let profTd = new Float64Array(0);
let profQv = new Float64Array(0);
let profN = 0;

function ensureProfile(n: number): void {
  if (n <= profN) return;
  profN = n;
  profZ = new Float64Array(n);
  profP = new Float64Array(n);
  profT = new Float64Array(n);
  profTd = new Float64Array(n);
  profQv = new Float64Array(n);
}

function buildProfile(
  grid: Grid3D,
  f: SimFields,
  i: number,
  j: number,
): number {
  const nz = grid.nz;
  ensureProfile(nz);
  for (let k = 0; k < nz; k++) {
    const id = grid.idx(i, j, k);
    profZ[k] = (k + 0.5) * grid.dz;
    profP[k] = f.p0[k];
    profT[k] = TFromTheta(f.theta[id], f.p0[k]);
    profTd[k] = Math.min(profT[k], dewpointAt(f, id, k));
    profQv[k] = Math.max(0, f.qv[id]);
  }
  return nz;
}

interface ParcelMetrics {
  cape: number;
  cin: number;
  lfc: number;
  el: number;
  t500: number;
}

/** Saturated moist-adiabatic lapse rate (K/m). */
function moistLapse(T: number, p: number): number {
  const es = esatFast(Math.max(180, T));
  const rs = (0.622 * es) / Math.max(p - es, 1);
  const num = G * (1 + (LV * rs) / (RD * Math.max(T, 1)));
  const den = CP + (LV * LV * rs) / (RV * Math.max(T, 1) * Math.max(T, 1));
  return clamp(num / Math.max(den, 1), 0.002, 0.0098);
}

/**
 * Lift a parcel from `start` upward.  The parcel is dry-adiabatic to its LCL
 * and saturated above it; the environment is read from the scratch profile.
 */
function parcelMetrics(
  n: number,
  start: number,
  tStart: number,
  tdStart: number,
): ParcelMetrics {
  const result: ParcelMetrics = {
    cape: 0,
    cin: 0,
    lfc: 0,
    el: 0,
    t500: tStart,
  };
  if (n < 2 || start >= n - 1) return result;

  const tC = tStart - 273.15;
  const tdC = Math.min(tStart, tdStart) - 273.15;
  const lclZ = profZ[start] + Math.max(0, 125 * (tC - tdC));
  const thetaP = tStart * Math.pow(P0 / Math.max(profP[start], 1), RD / CP);
  const pLcl = pressureAtHeight(lclZ);
  const tLcl = thetaP * Math.pow(Math.max(pLcl, 1) / P0, RD / CP);
  let tp = tStart;
  let zPrev = profZ[start];
  let aboveLcl = false;
  let bestP = Infinity;

  for (let k = start + 1; k < n; k++) {
    const dz = profZ[k] - profZ[k - 1];
    if (dz <= 0) continue;
    const zMid = 0.5 * (profZ[k] + profZ[k - 1]);
    const pMid = 0.5 * (profP[k] + profP[k - 1]);
    const tEnv = 0.5 * (profT[k] + profT[k - 1]);

    let tParcel: number;
    if (zMid < lclZ) {
      tParcel = thetaP * Math.pow(Math.max(pMid, 1) / P0, RD / CP);
      tp = tParcel;
      zPrev = zMid;
    } else {
      if (!aboveLcl) {
        tp = tLcl;
        zPrev = lclZ;
        aboveLcl = true;
      }
      const climb = Math.max(0, zMid - zPrev);
      if (climb > 0) {
        tp -= moistLapse(tp, pMid) * climb;
        zPrev = zMid;
      }
      tParcel = tp;
    }

    if (Math.abs(pMid - 50000) < Math.abs(bestP - 50000)) {
      bestP = pMid;
      result.t500 = tParcel;
    }

    const buoyancy = G * ((tParcel - tEnv) / Math.max(tEnv, 1));
    if (buoyancy > 0) {
      if (result.lfc === 0) result.lfc = zMid;
      result.el = zMid;
      result.cape += buoyancy * dz;
    } else if (result.lfc === 0) {
      result.cin += -buoyancy * dz;
    }
  }

  result.cape = Math.max(0, result.cape);
  result.cin = Math.max(0, result.cin);
  return result;
}

function mixedLayerParcel(n: number): { t: number; td: number } {
  const pSfc = profP[0];
  const pTop = pSfc - 10000;
  let thetaSum = 0;
  let qvSum = 0;
  let count = 0;
  for (let k = 0; k < n; k++) {
    if (profP[k] < pTop) break;
    thetaSum += profT[k] * Math.pow(P0 / Math.max(profP[k], 1), RD / CP);
    qvSum += profQv[k];
    count++;
  }
  const thetaMean = count > 0 ? thetaSum / count : profT[0];
  const qvMean = count > 0 ? qvSum / count : profQv[0];
  const t = thetaMean * Math.pow(Math.max(pSfc, 1) / P0, RD / CP);
  const e = (qvMean * pSfc) / (0.622 + qvMean);
  return { t, td: Math.min(t, dewpointFromE(Math.max(1, e)) + 273.15) };
}

/** Best (highest θe) parcel in the lowest 3 km. */
function mostUnstableParcel(n: number): { start: number; t: number; td: number } {
  let bestStart = 0;
  let bestThetaE = -Infinity;
  for (let k = 0; k < n; k++) {
    if (profZ[k] > 3000) break;
    const T = profT[k];
    const td = Math.min(T, profTd[k]);
    const qv = Math.max(0, (0.622 * esatFast(td)) / Math.max(profP[k] - esatFast(td), 1));
    const theta = T * Math.pow(P0 / Math.max(profP[k], 1), RD / CP);
    const thetaE = theta * Math.exp((LV * qv) / (CP * Math.max(T, 1)));
    if (thetaE > bestThetaE) {
      bestThetaE = thetaE;
      bestStart = k;
    }
  }
  return {
    start: bestStart,
    t: profT[bestStart],
    td: Math.min(profT[bestStart], profTd[bestStart]),
  };
}

function wetBulbC(tC: number, rh: number): number {
  const r = clamp(rh, 0, 100);
  return (
    tC * Math.atan(0.151977 * Math.sqrt(r + 8.313659)) +
    Math.atan(tC + r) -
    Math.atan(r - 1.676331) +
    0.00391838 * Math.pow(r, 1.5) * Math.atan(0.023101 * r) -
    4.686035
  );
}

function cloudTopIndex(f: SimFields, grid: Grid3D, i: number, j: number): number {
  for (let k = grid.nz - 1; k >= 0; k--) {
    const id = grid.idx(i, j, k);
    if (
      Math.max(0, f.qc[id]) +
        Math.max(0, f.qr[id]) +
        Math.max(0, f.qi[id]) +
        Math.max(0, f.qs[id]) +
        Math.max(0, f.qg[id]) +
        Math.max(0, f.qh[id]) >
      1e-4
    ) {
      return k;
    }
  }
  return -1;
}

function cloudBaseIndex(f: SimFields, grid: Grid3D, i: number, j: number): number {
  for (let k = 0; k < grid.nz; k++) {
    const id = grid.idx(i, j, k);
    if (
      Math.max(0, f.qc[id]) +
        Math.max(0, f.qr[id]) +
        Math.max(0, f.qi[id]) +
        Math.max(0, f.qs[id]) +
        Math.max(0, f.qg[id]) +
        Math.max(0, f.qh[id]) >
      1e-4
    ) {
      return k;
    }
  }
  return -1;
}

function divergenceAt(
  grid: Grid3D,
  f: SimFields,
  i: number,
  j: number,
  k: number,
): number {
  const { nx, ny, dx, dy } = grid;
  const ip = Math.min(nx - 1, i + 1);
  const im = Math.max(0, i - 1);
  const jp = Math.min(ny - 1, j + 1);
  const jm = Math.max(0, j - 1);
  const duDx =
    (grid.uCenter(f.u, ip, j, k) - grid.uCenter(f.u, im, j, k)) /
    Math.max(1e-3, (ip - im) * dx);
  const dvDy =
    (grid.vCenter(f.v, i, jp, k) - grid.vCenter(f.v, i, jm, k)) /
    Math.max(1e-3, (jp - jm) * dy);
  return (duDx + dvDy) * 1e4;
}

/** Column-integrated mixing ratio in g/m². */
function waterPath(
  grid: Grid3D,
  f: SimFields,
  i: number,
  j: number,
  pick: (id: number) => number,
): number {
  let path = 0;
  for (let k = 0; k < grid.nz; k++) {
    path += f.rho0[k] * Math.max(0, pick(grid.idx(i, j, k))) * grid.dz * 1000;
  }
  return path;
}

function echoTopM(grid: Grid3D, f: SimFields, i: number, j: number): number {
  let top = 0;
  for (let k = 0; k < grid.nz; k++) {
    const id = grid.idx(i, j, k);
    const q =
      Math.max(0, f.qr[id]) +
      0.6 * Math.max(0, f.qs[id]) +
      2 * Math.max(0, f.qg[id]) +
      3.5 * Math.max(0, f.qh[id]);
    if (q > 1e-5) top = (k + 0.5) * grid.dz;
  }
  return top;
}

/* ── individual products ────────────────────────────────────────────────── */

function packMlcape(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const n = buildProfile(grid, f, i, j);
      const parcel = mixedLayerParcel(n);
      const m = parcelMetrics(n, 0, parcel.t, parcel.td);
      paintNorm(m.cape, 0, 5000, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packMucape(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const n = buildProfile(grid, f, i, j);
      const parcel = mostUnstableParcel(n);
      const m = parcelMetrics(n, parcel.start, parcel.t, parcel.td);
      paintNorm(m.cape, 0, 5000, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packLiftedIndex(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  const k500 = pressureLevelK(f, 50000);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const n = buildProfile(grid, f, i, j);
      const m = parcelMetrics(n, 0, profT[0], profTd[0]);
      const env500 = profT[k500];
      paintSigned(env500 - m.t500, 10, out, mapPix(i, j, nx, ny));
    }
  }
}

function packShowalter(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  const k850 = pressureLevelK(f, 85000);
  const k500 = pressureLevelK(f, 50000);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const n = buildProfile(grid, f, i, j);
      const m = parcelMetrics(n, k850, profT[k850], profTd[k850]);
      paintSigned(profT[k500] - m.t500, 8, out, mapPix(i, j, nx, ny));
    }
  }
}

function packKIndex(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  const k850 = pressureLevelK(f, 85000);
  const k700 = pressureLevelK(f, 70000);
  const k500 = pressureLevelK(f, 50000);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id850 = grid.idx(i, j, k850);
      const id700 = grid.idx(i, j, k700);
      const id500 = grid.idx(i, j, k500);
      const t850 = tempAt(f, id850, k850) - 273.15;
      const t700 = tempAt(f, id700, k700) - 273.15;
      const t500 = tempAt(f, id500, k500) - 273.15;
      const td850 = dewpointAt(f, id850, k850) - 273.15;
      const td700 = dewpointAt(f, id700, k700) - 273.15;
      const ki = t850 - t500 + td850 - (t700 - td700);
      paintNorm(ki, 0, 50, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packTotalTotals(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  const k850 = pressureLevelK(f, 85000);
  const k500 = pressureLevelK(f, 50000);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id850 = grid.idx(i, j, k850);
      const id500 = grid.idx(i, j, k500);
      const t850 = tempAt(f, id850, k850) - 273.15;
      const td850 = dewpointAt(f, id850, k850) - 273.15;
      const t500 = tempAt(f, id500, k500) - 273.15;
      paintNorm(t850 + td850 - 2 * t500, 40, 70, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packLapse700500(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  const k700 = pressureLevelK(f, 70000);
  const k500 = pressureLevelK(f, 50000);
  const dz = ((k500 - k700) * grid.dz) / 1000;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const t700 = tempAt(f, grid.idx(i, j, k700), k700);
      const t500 = tempAt(f, grid.idx(i, j, k500), k500);
      paintNorm((t700 - t500) / Math.max(dz, 0.1), 3, 10, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packLapse03(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz, dz } = grid;
  const k3 = Math.min(nz - 1, Math.round(3000 / Math.max(dz, 1)));
  const dzKm = ((k3) * dz) / 1000;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const t0 = tempAt(f, grid.idx(i, j, 0), 0);
      const t3 = tempAt(f, grid.idx(i, j, k3), k3);
      paintNorm((t0 - t3) / Math.max(dzKm, 0.1), 3, 10, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packWbz(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let height = 0;
      let prev = wetBulbC(tempAt(f, grid.idx(i, j, 0), 0) - 273.15, rhAt(f, grid.idx(i, j, 0), 0));
      for (let k = 1; k < nz; k++) {
        const id = grid.idx(i, j, k);
        const tw = wetBulbC(tempAt(f, id, k) - 273.15, rhAt(f, id, k));
        if (prev > 0 && tw <= 0) {
          const frac = (prev - 0) / Math.max(1e-6, prev - tw);
          height = (k - 1 + frac + 0.5) * grid.dz;
          break;
        }
        prev = tw;
      }
      paintNorm(height, 0, 5000, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packConvTemp(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const n = buildProfile(grid, f, i, j);
      const m = parcelMetrics(n, 0, profT[0], profTd[0]);
      let tConv = profT[0];
      if (m.lfc > 0) {
        let kLfc = 1;
        while (kLfc < nz - 1 && profZ[kLfc] < m.lfc) kLfc++;
        const pLfc = profP[kLfc];
        tConv = profT[kLfc] * Math.pow(profP[0] / Math.max(pLfc, 1), RD / CP);
      }
      paintNorm(tConv - 273.15, 5, 45, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packDcape(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const n = buildProfile(grid, f, i, j);
      // Downdraft parcel: lowest θe in the lowest 3 km.
      let start = 0;
      let best = Infinity;
      for (let k = 0; k < n && profZ[k] <= 3000; k++) {
        const T = profT[k];
        const td = Math.min(T, profTd[k]);
        const qv = (0.622 * esatFast(td)) / Math.max(profP[k] - esatFast(td), 1);
        const theta = T * Math.pow(P0 / Math.max(profP[k], 1), RD / CP);
        const thetaE = theta * Math.exp((LV * qv) / (CP * Math.max(T, 1)));
        if (thetaE < best) {
          best = thetaE;
          start = k;
        }
      }
      let tp = profT[start];
      let dcape = 0;
      for (let k = start - 1; k >= 0; k--) {
        const zUpper = profZ[k + 1];
        const zMid = 0.5 * (profZ[k] + zUpper);
        const dz = zUpper - zMid;
        const pMid = 0.5 * (profP[k] + profP[k + 1]);
        const tEnv = 0.5 * (profT[k] + profT[k + 1]);
        tp += moistLapse(tp, pMid) * dz;
        const b = G * ((tp - tEnv) / Math.max(tEnv, 1));
        if (b < 0) dcape += -b * dz;
      }
      paintNorm(dcape, 0, 2000, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packCapeShear(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz, dz } = grid;
  const k6 = Math.min(nz - 1, Math.max(0, Math.round(6000 / Math.max(dz, 1))));
  const shear = Math.hypot(f.u0[k6] - f.u0[0], f.v0[k6] - f.v0[0]);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const n = buildProfile(grid, f, i, j);
      const m = parcelMetrics(n, 0, profT[0], profTd[0]);
      paintNorm(m.cape * shear, 0, 300000, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packDewpointDepression(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  const p = f.p0[0];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id = grid.idx(i, j, 0);
      const t = TFromTheta(f.theta[id], p);
      const td = dewpointAt(f, id, 0);
      paintNorm(t - td, 0, 30, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packSpecificHumidity(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const qv = Math.max(0, f.qv[grid.idx(i, j, 0)]);
      paintNorm((qv / (1 + qv)) * 1000, 0, 25, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packMixingRatio(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      paintNorm(Math.max(0, f.qv[grid.idx(i, j, 0)]) * 1000, 0, 25, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packMoistureFlux(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const qv = Math.max(0, f.qv[grid.idx(i, j, 0)]);
      const spd = Math.hypot(grid.uCenter(f.u, i, j, 0), grid.vCenter(f.v, i, j, 0));
      paintNorm(qv * spd * 1000, 0, 400, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packDryIntrusion(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz } = grid;
  const k700 = pressureLevelK(f, 70000);
  const k500 = pressureLevelK(f, 50000);
  const lo = Math.min(k700, k500);
  const hi = Math.max(k700, k500);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let rh = 0;
      let count = 0;
      for (let k = lo; k <= hi && k < nz; k++) {
        rh += rhAt(f, grid.idx(i, j, k), k);
        count++;
      }
      const dryness = 100 - (count > 0 ? rh / count : 100);
      paintNorm(dryness, 0, 100, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packBlHumidity(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz, dz } = grid;
  const k1 = Math.min(nz - 1, Math.max(1, Math.round(1000 / Math.max(dz, 1))));
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let sum = 0;
      for (let k = 0; k <= k1; k++) sum += rhAt(f, grid.idx(i, j, k), k);
      paintNorm(sum / (k1 + 1), 0, 100, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packWetBulb(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id = grid.idx(i, j, 0);
      const tC = TFromTheta(f.theta[id], f.p0[0]) - 273.15;
      paintNorm(wetBulbC(tC, rhAt(f, id, 0)), -15, 40, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packEvapPotential(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id = grid.idx(i, j, 0);
      const T = TFromTheta(f.theta[id], f.p0[0]);
      const deficit = Math.max(0, qsat(T, f.p0[0]) - Math.max(0, f.qv[id]));
      paintNorm(deficit * 1000, 0, 20, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packCloudIce(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let max = 0;
      for (let k = 0; k < nz; k++) {
        const qi = Math.max(0, f.qi[grid.idx(i, j, k)]);
        if (qi > max) max = qi;
      }
      paintNorm(max * 1000, 0, 3, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packIwp(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      paintNorm(waterPath(grid, f, i, j, (id) => f.qi[id]), 0, 600, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packCloudTopTemp(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = cloudTopIndex(f, grid, i, j);
      if (k < 0) {
        paintBackground(out, mapPix(i, j, nx, ny));
      } else {
        paintCold(tempAt(f, grid.idx(i, j, k), k) - 273.15, out, mapPix(i, j, nx, ny));
      }
    }
  }
}

function packCloudDepth(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const top = cloudTopIndex(f, grid, i, j);
      const base = cloudBaseIndex(f, grid, i, j);
      const depth = top >= 0 && base >= 0 ? (top - base) * grid.dz : 0;
      paintNorm(depth, 0, 15000, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packOvershoot(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const top = cloudTopIndex(f, grid, i, j);
      if (top < 0) {
        paintNorm(0, 0, 3000, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
        continue;
      }
      const n = buildProfile(grid, f, i, j);
      const m = parcelMetrics(n, 0, profT[0], profTd[0]);
      const ctop = (top + 0.5) * grid.dz;
      paintNorm(Math.max(0, ctop - m.el), 0, 3000, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packCloudTopDivergence(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = cloudTopIndex(f, grid, i, j);
      const div = k >= 0 ? divergenceAt(grid, f, i, j, k) : 0;
      paintSigned(div, 20, out, mapPix(i, j, nx, ny));
    }
  }
}

function packDowndraft(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let min = 0;
      for (let k = 0; k < nz; k++) {
        const w = grid.wCenter(f.w, i, j, k);
        if (w < min) min = w;
      }
      paintNorm(-min, 0, 20, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packOmega(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  const k = pressureLevelK(f, 70000);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const w = grid.wCenter(f.w, i, j, k);
      paintSigned(-f.rho0[k] * G * w, 5, out, mapPix(i, j, nx, ny));
    }
  }
}

function srhForLayer(
  grid: Grid3D,
  f: SimFields,
  topM: number,
): { srh: number; cu: number; cv: number } {
  const { nz, dz } = grid;
  const kTop = Math.min(nz - 1, Math.max(1, Math.round(topM / Math.max(dz, 1))));
  const k6 = Math.min(nz - 1, Math.max(1, Math.round(6000 / Math.max(dz, 1))));
  let sumU = 0;
  let sumV = 0;
  let count = 0;
  for (let k = 0; k <= k6; k++) {
    sumU += f.u0[k];
    sumV += f.v0[k];
    count++;
  }
  const meanU = sumU / Math.max(1, count);
  const meanV = sumV / Math.max(1, count);
  const shearU = f.u0[k6] - f.u0[0];
  const shearV = f.v0[k6] - f.v0[0];
  const mag = Math.hypot(shearU, shearV);
  const cu = meanU + (mag > 1e-6 ? (7.5 * shearV) / mag : 0);
  const cv = meanV - (mag > 1e-6 ? (7.5 * shearU) / mag : 0);
  let srh = 0;
  for (let k = 1; k <= kTop; k++) {
    const u0 = f.u0[k - 1];
    const v0 = f.v0[k - 1];
    const u1 = f.u0[k];
    const v1 = f.v0[k];
    srh +=
      0.5 * (u0 - cu + (u1 - cu)) * (v1 - v0) -
      0.5 * (v0 - cv + (v1 - cv)) * (u1 - u0);
  }
  return { srh, cu, cv };
}

function packSrh(grid: Grid3D, f: SimFields, out: Uint8Array, topM: number): void {
  const { nx, ny } = grid;
  const { srh } = srhForLayer(grid, f, topM);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      paintSigned(srh, topM < 2000 ? 150 : 300, out, mapPix(i, j, nx, ny));
    }
  }
}

function packStormRelativeWind(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  const { cu, cv } = srhForLayer(grid, f, 6000);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const u = f.u0[0] - cu;
      const v = f.v0[0] - cv;
      paintNorm(Math.hypot(u, v), 0, 60, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packBrn(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz, dz } = grid;
  const k6 = Math.min(nz - 1, Math.max(0, Math.round(6000 / Math.max(dz, 1))));
  const shear = Math.hypot(f.u0[k6] - f.u0[0], f.v0[k6] - f.v0[0]);
  const shearEnergy = Math.max(1, 0.5 * shear * shear);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const n = buildProfile(grid, f, i, j);
      const m = parcelMetrics(n, 0, profT[0], profTd[0]);
      paintNorm(m.cape / shearEnergy, 0, 100, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packLowLevelJet(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz, dz } = grid;
  const k3 = Math.min(nz - 1, Math.max(1, Math.round(3000 / Math.max(dz, 1))));
  let max = 0;
  for (let k = 0; k <= k3; k++) {
    const spd = Math.hypot(f.u0[k], f.v0[k]);
    if (spd > max) max = spd;
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      paintNorm(max, 0, 40, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packUpperLevelJet(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz, dz } = grid;
  const k0 = Math.max(0, Math.round(8000 / Math.max(dz, 1)));
  const k1 = Math.min(nz - 1, Math.max(k0 + 1, Math.round(12000 / Math.max(dz, 1))));
  let max = 0;
  for (let k = k0; k <= k1; k++) {
    const spd = Math.hypot(f.u0[k], f.v0[k]);
    if (spd > max) max = spd;
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      paintNorm(max, 0, 80, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packComponent(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
  component: "u" | "v",
): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const value =
        component === "u"
          ? grid.uCenter(f.u, i, j, 0)
          : grid.vCenter(f.v, i, j, 0);
      paintSigned(value, 30, out, mapPix(i, j, nx, ny));
    }
  }
}

/** Liquid fraction of the precipitating mass at the lowest hydrometeor level. */
function liquidFraction(f: SimFields, grid: Grid3D, i: number, j: number): number {
  for (let k = 0; k < grid.nz; k++) {
    const id = grid.idx(i, j, k);
    const liquid = Math.max(0, f.qr[id]) + Math.max(0, f.qc[id]);
    const frozen =
      Math.max(0, f.qi[id]) +
      Math.max(0, f.qs[id]) +
      Math.max(0, f.qg[id]) +
      Math.max(0, f.qh[id]);
    if (liquid + frozen > 1e-6) {
      return clamp(liquid / (liquid + frozen), 0, 1);
    }
  }
  const tSfc = tempAt(f, grid.idx(i, j, 0), 0) - 273.15;
  if (tSfc > 2) return 1;
  if (tSfc < 0) return 0;
  return clamp(tSfc / 2, 0, 1);
}

function packPrecipPhaseRate(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
  liquid: boolean,
): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const s = i + j * nx;
      const rate = Math.max(0, f.precipRate[s] || 0);
      const frac = liquidFraction(f, grid, i, j);
      const value = liquid ? rate * frac : rate * (1 - frac);
      paintNorm(value, 0, 60, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packVirga(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const s = i + j * nx;
      const rate = Math.max(0, f.precipRate[s] || 0);
      if (rate >= 0.05) {
        paintNorm(0, 0, 1200, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
        continue;
      }
      const path = waterPath(
        grid,
        f,
        i,
        j,
        (id) =>
          Math.max(0, f.qr[id]) +
          Math.max(0, f.qi[id]) +
          Math.max(0, f.qs[id]) +
          Math.max(0, f.qg[id]) +
          Math.max(0, f.qh[id]),
      );
      paintNorm(path, 0, 1200, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packVilDensity(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let vil = 0;
      for (let k = 0; k < grid.nz; k++) {
        const id = grid.idx(i, j, k);
        vil +=
          f.rho0[k] *
          (Math.max(0, f.qr[id]) +
            Math.max(0, f.qi[id]) +
            Math.max(0, f.qs[id]) +
            Math.max(0, f.qg[id]) +
            Math.max(0, f.qh[id])) *
          grid.dz;
      }
      const topKm = Math.max(1, echoTopM(grid, f, i, j) / 1000);
      paintNorm(vil / topKm, 0, 5, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packHydrometeorClass(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let best = 0;
      let code = 0;
      for (let k = 0; k < nz; k++) {
        const id = grid.idx(i, j, k);
        const values = [
          Math.max(0, f.qc[id]),
          Math.max(0, f.qr[id]),
          Math.max(0, f.qi[id]),
          Math.max(0, f.qs[id]),
          Math.max(0, f.qg[id]),
          Math.max(0, f.qh[id]),
        ];
        for (let n = 0; n < values.length; n++) {
          if (values[n] > best) {
            best = values[n];
            code = n + 1;
          }
        }
      }
      lerpStops(code, HYDRO_STOPS, out, mapPix(i, j, nx, ny));
    }
  }
}

/**
 * Hypsometric height of `targetPa` above the model's lowest level (m).
 *
 * Uses the base-state pressure levels rather than the anelastic pressure
 * perturbation: the perturbation is a projection variable, not a measured
 * surface pressure, and adding it to p0 produced physically impossible
 * 500-hPa heights.  The lowest model level sits at 0.5 dz.
 */
function heightAtPressure(
  grid: Grid3D,
  f: SimFields,
  i: number,
  j: number,
  targetPa: number,
): number {
  const { nz, dz } = grid;
  if (f.p0[0] <= targetPa) return 0.5 * dz;
  let z = 0.5 * dz;
  let reached = false;
  for (let k = 0; k < nz - 1; k++) {
    const pA = f.p0[k];
    const pB = f.p0[k + 1];
    if (pA <= targetPa) break;
    const pEnd = Math.max(targetPa, pB);
    const tA = tempAt(f, grid.idx(i, j, k), k);
    const tB = tempAt(f, grid.idx(i, j, k + 1), k + 1);
    const qA = Math.max(0, f.qv[grid.idx(i, j, k)]);
    const qB = Math.max(0, f.qv[grid.idx(i, j, k + 1)]);
    const tv = 0.5 * (tA * (1 + 0.608 * qA) + tB * (1 + 0.608 * qB));
    z += ((RD * tv) / G) * Math.log(pA / Math.max(pEnd, 1));
    if (pB <= targetPa) {
      reached = true;
      break;
    }
  }
  if (!reached && f.p0[nz - 1] > targetPa) {
    // The model top is below the requested pressure; extrapolate with the
    // top-level temperature so the product still has a finite value.
    const tTop = tempAt(f, grid.idx(i, j, nz - 1), nz - 1);
    z += ((RD * tTop) / G) * Math.log(f.p0[nz - 1] / Math.max(targetPa, 1));
  }
  return z;
}

function packZ500(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      paintNorm(heightAtPressure(grid, f, i, j, 50000), 4800, 6000, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packThickness(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const z500 = heightAtPressure(grid, f, i, j, 50000);
      const z1000 = heightAtPressure(grid, f, i, j, 100000);
      paintNorm(z500 - z1000, 4800, 6000, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packTropopause(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const n = buildProfile(grid, f, i, j);
      let height = 0;
      for (let k = 0; k < n; k++) {
        if (profZ[k] < 5000) continue;
        let k2 = k;
        while (k2 < n - 1 && profZ[k2] - profZ[k] < 2000) k2++;
        if (profZ[k2] - profZ[k] < 1500) break;
        const lapse = (profT[k] - profT[k2]) / (profZ[k2] - profZ[k]);
        if (lapse <= 0.002) {
          height = profZ[k];
          break;
        }
      }
      paintNorm(height, 5000, 16000, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packVortAdv(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, dx, dy } = grid;
  const k = pressureLevelK(f, 50000);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const ip = Math.min(nx - 1, i + 1);
      const im = Math.max(0, i - 1);
      const jp = Math.min(ny - 1, j + 1);
      const jm = Math.max(0, j - 1);
      const zeta = (ii: number, jj: number): number => {
        const x = Math.max(1, Math.min(nx - 2, ii));
        const y = Math.max(1, Math.min(ny - 2, jj));
        const dvDx =
          (grid.vCenter(f.v, x + 1, y, k) - grid.vCenter(f.v, x - 1, y, k)) /
          Math.max(1e-3, 2 * dx);
        const duDy =
          (grid.uCenter(f.u, x, y + 1, k) - grid.uCenter(f.u, x, y - 1, k)) /
          Math.max(1e-3, 2 * dy);
        return dvDx - duDy;
      };
      const zetaP = zeta(Math.min(nx - 2, i + 1), j);
      const zetaM = zeta(Math.max(1, i - 1), j);
      const zetaJp = zeta(i, Math.min(ny - 2, j + 1));
      const zetaJm = zeta(i, Math.max(1, j - 1));
      const dZdx = (zetaP - zetaM) / Math.max(1e-3, (Math.min(nx - 2, i + 1) - Math.max(1, i - 1)) * dx);
      const dZdy = (zetaJp - zetaJm) / Math.max(1e-3, (Math.min(ny - 2, j + 1) - Math.max(1, j - 1)) * dy);
      const u = grid.uCenter(f.u, i, j, k);
      const v = grid.vCenter(f.v, i, j, k);
      const adv = -(u * dZdx + v * dZdy) * 1e9;
      paintSigned(adv, 50, out, mapPix(i, j, nx, ny));
    }
  }
}

function packColdPool(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  const exner = Math.pow(f.p0[0] / P0, RD / CP);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id = grid.idx(i, j, 0);
      const deficit = (f.theta0[0] - f.theta[id]) * exner;
      paintNorm(Math.max(0, deficit), 0, 10, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

function packSurfaceGradient(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
  kind: "p" | "t" | "td",
  max: number,
): void {
  const { nx, ny, dx, dy } = grid;
  const p = f.p0[0];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const ip = Math.min(nx - 1, i + 1);
      const im = Math.max(0, i - 1);
      const jp = Math.min(ny - 1, j + 1);
      const jm = Math.max(0, j - 1);
      const value = (ii: number, jj: number): number => {
        const id = grid.idx(ii, jj, 0);
        if (kind === "p") return (f.p[id] * f.rho0[0]) / 100;
        if (kind === "t") return TFromTheta(f.theta[id], p);
        return dewpointAt(f, id, 0);
      };
      const dvDx =
        (value(ip, j) - value(im, j)) /
        Math.max(1e-3, ((ip - im) * dx) / 1000);
      const dvDy =
        (value(i, jp) - value(i, jm)) /
        Math.max(1e-3, ((jp - jm) * dy) / 1000);
      paintNorm(Math.hypot(dvDx, dvDy), 0, max, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
    }
  }
}

export function packDerivedProduct(
  id: DerivedProductId,
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
): void {
  switch (id) {
    case "mlcape":
      packMlcape(grid, f, out);
      break;
    case "mucape":
      packMucape(grid, f, out);
      break;
    case "li":
      packLiftedIndex(grid, f, out);
      break;
    case "showalter":
      packShowalter(grid, f, out);
      break;
    case "kindex":
      packKIndex(grid, f, out);
      break;
    case "totaltotals":
      packTotalTotals(grid, f, out);
      break;
    case "lapse700500":
      packLapse700500(grid, f, out);
      break;
    case "lapse03":
      packLapse03(grid, f, out);
      break;
    case "wbz":
      packWbz(grid, f, out);
      break;
    case "convtemp":
      packConvTemp(grid, f, out);
      break;
    case "dcape":
      packDcape(grid, f, out);
      break;
    case "capeshear":
      packCapeShear(grid, f, out);
      break;
    case "dptdep":
      packDewpointDepression(grid, f, out);
      break;
    case "qsfc":
      packSpecificHumidity(grid, f, out);
      break;
    case "mixratio":
      packMixingRatio(grid, f, out);
      break;
    case "mflux":
      packMoistureFlux(grid, f, out);
      break;
    case "dryint":
      packDryIntrusion(grid, f, out);
      break;
    case "blrh":
      packBlHumidity(grid, f, out);
      break;
    case "wetbulb":
      packWetBulb(grid, f, out);
      break;
    case "evappot":
      packEvapPotential(grid, f, out);
      break;
    case "cice":
      packCloudIce(grid, f, out);
      break;
    case "iwp":
      packIwp(grid, f, out);
      break;
    case "cttemp":
      packCloudTopTemp(grid, f, out);
      break;
    case "cdepth":
      packCloudDepth(grid, f, out);
      break;
    case "overshoot":
      packOvershoot(grid, f, out);
      break;
    case "ctdiv":
      packCloudTopDivergence(grid, f, out);
      break;
    case "downdraft":
      packDowndraft(grid, f, out);
      break;
    case "omega":
      packOmega(grid, f, out);
      break;
    case "shear08":
      // Uses the same base-state shear definition as the other shear views.
      {
        const { nx, ny, nz, dz } = grid;
        const k8 = Math.min(nz - 1, Math.max(0, Math.round(8000 / Math.max(dz, 1))));
        const shear = Math.hypot(f.u0[k8] - f.u0[0], f.v0[k8] - f.v0[0]);
        for (let j = 0; j < ny; j++) {
          for (let i = 0; i < nx; i++) {
            paintNorm(shear, 0, 80, SCALAR_RAMP, out, mapPix(i, j, nx, ny));
          }
        }
      }
      break;
    case "srh01":
      packSrh(grid, f, out, 1000);
      break;
    case "srh03":
      packSrh(grid, f, out, 3000);
      break;
    case "srw":
      packStormRelativeWind(grid, f, out);
      break;
    case "brn":
      packBrn(grid, f, out);
      break;
    case "llj":
      packLowLevelJet(grid, f, out);
      break;
    case "ulj":
      packUpperLevelJet(grid, f, out);
      break;
    case "ucomp":
      packComponent(grid, f, out, "u");
      break;
    case "vcomp":
      packComponent(grid, f, out, "v");
      break;
    case "virga":
      packVirga(grid, f, out);
      break;
    case "vildensity":
      packVilDensity(grid, f, out);
      break;
    case "hydrometeor":
      packHydrometeorClass(grid, f, out);
      break;
    case "rainrate":
      packPrecipPhaseRate(grid, f, out, true);
      break;
    case "snowrate":
      packPrecipPhaseRate(grid, f, out, false);
      break;
    case "z500":
      packZ500(grid, f, out);
      break;
    case "thickness":
      packThickness(grid, f, out);
      break;
    case "tropopause":
      packTropopause(grid, f, out);
      break;
    case "vortadv":
      packVortAdv(grid, f, out);
      break;
    case "coldpool":
      packColdPool(grid, f, out);
      break;
    case "pgrad":
      packSurfaceGradient(grid, f, out, "p", 5);
      break;
    case "tgrad":
      packSurfaceGradient(grid, f, out, "t", 10);
      break;
    case "tdgrad":
      packSurfaceGradient(grid, f, out, "td", 10);
      break;
    case "w925":
    case "w700":
    case "w500":
    case "w300":
    case "w200":
      // These are simple fixed-level wind speeds handled by mapProducts.
      break;
  }
}
