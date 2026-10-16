import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import { integrateCapeCin } from "./cape";
import { surfacePressureBiasHpa } from "./synoptic";
import { TFromTheta, dewpointFromE } from "./thermo";

export type MapProductId =
  | "refl"
  | "doppler"
  | "cape"
  | "cin"
  | "tsfc"
  | "td"
  | "wspd"
  | "psfc"
  | "ltg"
  | "vis"
  | "ir";

export interface MapProductMeta {
  id: MapProductId;
  title: string;
  units: string;
  /** CSS linear-gradient for legend bar */
  legendCss: string;
  ticks: string[];
}

export const MAP_PRODUCTS: Record<MapProductId, MapProductMeta> = {
  refl: {
    id: "refl",
    title: "Column-max reflectivity",
    units: "dBZ",
    legendCss:
      "linear-gradient(90deg,#00a000 0%,#00dc00 25%,#ffff00 45%,#ff8c00 60%,#ff0000 75%,#ff00ff 90%,#ffffff 100%)",
    ticks: ["5", "30", "50", "70"],
  },
  doppler: {
    id: "doppler",
    title: "Radial velocity (center radar)",
    units: "m/s",
    legendCss:
      "linear-gradient(90deg,#2040ff 0%,#a0c0ff 40%,#f0f0f0 50%,#ffb0a0 60%,#ff2020 100%)",
    ticks: ["-30", "0", "+30"],
  },
  cape: {
    id: "cape",
    title: "Surface-based CAPE",
    units: "J/kg",
    legendCss:
      "linear-gradient(90deg,#1a2030 0%,#fff7c0 25%,#ffb040 55%,#ff4020 80%,#c00080 100%)",
    ticks: ["0", "1000", "3000", "5000"],
  },
  cin: {
    id: "cin",
    title: "Surface-based CIN",
    units: "J/kg",
    legendCss:
      "linear-gradient(90deg,#1a2030 0%,#5078b4 35%,#2850c8 70%,#7828b4 100%)",
    ticks: ["0", "50", "150", "300"],
  },
  tsfc: {
    id: "tsfc",
    title: "Surface temperature",
    units: "°C",
    legendCss:
      "linear-gradient(90deg,#2030a0 0%,#40c0ff 25%,#f0f0f0 45%,#ffc040 70%,#ff2020 100%)",
    ticks: ["0", "15", "25", "35"],
  },
  td: {
    id: "td",
    title: "Surface dewpoint",
    units: "°C",
    legendCss:
      "linear-gradient(90deg,#2030a0 0%,#40c0ff 25%,#f0f0f0 45%,#ffc040 70%,#ff2020 100%)",
    ticks: ["0", "10", "20", "28"],
  },
  wspd: {
    id: "wspd",
    title: "Surface wind speed",
    units: "m/s",
    legendCss:
      "linear-gradient(90deg,#1a2030 0%,#3cb46a 30%,#ffe060 65%,#ffffff 100%)",
    ticks: ["0", "10", "20", "40"],
  },
  psfc: {
    id: "psfc",
    title: "Surface pressure",
    units: "hPa",
    legendCss:
      "linear-gradient(90deg,#2040ff 0%,#a0c0ff 40%,#f0f0f0 50%,#ffb0a0 60%,#ff2020 100%)",
    ticks: ["-12", "0", "+12"],
  },
  ltg: {
    id: "ltg",
    title: "Lightning hotspots",
    units: "/min",
    legendCss:
      "linear-gradient(90deg,#1a1428 0%,#c87820 40%,#ffe060 70%,#ffffff 100%)",
    ticks: ["0", "5", "15", "30"],
  },
  vis: {
    id: "vis",
    title: "Visible satellite",
    units: "albedo",
    legendCss:
      "linear-gradient(90deg,#141820 0%,#6a7384 42%,#d8dce4 78%,#ffffff 100%)",
    ticks: ["clear", "thin", "thick"],
  },
  ir: {
    id: "ir",
    title: "Infrared satellite",
    units: "°C",
    legendCss:
      "linear-gradient(90deg,#2a1408 0%,#8a4030 28%,#b0b4c0 62%,#f7f7fb 100%)",
    ticks: ["30", "0", "-40", "-70"],
  },
};

export function packMapProduct(
  id: MapProductId,
  grid: Grid3D,
  fields: SimFields,
  out: Uint8Array,
): void {
  switch (id) {
    case "refl":
      packReflectivity(grid, fields, out);
      break;
    case "doppler":
      packDoppler(grid, fields, out);
      break;
    case "cape":
      packThermo(grid, fields, out, "cape");
      break;
    case "cin":
      packThermo(grid, fields, out, "cin");
      break;
    case "tsfc":
      packSurfaceT(grid, fields, out);
      break;
    case "td":
      packDewpoint(grid, fields, out);
      break;
    case "wspd":
      packWindSpeed(grid, fields, out);
      break;
    case "psfc":
      packSurfacePressure(grid, fields, out);
      break;
    case "ltg":
      break;
    case "vis":
      packVisible(grid, fields, out);
      break;
    case "ir":
      packInfrared(grid, fields, out);
      break;
  }
}

/** Image / texture row 0 = north (+j) so maps are north-up. */
function mapPix(i: number, j: number, nx: number, ny: number): number {
  return (i + (ny - 1 - j) * nx) * 4;
}

function packReflectivity(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
): void {
  const { nx, ny, nz } = grid;
  const nxny = nx * ny;
  const stepK = nz > 48 ? Math.ceil(nz / 48) : 1;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let maxDbz = -30;
      for (let k = 0; k < nz; k += stepK) {
        const id = grid.idx(i, j, k);
        const ww = 0.5 * (f.w[id] + f.w[id + nxny]);
        const dbz = reflectivityDbz(f.qr[id], f.qc[id], ww);
        if (dbz > maxDbz) maxDbz = dbz;
      }
      dbzToRgba(maxDbz, out, mapPix(i, j, nx, ny));
    }
  }
}

/** Visible satellite: column cloud thickness. Clear ground stays dark. */
function packVisible(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz } = grid;
  const nxny = nx * ny;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let tau = 0;
      for (let k = 0; k < nz; k++) {
        const id = i + j * nx + k * nxny;
        tau += f.qc[id] * 520 + f.qr[id] * 180;
      }
      const alb = 1 - Math.exp(-tau);
      const g = (18 + alb * 237) | 0;
      const o = mapPix(i, j, nx, ny);
      out[o] = g;
      out[o + 1] = g;
      out[o + 2] = Math.min(255, g + 4);
      out[o + 3] = 255;
    }
  }
}

/** Infrared: cold cloud tops are bright. Clear columns use the warm surface. */
function packInfrared(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz } = grid;
  const nxny = nx * ny;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let kTop = 0;
      for (let k = nz - 1; k >= 0; k--) {
        const id = i + j * nx + k * nxny;
        if (f.qc[id] + f.qr[id] > 2e-5) {
          kTop = k;
          break;
        }
      }
      const id = i + j * nx + kTop * nxny;
      const tC = TFromTheta(f.theta[id], f.p0[kTop]) - 273.15;
      irToRgba(tC, out, mapPix(i, j, nx, ny));
    }
  }
}

function irToRgba(tC: number, out: Uint8Array, o: number): void {
  const stops: [number, number, number, number][] = [
    [-70, 255, 255, 255],
    [-40, 232, 232, 238],
    [-12, 176, 176, 186],
    [8, 138, 64, 48],
    [30, 42, 20, 12],
  ];
  lerpStops(Math.min(30, Math.max(-70, tC)), stops, out, o, 255);
}

/** Storm-relative radial velocity toward domain-center virtual radar, ~1.5 km. */
function packDoppler(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz, dz } = grid;
  const cx = (nx - 1) * 0.5;
  const cy = (ny - 1) * 0.5;
  const kRadar = Math.max(
    1,
    Math.min(nz - 2, Math.round(1500 / Math.max(dz, 1))),
  );

  // Domain-mean wind at that level for storm-relative (C-grid → cell center)
  let uSum = 0;
  let vSum = 0;
  let n = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      uSum += grid.uCenter(f.u, i, j, kRadar);
      vSum += grid.vCenter(f.v, i, j, kRadar);
      n++;
    }
  }
  const uBar = uSum / Math.max(1, n);
  const vBar = vSum / Math.max(1, n);

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const dx = i - cx;
      const dy = j - cy;
      const r = Math.hypot(dx, dy);
      let vr = 0;
      if (r > 0.5) {
        const uRel = grid.uCenter(f.u, i, j, kRadar) - uBar;
        const vRel = grid.vCenter(f.v, i, j, kRadar) - vBar;
        vr = (uRel * dx + vRel * dy) / r;
      }
      divergingToRgba(vr, -30, 30, out, mapPix(i, j, nx, ny));
    }
  }
}

let thermoN = 0;
let thermoZ: Float64Array = new Float64Array(0);
let thermoP: Float64Array = new Float64Array(0);
let thermoT: Float64Array = new Float64Array(0);
let thermoTd: Float64Array = new Float64Array(0);

function ensureThermo(n: number): void {
  if (n <= thermoN) return;
  thermoN = n;
  thermoZ = new Float64Array(n);
  thermoP = new Float64Array(n);
  thermoT = new Float64Array(n);
  thermoTd = new Float64Array(n);
}

function packThermo(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
  which: "cape" | "cin",
): void {
  const { nx, ny, nz, dz, zTop } = grid;
  const stepK = Math.max(1, Math.floor(nz / 20));
  const ks: number[] = [];
  for (let k = 0; k < nz; k += stepK) ks.push(k);
  if (ks[ks.length - 1] !== nz - 1) ks.push(nz - 1);
  const nLev = ks.length;
  ensureThermo(nLev);

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      for (let n = 0; n < nLev; n++) {
        const k = ks[n];
        const id = grid.idx(i, j, k);
        const p = f.p0[k];
        const T = TFromTheta(f.theta[id], p);
        const qv = Math.max(0, f.qv[id]);
        const e = (qv * p) / (0.622 + qv);
        thermoZ[n] = (k + 0.5) * dz;
        thermoP[n] = p;
        thermoT[n] = T;
        thermoTd[n] = Math.min(T, dewpointFromE(Math.max(1, e)) + 273.15);
      }
      const idx = integrateCapeCin(
        thermoZ,
        thermoP,
        thermoT,
        thermoTd,
        nLev,
        zTop,
      );
      const pix = mapPix(i, j, nx, ny);
      if (which === "cape") capeToRgba(idx.cape, out, pix);
      else cinToRgba(idx.cin, out, pix);
    }
  }
}

function packSurfaceT(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  const p0 = f.p0[0];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const th = f.theta[grid.idx(i, j, 0)];
      const tC = TFromTheta(th, p0) - 273.15;
      thermalToRgba(tC, 0, 38, out, mapPix(i, j, nx, ny));
    }
  }
}

function packDewpoint(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  const p0 = f.p0[0];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const qv = Math.max(0, f.qv[grid.idx(i, j, 0)]);
      const e = (qv * p0) / (0.622 + qv);
      const tdC = dewpointFromE(Math.max(1, e));
      thermalToRgba(tdC, 0, 28, out, mapPix(i, j, nx, ny));
    }
  }
}

function packWindSpeed(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const spd = Math.hypot(
        grid.uCenter(f.u, i, j, 0),
        grid.vCenter(f.v, i, j, 0),
      );
      speedToRgba(spd, out, mapPix(i, j, nx, ny));
    }
  }
}

/** Anelastic π' at the surface, scaled as a pressure perturbation in hPa. */
function packSurfacePressure(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  const scale = f.rho0[0] / 100;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const xn = i / Math.max(1, nx - 1);
      const yn = j / Math.max(1, ny - 1);
      const hPa = f.p[grid.idx(i, j, 0)] * scale + surfacePressureBiasHpa(xn, yn);
      divergingToRgba(hPa, -12, 12, out, mapPix(i, j, nx, ny));
    }
  }
}

/** Flash rate in flashes per minute. */
export function packLightning(
  grid: Grid3D,
  flashPerMin: Float32Array,
  out: Uint8Array,
): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const rate = flashPerMin[i + j * nx] ?? 0;
      lightningToRgba(rate, out, mapPix(i, j, nx, ny));
    }
  }
}

/** Bottom and top of the reflectivity color bar. Shaft opacity uses the same span. */
export const DBZ_FLOOR = 5;
export const DBZ_SCALE_MAX = 70;

/** 0 at 5 dBZ, 1 at 70 dBZ. */
export function dbzOpacity(dbz: number): number {
  if (dbz <= DBZ_FLOOR) return 0;
  return Math.min(1, (dbz - DBZ_FLOOR) / (DBZ_SCALE_MAX - DBZ_FLOOR));
}

/**
 * Reflectivity from warm-rain mixing ratios.
 * The prefactor maps the rain this model actually holds onto 5–70 dBZ.
 * A strong updraft over heavy rain adds a compact core so pink and white
 * stay inside the updraft instead of painting the whole echo.
 */
export function reflectivityDbz(qr: number, qc: number, w = 0): number {
  const qrp = Math.max(0, qr);
  const qcp = Math.max(0, qc);
  if (qrp < 1e-8 && qcp < 5e-5) return -30;
  const ze = 8.0e8 * Math.pow(qrp, 1.6) + 2.0e5 * qcp * qcp;
  let dbz = 10 * Math.log10(Math.max(ze, 1e-8));
  if (w > 4 && qrp > 2e-4) {
    const up = Math.min(1, (w - 4) / 12);
    const rain = Math.min(1, qrp / 0.004);
    dbz += 16 * up * rain;
  }
  return dbz;
}

function dbzToRgba(dbz: number, out: Uint8Array, o: number): void {
  if (dbz < 5) {
    out[o] = 0;
    out[o + 1] = 0;
    out[o + 2] = 0;
    out[o + 3] = 0;
    return;
  }
  const stops: [number, number, number, number][] = [
    [5, 0, 160, 0],
    [20, 0, 220, 0],
    [30, 255, 255, 0],
    [40, 255, 140, 0],
    [50, 255, 0, 0],
    [60, 255, 0, 255],
    [70, 255, 255, 255],
  ];
  lerpStops(dbz, stops, out, o, 220);
}

function cinToRgba(cin: number, out: Uint8Array, o: number): void {
  if (cin < 10) {
    out[o] = 20;
    out[o + 1] = 24;
    out[o + 2] = 36;
    out[o + 3] = 255;
    return;
  }
  const stops: [number, number, number, number][] = [
    [10, 80, 120, 180],
    [50, 80, 140, 220],
    [150, 40, 80, 200],
    [300, 120, 40, 180],
  ];
  lerpStops(Math.min(400, cin), stops, out, o, 255);
}

function speedToRgba(spd: number, out: Uint8Array, o: number): void {
  const stops: [number, number, number, number][] = [
    [0, 26, 32, 48],
    [10, 60, 180, 106],
    [20, 255, 224, 96],
    [40, 255, 255, 255],
  ];
  lerpStops(Math.min(40, Math.max(0, spd)), stops, out, o, 255);
}

function lightningToRgba(rate: number, out: Uint8Array, o: number): void {
  if (rate < 0.4) {
    out[o] = 20;
    out[o + 1] = 16;
    out[o + 2] = 32;
    out[o + 3] = 255;
    return;
  }
  const stops: [number, number, number, number][] = [
    [0.4, 80, 40, 20],
    [5, 200, 120, 32],
    [15, 255, 224, 96],
    [30, 255, 255, 255],
  ];
  lerpStops(Math.min(40, rate), stops, out, o, 255);
}

function capeToRgba(cape: number, out: Uint8Array, o: number): void {
  if (cape < 50) {
    out[o] = 20;
    out[o + 1] = 24;
    out[o + 2] = 36;
    out[o + 3] = 255;
    return;
  }
  const stops: [number, number, number, number][] = [
    [50, 255, 247, 192],
    [800, 255, 196, 64],
    [1800, 255, 96, 32],
    [3200, 210, 24, 56],
    [5000, 150, 0, 140],
  ];
  lerpStops(Math.min(5000, Math.max(0, cape)), stops, out, o, 255);
}

function thermalToRgba(
  tC: number,
  tMin: number,
  tMax: number,
  out: Uint8Array,
  o: number,
): void {
  const stops: [number, number, number, number][] = [
    [tMin, 32, 48, 160],
    [tMin + (tMax - tMin) * 0.25, 64, 192, 255],
    [tMin + (tMax - tMin) * 0.45, 240, 240, 240],
    [tMin + (tMax - tMin) * 0.7, 255, 192, 64],
    [tMax, 255, 32, 32],
  ];
  lerpStops(Math.min(tMax, Math.max(tMin, tC)), stops, out, o, 255);
}

function divergingToRgba(
  v: number,
  vMin: number,
  vMax: number,
  out: Uint8Array,
  o: number,
): void {
  const t = (v - vMin) / Math.max(1e-6, vMax - vMin);
  const x = Math.min(1, Math.max(0, t));
  // blue → white → red
  if (x < 0.5) {
    const u = x * 2;
    out[o] = (32 + (240 - 32) * u) | 0;
    out[o + 1] = (64 + (240 - 64) * u) | 0;
    out[o + 2] = (255 - (255 - 240) * u) | 0;
  } else {
    const u = (x - 0.5) * 2;
    out[o] = (240 + (255 - 240) * u) | 0;
    out[o + 1] = (240 - (240 - 32) * u) | 0;
    out[o + 2] = (240 - (240 - 32) * u) | 0;
  }
  out[o + 3] = 255;
}

function lerpStops(
  value: number,
  stops: [number, number, number, number][],
  out: Uint8Array,
  o: number,
  alpha: number,
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
  out[o + 3] = alpha;
}
