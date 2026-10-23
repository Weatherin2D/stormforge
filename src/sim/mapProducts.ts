import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import { integrateCapeCin } from "./cape";
import { surfacePressureBiasHpa } from "./synoptic";
import {
  CP,
  LV,
  TFromTheta,
  dewpointFromE,
  qsat,
  spdDirFromUv,
} from "./thermo";

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
  | "ir"
  // ── Thermodynamics ────────────────────────────────────────────────────────
  | "rh"
  | "thetae"
  | "lcl"
  | "lfc"
  | "el"
  | "frz"
  | "cape03"
  | "pwat"
  | "t850"
  | "td850"
  | "w850"
  // ── Wind and dynamics ─────────────────────────────────────────────────────
  | "wdir"
  | "wmax"
  | "w3k"
  | "shear06"
  | "conv"
  | "vort"
  | "mconv"
  | "uh25"
  // ── Clouds ────────────────────────────────────────────────────────────────
  | "ctop"
  | "cbase"
  | "cfr"
  | "clwc"
  | "lwp"
  // ── Radar and precipitation ───────────────────────────────────────────────
  | "refl1k"
  | "echotop"
  | "vil";

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

/** Low-level relative humidity: dry brown → saturated green/blue. */
const RH_STOPS: RgbaStop[] = [
  [0, 120, 78, 34],
  [25, 168, 138, 66],
  [45, 216, 206, 84],
  [65, 96, 190, 92],
  [80, 24, 150, 74],
  [100, 40, 96, 190],
];

/** Equivalent potential temperature, 300–380 K. */
const THETAE_STOPS: RgbaStop[] = [
  [300, 60, 40, 140],
  [312, 40, 90, 210],
  [324, 40, 180, 200],
  [334, 60, 200, 96],
  [344, 226, 220, 60],
  [356, 250, 150, 32],
  [368, 226, 48, 40],
  [380, 170, 30, 110],
];

/** LCL height, 0–4000 m. */
const LCL_STOPS: RgbaStop[] = [
  [0, 24, 36, 56],
  [400, 64, 116, 190],
  [900, 60, 190, 190],
  [1500, 80, 200, 90],
  [2400, 236, 214, 60],
  [3200, 244, 144, 40],
  [4000, 200, 44, 44],
];

/** Precipitable water, 0–70 mm. */
const PWAT_STOPS: RgbaStop[] = [
  [0, 20, 30, 48],
  [8, 44, 92, 170],
  [18, 40, 160, 190],
  [30, 70, 190, 100],
  [42, 232, 214, 60],
  [54, 244, 142, 40],
  [70, 210, 52, 160],
];

/** Bulk shear, 0–60 m/s. */
const SHEAR_STOPS: RgbaStop[] = [
  [0, 24, 36, 56],
  [8, 48, 110, 190],
  [16, 44, 180, 190],
  [25, 70, 196, 100],
  [35, 236, 214, 60],
  [45, 244, 120, 40],
  [55, 214, 44, 120],
  [60, 255, 255, 255],
];

/** Column-max updraft, 0–35 m/s. */
const WMAX_STOPS: RgbaStop[] = [
  [0, 24, 36, 56],
  [2, 46, 92, 180],
  [5, 40, 160, 200],
  [9, 70, 196, 110],
  [15, 236, 216, 70],
  [23, 244, 132, 36],
  [35, 220, 40, 60],
];

/** Cloud-top / echo-top height, 0–15 km. */
const TOP_STOPS: RgbaStop[] = [
  [0, 24, 36, 56],
  [2000, 52, 92, 190],
  [4000, 48, 168, 200],
  [6000, 66, 196, 108],
  [8000, 226, 214, 66],
  [10000, 244, 140, 40],
  [13000, 214, 44, 120],
  [15000, 255, 230, 255],
];

/** Cloud fraction, 0–100 %. */
const CFR_STOPS: RgbaStop[] = [
  [0, 22, 32, 48],
  [15, 60, 84, 116],
  [35, 120, 148, 180],
  [55, 182, 202, 222],
  [75, 226, 236, 246],
  [100, 255, 255, 255],
];

/** Cloud liquid water content, 0–6 g/kg. */
const CLWC_STOPS: RgbaStop[] = [
  [0, 22, 32, 48],
  [0.3, 44, 92, 180],
  [0.8, 40, 160, 200],
  [1.5, 70, 196, 110],
  [2.5, 236, 216, 70],
  [4, 244, 132, 36],
  [6, 220, 40, 60],
];

/** Liquid water path, 0–1200 g/m². */
const LWP_STOPS: RgbaStop[] = [
  [0, 22, 32, 48],
  [60, 44, 92, 180],
  [180, 40, 160, 200],
  [380, 70, 196, 110],
  [650, 236, 216, 70],
  [900, 244, 132, 36],
  [1200, 232, 232, 255],
];

/** Vertically integrated liquid, 0–75 kg/m². */
const VIL_STOPS: RgbaStop[] = [
  [0, 22, 32, 48],
  [5, 44, 92, 180],
  [15, 40, 160, 200],
  [28, 70, 196, 110],
  [40, 236, 216, 70],
  [55, 244, 132, 36],
  [68, 220, 40, 90],
  [75, 255, 210, 255],
];

/** Updraft helicity, 0–300 m²/s². */
const UH_STOPS: RgbaStop[] = [
  [0, 22, 32, 48],
  [25, 44, 92, 180],
  [75, 40, 168, 200],
  [150, 70, 196, 110],
  [220, 236, 216, 70],
  [270, 244, 120, 40],
  [300, 220, 40, 60],
];

/** Meteorological wind direction, circular 0–360°. */
const WDIR_STOPS: RgbaStop[] = [
  [0, 230, 90, 70],
  [45, 230, 170, 70],
  [90, 90, 200, 90],
  [135, 70, 200, 190],
  [180, 70, 130, 230],
  [225, 140, 100, 220],
  [270, 230, 190, 80],
  [315, 230, 110, 140],
  [360, 230, 90, 70],
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
  rh: {
    id: "rh",
    title: "Surface relative humidity",
    units: "%",
    legendCss: legendFromStops(RH_STOPS, 0, 100),
    ticks: ["0", "25", "50", "75", "100"],
    scale: { min: 0, max: 100, values: [0, 25, 50, 75, 100] },
  },
  thetae: {
    id: "thetae",
    title: "Surface equivalent potential temperature",
    units: "K",
    legendCss: legendFromStops(THETAE_STOPS, 300, 380),
    ticks: ["300", "320", "340", "360", "380"],
    scale: { min: 300, max: 380, values: [300, 320, 340, 360, 380] },
  },
  lcl: {
    id: "lcl",
    title: "Lifting condensation level (surface parcel)",
    units: "m",
    legendCss: legendFromStops(LCL_STOPS, 0, 4000),
    ticks: ["0", "1000", "2000", "3000", "4000"],
    scale: { min: 0, max: 4000, values: [0, 1000, 2000, 3000, 4000] },
  },
  lfc: {
    id: "lfc",
    title: "Level of free convection",
    units: "m",
    legendCss: legendFromStops(TOP_STOPS, 0, 15000),
    ticks: ["0", "3k", "6k", "9k", "12k", "15k"],
    scale: { min: 0, max: 15000, values: [0, 3000, 6000, 9000, 12000, 15000] },
  },
  el: {
    id: "el",
    title: "Equilibrium level",
    units: "m",
    legendCss: legendFromStops(TOP_STOPS, 0, 15000),
    ticks: ["0", "3k", "6k", "9k", "12k", "15k"],
    scale: { min: 0, max: 15000, values: [0, 3000, 6000, 9000, 12000, 15000] },
  },
  frz: {
    id: "frz",
    title: "Freezing-level height",
    units: "m",
    legendCss: legendFromStops(TOP_STOPS, 0, 15000),
    ticks: ["0", "3k", "6k", "9k", "12k", "15k"],
    scale: { min: 0, max: 15000, values: [0, 3000, 6000, 9000, 12000, 15000] },
  },
  cape03: {
    id: "cape03",
    title: "0–3 km CAPE",
    units: "J/kg",
    legendCss: legendFromStops(CAPE_LEGEND, 0, 5000),
    ticks: ["0", "1000", "2500", "5000"],
    scale: { min: 0, max: 5000, values: [0, 1000, 2500, 5000] },
  },
  pwat: {
    id: "pwat",
    title: "Precipitable water",
    units: "mm",
    legendCss: legendFromStops(PWAT_STOPS, 0, 70),
    ticks: ["0", "15", "30", "45", "60", "70"],
    scale: { min: 0, max: 70, values: [0, 15, 30, 45, 60, 70] },
  },
  t850: {
    id: "t850",
    title: "850 hPa temperature",
    units: "°C",
    legendCss: legendFromStops(TEMP_STOPS, -15, 40),
    ticks: ["-15", "0", "15", "30", "40"],
    scale: { min: -15, max: 40, values: [-15, 0, 15, 30, 40] },
  },
  td850: {
    id: "td850",
    title: "850 hPa dewpoint",
    units: "°C",
    legendCss: legendFromStops(DEW_STOPS, -5, 28),
    ticks: ["-5", "5", "15", "22", "28"],
    scale: { min: -5, max: 28, values: [-5, 5, 15, 22, 28] },
  },
  w850: {
    id: "w850",
    title: "850 hPa wind speed",
    units: "m/s",
    legendCss: legendFromStops(SHEAR_STOPS, 0, 60),
    ticks: ["0", "15", "30", "45", "60"],
    scale: { min: 0, max: 60, values: [0, 15, 30, 45, 60] },
  },
  wdir: {
    id: "wdir",
    title: "Surface wind direction (from)",
    units: "°",
    legendCss: legendFromStops(WDIR_STOPS, 0, 360),
    ticks: ["N", "E", "S", "W", "N"],
    scale: { min: 0, max: 360, values: [0, 90, 180, 270, 360] },
  },
  wmax: {
    id: "wmax",
    title: "Column-max updraft",
    units: "m/s",
    legendCss: legendFromStops(WMAX_STOPS, 0, 35),
    ticks: ["0", "5", "10", "20", "35"],
    scale: { min: 0, max: 35, values: [0, 5, 10, 20, 35] },
  },
  w3k: {
    id: "w3k",
    title: "3 km vertical velocity",
    units: "m/s",
    legendCss:
      "linear-gradient(90deg,#2040ff 0%,#a0c0ff 35%,#b8b8b8 50%,#ffb0a0 65%,#ff2020 100%)",
    ticks: ["-15", "-5", "0", "+5", "+15"],
  },
  shear06: {
    id: "shear06",
    title: "0–6 km bulk shear",
    units: "m/s",
    legendCss: legendFromStops(SHEAR_STOPS, 0, 60),
    ticks: ["0", "15", "30", "45", "60"],
    scale: { min: 0, max: 60, values: [0, 15, 30, 45, 60] },
  },
  conv: {
    id: "conv",
    title: "Surface wind convergence",
    units: "10⁻⁴ s⁻¹",
    legendCss:
      "linear-gradient(90deg,#2040ff 0%,#a0c0ff 40%,#f0f0f0 50%,#ffb0a0 60%,#ff2020 100%)",
    ticks: ["-20", "0", "+20"],
  },
  vort: {
    id: "vort",
    title: "Surface relative vorticity",
    units: "10⁻⁴ s⁻¹",
    legendCss:
      "linear-gradient(90deg,#2040ff 0%,#a0c0ff 40%,#f0f0f0 50%,#ffb0a0 60%,#ff2020 100%)",
    ticks: ["-20", "0", "+20"],
  },
  mconv: {
    id: "mconv",
    title: "Surface moisture convergence",
    units: "10⁻⁶ kg kg⁻¹ s⁻¹",
    legendCss:
      "linear-gradient(90deg,#2040ff 0%,#a0c0ff 40%,#f0f0f0 50%,#ffb0a0 60%,#ff2020 100%)",
    ticks: ["-20", "0", "+20"],
  },
  uh25: {
    id: "uh25",
    title: "2–5 km updraft helicity",
    units: "m²/s²",
    legendCss: legendFromStops(UH_STOPS, 0, 300),
    ticks: ["0", "75", "150", "225", "300"],
    scale: { min: 0, max: 300, values: [0, 75, 150, 225, 300] },
  },
  ctop: {
    id: "ctop",
    title: "Cloud-top height",
    units: "m",
    legendCss: legendFromStops(TOP_STOPS, 0, 15000),
    ticks: ["0", "3k", "6k", "9k", "12k", "15k"],
    scale: { min: 0, max: 15000, values: [0, 3000, 6000, 9000, 12000, 15000] },
  },
  cbase: {
    id: "cbase",
    title: "Cloud-base height",
    units: "m",
    legendCss: legendFromStops(TOP_STOPS, 0, 15000),
    ticks: ["0", "3k", "6k", "9k", "12k", "15k"],
    scale: { min: 0, max: 15000, values: [0, 3000, 6000, 9000, 12000, 15000] },
  },
  cfr: {
    id: "cfr",
    title: "Cloud fraction",
    units: "%",
    legendCss: legendFromStops(CFR_STOPS, 0, 100),
    ticks: ["0", "25", "50", "75", "100"],
    scale: { min: 0, max: 100, values: [0, 25, 50, 75, 100] },
  },
  clwc: {
    id: "clwc",
    title: "Column-max cloud liquid water",
    units: "g/kg",
    legendCss: legendFromStops(CLWC_STOPS, 0, 6),
    ticks: ["0", "1", "2", "4", "6"],
    scale: { min: 0, max: 6, values: [0, 1, 2, 4, 6] },
  },
  lwp: {
    id: "lwp",
    title: "Liquid water path",
    units: "g/m²",
    legendCss: legendFromStops(LWP_STOPS, 0, 1200),
    ticks: ["0", "200", "400", "800", "1200"],
    scale: { min: 0, max: 1200, values: [0, 200, 400, 800, 1200] },
  },
  refl1k: {
    id: "refl1k",
    title: "1 km reflectivity",
    units: "dBZ",
    legendCss: legendFromStops(REFL_STOPS, 5, 75),
    ticks: ["5", "20", "35", "50", "65", "75"],
    scale: { min: 5, max: 75, values: [5, 20, 35, 50, 65, 75] },
  },
  echotop: {
    id: "echotop",
    title: "18 dBZ echo-top height",
    units: "km",
    legendCss: legendFromStops(TOP_STOPS, 0, 15000),
    ticks: ["0", "4", "8", "12", "15"],
    scale: { min: 0, max: 15000, values: [0, 4000, 8000, 12000, 15000] },
  },
  vil: {
    id: "vil",
    title: "Vertically integrated liquid",
    units: "kg/m²",
    legendCss: legendFromStops(VIL_STOPS, 0, 75),
    ticks: ["0", "15", "30", "45", "60", "75"],
    scale: { min: 0, max: 75, values: [0, 15, 30, 45, 60, 75] },
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
    case "rh":
      packSurfaceRh(grid, fields, out);
      break;
    case "thetae":
      packSurfaceThetaE(grid, fields, out);
      break;
    case "lcl":
      packLcl(grid, fields, out);
      break;
    case "lfc":
      packThermo(grid, fields, out, "lfc");
      break;
    case "el":
      packThermo(grid, fields, out, "el");
      break;
    case "frz":
      packFreezingLevel(grid, fields, out);
      break;
    case "cape03":
      packThermo(grid, fields, out, "cape03");
      break;
    case "pwat":
      packPwat(grid, fields, out);
      break;
    case "t850":
      packTempAt(grid, fields, out, 85000);
      break;
    case "td850":
      packDewAt(grid, fields, out, 85000);
      break;
    case "w850":
      packWindAt(grid, fields, out, 85000);
      break;
    case "wdir":
      packWindDirection(grid, fields, out);
      break;
    case "wmax":
      packColumnMaxW(grid, fields, out);
      break;
    case "w3k":
      packVerticalVelocityAt(grid, fields, out, 3000);
      break;
    case "shear06":
      packBulkShear06(grid, fields, out);
      break;
    case "conv":
      packSurfaceConvergence(grid, fields, out);
      break;
    case "vort":
      packSurfaceVorticity(grid, fields, out);
      break;
    case "mconv":
      packMoistureConvergence(grid, fields, out);
      break;
    case "uh25":
      packUpdraftHelicity(grid, fields, out);
      break;
    case "ctop":
      packCloudTop(grid, fields, out);
      break;
    case "cbase":
      packCloudBase(grid, fields, out);
      break;
    case "cfr":
      packCloudFraction(grid, fields, out);
      break;
    case "clwc":
      packCloudLwc(grid, fields, out);
      break;
    case "lwp":
      packLiquidWaterPath(grid, fields, out);
      break;
    case "refl1k":
      packReflectivityAt(grid, fields, out, 1000);
      break;
    case "echotop":
      packEchoTop(grid, fields, out);
      break;
    case "vil":
      packVil(grid, fields, out);
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
  which: "cape" | "cin" | "cape03" | "lfc" | "el",
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
      else if (which === "cin") cinToRgba(idx.cin, out, pix);
      else if (which === "cape03") capeToRgba(idx.cape0to3, out, pix);
      else if (which === "lfc") topToRgba(idx.lfcM, out, pix);
      else topToRgba(idx.elM, out, pix);
    }
  }
}

function topToRgba(heightM: number, out: Uint8Array, o: number): void {
  if (heightM <= 0) {
    out[o] = MAP_BG[1];
    out[o + 1] = MAP_BG[2];
    out[o + 2] = MAP_BG[3];
    out[o + 3] = 255;
    return;
  }
  lerpStops(clamp(heightM, 0, 15000), TOP_STOPS, out, o, 255);
}

/** Height where the environment first reaches 0 °C, linearly interpolated. */
function packFreezingLevel(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz, dz } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let height = 0;
      let prevT = TFromTheta(f.theta[grid.idx(i, j, 0)], f.p0[0]);
      for (let k = 1; k < nz; k++) {
        const T = TFromTheta(f.theta[grid.idx(i, j, k)], f.p0[k]);
        if (prevT > 273.15 && T <= 273.15) {
          const frac = (prevT - 273.15) / Math.max(1e-6, prevT - T);
          height = (k - 1 + frac + 0.5) * dz;
          break;
        }
        prevT = T;
      }
      topToRgba(height, out, mapPix(i, j, nx, ny));
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
export const DBZ_FLOOR = 0;
export const DBZ_SCALE_MAX = 70;

/** 0 at 0 dBZ, 1 at 70 dBZ with specified gradient. */
export function dbzOpacity(dbz: number): number {
  if (dbz <= 0) return 0;
  if (dbz <= 10) {
    const t = (dbz - 0) / 10;
    return 0.25 * t;
  }
  if (dbz <= 25) {
    const t = (dbz - 10) / 15;
    return 0.25 + (0.5 - 0.25) * t;
  }
  if (dbz <= 42) {
    const t = (dbz - 25) / 17;
    return 0.5 + (0.75 - 0.5) * t;
  }
  if (dbz <= 65) {
    const t = (dbz - 42) / 23;
    return 0.75 + (0.95 - 0.75) * t;
  }
  if (dbz >= 70) return 1.0;
  const t = (dbz - 65) / 5;
  return 0.95 + (1.0 - 0.95) * t;
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

// ───────────────────────────────────────────────────────────────────────────
// Derived 2D fields (see src/sim/viewCatalog.ts for provenance and formulas)
// ───────────────────────────────────────────────────────────────────────────

/** Cloud and rain are treated as "present" above this mixing ratio (kg/kg). */
const CLOUD_THRESHOLD = 1e-4;
/** Echo top uses this radar-equivalent threshold. */
const ECHO_TOP_DBZ = 18;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Index of the model level whose base pressure is closest to `pPa`. */
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

/** Surface temperature / dewpoint (°C) from the lowest model level. */
function surfaceTdC(f: SimFields, id: number, p0: number): number {
  const qv = Math.max(0, f.qv[id]);
  if (qv <= 1e-12) return -80;
  return dewpointFromE(Math.max(1, (qv * p0) / (0.622 + qv)));
}

function packSurfaceRh(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  const p = f.p0[0];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id = grid.idx(i, j, 0);
      const T = TFromTheta(f.theta[id], p);
      const qs = qsat(T, p);
      const rh = qs > 1e-12 ? (Math.max(0, f.qv[id]) / qs) * 100 : 0;
      lerpStops(clamp(rh, 0, 100), RH_STOPS, out, mapPix(i, j, nx, ny), 255);
    }
  }
}

function packSurfaceThetaE(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  const p = f.p0[0];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id = grid.idx(i, j, 0);
      const T = TFromTheta(f.theta[id], p);
      const qv = Math.max(0, f.qv[id]);
      const thetaE = f.theta[id] * Math.exp((LV * qv) / (CP * Math.max(T, 1)));
      lerpStops(
        clamp(thetaE, 300, 380),
        THETAE_STOPS,
        out,
        mapPix(i, j, nx, ny),
        255,
      );
    }
  }
}

/** LCL from the surface parcel: 125 m per °C of T−Td (rough estimate). */
function packLcl(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  const p = f.p0[0];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id = grid.idx(i, j, 0);
      const tC = TFromTheta(f.theta[id], p) - 273.15;
      const tdC = surfaceTdC(f, id, p);
      const lcl = clamp(125 * (tC - tdC), 0, 4000);
      lerpStops(lcl, LCL_STOPS, out, mapPix(i, j, nx, ny), 255);
    }
  }
}

/** Column water vapour: Σ ρ·qv·dz. 1 kg/m² = 1 mm of precipitable water. */
function packPwat(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz, dz } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let pw = 0;
      for (let k = 0; k < nz; k++) {
        const id = grid.idx(i, j, k);
        pw += f.rho0[k] * Math.max(0, f.qv[id]) * dz;
      }
      lerpStops(clamp(pw, 0, 70), PWAT_STOPS, out, mapPix(i, j, nx, ny), 255);
    }
  }
}

function packTempAt(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
  pPa: number,
): void {
  const { nx, ny } = grid;
  const k = pressureLevelK(f, pPa);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id = grid.idx(i, j, k);
      tempToRgba(
        TFromTheta(f.theta[id], f.p0[k]) - 273.15,
        out,
        mapPix(i, j, nx, ny),
      );
    }
  }
}

function packDewAt(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
  pPa: number,
): void {
  const { nx, ny } = grid;
  const k = pressureLevelK(f, pPa);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id = grid.idx(i, j, k);
      dewToRgba(
        surfaceTdC(f, id, f.p0[k]),
        out,
        mapPix(i, j, nx, ny),
      );
    }
  }
}

function packWindAt(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
  pPa: number,
): void {
  const { nx, ny } = grid;
  const k = pressureLevelK(f, pPa);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const spd = Math.hypot(
        grid.uCenter(f.u, i, j, k),
        grid.vCenter(f.v, i, j, k),
      );
      lerpStops(
        clamp(spd, 0, 60),
        SHEAR_STOPS,
        out,
        mapPix(i, j, nx, ny),
        255,
      );
    }
  }
}

/** Meteorological direction the surface wind blows FROM. Calm is dark. */
function packWindDirection(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const u = grid.uCenter(f.u, i, j, 0);
      const v = grid.vCenter(f.v, i, j, 0);
      const { dir, spd } = spdDirFromUv(u, v);
      const o = mapPix(i, j, nx, ny);
      if (spd < 0.1) {
        out[o] = MAP_BG[1];
        out[o + 1] = MAP_BG[2];
        out[o + 2] = MAP_BG[3];
        out[o + 3] = 255;
      } else {
        lerpStops(dir, WDIR_STOPS, out, o, 255);
      }
    }
  }
}

function packColumnMaxW(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let wMax = 0;
      for (let k = 0; k < nz; k++) {
        const w = grid.wCenter(f.w, i, j, k);
        if (w > wMax) wMax = w;
      }
      lerpStops(
        clamp(wMax, 0, 35),
        WMAX_STOPS,
        out,
        mapPix(i, j, nx, ny),
        255,
      );
    }
  }
}

/** 0–6 km bulk shear from the base-state sounding (uniform in x/y). */
function packBulkShear06(grid: Grid3D, f: SimFields, out: Uint8Array): void {  const { nx, ny, nz, dz } = grid;
  const k6 = Math.min(nz - 1, Math.max(0, Math.round(6000 / Math.max(dz, 1))));
  const shear = Math.hypot(f.u0[k6] - f.u0[0], f.v0[k6] - f.v0[0]);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      lerpStops(
        clamp(shear, 0, 60),
        SHEAR_STOPS,
        out,
        mapPix(i, j, nx, ny),
        255,
      );
    }
  }
}

function packVerticalVelocityAt(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
  zM: number,
): void {
  const { nx, ny, nz, dz } = grid;
  const k = Math.min(nz - 2, Math.max(0, Math.round(zM / Math.max(dz, 1))));
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      divergingToRgba(
        clamp(grid.wCenter(f.w, i, j, k), -15, 15),
        -15,
        15,
        out,
        mapPix(i, j, nx, ny),
      );
    }
  }
}

/** Horizontal wind convergence at the surface: −(∂u/∂x + ∂v/∂y) × 10⁴. */
function packSurfaceConvergence(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
): void {
  const { nx, ny, dx, dy } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const ip = Math.min(nx - 1, i + 1);
      const im = Math.max(0, i - 1);
      const jp = Math.min(ny - 1, j + 1);
      const jm = Math.max(0, j - 1);
      const duDx =
        (grid.uCenter(f.u, ip, j, 0) - grid.uCenter(f.u, im, j, 0)) /
        Math.max(1e-3, (ip - im) * dx);
      const dvDy =
        (grid.vCenter(f.v, i, jp, 0) - grid.vCenter(f.v, i, jm, 0)) /
        Math.max(1e-3, (jp - jm) * dy);
      const conv = -(duDx + dvDy) * 1e4;
      divergingToRgba(
        clamp(conv, -20, 20),
        -20,
        20,
        out,
        mapPix(i, j, nx, ny),
      );
    }
  }
}

/** Relative vorticity at the surface: ∂v/∂x − ∂u/∂y, × 10⁴. */
function packSurfaceVorticity(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
): void {
  const { nx, ny, dx, dy } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const ip = Math.min(nx - 1, i + 1);
      const im = Math.max(0, i - 1);
      const jp = Math.min(ny - 1, j + 1);
      const jm = Math.max(0, j - 1);
      const dvDx =
        (grid.vCenter(f.v, ip, j, 0) - grid.vCenter(f.v, im, j, 0)) /
        Math.max(1e-3, (ip - im) * dx);
      const duDy =
        (grid.uCenter(f.u, i, jp, 0) - grid.uCenter(f.u, i, jm, 0)) /
        Math.max(1e-3, (jp - jm) * dy);
      const zeta = (dvDx - duDy) * 1e4;
      divergingToRgba(
        clamp(zeta, -20, 20),
        -20,
        20,
        out,
        mapPix(i, j, nx, ny),
      );
    }
  }
}

/** Surface moisture convergence: −∇·(qv·V), scaled to 10⁻⁶ kg kg⁻¹ s⁻¹. */
function packMoistureConvergence(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
): void {
  const { nx, ny, dx, dy } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const ip = Math.min(nx - 1, i + 1);
      const im = Math.max(0, i - 1);
      const jp = Math.min(ny - 1, j + 1);
      const jm = Math.max(0, j - 1);
      const qip = Math.max(0, f.qv[grid.idx(ip, j, 0)]);
      const qim = Math.max(0, f.qv[grid.idx(im, j, 0)]);
      const qjp = Math.max(0, f.qv[grid.idx(i, jp, 0)]);
      const qjm = Math.max(0, f.qv[grid.idx(i, jm, 0)]);
      const dquDx =
        (qip * grid.uCenter(f.u, ip, j, 0) -
          qim * grid.uCenter(f.u, im, j, 0)) /
        Math.max(1e-3, (ip - im) * dx);
      const dqvDy =
        (qjp * grid.vCenter(f.v, i, jp, 0) -
          qjm * grid.vCenter(f.v, i, jm, 0)) /
        Math.max(1e-3, (jp - jm) * dy);
      const mconv = -(dquDx + dqvDy) * 1e6;
      divergingToRgba(
        clamp(mconv, -30, 30),
        -30,
        30,
        out,
        mapPix(i, j, nx, ny),
      );
    }
  }
}

/**
 * 2–5 km updraft helicity: ∫ w·ζ dz over the 2–5 km layer, updrafts only.
 * This is a storm-scale diagnostic, not an observed rotation measurement.
 */
function packUpdraftHelicity(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
): void {
  const { nx, ny, nz, dz, dx, dy } = grid;
  const k0 = Math.max(1, Math.floor(2000 / Math.max(dz, 1)));
  const k1 = Math.min(nz - 2, Math.ceil(5000 / Math.max(dz, 1)));
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const ip = Math.min(nx - 1, i + 1);
      const im = Math.max(0, i - 1);
      const jp = Math.min(ny - 1, j + 1);
      const jm = Math.max(0, j - 1);
      let uh = 0;
      for (let k = k0; k <= k1; k++) {
        const w = grid.wCenter(f.w, i, j, k);
        if (w <= 0) continue;
        const dvDx =
          (grid.vCenter(f.v, ip, j, k) - grid.vCenter(f.v, im, j, k)) /
          Math.max(1e-3, (ip - im) * dx);
        const duDy =
          (grid.uCenter(f.u, i, jp, k) - grid.uCenter(f.u, i, jm, k)) /
          Math.max(1e-3, (jp - jm) * dy);
        uh += w * (dvDx - duDy) * dz;
      }
      lerpStops(
        clamp(uh, 0, 300),
        UH_STOPS,
        out,
        mapPix(i, j, nx, ny),
        255,
      );
    }
  }
}

/** Height (m) of the highest level containing cloud or rain water. */
function packCloudTop(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz, dz } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let top = 0;
      for (let k = 0; k < nz; k++) {
        const id = grid.idx(i, j, k);
        if (f.qc[id] + f.qr[id] > CLOUD_THRESHOLD) top = (k + 0.5) * dz;
      }
      lerpStops(
        clamp(top, 0, 15000),
        TOP_STOPS,
        out,
        mapPix(i, j, nx, ny),
        255,
      );
    }
  }
}

/** Height (m) of the lowest level containing cloud or rain water. */
function packCloudBase(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz, dz } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let base = 0;
      for (let k = 0; k < nz; k++) {
        const id = grid.idx(i, j, k);
        if (f.qc[id] + f.qr[id] > CLOUD_THRESHOLD) {
          base = (k + 0.5) * dz;
          break;
        }
      }
      lerpStops(
        clamp(base, 0, 15000),
        TOP_STOPS,
        out,
        mapPix(i, j, nx, ny),
        255,
      );
    }
  }
}

/** Fraction of column levels that carry cloud or rain water. */
function packCloudFraction(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let n = 0;
      for (let k = 0; k < nz; k++) {
        const id = grid.idx(i, j, k);
        if (f.qc[id] + f.qr[id] > CLOUD_THRESHOLD) n++;
      }
      const frac = (n / Math.max(1, nz)) * 100;
      lerpStops(frac, CFR_STOPS, out, mapPix(i, j, nx, ny), 255);
    }
  }
}

/** Column-max cloud liquid-water content (g/kg). Ice is not modelled. */
function packCloudLwc(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let lwc = 0;
      for (let k = 0; k < nz; k++) {
        const qc = Math.max(0, f.qc[grid.idx(i, j, k)]);
        if (qc > lwc) lwc = qc;
      }
      lerpStops(
        clamp(lwc * 1000, 0, 6),
        CLWC_STOPS,
        out,
        mapPix(i, j, nx, ny),
        255,
      );
    }
  }
}

/** Column-integrated cloud liquid water (g/m²). */
function packLiquidWaterPath(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
): void {
  const { nx, ny, nz, dz } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let lwp = 0;
      for (let k = 0; k < nz; k++) {
        const id = grid.idx(i, j, k);
        lwp += f.rho0[k] * Math.max(0, f.qc[id]) * dz * 1000;
      }
      lerpStops(
        clamp(lwp, 0, 1200),
        LWP_STOPS,
        out,
        mapPix(i, j, nx, ny),
        255,
      );
    }
  }
}

/** Reflectivity at a fixed height (used for the 1 km product). */
function packReflectivityAt(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
  zM: number,
): void {
  const { nx, ny, nz, dz } = grid;
  const k = Math.min(nz - 1, Math.max(0, Math.round(zM / Math.max(dz, 1))));
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id = grid.idx(i, j, k);
      const w = grid.wCenter(f.w, i, j, k);
      dbzToRgba(reflectivityDbz(f.qr[id], f.qc[id], w), out, mapPix(i, j, nx, ny));
    }
  }
}

/** Highest level whose radar-equivalent reflectivity reaches 18 dBZ. */
function packEchoTop(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz, dz } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let top = 0;
      for (let k = 0; k < nz; k++) {
        const id = grid.idx(i, j, k);
        const w = grid.wCenter(f.w, i, j, k);
        if (reflectivityDbz(f.qr[id], f.qc[id], w) >= ECHO_TOP_DBZ) {
          top = (k + 0.5) * dz;
        }
      }
      lerpStops(
        clamp(top, 0, 15000),
        TOP_STOPS,
        out,
        mapPix(i, j, nx, ny),
        255,
      );
    }
  }
}

/** Vertically integrated liquid water (kg/m²). */
function packVil(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz, dz } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let vil = 0;
      for (let k = 0; k < nz; k++) {
        const id = grid.idx(i, j, k);
        vil += f.rho0[k] * Math.max(0, f.qr[id]) * dz;
      }
      lerpStops(clamp(vil, 0, 75), VIL_STOPS, out, mapPix(i, j, nx, ny), 255);
    }
  }
}
