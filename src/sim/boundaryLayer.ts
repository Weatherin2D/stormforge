/**
 * Bulk aerodynamic surface fluxes, a K-profile PBL (coarse grids), and a
 * gray two-stream longwave tendency from liquid/ice water path.
 */

import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import { CP, LV, TFromTheta, qsat } from "./thermo";
import { getAdvanced, getToggles } from "./AdvancedSettings";
import type { RadiationOptions } from "./SurfaceRadiation";
import { cosZenith } from "./SurfaceRadiation";

const KAPPA = 0.4;
const CD = 1.5e-3;
const CH = 1.2e-3;
const CE = 1.2e-3;

export interface SlowPhysicsContext {
  landMask: Float32Array;
  height?: Float32Array | null;
  openK?: Uint16Array | null;
  soil?: Float32Array | null;
  veg?: Float32Array | null;
  kind?: Float32Array | null;
  radiation: RadiationOptions;
}

/**
 * Bulk heat / moisture / drag at the first free level, then a K-profile
 * mix when dx is above ~1 km. Smagorinsky owns mixing on finer grids.
 */
export function stepBulkSurfaceFluxes(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  ctx: SlowPhysicsContext,
): void {
  if (dt <= 0 || !getToggles().enableRadiation) return;
  const { nx, ny, nz, dx, dy, dz } = grid;
  const adv = getAdvanced();
  const sunFlat = Math.max(0, cosZenith(
    ctx.radiation.latitudeDeg,
    ctx.radiation.month,
    ctx.radiation.solarHour,
  ));
  const pace =
    Math.max(1, ctx.radiation.diurnalSpeed) *
    Math.max(0.2, adv.radiationPace);

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const s = i + j * nx;
      const k0 = ctx.openK ? Math.min(nz - 1, ctx.openK[s] | 0) : 0;
      const id = grid.idx(i, j, k0);
      const land = ctx.landMask.length >= nx * ny ? ctx.landMask[s] : 1;
      const isWater =
        ctx.kind && ctx.kind.length >= nx * ny
          ? ctx.kind[s] >= 0.5
          : land < 0.2;
      const soil =
        ctx.soil && !isWater ? Math.min(1, Math.max(0, ctx.soil[s])) : 0;
      const veg =
        ctx.veg && !isWater ? Math.min(1, Math.max(0, ctx.veg[s])) : 0;

      const u =
        0.5 *
        (f.u[grid.uIdx(i, j, k0)] + f.u[grid.uIdx(i + 1, j, k0)]);
      const v =
        0.5 *
        (f.v[grid.vIdx(i, j, k0)] + f.v[grid.vIdx(i, j + 1, k0)]);
      const spd = Math.max(0.5, Math.hypot(u, v));
      const drag =
        CD *
        Math.max(0.2, adv.terrainDrag) *
        (isWater ? 0.7 : 1 + 0.6 * veg * adv.roughnessVeg);

      // Surface potential temperature target from insolation / night cool.
      const thAir = f.theta[id];
      const albedo = isWater
        ? adv.waterAlbedo
        : adv.landAlbedo + 0.1 * veg;
      const sw =
        ((3.2 * pace) / 3600) *
        sunFlat *
        (1 - albedo) *
        adv.swHeating *
        (isWater ? 0.4 : Math.max(0.35, land));
      const lw =
        ((1.4 * pace) / 3600) *
        (isWater ? adv.lwWaterCooling * 0.4 : adv.lwLandCooling) *
        (sunFlat < 0.05 && getToggles().enableNightCooling
          ? adv.nightCoolBoost
          : 1);
      const thSfc = thAir + (sw - lw) * 40; // soft skin offset

      const evaporative = getToggles().enableBowenSplit
        ? Math.min(
            0.95,
            (isWater
              ? 0.85
              : Math.min(0.9, 0.15 + 0.55 * soil + 0.35 * veg)) *
              (isWater ? adv.evaporativeWater : adv.evaporativeLand),
          )
        : 0.35;

      const heat =
        CH * spd * (thSfc - thAir) * (1 - evaporative * 0.5);
      f.theta[id] += heat * dt * Math.max(0.2, adv.swHeating);
      // Bound drift away from base state.
      const th0 = f.theta0[k0];
      if (f.theta[id] > th0 + 14) f.theta[id] = th0 + 14;
      if (f.theta[id] < th0 - 10) f.theta[id] = th0 - 10;

      const T = TFromTheta(f.theta[id], f.p0[k0]);
      const qSfc =
        qsat(T, f.p0[k0]) *
        (isWater ? 0.98 : 0.55 + 0.35 * soil + 0.15 * veg);
      const moist =
        CE *
        spd *
        evaporative *
        (qSfc - f.qv[id]) *
        Math.max(
          0.2,
          isWater ? adv.evaporativeWater : adv.soilMoistureFlux,
        );
      if (moist > 0 || isWater) {
        f.qv[id] = Math.max(0, f.qv[id] + moist * dt);
      }

      // Momentum drag on lowest free faces.
      const damp = Math.min(0.5, drag * spd * dt / Math.max(dz, 1));
      f.u[grid.uIdx(i, j, k0)] *= 1 - damp;
      f.u[grid.uIdx(i + 1, j, k0)] *= 1 - damp;
      f.v[grid.vIdx(i, j, k0)] *= 1 - damp;
      f.v[grid.vIdx(i, j + 1, k0)] *= 1 - damp;

      void dx;
      void dy;
    }
  }
}

/**
 * Troen–Mahrt style K-profile in the lowest ~15% of the column when the
 * horizontal grid is too coarse for resolved thermals (dx ≳ 1 km).
 */
export function stepKProfilePBL(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  openK?: Uint16Array | null,
): void {
  const horiz = Math.min(grid.dx, grid.dy);
  if (horiz < 1000 || dt <= 0) return;
  const { nx, ny, nz, dz } = grid;
  const mixH = Math.max(0.2, getAdvanced().vertMixing);
  const ziCells = Math.min(nz - 2, Math.max(4, Math.floor(nz * 0.18)));
  const zi = ziCells * dz;
  const wStar = 1.2 * mixH; // m/s convective velocity scale

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k0 = openK ? openK[i + j * nx] : 0;
      for (let dk = 0; dk < ziCells - 1; dk++) {
        const k = k0 + dk;
        if (k + 1 >= nz) break;
        const z = (dk + 0.5) * dz;
        const zeta = Math.min(1, z / Math.max(zi, 1));
        const Km =
          KAPPA *
          wStar *
          zi *
          zeta *
          (1 - zeta) *
          (1 - zeta) *
          mixH;
        if (Km < 1e-4) continue;
        const id0 = grid.idx(i, j, k);
        const id1 = grid.idx(i, j, k + 1);
        const fac = Math.min(0.45, (Km * dt) / (dz * dz));
        const dTh = (f.theta[id0] - f.theta[id1]) * fac;
        f.theta[id0] -= dTh;
        f.theta[id1] += dTh;
        const dQ = (f.qv[id0] - f.qv[id1]) * fac;
        f.qv[id0] = Math.max(0, f.qv[id0] - dQ);
        f.qv[id1] = Math.max(0, f.qv[id1] + dQ);
      }
    }
  }
}

/**
 * Gray two-stream longwave: optical depth from liquid + ice water path,
 * cooling peaked near cloud top. Replaces the fixed 2 K/h seeder.
 */
export function stepGrayLongwave(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  openK?: Uint16Array | null,
): void {
  if (dt <= 0) return;
  const { nx, ny, nz, dz } = grid;
  const rate = ((2.4 / 3600) * getAdvanced().lwLandCooling) * dt;
  const nxny = nx * ny;

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k0 = openK ? openK[i + j * nx] : 0;
      // Column liquid+ice water path and cloud-top index.
      let lwp = 0;
      let cloudTop = -1;
      for (let k = k0; k < nz; k++) {
        const id = i + j * nx + k * nxny;
        const qc = f.qc[id] + f.qi[id] + 0.5 * f.qs[id];
        if (qc > 5e-5) {
          lwp += qc * f.rho0[k] * dz;
          cloudTop = k;
        }
      }
      if (cloudTop < 1 || lwp < 1e-4) continue;
      const tau = Math.min(8, 0.15 * lwp * 1000); // LWP in g/m² order
      const coolTop = rate * (1 - Math.exp(-tau));
      for (let dk = 0; dk <= 3; dk++) {
        const k = cloudTop - dk;
        if (k < k0) break;
        const amp = Math.exp(-dk * 1.2);
        const id = i + j * nx + k * nxny;
        f.theta[id] -= coolTop * amp;
        if (f.theta[id] < f.theta0[k] - 6) f.theta[id] = f.theta0[k] - 6;
      }
      // Weak heating below thick cloud (downwelling IR).
      if (tau > 1 && cloudTop > k0 + 2) {
        const warm = coolTop * 0.25;
        for (let k = k0; k < cloudTop - 2; k++) {
          const id = i + j * nx + k * nxny;
          f.theta[id] += warm * 0.15;
        }
      }
    }
  }
  void CP;
  void LV;
}

/** Combined slow column physics (surface + PBL + longwave). */
export function stepSlowColumnPhysics(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  ctx: SlowPhysicsContext,
): void {
  stepBulkSurfaceFluxes(grid, f, dt, ctx);
  stepKProfilePBL(grid, f, dt, ctx.openK);
  stepGrayLongwave(grid, f, dt, ctx.openK);
}
