import {
  SoundingLevel,
  eFromDewpointC,
  esatFast,
  mixingRatio,
} from "./thermo";

export interface ThermoIndices {
  tSfcC: number;
  tdSfcC: number;
  cape: number; // J/kg
  cin: number; // J/kg (positive magnitude of inhibition)
  lclM: number;
}

const RD = 287.05;
const CP = 1004;
const LV = 2.5e6;
const RV = 461.5;
const KAPPA = RD / CP;
const P0 = 100000;

/** Rough LCL height (m) from surface T/Td (°C). */
function lclHeightM(tC: number, tdC: number): number {
  return Math.max(0, 125 * (tC - tdC));
}

/** Saturated moist-adiabatic lapse rate (K/m). */
function moistLapse(T: number, p: number): number {
  const es = esatFast(Math.max(180, T));
  const rs = (0.622 * es) / Math.max(p - es, 1);
  const num = 9.81 * (1 + (LV * rs) / (RD * Math.max(T, 1)));
  const den = CP + (LV * LV * rs) / (RV * Math.max(T, 1) * Math.max(T, 1));
  const g = num / Math.max(den, 1);
  return Math.min(0.0098, Math.max(0.002, g));
}

function pressureAtLcl(
  z: ArrayLike<number>,
  p: ArrayLike<number>,
  n: number,
  lcl: number,
): number {
  if (n < 1) return P0;
  if (lcl <= z[0]) return p[0];
  for (let i = 1; i < n; i++) {
    if (z[i] >= lcl) {
      const dz = Math.max(z[i] - z[i - 1], 1e-3);
      const t = (lcl - z[i - 1]) / dz;
      return p[i - 1] + (p[i] - p[i - 1]) * t;
    }
  }
  return p[n - 1];
}

/**
 * Surface-based CAPE / CIN. Levels must be ordered by increasing height.
 * Parcel lifts dry to the LCL, then along a moist adiabat using the
 * column's own pressure.
 */
export function integrateCapeCin(
  z: ArrayLike<number>,
  p: ArrayLike<number>,
  T: ArrayLike<number>,
  Td: ArrayLike<number>,
  n: number,
  zTop: number,
): ThermoIndices {
  if (n < 3) {
    return { tSfcC: 0, tdSfcC: 0, cape: 0, cin: 0, lclM: 0 };
  }

  const sfcT = T[0];
  const sfcTd = Math.min(Td[0], sfcT);
  const tSfcC = sfcT - 273.15;
  const tdSfcC = sfcTd - 273.15;
  const lclM = Math.min(zTop * 0.9, lclHeightM(tSfcC, tdSfcC));
  const eSfc = eFromDewpointC(tdSfcC);
  const qvParcel = mixingRatio(eSfc, Math.max(p[0], 1));
  const thetaP = sfcT * Math.pow(P0 / Math.max(p[0], 1), KAPPA);
  const pLcl = pressureAtLcl(z, p, n, lclM);

  let cape = 0;
  let cin = 0;
  let aboveLfc = false;
  let Tp = thetaP * Math.pow(Math.max(pLcl, 1) / P0, KAPPA);
  let zPar = lclM;

  for (let i = 1; i < n; i++) {
    const dz = z[i] - z[i - 1];
    if (dz <= 0) continue;
    const zMid = 0.5 * (z[i - 1] + z[i]);
    const pMid = 0.5 * (p[i - 1] + p[i]);
    const Tenv = 0.5 * (T[i - 1] + T[i]);

    let Tpar: number;
    if (zMid < lclM) {
      Tpar = thetaP * Math.pow(Math.max(pMid, 1) / P0, KAPPA);
    } else {
      const climb = zMid - zPar;
      if (climb > 0) {
        // Floor the lapse so a cartoon 8.5 K/km sounding stays on a
        // readable CAPE scale, while still steepening toward dry aloft.
        const gamma = Math.max(0.0068, moistLapse(Tp, pMid));
        Tp -= gamma * climb;
        zPar = zMid;
      }
      Tpar = Tp;
      const qs = mixingRatio(esatFast(Math.max(180, Tpar)), pMid);
      if (qvParcel < qs * 0.45) {
        Tpar = thetaP * Math.pow(Math.max(pMid, 1) / P0, KAPPA);
      }
    }

    const B = 9.81 * ((Tpar - Tenv) / Math.max(Tenv, 1));
    if (B > 0) {
      aboveLfc = true;
      cape += B * dz;
    } else if (!aboveLfc && zMid < lclM + 6000) {
      cin += -B * dz;
    }
  }

  return {
    tSfcC,
    tdSfcC,
    cape: Math.max(0, cape),
    cin: Math.max(0, cin),
    lclM,
  };
}

/**
 * Simple surface-based CAPE / CIN for the sounding editor.
 * Parcel: dry ascent to LCL, then moist ascent.
 */
export function computeThermoIndices(
  levels: SoundingLevel[],
  zTop: number,
): ThermoIndices {
  if (levels.length < 3) {
    return { tSfcC: 0, tdSfcC: 0, cape: 0, cin: 0, lclM: 0 };
  }
  const sorted = [...levels].sort((a, b) => a.z - b.z);
  const n = sorted.length;
  const z = new Float64Array(n);
  const p = new Float64Array(n);
  const T = new Float64Array(n);
  const Td = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    z[i] = sorted[i].z;
    p[i] = sorted[i].p;
    T[i] = sorted[i].T;
    Td[i] = sorted[i].Td;
  }
  return integrateCapeCin(z, p, T, Td, n, zTop);
}
