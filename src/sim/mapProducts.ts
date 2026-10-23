import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import { hailMaxDiameter } from "./coldMicrophysics";
import { integrateCapeCin } from "./cape";
import {
  DERIVED_LEGENDS,
  packDerivedProduct,
  type DerivedProductId,
} from "./mapDerived";
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
  | "t925"
  | "t700"
  | "t500"
  | "t850"
  | "td925"
  | "td700"
  | "td500"
  | "td850"
  | "w850"
  // ── Wind and dynamics ─────────────────────────────────────────────────────
  | "wdir"
  | "wmax"
  | "w3k"
  | "shear01"
  | "shear03"
  | "shear06"
  | "conv"
  | "div"
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
  | "vil"
  | "precip"
  | "paccum"
  | "preciptype"
  // ── Cold species ──────────────────────────────────────────────────────────
  | "graupel"
  | "snowice"
  | "hailsize"
  // ── Synoptic ──────────────────────────────────────────────────────────────
  | "mslp"
  // ── Derived instability and parcel diagnostics ────────────────────────────
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
  // ── Derived moisture and surface thermodynamics ───────────────────────────
  | "dptdep"
  | "qsfc"
  | "mixratio"
  | "mflux"
  | "dryint"
  | "blrh"
  | "wetbulb"
  | "evappot"
  // ── Derived cloud structure ───────────────────────────────────────────────
  | "cice"
  | "iwp"
  | "cttemp"
  | "cdepth"
  | "overshoot"
  | "ctdiv"
  | "downdraft"
  // ── Derived wind and dynamics ─────────────────────────────────────────────
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
  // ── Derived precipitation and synoptic fields ─────────────────────────────
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

/** Surface precipitation rate, 0–60 mm/h. */
const PRECIP_STOPS: RgbaStop[] = [
  [0, 22, 32, 48],
  [0.5, 30, 78, 120],
  [2, 40, 150, 170],
  [6, 60, 190, 110],
  [12, 236, 216, 70],
  [25, 244, 132, 36],
  [40, 220, 40, 60],
  [60, 200, 90, 220],
];

/** Storm-total accumulation, 0–100 mm. */
const ACCUM_STOPS: RgbaStop[] = [
  [0, 22, 32, 48],
  [2, 32, 84, 130],
  [8, 40, 156, 176],
  [20, 70, 196, 110],
  [40, 238, 216, 70],
  [65, 244, 128, 36],
  [100, 210, 50, 190],
];

/** Graupel mixing ratio, 0–3 g/kg. */
const GRAUPEL_STOPS: RgbaStop[] = [
  [0, 22, 32, 48],
  [0.1, 54, 88, 150],
  [0.4, 60, 160, 190],
  [0.9, 80, 200, 120],
  [1.5, 236, 216, 70],
  [2.2, 244, 132, 36],
  [3, 240, 220, 255],
];

/** Snow + cloud ice mixing ratio, 0–6 g/kg. */
const SNOW_STOPS: RgbaStop[] = [
  [0, 22, 32, 48],
  [0.2, 58, 92, 158],
  [0.8, 78, 156, 206],
  [1.8, 140, 198, 226],
  [3.2, 214, 230, 240],
  [6, 255, 255, 255],
];

/** Hail diameter, 0–80 mm. */
const HAIL_STOPS: RgbaStop[] = [
  [0, 22, 32, 48],
  [5, 40, 120, 170],
  [12, 60, 190, 140],
  [25, 236, 216, 70],
  [40, 244, 120, 36],
  [60, 214, 40, 70],
  [80, 255, 230, 255],
];

/** Mean sea-level pressure, 980–1040 hPa. */
const MSLP_STOPS: RgbaStop[] = [
  [980, 60, 40, 170],
  [995, 60, 110, 220],
  [1005, 130, 190, 230],
  [1013, 236, 236, 240],
  [1021, 250, 210, 130],
  [1030, 240, 140, 60],
  [1040, 190, 50, 50],
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

/** Compact metadata builder for the derived-scalar products. */
function pm(
  id: MapProductId,
  title: string,
  units: string,
  legendCss: string,
  min: number,
  max: number,
  values: number[],
  ticks: string[],
): MapProductMeta {
  return {
    id,
    title,
    units,
    legendCss,
    ticks,
    scale: { min, max, values },
  };
}

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
  t925: {
    id: "t925",
    title: "925 hPa temperature",
    units: "°C",
    legendCss: legendFromStops(TEMP_STOPS, -15, 40),
    ticks: ["-15", "0", "15", "30", "40"],
    scale: { min: -15, max: 40, values: [-15, 0, 15, 30, 40] },
  },
  t700: {
    id: "t700",
    title: "700 hPa temperature",
    units: "°C",
    legendCss: legendFromStops(TEMP_STOPS, -15, 40),
    ticks: ["-15", "0", "15", "30", "40"],
    scale: { min: -15, max: 40, values: [-15, 0, 15, 30, 40] },
  },
  t500: {
    id: "t500",
    title: "500 hPa temperature",
    units: "°C",
    legendCss: legendFromStops(TEMP_STOPS, -15, 40),
    ticks: ["-15", "0", "15", "30", "40"],
    scale: { min: -15, max: 40, values: [-15, 0, 15, 30, 40] },
  },
  td925: {
    id: "td925",
    title: "925 hPa dewpoint",
    units: "°C",
    legendCss: legendFromStops(DEW_STOPS, -5, 28),
    ticks: ["-5", "5", "15", "22", "28"],
    scale: { min: -5, max: 28, values: [-5, 5, 15, 22, 28] },
  },
  td700: {
    id: "td700",
    title: "700 hPa dewpoint",
    units: "°C",
    legendCss: legendFromStops(DEW_STOPS, -5, 28),
    ticks: ["-5", "5", "15", "22", "28"],
    scale: { min: -5, max: 28, values: [-5, 5, 15, 22, 28] },
  },
  td500: {
    id: "td500",
    title: "500 hPa dewpoint",
    units: "°C",
    legendCss: legendFromStops(DEW_STOPS, -5, 28),
    ticks: ["-5", "5", "15", "22", "28"],
    scale: { min: -5, max: 28, values: [-5, 5, 15, 22, 28] },
  },
  shear01: {
    id: "shear01",
    title: "0–1 km bulk shear",
    units: "m/s",
    legendCss: legendFromStops(SHEAR_STOPS, 0, 60),
    ticks: ["0", "15", "30", "45", "60"],
    scale: { min: 0, max: 60, values: [0, 15, 30, 45, 60] },
  },
  shear03: {
    id: "shear03",
    title: "0–3 km bulk shear",
    units: "m/s",
    legendCss: legendFromStops(SHEAR_STOPS, 0, 60),
    ticks: ["0", "15", "30", "45", "60"],
    scale: { min: 0, max: 60, values: [0, 15, 30, 45, 60] },
  },
  div: {
    id: "div",
    title: "Surface wind divergence",
    units: "10⁻⁴ s⁻¹",
    legendCss:
      "linear-gradient(90deg,#2040ff 0%,#a0c0ff 40%,#f0f0f0 50%,#ffb0a0 60%,#ff2020 100%)",
    ticks: ["-20", "0", "+20"],
  },
  precip: {
    id: "precip",
    title: "Surface precipitation rate",
    units: "mm/h",
    legendCss: legendFromStops(PRECIP_STOPS, 0, 60),
    ticks: ["0", "2", "6", "12", "25", "40", "60"],
    scale: { min: 0, max: 60, values: [0, 2, 6, 12, 25, 40, 60] },
  },
  paccum: {
    id: "paccum",
    title: "Accumulated precipitation",
    units: "mm",
    legendCss: legendFromStops(ACCUM_STOPS, 0, 100),
    ticks: ["0", "2", "8", "20", "40", "65", "100"],
    scale: { min: 0, max: 100, values: [0, 2, 8, 20, 40, 65, 100] },
  },
  preciptype: {
    id: "preciptype",
    title: "Precipitation type at the surface",
    units: "—",
    legendCss:
      "linear-gradient(90deg,#141820 0%,#3c78e0 26%,#b07ad8 52%,#38b060 78%,#dcf0ff 100%)",
    ticks: ["none", "snow", "mixed", "rain"],
  },
  graupel: {
    id: "graupel",
    title: "Column-max graupel",
    units: "g/kg",
    legendCss: legendFromStops(GRAUPEL_STOPS, 0, 3),
    ticks: ["0", "0.4", "0.9", "1.5", "2.2", "3"],
    scale: { min: 0, max: 3, values: [0, 0.4, 0.9, 1.5, 2.2, 3] },
  },
  snowice: {
    id: "snowice",
    title: "Column-max snow and cloud ice",
    units: "g/kg",
    legendCss: legendFromStops(SNOW_STOPS, 0, 6),
    ticks: ["0", "0.8", "1.8", "3.2", "6"],
    scale: { min: 0, max: 6, values: [0, 0.8, 1.8, 3.2, 6] },
  },
  hailsize: {
    id: "hailsize",
    title: "Column-max hail diameter",
    units: "mm",
    legendCss: legendFromStops(HAIL_STOPS, 0, 80),
    ticks: ["0", "5", "12", "25", "40", "60", "80"],
    scale: { min: 0, max: 80, values: [0, 5, 12, 25, 40, 60, 80] },
  },
  mslp: {
    id: "mslp",
    title: "Mean sea-level pressure",
    units: "hPa",
    legendCss: legendFromStops(MSLP_STOPS, 980, 1040),
    ticks: ["980", "995", "1005", "1013", "1021", "1030", "1040"],
    scale: { min: 980, max: 1040, values: [980, 995, 1005, 1013, 1021, 1030, 1040] },
  },
  // ── Derived instability and parcel diagnostics ────────────────────────────
  mlcape: pm("mlcape", "Mixed-layer CAPE (lowest 100 hPa)", "J/kg", DERIVED_LEGENDS.scalar, 0, 5000, [0, 1000, 2500, 5000], ["0", "1000", "2500", "5000"]),
  mucape: pm("mucape", "Most-unstable CAPE", "J/kg", DERIVED_LEGENDS.scalar, 0, 5000, [0, 1000, 2500, 5000], ["0", "1000", "2500", "5000"]),
  li: pm("li", "Lifted index (500 hPa)", "K", DERIVED_LEGENDS.diverging, -10, 10, [-10, 0, 10], ["-10", "0", "+10"]),
  showalter: pm("showalter", "Showalter index", "K", DERIVED_LEGENDS.diverging, -8, 8, [-8, 0, 8], ["-8", "0", "+8"]),
  kindex: pm("kindex", "K index", "K", DERIVED_LEGENDS.scalar, 0, 50, [0, 15, 30, 50], ["0", "15", "30", "50"]),
  totaltotals: pm("totaltotals", "Total totals index", "K", DERIVED_LEGENDS.scalar, 40, 70, [40, 50, 60, 70], ["40", "50", "60", "70"]),
  lapse700500: pm("lapse700500", "700–500 hPa lapse rate", "K/km", DERIVED_LEGENDS.scalar, 3, 10, [3, 5, 7, 10], ["3", "5", "7", "10"]),
  lapse03: pm("lapse03", "0–3 km lapse rate", "K/km", DERIVED_LEGENDS.scalar, 3, 10, [3, 5, 7, 10], ["3", "5", "7", "10"]),
  wbz: pm("wbz", "Wet-bulb-zero height", "m", DERIVED_LEGENDS.scalar, 0, 5000, [0, 1000, 2000, 3000, 5000], ["0", "1k", "2k", "3k", "5k"]),
  convtemp: pm("convtemp", "Convective temperature", "°C", DERIVED_LEGENDS.scalar, 5, 45, [5, 15, 25, 35, 45], ["5", "15", "25", "35", "45"]),
  dcape: pm("dcape", "Downdraft CAPE (DCAPE)", "J/kg", DERIVED_LEGENDS.scalar, 0, 2000, [0, 500, 1000, 2000], ["0", "500", "1000", "2000"]),
  capeshear: pm("capeshear", "CAPE × 0–6 km shear", "J·m/(kg·s)", DERIVED_LEGENDS.scalar, 0, 300000, [0, 75000, 150000, 300000], ["0", "75k", "150k", "300k"]),
  // ── Derived moisture and surface thermodynamics ───────────────────────────
  dptdep: pm("dptdep", "Surface dew-point depression", "K", DERIVED_LEGENDS.scalar, 0, 30, [0, 10, 20, 30], ["0", "10", "20", "30"]),
  qsfc: pm("qsfc", "Surface specific humidity", "g/kg", DERIVED_LEGENDS.scalar, 0, 25, [0, 5, 10, 15, 25], ["0", "5", "10", "15", "25"]),
  mixratio: pm("mixratio", "Surface water-vapour mixing ratio", "g/kg", DERIVED_LEGENDS.scalar, 0, 25, [0, 5, 10, 15, 25], ["0", "5", "10", "15", "25"]),
  mflux: pm("mflux", "Surface moisture flux", "g kg⁻¹ m s⁻¹", DERIVED_LEGENDS.scalar, 0, 400, [0, 100, 200, 300, 400], ["0", "100", "200", "300", "400"]),
  dryint: pm("dryint", "Mid-level dry-air intrusion", "%", DERIVED_LEGENDS.scalar, 0, 100, [0, 25, 50, 75, 100], ["0", "25", "50", "75", "100"]),
  blrh: pm("blrh", "Boundary-layer relative humidity", "%", DERIVED_LEGENDS.scalar, 0, 100, [0, 25, 50, 75, 100], ["0", "25", "50", "75", "100"]),
  wetbulb: pm("wetbulb", "Surface wet-bulb temperature", "°C", DERIVED_LEGENDS.scalar, -15, 40, [-15, 0, 15, 30, 40], ["-15", "0", "15", "30", "40"]),
  evappot: pm("evappot", "Surface evaporation potential", "g/kg", DERIVED_LEGENDS.scalar, 0, 20, [0, 5, 10, 20], ["0", "5", "10", "20"]),
  // ── Derived cloud structure ───────────────────────────────────────────────
  cice: pm("cice", "Column-max cloud ice", "g/kg", DERIVED_LEGENDS.scalar, 0, 3, [0, 0.5, 1, 2, 3], ["0", "0.5", "1", "2", "3"]),
  iwp: pm("iwp", "Ice water path", "g/m²", DERIVED_LEGENDS.scalar, 0, 600, [0, 50, 150, 300, 600], ["0", "50", "150", "300", "600"]),
  cttemp: pm("cttemp", "Cloud-top temperature", "°C", DERIVED_LEGENDS.cold, -80, 20, [-80, -60, -40, -20, 0, 20], ["-80", "-60", "-40", "-20", "0", "20"]),
  cdepth: pm("cdepth", "Cloud depth", "m", DERIVED_LEGENDS.scalar, 0, 15000, [0, 3000, 6000, 9000, 15000], ["0", "3k", "6k", "9k", "15k"]),
  overshoot: pm("overshoot", "Overshooting-top depth", "m", DERIVED_LEGENDS.scalar, 0, 3000, [0, 500, 1000, 2000, 3000], ["0", "500", "1k", "2k", "3k"]),
  ctdiv: pm("ctdiv", "Cloud-top divergence", "10⁻⁴ s⁻¹", DERIVED_LEGENDS.diverging, -20, 20, [-20, 0, 20], ["-20", "0", "+20"]),
  downdraft: pm("downdraft", "Column-max downdraft", "m/s", DERIVED_LEGENDS.scalar, 0, 20, [0, 5, 10, 15, 20], ["0", "5", "10", "15", "20"]),
  // ── Derived wind and dynamics ─────────────────────────────────────────────
  w925: pm("w925", "925 hPa wind speed", "m/s", DERIVED_LEGENDS.scalar, 0, 60, [0, 15, 30, 45, 60], ["0", "15", "30", "45", "60"]),
  w700: pm("w700", "700 hPa wind speed", "m/s", DERIVED_LEGENDS.scalar, 0, 80, [0, 15, 30, 50, 80], ["0", "15", "30", "50", "80"]),
  w500: pm("w500", "500 hPa wind speed", "m/s", DERIVED_LEGENDS.scalar, 0, 80, [0, 15, 30, 50, 80], ["0", "15", "30", "50", "80"]),
  w300: pm("w300", "300 hPa wind speed", "m/s", DERIVED_LEGENDS.scalar, 0, 80, [0, 15, 30, 50, 80], ["0", "15", "30", "50", "80"]),
  w200: pm("w200", "200 hPa wind speed", "m/s", DERIVED_LEGENDS.scalar, 0, 80, [0, 15, 30, 50, 80], ["0", "15", "30", "50", "80"]),
  omega: pm("omega", "700 hPa pressure vertical velocity", "Pa/s", DERIVED_LEGENDS.diverging, -5, 5, [-5, 0, 5], ["-5", "0", "+5"]),
  shear08: pm("shear08", "0–8 km bulk shear", "m/s", DERIVED_LEGENDS.scalar, 0, 80, [0, 15, 30, 50, 80], ["0", "15", "30", "50", "80"]),
  srh01: pm("srh01", "0–1 km storm-relative helicity", "m²/s²", DERIVED_LEGENDS.diverging, -150, 150, [-150, 0, 150], ["-150", "0", "+150"]),
  srh03: pm("srh03", "0–3 km storm-relative helicity", "m²/s²", DERIVED_LEGENDS.diverging, -300, 300, [-300, 0, 300], ["-300", "0", "+300"]),
  srw: pm("srw", "Surface storm-relative wind speed", "m/s", DERIVED_LEGENDS.scalar, 0, 60, [0, 15, 30, 45, 60], ["0", "15", "30", "45", "60"]),
  brn: pm("brn", "Bulk Richardson number", "–", DERIVED_LEGENDS.scalar, 0, 100, [0, 10, 25, 50, 100], ["0", "10", "25", "50", "100"]),
  llj: pm("llj", "Low-level jet (0–3 km max wind)", "m/s", DERIVED_LEGENDS.scalar, 0, 40, [0, 10, 20, 30, 40], ["0", "10", "20", "30", "40"]),
  ulj: pm("ulj", "Upper-level jet (8–12 km max wind)", "m/s", DERIVED_LEGENDS.scalar, 0, 80, [0, 15, 30, 50, 80], ["0", "15", "30", "50", "80"]),
  ucomp: pm("ucomp", "Surface u-component wind", "m/s", DERIVED_LEGENDS.diverging, -30, 30, [-30, 0, 30], ["-30", "0", "+30"]),
  vcomp: pm("vcomp", "Surface v-component wind", "m/s", DERIVED_LEGENDS.diverging, -30, 30, [-30, 0, 30], ["-30", "0", "+30"]),
  // ── Derived precipitation and synoptic fields ─────────────────────────────
  virga: pm("virga", "Virga water path", "g/m²", DERIVED_LEGENDS.scalar, 0, 1200, [0, 100, 300, 600, 1200], ["0", "100", "300", "600", "1200"]),
  vildensity: pm("vildensity", "VIL density", "g/m³", DERIVED_LEGENDS.scalar, 0, 5, [0, 1, 2, 3, 5], ["0", "1", "2", "3", "5"]),
  hydrometeor: pm("hydrometeor", "Dominant hydrometeor class", "–", DERIVED_LEGENDS.hydro, 0, 6, [0, 1, 2, 3, 4, 5, 6], ["none", "cloud", "rain", "ice", "snow", "graupel", "hail"]),
  rainrate: pm("rainrate", "Liquid rainfall rate", "mm/h", DERIVED_LEGENDS.scalar, 0, 60, [0, 2, 6, 12, 25, 40, 60], ["0", "2", "6", "12", "25", "40", "60"]),
  snowrate: pm("snowrate", "Frozen precipitation rate", "mm/h", DERIVED_LEGENDS.scalar, 0, 60, [0, 2, 6, 12, 25, 40, 60], ["0", "2", "6", "12", "25", "40", "60"]),
  z500: pm("z500", "500 hPa geopotential height", "m", DERIVED_LEGENDS.scalar, 4800, 6000, [4800, 5200, 5500, 5800, 6000], ["4800", "5200", "5500", "5800", "6000"]),
  thickness: pm("thickness", "1000–500 hPa thickness", "m", DERIVED_LEGENDS.scalar, 4800, 6000, [4800, 5200, 5500, 5800, 6000], ["4800", "5200", "5500", "5800", "6000"]),
  tropopause: pm("tropopause", "Tropopause height", "m", DERIVED_LEGENDS.scalar, 5000, 16000, [5000, 8000, 11000, 14000, 16000], ["5k", "8k", "11k", "14k", "16k"]),
  vortadv: pm("vortadv", "500 hPa vorticity advection", "10⁻⁹ s⁻²", DERIVED_LEGENDS.diverging, -50, 50, [-50, 0, 50], ["-50", "0", "+50"]),
  coldpool: pm("coldpool", "Surface cold-pool temperature deficit", "K", DERIVED_LEGENDS.scalar, 0, 10, [0, 2, 4, 7, 10], ["0", "2", "4", "7", "10"]),
  pgrad: pm("pgrad", "Surface pressure gradient", "hPa/km", DERIVED_LEGENDS.scalar, 0, 5, [0, 1, 2, 3, 5], ["0", "1", "2", "3", "5"]),
  tgrad: pm("tgrad", "Surface temperature gradient", "K/km", DERIVED_LEGENDS.scalar, 0, 10, [0, 2, 4, 7, 10], ["0", "2", "4", "7", "10"]),
  tdgrad: pm("tdgrad", "Surface dew-point gradient", "K/km", DERIVED_LEGENDS.scalar, 0, 10, [0, 2, 4, 7, 10], ["0", "2", "4", "7", "10"]),
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
    case "t500":
      packTempAt(grid, fields, out, 50000);
      break;
    case "t700":
      packTempAt(grid, fields, out, 70000);
      break;
    case "t925":
      packTempAt(grid, fields, out, 92500);
      break;
    case "td850":
      packDewAt(grid, fields, out, 85000);
      break;
    case "td500":
      packDewAt(grid, fields, out, 50000);
      break;
    case "td700":
      packDewAt(grid, fields, out, 70000);
      break;
    case "td925":
      packDewAt(grid, fields, out, 92500);
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
    case "shear03":
      packBulkShear(grid, fields, out, 3000);
      break;
    case "shear01":
      packBulkShear(grid, fields, out, 1000);
      break;
    case "shear06":
      packBulkShear06(grid, fields, out);
      break;
    case "conv":
      packSurfaceConvergence(grid, fields, out, true);
      break;
    case "div":
      packSurfaceConvergence(grid, fields, out, false);
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
    case "precip":
      packPrecip(grid, fields, out);
      break;
    case "paccum":
      packPaccum(grid, fields, out);
      break;
    case "preciptype":
      packPrecipType(grid, fields, out);
      break;
    case "graupel":
      packGraupel(grid, fields, out);
      break;
    case "snowice":
      packSnowIce(grid, fields, out);
      break;
    case "hailsize":
      packHailSize(grid, fields, out);
      break;
    case "mslp":
      packMslp(grid, fields, out);
      break;
    case "w925":
      packWindAt(grid, fields, out, 92500);
      break;
    case "w700":
      packWindAt(grid, fields, out, 70000);
      break;
    case "w500":
      packWindAt(grid, fields, out, 50000);
      break;
    case "w300":
      packWindAt(grid, fields, out, 30000);
      break;
    case "w200":
      packWindAt(grid, fields, out, 20000);
      break;
    case "mlcape":
    case "mucape":
    case "li":
    case "showalter":
    case "kindex":
    case "totaltotals":
    case "lapse700500":
    case "lapse03":
    case "wbz":
    case "convtemp":
    case "dcape":
    case "capeshear":
    case "dptdep":
    case "qsfc":
    case "mixratio":
    case "mflux":
    case "dryint":
    case "blrh":
    case "wetbulb":
    case "evappot":
    case "cice":
    case "iwp":
    case "cttemp":
    case "cdepth":
    case "overshoot":
    case "ctdiv":
    case "downdraft":
    case "omega":
    case "shear08":
    case "srh01":
    case "srh03":
    case "srw":
    case "brn":
    case "llj":
    case "ulj":
    case "ucomp":
    case "vcomp":
    case "virga":
    case "vildensity":
    case "hydrometeor":
    case "rainrate":
    case "snowrate":
    case "z500":
    case "thickness":
    case "tropopause":
    case "vortadv":
    case "coldpool":
    case "pgrad":
    case "tgrad":
    case "tdgrad":
      packDerivedProduct(id as DerivedProductId, grid, fields, out);
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
        const dbz = reflectivityDbz(
          f.qr[id],
          f.qc[id],
          ww,
          coldReflectivityMass(f, id),
        );
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
        tau +=
          f.qc[id] * 520 +
          f.qr[id] * 180 +
          (f.qi[id] + f.qs[id]) * 400 +
          (f.qg[id] + f.qh[id]) * 520;
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
        const dTau =
          (f.qc[id] * 40 +
            f.qr[id] * 18 +
            (f.qi[id] + f.qs[id]) * 42 +
            (f.qg[id] + f.qh[id]) * 60) *
          dzN;
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
 * Reflectivity from bulk mixing ratios.
 * The prefactor maps the rain this model actually holds onto 5–70 dBZ.
 * A strong updraft over heavy rain adds a compact core so pink and white
 * stay inside the updraft instead of painting the whole echo.
 * `ice` is a pre-weighted cold-species mass (see `coldReflectivityMass`):
 * snow contributes little, graupel and hail a lot.
 */
export function reflectivityDbz(
  qr: number,
  qc: number,
  w = 0,
  ice = 0,
): number {
  const qrp = Math.max(0, qr);
  const qcp = Math.max(0, qc);
  const qip = Math.max(0, ice);
  if (qrp < 1e-8 && qcp < 5e-5 && qip < 1e-9) return -30;
  const ze =
    8.0e8 * Math.pow(qrp, 1.6) +
    2.0e5 * qcp * qcp +
    4.0e9 * Math.pow(qip, 1.6);
  let dbz = 10 * Math.log10(Math.max(ze, 1e-8));
  if (w > 4 && qrp > 2e-4) {
    const up = Math.min(1, (w - 4) / 12);
    const rain = Math.min(1, qrp / 0.004);
    dbz += 16 * up * rain;
  }
  return dbz;
}

/**
 * Radar-relevant cold mass: cloud ice at face value, snow heavily discounted
 * for its low density, graupel and hail boosted.
 */
export function coldReflectivityMass(f: SimFields, id: number): number {
  return (
    Math.max(0, f.qi[id]) +
    0.6 * Math.max(0, f.qs[id]) +
    2.0 * Math.max(0, f.qg[id]) +
    3.5 * Math.max(0, f.qh[id])
  );
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

/** Bulk shear between surface and height zM from the base-state sounding (uniform). */
function packBulkShear(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
  zM: number,
): void {
  const { nx, ny, nz, dz } = grid;
  const k1 = Math.min(nz - 1, Math.max(0, Math.round(zM / Math.max(dz, 1))));
  const shear = Math.hypot(f.u0[k1] - f.u0[0], f.v0[k1] - f.v0[0]);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      lerpStops(
        clamp(shear, 0, 80),
        SHEAR_STOPS,
        out,
        mapPix(i, j, nx, ny),
        255,
      );
    }
  }
}

/** 0–6 km bulk shear from the base-state sounding (uniform in x/y). */
function packBulkShear06(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  packBulkShear(grid, f, out, 6000);
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
  convergentPositive = true,
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
      const val = convergentPositive ? conv : -conv;
      divergingToRgba(
        clamp(val, -20, 20),
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
        if (f.qc[id] +
          f.qr[id] +
          f.qi[id] +
          f.qs[id] +
          f.qg[id] +
          f.qh[id] >
          CLOUD_THRESHOLD) top = (k + 0.5) * dz;
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
        if (f.qc[id] +
          f.qr[id] +
          f.qi[id] +
          f.qs[id] +
          f.qg[id] +
          f.qh[id] >
          CLOUD_THRESHOLD) {
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
        if (f.qc[id] +
          f.qr[id] +
          f.qi[id] +
          f.qs[id] +
          f.qg[id] +
          f.qh[id] >
          CLOUD_THRESHOLD) n++;
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
      dbzToRgba(
        reflectivityDbz(
          f.qr[id],
          f.qc[id],
          w,
          coldReflectivityMass(f, id),
        ),
        out,
        mapPix(i, j, nx, ny),
      );
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
        if (
          reflectivityDbz(
            f.qr[id],
            f.qc[id],
            w,
            coldReflectivityMass(f, id),
          ) >= ECHO_TOP_DBZ
        ) {
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
        vil +=
          f.rho0[k] *
          (Math.max(0, f.qr[id]) +
            Math.max(0, f.qi[id]) +
            Math.max(0, f.qs[id]) +
            Math.max(0, f.qg[id]) +
            Math.max(0, f.qh[id])) *
          dz;
      }
      lerpStops(clamp(vil, 0, 75), VIL_STOPS, out, mapPix(i, j, nx, ny), 255);
    }
  }
}

/**
 * Precipitation-type categories. Positions match the legend gradient in
 * `MAP_PRODUCTS.preciptype` (0 none, 26 snow, 52 mixed, 78 rain, 100 hail).
 */
const PRECIP_TYPE_STOPS: RgbaStop[] = [
  [0, 20, 24, 32],
  [26, 60, 120, 224],
  [52, 176, 122, 216],
  [78, 56, 176, 96],
  [100, 220, 240, 255],
];

/** Surface precipitation rate (mm/h). */
function packPrecip(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const rate = Math.max(0, f.precipRate[i + j * nx] || 0);
      lerpStops(
        clamp(rate, 0, 60),
        PRECIP_STOPS,
        out,
        mapPix(i, j, nx, ny),
        255,
      );
    }
  }
}

/** Storm-total rain plus frozen accumulation (mm liquid equivalent). */
function packPaccum(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const s = i + j * nx;
      const mm =
        Math.max(0, f.rainAccum[s] || 0) + Math.max(0, f.snowAccum[s] || 0);
      lerpStops(clamp(mm, 0, 100), ACCUM_STOPS, out, mapPix(i, j, nx, ny), 255);
    }
  }
}

/** Column-max graupel mixing ratio (g/kg). */
function packGraupel(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let g = 0;
      for (let k = 0; k < nz; k++) {
        const qg = Math.max(0, f.qg[grid.idx(i, j, k)]);
        if (qg > g) g = qg;
      }
      lerpStops(
        clamp(g * 1000, 0, 3),
        GRAUPEL_STOPS,
        out,
        mapPix(i, j, nx, ny),
        255,
      );
    }
  }
}

/** Column-max cloud ice plus snow mixing ratio (g/kg). */
function packSnowIce(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let s = 0;
      for (let k = 0; k < nz; k++) {
        const id = grid.idx(i, j, k);
        const q = Math.max(0, f.qi[id]) + Math.max(0, f.qs[id]);
        if (q > s) s = q;
      }
      lerpStops(
        clamp(s * 1000, 0, 6),
        SNOW_STOPS,
        out,
        mapPix(i, j, nx, ny),
        255,
      );
    }
  }
}

/** Column-max hailstone diameter (mm). */
function packHailSize(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let d = 0;
      for (let k = 0; k < nz; k++) {
        const id = grid.idx(i, j, k);
        const qh = Math.max(0, f.qh[id]);
        if (qh <= 0) continue;
        const mm = hailMaxDiameter(qh, f.rho0[k]) * 1000;
        if (mm > d) d = mm;
      }
      lerpStops(clamp(d, 0, 80), HAIL_STOPS, out, mapPix(i, j, nx, ny), 255);
    }
  }
}

/**
 * Mean sea-level pressure from the surface perturbation, hydrostatically
 * reduced to z = 0 and combined with the synoptic high/low pattern.
 */
function packMslp(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, dz } = grid;
  const p0 = f.p0[0];
  const rho0 = f.rho0[0];
  const zSfc = 0.5 * dz;
  const gOverR = 9.80665 / 287.05;
  const xDen = Math.max(1, nx - 1);
  const yDen = Math.max(1, ny - 1);
  for (let j = 0; j < ny; j++) {
    const yn = j / yDen;
    for (let i = 0; i < nx; i++) {
      const s = i + j * nx;
      const pSfc = p0 + rho0 * f.p[s];
      const tV =
        TFromTheta(f.theta[s], p0) * (1 + 0.608 * Math.max(0, f.qv[s]));
      const reduced = pSfc * Math.exp((gOverR * zSfc) / Math.max(180, tV));
      const hpa = reduced / 100 + surfacePressureBiasHpa(i / xDen, yn);
      lerpStops(
        clamp(hpa, 980, 1040),
        MSLP_STOPS,
        out,
        mapPix(i, j, nx, ny),
        255,
      );
    }
  }
}

/**
 * Surface precipitation type. Uses the lowest precipitating level to decide
 * whether the column is delivering snow, a rain/snow mix, graupel/sleet,
 * rain, or hail.
 */
function packPrecipType(grid: Grid3D, f: SimFields, out: Uint8Array): void {
  const { nx, ny, nz } = grid;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const s = i + j * nx;
      const rate = Math.max(0, f.precipRate[s] || 0);
      const accum =
        Math.max(0, f.rainAccum[s] || 0) + Math.max(0, f.snowAccum[s] || 0);
      const code = precipTypeCode(grid, f, i, j, nz, rate, accum);
      lerpStops(code * 26, PRECIP_TYPE_STOPS, out, mapPix(i, j, nx, ny), 255);
    }
  }
}

/** 0 none, 1 snow, 2 mixed, 3 rain, 4 hail — on the legend's 0–100 scale. */
function precipTypeCode(
  grid: Grid3D,
  f: SimFields,
  i: number,
  j: number,
  nz: number,
  rate: number,
  accum: number,
): number {
  if (rate < 0.05 && accum < 0.01) return 0;

  let kLow = -1;
  for (let k = 0; k < nz; k++) {
    const id = grid.idx(i, j, k);
    if (
      f.qr[id] + f.qi[id] + f.qs[id] + f.qg[id] + f.qh[id] >
      1e-5
    ) {
      kLow = k;
      break;
    }
  }
  const s = i + j * grid.nx;
  const tSfc = TFromTheta(f.theta[s], f.p0[0]) - 273.15;

  let hailMM = 0;
  for (let k = 0; k < nz; k++) {
    const id = grid.idx(i, j, k);
    const qh = Math.max(0, f.qh[id]);
    if (qh > 0) {
      const mm = hailMaxDiameter(qh, f.rho0[k]) * 1000;
      if (mm > hailMM) hailMM = mm;
    }
  }
  if (hailMM >= 10) return 4;

  if (kLow >= 0) {
    const id = grid.idx(i, j, kLow);
    const liquid = Math.max(0, f.qr[id]);
    const frozen =
      Math.max(0, f.qi[id]) +
      Math.max(0, f.qs[id]) +
      Math.max(0, f.qg[id]) +
      Math.max(0, f.qh[id]);
    const rimed = Math.max(0, f.qg[id]) + Math.max(0, f.qh[id]);
    if (rimed > liquid + frozen * 0.5 && tSfc < 8) return 2;
    if (frozen > liquid * 1.5 && tSfc <= 1) return 1;
    if (frozen > liquid && tSfc <= 3) return 2;
  }

  if (tSfc <= 0.5) return 1;
  if (tSfc <= 3) return 2;
  return 3;
}
