/**
 * Liquid saturation adjustment: Newton step of θ and qv onto the liquid
 * saturation curve with latent heat in the same update.
 *
 * Always uses liquid esat. Ice supersaturation must not dump into qc —
 * that paints an instant domain-wide cloud sheet on any moist mid-level
 * sounding. Mixed-phase / ice saturation lives in coldMicrophysics.
 */

import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import {
  CP,
  LV,
  esatFast,
  mixingRatio,
  saturatedEvapLimit,
} from "./thermo";

/**
 * Adjust one cell toward liquid saturation.
 * `dt` rate-limits clear-air condensation so multi-second hydrostatic
 * steps cannot instantly sheet the domain from a near-saturated lid.
 */
export function adjustCellSaturation(
  theta: number,
  qv: number,
  qc: number,
  p: number,
  exner: number,
  dt = 1,
): { theta: number; qv: number; qc: number } {
  let th = theta;
  let q = Math.max(0, qv);
  let c = Math.max(0, qc);
  const T = th * exner;
  const L = LV;
  const qs = Math.max(1e-6, mixingRatio(esatFast(T), p));
  const excess = q - qs;

  if (excess > 0) {
    // Ignore tiny supersaturation in clear air — numerical / profile noise.
    if (c < 1e-6 && excess < 8e-5) {
      return { theta: th, qv: q, qc: c };
    }
    // One Newton step: condensation heats and raises qs.
    const dqs_dT = (qs * L) / (461.5 * Math.max(T, 1) * Math.max(T, 1));
    const dT_dq = (L / CP) * (th / Math.max(T, 1)) * exner;
    const denom = 1 + dqs_dT * dT_dq;
    let cond = excess / Math.max(denom, 0.2);
    // Clear air: ease onto the curve instead of dumping the whole surplus.
    if (c < 1e-5) cond *= Math.min(1, Math.max(dt, 0) / 12);
    q -= cond;
    c += cond;
    th += (L / CP) * cond * (th / Math.max(T, 1));
  } else if (c > 0) {
    const deficit = -excess;
    let evap = Math.min(c, deficit);
    evap = saturatedEvapLimit(th, q, evap, p, exner, esatFast);
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
  dt = 1,
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
        const out = adjustCellSaturation(
          f.theta[id],
          f.qv[id],
          f.qc[id],
          p0,
          ex,
          dt,
        );
        f.theta[id] = out.theta;
        f.qv[id] = out.qv;
        f.qc[id] = out.qc;
      }
    }
  }
}
