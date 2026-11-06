/**
 * One-plume mass-flux cumulus scheme for synoptic (hydrostatic) grids.
 * Consumes CAPE, detrains cloud/rain near the equilibrium level, and
 * applies compensating subsidence.
 */

import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import {
  CP,
  LV,
  TFromTheta,
  dewpointFromE,
  esatFast,
  mixingRatio,
  qsat,
} from "./thermo";
import { integrateCapeCin } from "./cape";

const ENTRAIN = 1.5e-4; // 1/m
const DETRAIN = 1.0e-4;
const PRECIP_FRAC = 0.45;
const MASS_SCALE = 2.5e-3; // kg/m²/s per (CAPE)^{1/2}

/**
 * Deep convection parameterization. Safe to call only when the grid cannot
 * resolve updrafts (dx ≳ 4 km).
 */
export function stepCumulusMassFlux(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  openK?: Uint16Array | null,
): void {
  if (dt <= 0) return;
  const { nx, ny, nz, dz } = grid;
  const z = new Float32Array(nz);
  const p = new Float32Array(nz);
  const T = new Float32Array(nz);
  const Td = new Float32Array(nz);

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k0 = openK ? openK[i + j * nx] : 0;
      for (let k = 0; k < nz; k++) {
        const id = grid.idx(i, j, k);
        z[k] = (k + 0.5) * dz;
        p[k] = f.p0[k];
        T[k] = TFromTheta(f.theta[id], f.p0[k]);
        const qv = Math.max(0, f.qv[id]);
        const e = (qv * f.p0[k]) / (0.622 + qv);
        Td[k] = dewpointFromE(Math.max(1, e)) + 273.15;
      }
      // Mask buried levels by copying the first free air downward.
      for (let k = 0; k < k0; k++) {
        T[k] = T[k0];
        Td[k] = Td[k0];
      }

      const idx = integrateCapeCin(z, p, T, Td, nz, grid.zTop);
      if (idx.cape < 150 || idx.elM <= idx.lclM + 500) continue;

      const M =
        MASS_SCALE *
        Math.sqrt(idx.cape) *
        Math.min(1, dt / 600);
      if (M <= 0) continue;

      const kLcl = Math.max(
        k0,
        Math.min(nz - 2, Math.floor(idx.lclM / dz)),
      );
      const kEl = Math.max(
        kLcl + 1,
        Math.min(nz - 1, Math.floor(idx.elM / dz)),
      );

      // Entraining plume: θ_p and q_p
      let thP = f.theta[grid.idx(i, j, kLcl)];
      let qP = f.qv[grid.idx(i, j, kLcl)];
      let condensed = 0;

      for (let k = kLcl; k <= kEl; k++) {
        const id = grid.idx(i, j, k);
        const ent = ENTRAIN * dz;
        thP = (thP + ent * f.theta[id]) / (1 + ent);
        qP = (qP + ent * f.qv[id]) / (1 + ent);
        const Tparc = TFromTheta(thP, f.p0[k]);
        const qs = qsat(Tparc, f.p0[k]);
        if (qP > qs) {
          const cond = qP - qs;
          qP = qs;
          condensed += cond;
          thP += (LV / CP) * cond * (thP / Math.max(Tparc, 1));
        }
        // Compensating subsidence on the environment.
        if (k > kLcl && k < nz - 1) {
          const idUp = grid.idx(i, j, k + 1);
          const wSub = (M / Math.max(f.rho0[k], 0.1)) * (1 - DETRAIN * (k - kLcl) * dz);
          const fac = Math.min(0.2, (wSub * dt) / dz);
          f.theta[id] += (f.theta[idUp] - f.theta[id]) * fac;
          f.qv[id] = Math.max(
            0,
            f.qv[id] + (f.qv[idUp] - f.qv[id]) * fac,
          );
        }
      }

      if (condensed < 1e-5) continue;
      const rain = condensed * PRECIP_FRAC;
      const cloud = condensed - rain;
      // Detrain near EL.
      const idEl = grid.idx(i, j, kEl);
      f.qc[idEl] += cloud * 0.6;
      f.qr[idEl] += rain * 0.4;
      if (kEl > 0) {
        f.qc[grid.idx(i, j, kEl - 1)] += cloud * 0.4;
        f.qr[grid.idx(i, j, kEl - 1)] += rain * 0.3;
      }
      // Surface precip rate from the remaining rain fraction.
      const mm = rain * 0.3 * f.rho0[kLcl] * dz;
      const ij = i + j * nx;
      f.rainAccum[ij] += mm;
      if (dt > 0) f.precipRate[ij] += (mm / dt) * 3600;

      // Cool / dry the sub-cloud layer slightly (downdraft proxy).
      for (let k = k0; k < kLcl; k++) {
        const id = grid.idx(i, j, k);
        f.theta[id] -= 0.15 * rain * (LV / CP);
        f.qv[id] = Math.max(0, f.qv[id] - 0.1 * rain);
      }
    }
  }
  void esatFast;
  void mixingRatio;
}
