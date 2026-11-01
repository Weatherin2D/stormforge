/** Pressure-based sounding level used by the Skew-T / hodograph creator. */
export interface CreatorLevel {
  /** Pressure (hPa). */
  p: number;
  /** Temperature (°C). */
  T: number;
  /** Dewpoint (°C). */
  Td: number;
  /** Wind direction (meteorological degrees). */
  d: number;
  /** Wind speed (kt). */
  s: number;
  /** Height AGL (m), filled by hydrostatic integration. */
  z?: number;
  /** u wind (m/s). */
  u?: number;
  /** v wind (m/s). */
  v?: number;
}

export type ParcelKey = "SB" | "ML" | "MU";
export type Hemisphere = "N" | "S";

export interface LiftResult {
  cape: number;
  cin: number;
  pl: number;
  lfc: number | null;
  el: number | null;
  pts: [number, number, number][];
}

export interface HazardFlag {
  label: string;
  detail: string;
}

export interface Diagnostics {
  P: Record<ParcelKey, LiftResult>;
  m: [number, number];
  RM: [number, number];
  LM: [number, number];
  S: boolean;
  cyc: [number, number];
  ant: [number, number];
  pw: number;
  stp: number | null;
  stpA: number | null;
  scp: number | null;
  scpA: number | null;
  s1: number;
  a1: number;
  s3: number | null;
  a3: number | null;
  li: number | null;
  z0: number | null;
  z20: number | null;
  l03: number | null;
  l36: number | null;
  l75: number | null;
  sh: (number | null)[];
  lcl: number;
  hz: HazardFlag[];
}
