/**
 * Saturation adjustment: Newton step of θ and qv onto the liquid (or ice)
 * saturation curve with latent heat in the same update.
 */

import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import {
  CP,
  LV,
  esatFast,
  esatIce,
  mixingRatio,
  saturatedEvapLimit,
} from "./thermo";

const T0 = 273.15;
const LF = 3.34e5;
const LS = LV + LF;

/**
 * Adjust one cell toward saturation. When T < 0 °C the ice curve is used
 * for the vapor sink; liquid cloud still evaporates against liquid esat.
 */
export function adjustCellSaturation(
  theta: number,
  qv: number,
  qc: number,
  p: number,
  exner: number,
): { theta: number; qv: number; qc: number } {
  let th = theta;
  let q = Math.max(0, qv);
  let c = Math.max(0, qc);
  const T = th * exner;
  const ice = T < T0;
  const esFn = ice ? esatIce : esatFast;
  const L = ice ? LS : LV;
  const qs = Math.max(1e-6, mixingRatio(esFn(T), p));
  const excess = q - qs;

  if (excess > 0) {
    // One Newton step: condensation heats and raises qs.
    const dqs_dT = (qs * L) / (461.5 * Math.max(T, 1) * Math.max(T, 1));
    const dT_dq = (L / CP) * (th / Math.max(T, 1)) * exner;
    const denom = 1 + dqs_dT * dT_dq;
    const cond = excess / Math.max(denom, 0.2);
    q -= cond;
    c += cond;
    th += (L / CP) * cond * (th / Math.max(T, 1));
  } else if (c > 0) {
    const deficit = -excess;
    let evap = Math.min(c, deficit);
    evap = saturatedEvapLimit(th, q, evap, p, exner, esFn);
    q += evap;
    c -= evap;
    th -= (L / CP) * evap * (th / Math.max(T, 1));
  }

  return { theta: th, qv: Math.max(0, q), qc: Math.max(0, c) };
}

/** Grid-wide saturation adjustment after every advective substep. */
export function stepSaturationAdjustment(
  grid: Grid3D,
  f: SimFields,
  exner: Float32Array,
  openK?: Uint16Array | null,
): void {
  const { nx, ny, nz } = grid;
  const nxny = nx * ny;
  for (let k = 0; k < nz; k++) {
    const p0 = f.p0[k];
    const ex = exner[k];
    const kBase = k * nxny;
    for (let j = 0; j < ny; j++) {
      const row = kBase + j * nx;
      for (let i = 0; i < nx; i++) {
        if (openK && k < openK[i + j * nx]) continue;
        const id = row + i;
        const out = adjustCellSaturation(f.theta[id], f.qv[id], f.qc[id], p0, ex);
        f.theta[id] = out.theta;
        f.qv[id] = out.qv;
        f.qc[id] = out.qc;
      }
    }
  }
}
