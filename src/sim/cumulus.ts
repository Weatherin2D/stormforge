/**
 * One-plume mass-flux cumulus scheme for synoptic (hydrostatic) grids.
 * Consumes CAPE, detrains cloud/rain near the equilibrium level, and
 * applies compensating subsidence.
 *
 * CAPE alone is not a trigger — the default sandbox sounding has thousands
 * of J/kg everywhere, which would sheet the whole map with anvil and rain.
 * Columns only fire where a front ridge or a drawn low provides lift, or
 * on a sparse daytime seed so continental grids stay cellular.
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
import { getActiveSynoptic } from "./synoptic";

const ENTRAIN = 1.5e-4; // 1/m
const DETRAIN = 1.0e-4;
const PRECIP_FRAC = 0.25;
const MASS_SCALE = 4.0e-4; // kg/m²/s per (CAPE)^{1/2}
/** Minimum synoptic lift (front ridge or low weight) to allow a plume. */
const TRIGGER_MIN = 0.35;
/** Target spacing between daytime self-triggered cells (m). */
const DAY_PLUME_SPACING = 90_000;

/**
 * Deep convection parameterization. Safe to call only when the grid cannot
 * resolve updrafts (dx >= 4 km).
 *
 * `liftK` is the frontal ridge amplitude from the balanced environment
 * (0 = no front). Drawn lows add their own trigger weight inside.
 */
export function stepCumulusMassFlux(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  openK?: Uint16Array | null,
  liftK?: Float32Array | null,
): void {
  if (dt <= 0) return;
  const { nx, ny, nz, dz, dx, dy } = grid;
  const z = new Float32Array(nz);
  const p = new Float32Array(nz);
  const T = new Float32Array(nz);
  const Td = new Float32Array(nz);
  const syn = getActiveSynoptic();
  const xDen = Math.max(1, nx - 1);
  const yDen = Math.max(1, ny - 1);
  const cellM = Math.max(dx, dy, 1);
  // Keep ~one daytime plume per DAY_PLUME_SPACING^2, capped so coarse grids
  // never light up a majority of columns once the BL warms.
  const dayKeep = Math.min(
    0.08,
    Math.max(0.015, (DAY_PLUME_SPACING * DAY_PLUME_SPACING) / (cellM * cellM)),
  );

  for (let j = 0; j < ny; j++) {
    const yn = j / yDen;
    for (let i = 0; i < nx; i++) {
      const ij = i + j * nx;
      // Lows are the primary trigger. Frontal ridge lift alone used to fire
      // a plume in every column along a drawn front on the CAPE-rich default
      // sounding — an instant rain sheet. Keep a weak front contribution.
      let trig = liftK ? 0.15 * liftK[ij] : 0;
      if (syn.enabled !== false) {
        const xn = i / xDen;
        for (const c of syn.centers) {
          if (!c.enabled || c.kind !== "low") continue;
          const r = Math.hypot(xn - c.x, yn - c.y);
          trig += (c.hPa / 10) * Math.exp(-(r * r) / (2 * 0.18 * 0.18));
        }
      }
      const k0 = openK ? openK[ij] : 0;
      // Daytime BL heating: sparse seeds only. A continuous mottling gate
      // still fires most warm land columns on continental grids.
      if (trig < TRIGGER_MIN) {
        const idSfc = grid.idx(i, j, k0);
        const dTh = f.theta[idSfc] - f.theta0[k0];
        if (dTh > 2.4) {
          const seed =
            ((i * 73856093) ^ (j * 19349663) ^ ((i + 17) * (j + 91) * 83492791)) >>>
            0;
          const u = (seed % 1000) / 1000;
          if (u < dayKeep) {
            const intensity = Math.min(1.2, (dTh - 2.0) / 5);
            trig = Math.max(trig, TRIGGER_MIN + 0.08 * intensity);
          }
        }
      }
      if (trig < TRIGGER_MIN) continue;
      for (let k = 0; k < nz; k++) {
        const id = grid.idx(i, j, k);
        z[k] = (k + 0.5) * dz;
        p[k] = f.p0[k];
        T[k] = TFromTheta(f.theta[id], f.p0[k]);
        const qv = Math.max(0, f.qv[id]);
        const e = (qv * f.p0[k]) / (0.622 + qv);
        Td[k] = dewpointFromE(Math.max(1, e)) + 273.15;
      }
      for (let k = 0; k < k0; k++) {
        T[k] = T[k0];
        Td[k] = Td[k0];
      }

      const idx = integrateCapeCin(z, p, T, Td, nz, grid.zTop);
      if (idx.cape < 400 || idx.cin > 40 || idx.elM <= idx.lclM + 500) continue;

      const M =
        MASS_SCALE *
        Math.sqrt(idx.cape) *
        Math.min(1, dt / 600) *
        Math.min(1.5, trig);
      if (M <= 0) continue;

      const kLcl = Math.max(
        k0,
        Math.min(nz - 2, Math.floor(idx.lclM / dz)),
      );
      const kEl = Math.max(
        kLcl + 1,
        Math.min(nz - 1, Math.floor(idx.elM / dz)),
      );

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
        if (k > kLcl && k < nz - 1) {
          const idUp = grid.idx(i, j, k + 1);
          const wSub =
            (M / Math.max(f.rho0[k], 0.1)) *
            (1 - DETRAIN * (k - kLcl) * dz);
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
      const mixIn = Math.min(
        0.06,
        (M * Math.max(dt, 1)) / Math.max(f.rho0[kEl] * dz, 0.05),
      );
      const idEl = grid.idx(i, j, kEl);
      f.qc[idEl] += cloud * 0.6 * mixIn;
      f.qr[idEl] += rain * 0.4 * mixIn;
      if (kEl > 0) {
        f.qc[grid.idx(i, j, kEl - 1)] += cloud * 0.4 * mixIn;
        f.qr[grid.idx(i, j, kEl - 1)] += rain * 0.3 * mixIn;
      }
      const mm = rain * 0.3 * mixIn * f.rho0[kLcl] * dz;
      const col = ij;
      f.rainAccum[col] += mm;
      if (dt > 0) f.precipRate[col] += (mm / dt) * 3600;

      for (let k = k0; k < kLcl; k++) {
        const id = grid.idx(i, j, k);
        f.theta[id] -= 0.15 * rain * mixIn * (LV / CP);
        f.qv[id] = Math.max(0, f.qv[id] - 0.1 * rain * mixIn);
      }
    }
  }
  void esatFast;
  void mixingRatio;
}
