import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import {
  RadiationOptions,
  solarStatus,
} from "./SurfaceRadiation";
import { dewpointFromE, esatFast, mixingRatio } from "./thermo";

const PLUME_COOLDOWN_S = 240;
const MAX_PLUMES = 2;
const PLUME_RADIUS_M = 1500;

/**
 * Daytime boundary-layer moisture and a few shallow plumes.
 * The grid is too coarse to grow cumulus from a 0.1 m/s thermal, so warm
 * land columns that can reach their LCL get a small saturated kick.
 */
export function stepShallowCu(
  grid: Grid3D,
  fields: SimFields,
  dt: number,
  landMask: Float32Array,
  cooldown: Float32Array,
  exner: Float32Array,
  radiation: RadiationOptions,
): void {
  if (dt <= 0) return;
  const nxy = grid.nx * grid.ny;
  for (let ij = 0; ij < nxy; ij++) {
    if (cooldown[ij] > 0) cooldown[ij] = Math.max(0, cooldown[ij] - dt);
  }

  const sun = solarStatus(radiation).sunFrac;
  if (!radiation.enabled || sun <= 0.25) return;
  if (landMask.length < nxy) return;

  addMoistureFlux(grid, fields, dt, landMask, exner, sun, radiation.diurnalSpeed);
  releasePlumes(grid, fields, landMask, cooldown, exner);
}

function addMoistureFlux(
  grid: Grid3D,
  fields: SimFields,
  dt: number,
  landMask: Float32Array,
  exner: Float32Array,
  sun: number,
  diurnalSpeed: number,
): void {
  const { nx, ny, nz } = grid;
  const pace = Math.max(1, diurnalSpeed) / 15;
  // Offsets most of the humidity drop from daytime heating, and leaves
  // the LCL free to rise into the 400 m–2.5 km window where plumes fire.
  const qDot0 = 8.4e-6 * pace * sun;
  const kMax = Math.min(nz - 1, 4);

  for (let k = 0; k < kMax; k++) {
    const wgt = Math.exp(-k / 1.15);
    if (wgt < 0.08) continue;
    const p0 = fields.p0[k];
    const ex = exner[k];
    const kBase = k * nx * ny;
    for (let j = 0; j < ny; j++) {
      const row = j * nx;
      for (let i = 0; i < nx; i++) {
        const id = kBase + row + i;
        const land = landMask[row + i];
        const T = fields.theta[id] * ex;
        const qs = mixingRatio(esatFast(T), p0);
        const cap = 0.95 * qs;
        const qv = fields.qv[id];
        if (qv >= cap) continue;
        fields.qv[id] = Math.min(cap, qv + qDot0 * land * wgt * dt);
      }
    }
  }
}

function releasePlumes(
  grid: Grid3D,
  fields: SimFields,
  landMask: Float32Array,
  cooldown: Float32Array,
  exner: Float32Array,
): void {
  const { nx, ny, nz, dx, dy, dz } = grid;
  let iA = -1;
  let jA = -1;
  let warmA = 1.2;
  let iB = -1;
  let jB = -1;
  let warmB = 1.2;

  const pSfc = fields.p0[0];
  const ex0 = exner[0];
  for (let j = 0; j < ny; j++) {
    const row = j * nx;
    for (let i = 0; i < nx; i++) {
      const ij = row + i;
      if (cooldown[ij] > 0) continue;
      if (landMask[ij] <= 1) continue;
      const th = fields.theta[ij];
      const dth = th - fields.theta0[0];
      if (dth <= warmB) continue;
      const T = th * ex0;
      const qv = Math.max(0, fields.qv[ij]);
      const e = (qv * pSfc) / (0.622 + qv);
      const tC = T - 273.15;
      const tdC = dewpointFromE(Math.max(1, e));
      const lcl = 125 * (tC - tdC);
      if (lcl < 400 || lcl > 2500) continue;
      if (dth > warmA) {
        iB = iA;
        jB = jA;
        warmB = warmA;
        iA = i;
        jA = j;
        warmA = dth;
      } else {
        iB = i;
        jB = j;
        warmB = dth;
      }
    }
  }

  const picks: [number, number][] = [];
  if (iA >= 0) picks.push([iA, jA]);
  if (iB >= 0 && picks.length < MAX_PLUMES) picks.push([iB, jB]);
  for (const [ci, cj] of picks) {
    firePlume(grid, fields, cooldown, exner, ci, cj, dx, dy, dz, nx, ny, nz);
  }
}

function firePlume(
  grid: Grid3D,
  fields: SimFields,
  cooldown: Float32Array,
  exner: Float32Array,
  ci: number,
  cj: number,
  dx: number,
  dy: number,
  dz: number,
  nx: number,
  ny: number,
  nz: number,
): void {
  const ij0 = ci + cj * nx;
  const pSfc = fields.p0[0];
  const qSfc = Math.max(0, fields.qv[ij0]);
  const T = fields.theta[ij0] * exner[0];
  const e = (qSfc * pSfc) / (0.622 + Math.max(qSfc, 1e-8));
  const lcl = 125 * (T - 273.15 - dewpointFromE(Math.max(1, e)));
  const cx = (ci + 0.5) * dx;
  const cy = (cj + 0.5) * dy;
  const i0 = Math.max(0, ci - Math.ceil(PLUME_RADIUS_M / dx) - 1);
  const i1 = Math.min(nx - 1, ci + Math.ceil(PLUME_RADIUS_M / dx) + 1);
  const j0 = Math.max(0, cj - Math.ceil(PLUME_RADIUS_M / dy) - 1);
  const j1 = Math.min(ny - 1, cj + Math.ceil(PLUME_RADIUS_M / dy) + 1);
  const k1 = Math.min(nz - 1, Math.ceil((lcl + 800) / dz));
  const nxny = nx * ny;

  for (let j = j0; j <= j1; j++) {
    const y = (j + 0.5) * dy;
    for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) * dx;
      const rHoriz = Math.hypot(x - cx, y - cy) / PLUME_RADIUS_M;
      if (rHoriz >= 1) continue;
      const hAmp = Math.cos(0.5 * Math.PI * rHoriz);
      const h2 = hAmp * hAmp;
      cooldown[i + j * nx] = Math.max(cooldown[i + j * nx], PLUME_COOLDOWN_S);
      for (let k = 0; k <= k1; k++) {
        const z = (k + 0.5) * dz;
        if (z > lcl + 800) break;
        const zAmp = z <= lcl ? 1 : Math.max(0, 1 - (z - lcl) / 800);
        const amp = h2 * zAmp;
        if (amp < 0.02) continue;
        const id = i + nx * j + k * nxny;
        fields.theta[id] += 2 * amp;
        const p0 = fields.p0[k];
        const qs = mixingRatio(esatFast(fields.theta[id] * exner[k]), p0);
        const frac = Math.min(1, z / Math.max(lcl, 1));
        const qLift = frac < 1 ? qSfc : Math.min(qSfc, qs * 0.99);
        fields.qv[id] += (qLift - fields.qv[id]) * amp;
        if (z >= lcl - dz && z <= lcl + 1.5 * dz) {
          fields.qc[id] = Math.max(fields.qc[id], 0.00045 * h2);
        }
        const kick = 2 * h2 * zAmp;
        fields.w[grid.wIdx(i, j, k)] += kick * 0.5;
        fields.w[grid.wIdx(i, j, Math.min(nz, k + 1))] += kick * 0.5;
      }
    }
  }

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      fields.w[grid.wIdx(i, j, 0)] = 0;
      fields.w[grid.wIdx(i, j, nz)] = 0;
    }
  }
}
