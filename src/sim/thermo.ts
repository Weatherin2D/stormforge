/** Thermodynamic helpers (SI-ish sandbox units). */

export const RD = 287.05;
export const CP = 1004.0;
export const LV = 2.5e6;
export const G = 9.81;
export const P0 = 100000.0; // Pa

/** Saturation vapor pressure over liquid (Pa), T in Kelvin. */
export function esat(T: number): number {
  const Tc = T - 273.15;
  return 611.2 * Math.exp((17.67 * Tc) / (Tc + 243.5));
}

/** Lookup range for the microphysics hot loop (Kelvin). */
const ESAT_T0 = 180;
const ESAT_T1 = 360;
const ESAT_DT = 0.25;
const ESAT_N = Math.round((ESAT_T1 - ESAT_T0) / ESAT_DT) + 1;
const ESAT_TABLE = new Float32Array(ESAT_N);
for (let i = 0; i < ESAT_N; i++) {
  ESAT_TABLE[i] = esat(ESAT_T0 + i * ESAT_DT);
}

/** Linearly interpolated esat. Matches `esat` to a fraction of a percent. */
export function esatFast(T: number): number {
  const x = (T - ESAT_T0) / ESAT_DT;
  const i = Math.floor(x);
  if (i <= 0) return ESAT_TABLE[0];
  if (i >= ESAT_N - 1) return ESAT_TABLE[ESAT_N - 1];
  const f = x - i;
  return ESAT_TABLE[i] + (ESAT_TABLE[i + 1] - ESAT_TABLE[i]) * f;
}

/** Exner factor π = (p/p0)^(R/cp). Temperature is θ · exner. */
export function exnerFromP(p: number): number {
  return Math.pow(Math.max(p, 1) / P0, RD / CP);
}

/** Mixing ratio from vapor pressure and air pressure (kg/kg). */
export function mixingRatio(e: number, p: number): number {
  return (0.622 * e) / Math.max(p - e, 1);
}

/** Saturation mixing ratio. */
export function qsat(T: number, p: number): number {
  return mixingRatio(esat(T), p);
}

/** Dewpoint (°C) from vapor pressure (Pa). */
export function dewpointFromE(e: number): number {
  const ln = Math.log(Math.max(e, 1) / 611.2);
  return (243.5 * ln) / (17.67 - ln);
}

/** Vapor pressure from dewpoint °C. */
export function eFromDewpointC(tdC: number): number {
  return 611.2 * Math.exp((17.67 * tdC) / (tdC + 243.5));
}

/** Potential temperature from T (K) and p (Pa). */
export function thetaFromT(T: number, p: number): number {
  return T * Math.pow(P0 / Math.max(p, 1), RD / CP);
}

/** Temperature from potential temperature. */
export function TFromTheta(theta: number, p: number): number {
  return theta * exnerFromP(p);
}

/** Approximate hydrostatic pressure profile (Pa) for a domain of height H. */
export function pressureAtZ(z: number, zTop: number, Tsurf = 288): number {
  // isothermal-ish scale height for sandbox use
  const H = (RD * Tsurf) / G;
  return P0 * Math.exp(-z / H) * (1 - 0.05 * (z / Math.max(zTop, 1)));
}

export interface SoundingLevel {
  z: number; // m
  p: number; // Pa
  T: number; // K
  Td: number; // K
  u: number; // m/s
  v: number; // m/s
}

/** Meteorological direction: degrees FROM which the wind blows (0=N, 90=E). */
export function spdDirFromUv(u: number, v: number): { spd: number; dir: number } {
  const spd = Math.hypot(u, v);
  if (spd < 1e-6) return { spd: 0, dir: 0 };
  let dir = (Math.atan2(-u, -v) * 180) / Math.PI;
  if (dir < 0) dir += 360;
  return { spd, dir };
}

export function uvFromSpdDir(spd: number, dirDeg: number): { u: number; v: number } {
  const rad = (dirDeg * Math.PI) / 180;
  const s = Math.max(0, spd);
  return {
    u: -s * Math.sin(rad),
    v: -s * Math.cos(rad),
  };
}

/** Default mildly unstable sounding with moisture, CM1-sandbox style. */
export function defaultSounding(zTop: number, n = 40): SoundingLevel[] {
  const levels: SoundingLevel[] = [];
  for (let i = 0; i < n; i++) {
    const z = (i / (n - 1)) * zTop;
    const p = pressureAtZ(z, zTop);
    // Surface warm / moist, steep lapse — CAPE-friendly for sandbox
    let T = 302 - 0.0085 * z;
    if (z > 11000) T = 215 + 0.001 * (z - 11000);
    // Moist BL + steeper Td drop aloft → usable CAPE for sandbox storms
    let TdC = (T - 273.15) - 0.8;
    if (z > 1500) TdC = 18 - 0.006 * (z - 1500);
    if (z > 5000) TdC = -8 - 0.0035 * (z - 5000);
    if (z > 9000) TdC = -28 - 0.002 * (z - 9000);
    const Td = TdC + 273.15;
    // Veering wind profile
    const u = 5 + 0.002 * z;
    const v = 2 + 0.0005 * z;
    levels.push({ z, p, T, Td, u, v });
  }
  return levels;
}

export function interpolateProfile(
  levels: SoundingLevel[],
  z: number,
): SoundingLevel {
  if (levels.length === 0) {
    return { z, p: P0, T: 288, Td: 280, u: 0, v: 0 };
  }
  if (z <= levels[0].z) return { ...levels[0], z };
  if (z >= levels[levels.length - 1].z) {
    return { ...levels[levels.length - 1], z };
  }
  let i = 0;
  while (i < levels.length - 1 && levels[i + 1].z < z) i++;
  const a = levels[i];
  const b = levels[i + 1];
  const t = (z - a.z) / Math.max(b.z - a.z, 1e-6);
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    z,
    p: lerp(a.p, b.p),
    T: lerp(a.T, b.T),
    Td: lerp(a.Td, b.Td),
    u: lerp(a.u, b.u),
    v: lerp(a.v, b.v),
  };
}
