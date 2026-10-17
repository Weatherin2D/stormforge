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

export interface MapScale {
  min: number;
  max: number;
  values: number[];
}

export interface MapProductMeta {
  id: MapProductId;
  title: string;
  units: string;
  /** CSS linear-gradient for legend bar */
  legendCss: string;
  ticks: string[];
  /** When set, tick labels sit at (value − min) / (max − min). */
  scale?: MapScale;
}

type RgbaStop = [number, number, number, number];

/** Map panel background. No-echo and low CAPE use this so they stay solid. */
const MAP_BG: RgbaStop = [0, 10, 16, 28];

function hex2(n: number): string {
  return Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, "0");
}

/** Legend position is (value − min) / (max − min), same span as the pixels. */
function legendFromStops(stops: RgbaStop[], min: number, max: number): string {
  const span = Math.max(1e-6, max - min);
  const parts = stops.map(([v, r, g, b]) => {
    const p = Math.min(100, Math.max(0, ((v - min) / span) * 100));
    return `#${hex2(r)}${hex2(g)}${hex2(b)} ${p.toFixed(1)}%`;
  });
  return `linear-gradient(90deg,${parts.join(",")})`;
}

/** RadarScope standard reflectivity, 5–75 dBZ. */
const REFL_STOPS: RgbaStop[] = [
  [5, 29, 37, 60],
  [17.5, 89, 155, 171],
  [22.5, 33, 186, 72],
  [32.5, 5, 101, 1],
  [37.5, 251, 252, 0],
  [42.5, 253, 149, 2],
  [50, 253, 38, 0],
  [60, 193, 148, 179],
  [70, 165, 2, 215],
  [75, 135, 255, 253],
];

/** RadarScope velocity: inbound green, near-zero gray, outbound red. */
const VEL_STOPS: RgbaStop[] = [
  [-30, 0, 70, 0],
  [-18, 0, 170, 40],
  [-6, 140, 230, 140],
  [-1, 90, 90, 90],
  [1, 90, 90, 90],
  [6, 240, 140, 140],
  [18, 230, 30, 30],
  [30, 140, 0, 0],
];

/** Pivotal-style surface temperature, −15°C to 40°C. */
const TEMP_STOPS: RgbaStop[] = [
  [-15, 110, 0, 170],
  [-5, 20, 40, 200],
  [5, 0, 190, 220],
  [12, 40, 180, 50],
  [20, 250, 230, 40],
  [28, 255, 140, 0],
  [35, 220, 20, 20],
  [40, 120, 0, 0],
];

/** Pivotal-style dewpoint: brown when dry, dark green when moist. */
const DEW_STOPS: RgbaStop[] = [
  [-5, 120, 70, 30],
  [2, 190, 150, 80],
  [10, 230, 210, 60],
  [16, 140, 200, 60],
  [22, 0, 150, 40],
  [28, 0, 80, 40],
];

/** Pivotal-style CAPE. The legend holds the dark floor from 0 to 100 J/kg. */
const CAPE_STOPS: RgbaStop[] = [
  [100, 255, 255, 190],
  [500, 255, 230, 40],
  [1000, 255, 200, 0],
  [2000, 255, 110, 0],
  [3000, 210, 20, 20],
  [4000, 180, 0, 120],
  [5000, 100, 0, 160],
];
const CAPE_LEGEND: RgbaStop[] = [
  [0, 10, 16, 28],
  [100, 10, 16, 28],
  ...CAPE_STOPS,
];

const IR_STOPS: RgbaStop[] = [
  [-90, 180, 0, 220],
  [-80, 128, 128, 128],
  [-70, 80, 0, 0],
  [-60, 255, 0, 0],
  [-50, 255, 140, 0],
  [-40, 255, 255, 0],
  [-30, 180, 255, 0],
  [-20, 0, 200, 0],
  [0, 0, 0, 180],
  [20, 0, 80, 255],
  [40, 0, 255, 255],
];

export const MAP_PRODUCTS: Record<MapProductId, MapProductMeta> = {
  refl: {
    id: "refl",
    title: "Column-max reflectivity",
    units: "dBZ",
    legendCss: legendFromStops(REFL_STOPS, 5, 75),
    ticks: ["5", "20", "35", "50", "65", "75"],
    scale: { min: 5, max: 75, values: [5, 20, 35, 50, 65, 75] },
  },
  doppler: {
    id: "doppler",
    title: "Radial velocity (center radar)",
    units: "m/s",
    legendCss: legendFromStops(VEL_STOPS, -30, 30),
    ticks: ["-30", "0", "+30"],
    scale: { min: -30, max: 30, values: [-30, 0, 30] },
  },
  cape: {
    id: "cape",
    title: "Surface-based CAPE",
    units: "J/kg",
    legendCss: legendFromStops(CAPE_LEGEND, 0, 5000),
    ticks: ["0", "1000", "2500", "5000"],
    scale: { min: 0, max: 5000, values: [0, 1000, 2500, 5000] },
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
    legendCss: legendFromStops(TEMP_STOPS, -15, 40),
    ticks: ["-15", "0", "15", "30", "40"],
    scale: { min: -15, max: 40, values: [-15, 0, 15, 30, 40] },
  },
  td: {
    id: "td",
    title: "Surface dewpoint",
    units: "°C",
    legendCss: legendFromStops(DEW_STOPS, -5, 28),
    ticks: ["-5", "5", "15", "22", "28"],
    scale: { min: -5, max: 28, values: [-5, 5, 15, 22, 28] },
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
    legendCss: legendFromStops(IR_STOPS, -90, 40),
    ticks: ["40", "0", "-40", "-70", "-90"],
    scale: { min: -90, max: 40, values: [40, 0, -40, -70, -90] },
  },
};

/** Paint a legend bar and its ticks from one product definition. */
export function paintLegend(
  bar: HTMLElement,
  ticks: HTMLElement,
  meta: MapProductMeta,
): void {
  bar.style.background = meta.legendCss;
  ticks.classList.toggle("scaled", !!meta.scale);
  ticks.innerHTML = legendTickHtml(meta);
}

/** Tick labels. Scaled products place each label on its value. */
export function legendTickHtml(meta: MapProductMeta): string {
  const scale = meta.scale;
  if (!scale) return meta.ticks.map((t) => `<span>${t}</span>`).join("");
  const span = Math.max(1e-6, scale.max - scale.min);
  return scale.values
    .map((v, i) => {
      const p = ((v - scale.min) / span) * 100;
      const label = meta.ticks[i] ?? String(v);
      const shift = p <= 1 ? "0" : p >= 99 ? "-100%" : "-50%";
      return `<span style="left:${p.toFixed(2)}%;transform:translateX(${shift})">${label}</span>`;
    })
    .join("");
}

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

/**
 * Infrared brightness temperature. Optical depth is accumulated from the top,
 * so a clear column stays at the surface temperature, a thin edge stays warmer,
 * and only a thick core takes the cold cloud temperature.
 */
function packInfrared(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz, dz } = grid;
  const nxny = nx * ny;
  const dzN = dz / 300;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const sfc = i + j * nx;
      const tSfc = TFromTheta(f.theta[sfc], f.p0[0]) - 273.15;
      let trans = 1;
      let acc = 0;
      for (let k = nz - 1; k >= 0 && trans > 0.02; k--) {
        const id = sfc + k * nxny;
        const dTau = (f.qc[id] * 40 + f.qr[id] * 18) * dzN;
        if (dTau <= 1e-6) continue;
        const emit = 1 - Math.exp(-dTau);
        const tC = TFromTheta(f.theta[id], f.p0[k]) - 273.15;
        acc += tC * emit * trans;
        trans *= Math.exp(-dTau);
      }
      irToRgba(acc + tSfc * trans, out, mapPix(i, j, nx, ny));
    }
  }
}

function irToRgba(tC: number, out: Uint8Array, o: number): void {
  lerpStops(Math.min(40, Math.max(-90, tC)), IR_STOPS, out, o, 255);
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
      velocityToRgba(vr, out, mapPix(i, j, nx, ny));
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
      tempToRgba(tC, out, mapPix(i, j, nx, ny));
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
      dewToRgba(tdC, out, mapPix(i, j, nx, ny));
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
    out[o] = MAP_BG[1];
    out[o + 1] = MAP_BG[2];
    out[o + 2] = MAP_BG[3];
    out[o + 3] = 255;
    return;
  }
  lerpStops(Math.min(75, dbz), REFL_STOPS, out, o, 255);
}

function velocityToRgba(vr: number, out: Uint8Array, o: number): void {
  lerpStops(Math.min(30, Math.max(-30, vr)), VEL_STOPS, out, o, 255);
}

function tempToRgba(tC: number, out: Uint8Array, o: number): void {
  lerpStops(Math.min(40, Math.max(-15, tC)), TEMP_STOPS, out, o, 255);
}

function dewToRgba(tdC: number, out: Uint8Array, o: number): void {
  lerpStops(Math.min(28, Math.max(-5, tdC)), DEW_STOPS, out, o, 255);
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
  if (cape < 100) {
    out[o] = MAP_BG[1];
    out[o + 1] = MAP_BG[2];
    out[o + 2] = MAP_BG[3];
    out[o + 3] = 255;
    return;
  }
  lerpStops(Math.min(5000, cape), CAPE_STOPS, out, o, 255);
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
