import {
  SoundingLevel,
  eFromDewpointC,
  esat,
  exnerFromP,
  mixingRatio,
  spdDirFromUv,
  thetaFromT,
} from "./thermo";
import { computeThermoIndices, ParcelPoint } from "./cape";

/** Everything the setup panels show about a sounding. */
export interface SoundingSummary {
  // --- surface parcel ---
  tSfcC: number;
  tdSfcC: number;
  rhSfc: number; // %
  qvSfcGkg: number;
  thetaSfcK: number;
  thetaeSfcK: number;
  tvSfcK: number;
  pSfcHpa: number;

  // --- parcel ---
  cape: number; // J/kg
  cin: number; // J/kg
  cape0to3: number; // J/kg
  lclM: number;
  lfcM: number;
  elM: number;
  parcel: ParcelPoint[];

  // --- wind ---
  sfcWindSpd: number; // m/s
  sfcWindDir: number; // deg from
  shear0to1: number; // m/s
  shear0to3: number;
  shear0to6: number;
  srh1km: number; // m^2/s^2
  srh3km: number;
  stormMotionSpd: number;
  stormMotionDir: number;
  maxWindSpd: number;
  maxWindDir: number;
  maxWindM: number;

  // --- levels ---
  freezingM: number;
  minus20M: number;
  wbZeroM: number;
  convectiveTempC: number;

  // --- moisture ---
  pwMm: number;
}

const CP = 1004;
const LV = 2.5e6;
const G = 9.81;
const P0 = 100000;
const KAPPA = 287.05 / CP;

/** Wet-bulb temperature (°C) — Stull (2011) empirical fit. */
export function wetBulbC(tC: number, rhPct: number): number {
  const rh = Math.max(0, Math.min(100, rhPct));
  return (
    tC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(tC + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035
  );
}

/** Virtual temperature (K) from T (K) and specific humidity (kg/kg). */
export function virtualTemp(T: number, qv: number): number {
  return T * (1 + 0.608 * qv - 1.2 * qv * qv);
}

/** Bolin's equivalent potential temperature (K). */
export function thetaE(T: number, Td: number, p: number): number {
  const theta = thetaFromT(T, p);
  const tl = Math.max(200, T - 55 * (T - Td));
  const w = mixingRatio(eFromDewpointC(Td - 273.15), p);
  return theta * Math.exp((LV / CP) * w / tl);
}

function pressureAtHeight(levels: SoundingLevel[], z: number): number {
  if (!levels.length) return P0;
  if (z <= levels[0].z) return levels[0].p;
  const last = levels[levels.length - 1];
  if (z >= last.z) return last.p;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i].z >= z) {
      const t = (z - levels[i - 1].z) / Math.max(levels[i].z - levels[i - 1].z, 1e-6);
      return levels[i - 1].p + (levels[i].p - levels[i - 1].p) * t;
    }
  }
  return last.p;
}

/** Wind vector interpolated to a height (m/s). */
function windAt(levels: SoundingLevel[], z: number): { u: number; v: number } {
  if (!levels.length) return { u: 0, v: 0 };
  if (z <= levels[0].z) return { u: levels[0].u, v: levels[0].v };
  const last = levels[levels.length - 1];
  if (z >= last.z) return { u: last.u, v: last.v };
  for (let i = 1; i < levels.length; i++) {
    if (levels[i].z >= z) {
      const t = (z - levels[i - 1].z) / Math.max(levels[i].z - levels[i - 1].z, 1e-6);
      return {
        u: levels[i - 1].u + (levels[i].u - levels[i - 1].u) * t,
        v: levels[i - 1].v + (levels[i].v - levels[i - 1].v) * t,
      };
    }
  }
  return { u: last.u, v: last.v };
}

/** Bulk shear magnitude (m/s) between the surface and a depth (m). */
function bulkShear(levels: SoundingLevel[], depthM: number): number {
  const top = windAt(levels, depthM);
  const bot = windAt(levels, 0);
  return Math.hypot(top.u - bot.u, top.v - bot.v);
}

/**
 * Storm-relative helicity (m²/s²) over the lowest `depthM` metres.
 * Davies-Jones streamwise-vorticity integral about the storm motion.
 */
function stormRelHelicity(
  levels: SoundingLevel[],
  depthM: number,
  motionU: number,
  motionV: number,
): number {
  let srh = 0;
  for (let i = 1; i < levels.length; i++) {
    const a = levels[i - 1];
    const b = levels[i];
    if (a.z > depthM) break;
    const dz = b.z - a.z;
    if (dz <= 0) continue;
    const du = b.u - a.u;
    const dv = b.v - a.v;
    srh += (a.v - motionV) * du - (a.u - motionU) * dv;
  }
  return srh;
}

/** Bunkers right-mover storm motion (m/s) from the 0–6 km mean wind. */
function stormMotion(levels: SoundingLevel[]): { u: number; v: number } {
  const mean = windAt(levels, 3000);
  const mean6 = windAt(levels, 6000);
  const ubar = 0.5 * (mean.u + mean6.u);
  const vbar = 0.5 * (mean.v + mean6.v);
  const mag = Math.hypot(ubar, vbar);
  if (mag < 1e-3) return { u: ubar, v: vbar };
  const dev = 7.5;
  return { u: ubar + (dev * vbar) / mag, v: vbar - (dev * ubar) / mag };
}

/** Lowest height (m) where the profile crosses a temperature (°C). */
function levelCrossing(levels: SoundingLevel[], tC: number): number {
  for (let i = 0; i < levels.length; i++) {
    const cur = levels[i].T - 273.15;
    if (cur <= tC) {
      if (i === 0) return levels[0].z;
      const prev = levels[i - 1].T - 273.15;
      const span = prev - cur;
      const t = span > 1e-6 ? (prev - tC) / span : 0;
      return levels[i - 1].z + (levels[i].z - levels[i - 1].z) * t;
    }
  }
  return 0;
}

/** Lowest height (m) where the wet-bulb temperature crosses 0 °C. */
function wetBulbZero(levels: SoundingLevel[]): number {
  let prevWb = 0;
  for (let i = 0; i < levels.length; i++) {
    const l = levels[i];
    const e = eFromDewpointC(l.Td - 273.15);
    const es = esat(l.T);
    const rh = es > 0 ? Math.max(0, Math.min(100, (100 * e) / es)) : 0;
    const wb = wetBulbC(l.T - 273.15, rh);
    if (i > 0 && prevWb < 0 && wb >= 0) {
      const t = -prevWb / Math.max(1e-6, wb - prevWb);
      return levels[i - 1].z + (l.z - levels[i - 1].z) * t;
    }
    prevWb = wb;
  }
  return 0;
}

/** Convective temperature (°C) — the surface T that unlocks the best parcel. */
function convectiveTemp(levels: SoundingLevel[]): number {
  if (levels.length < 2) return levels[0] ? levels[0].T - 273.15 : 0;
  let best = levels[0];
  let bestTe = -Infinity;
  for (const l of levels) {
    if (l.z > 3000) break;
    const te = thetaE(l.T, l.Td, l.p);
    if (te > bestTe) {
      bestTe = te;
      best = l;
    }
  }
  const thetaSfc = thetaFromT(levels[0].T, levels[0].p);
  const lclM = Math.max(0, 125 * (best.T - best.Td));
  const pLcl = pressureAtHeight(levels, lclM);
  return thetaSfc * Math.pow(pLcl / P0, KAPPA) - 273.15;
}

/** Total column precipitable water (mm). */
function precipitableWater(levels: SoundingLevel[]): number {
  let pw = 0;
  for (let i = 0; i < levels.length - 1; i++) {
    const l = levels[i];
    const e = eFromDewpointC(l.Td - 273.15);
    const w = mixingRatio(e, l.p);
    const qv = w / (1 + w);
    const dp = Math.max(0, l.p - levels[i + 1].p);
    // (1/g)·qv·dp integrates to kg/m², which is numerically millimetres.
    pw += (qv * dp) / G;
  }
  return pw;
}

/**
 * Full sounding analysis: parcel, wind and moisture readouts.
 * Levels must be ordered by increasing height.
 */
export function analyzeSounding(
  levels: SoundingLevel[],
  zTop: number,
): SoundingSummary {
  const sorted = [...levels].sort((a, b) => a.z - b.z);
  const idx = computeThermoIndices(sorted, zTop);
  const sfc = sorted[0];
  const tSfcC = sfc ? sfc.T - 273.15 : 0;
  const tdSfcC = sfc ? sfc.Td - 273.15 : 0;

  const eSfc = eFromDewpointC(tdSfcC);
  const esSfc = esat(sfc ? sfc.T : 273.15);
  const rhSfc = esSfc > 0 ? Math.max(0, Math.min(100, (100 * eSfc) / esSfc)) : 0;
  const wSfc = sfc ? mixingRatio(eSfc, sfc.p) : 0;
  const qvSfc = wSfc / (1 + wSfc);

  const motion = stormMotion(sorted);
  const sfcWind = sfc ? spdDirFromUv(sfc.u, sfc.v) : { spd: 0, dir: 0 };
  const motionDir = spdDirFromUv(motion.u, motion.v);

  let maxWindSpd = 0;
  let maxWindDir = 0;
  let maxWindM = 0;
  for (const l of sorted) {
    const { spd, dir } = spdDirFromUv(l.u, l.v);
    if (spd > maxWindSpd) {
      maxWindSpd = spd;
      maxWindDir = dir;
      maxWindM = l.z;
    }
  }

  return {
    tSfcC,
    tdSfcC,
    rhSfc,
    qvSfcGkg: wSfc * 1000,
    thetaSfcK: sfc ? thetaFromT(sfc.T, sfc.p) : 0,
    thetaeSfcK: sfc ? thetaE(sfc.T, sfc.Td, sfc.p) : 0,
    tvSfcK: sfc ? virtualTemp(sfc.T, qvSfc) : 0,
    pSfcHpa: sfc ? sfc.p / 100 : 0,

    cape: idx.cape,
    cin: idx.cin,
    cape0to3: idx.cape0to3,
    lclM: idx.lclM,
    lfcM: idx.lfcM,
    elM: idx.elM,
    parcel: idx.parcel,

    sfcWindSpd: sfcWind.spd,
    sfcWindDir: sfcWind.dir,
    shear0to1: bulkShear(sorted, 1000),
    shear0to3: bulkShear(sorted, 3000),
    shear0to6: bulkShear(sorted, 6000),
    srh1km: stormRelHelicity(sorted, 1000, motion.u, motion.v),
    srh3km: stormRelHelicity(sorted, 3000, motion.u, motion.v),
    stormMotionSpd: motionDir.spd,
    stormMotionDir: motionDir.dir,
    maxWindSpd,
    maxWindDir,
    maxWindM,

    freezingM: levelCrossing(sorted, 0),
    minus20M: levelCrossing(sorted, -20),
    wbZeroM: wetBulbZero(sorted),
    convectiveTempC: convectiveTemp(sorted),

    pwMm: precipitableWater(sorted),
  };
}

/** Exner factor for a pressure (Pa). */
export { exnerFromP };
