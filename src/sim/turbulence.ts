/**
 * Smagorinsky eddy viscosity and Coriolis on the anelastic C-grid.
 */

import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import { getAdvanced, getToggles } from "./AdvancedSettings";
import { getActiveSynoptic } from "./synoptic";

const OMEGA = 7.2921e-5;
/** Smagorinsky constant — kept modest so thermals are not diffused away. */
const CS = 0.12;
/** Scalar Prandtl number (>1 → weaker θ/qv mixing than momentum). */
const PR = 3;
/** Cap on eddy viscosity so a strong updraft cannot self-smother. */
const NU_CAP_FRAC = 0.08; // × dx²/dt scale applied per call via dt

/** Coriolis parameter from latitude (radians north positive). */
export function coriolisF(latitudeDeg: number, scale = 1): number {
  return 2 * OMEGA * Math.sin((latitudeDeg * Math.PI) / 180) * scale;
}

/**
 * Apply f × u on horizontal face winds. Synoptic latitude wins when a
 * pattern is active; otherwise the radiation latitude is used.
 */
export function applyCoriolis(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  radiationLatDeg: number,
  openK?: Uint16Array | null,
): void {
  const syn = getActiveSynoptic();
  const lat =
    syn.enabled !== false && Number.isFinite(syn.latitudeDeg)
      ? syn.latitudeDeg
      : radiationLatDeg;
  const ff = coriolisF(lat, getAdvanced().coriolisScale);
  if (Math.abs(ff) < 1e-8 || dt <= 0) return;

  const { nx, ny, nz } = grid;
  // Semi-implicit (u,v) rotation over dt keeps |f|dt from overshooting.
  const a = Math.cos(ff * dt);
  const b = Math.sin(ff * dt);

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i <= nx; i++) {
        if (openK) {
          const iL = i > 0 ? i - 1 : 0;
          const iR = i < nx ? i : nx - 1;
          if (k < openK[iL + j * nx] || k < openK[iR + j * nx]) continue;
        }
        const uid = grid.uIdx(i, j, k);
        // v at the u-face: average of surrounding v faces
        const iC = i < nx ? i : nx - 1;
        const iW = i > 0 ? i - 1 : 0;
        const vHere =
          0.25 *
          (f.v[grid.vIdx(iC, j, k)] +
            f.v[grid.vIdx(iC, j + 1, k)] +
            f.v[grid.vIdx(iW, j, k)] +
            f.v[grid.vIdx(iW, j + 1, k)]);
        const u0 = f.u[uid];
        // Only rotate u here; v is updated on its own faces below.
        f.u[uid] = a * u0 - b * vHere;
      }
    }
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (openK) {
          const jB = j > 0 ? j - 1 : 0;
          const jT = j < ny ? j : ny - 1;
          if (k < openK[i + jB * nx] || k < openK[i + jT * nx]) continue;
        }
        const vid = grid.vIdx(i, j, k);
        const jC = j < ny ? j : ny - 1;
        const jS = j > 0 ? j - 1 : 0;
        const uHere =
          0.25 *
          (f.u[grid.uIdx(i, jC, k)] +
            f.u[grid.uIdx(i + 1, jC, k)] +
            f.u[grid.uIdx(i, jS, k)] +
            f.u[grid.uIdx(i + 1, jS, k)]);
        const v0 = f.v[vid];
        f.v[vid] = b * uHere + a * v0;
      }
    }
  }
}

/**
 * Smagorinsky mixing of momentum (faces) and scalars (cell centres).
 * Deformation is estimated from centred face differences.
 */
export function applySmagorinsky(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  openK?: Uint16Array | null,
): void {
  if (dt <= 0) return;
  if (!getToggles().enableBuoyancy && getAdvanced().viscosityScale <= 0) return;
  const { nx, ny, nz, dx, dy, dz } = grid;
  const S = getAdvanced();
  const mixH = Math.max(0.05, S.horizMixing) * Math.max(0.05, S.viscosityScale);
  const mixV = Math.max(0.05, S.vertMixing) * Math.max(0.05, S.viscosityScale);
  const delta = Math.cbrt(dx * dy * dz);
  const nu0 = (CS * CS) * delta * delta * mixH;
  const nuV = (CS * CS) * delta * delta * mixV;
  // Stability cap: ν Δt / Δx² ≲ NU_CAP_FRAC
  const nuCap = (NU_CAP_FRAC * Math.min(dx, dy) * Math.min(dx, dy)) / Math.max(dt, 1e-3);

  // Diffuse θ and qv weakly (Pr > 1) so buoyancy cores survive.
  const nxny = nx * ny;
  const thTmp = new Float32Array(nxny);
  const qvTmp = new Float32Array(nxny);

  for (let k = 0; k < nz; k++) {
    const kFloor = openK;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const id = i + j * nx;
        if (kFloor && k < kFloor[id]) {
          thTmp[id] = f.theta[id + k * nxny];
          qvTmp[id] = f.qv[id + k * nxny];
          continue;
        }
        const c = id + k * nxny;
        const iL = i > 0 ? i - 1 : i;
        const iR = i < nx - 1 ? i + 1 : i;
        const jB = j > 0 ? j - 1 : j;
        const jT = j < ny - 1 ? j + 1 : j;
        const kD = k > 0 ? k - 1 : k;
        const kU = k < nz - 1 ? k + 1 : k;
        const du =
          (f.u[grid.uIdx(i + 1, j, k)] - f.u[grid.uIdx(i, j, k)]) / dx;
        const dv =
          (f.v[grid.vIdx(i, j + 1, k)] - f.v[grid.vIdx(i, j, k)]) / dy;
        const dw =
          (f.w[grid.wIdx(i, j, k + 1)] - f.w[grid.wIdx(i, j, k)]) / dz;
        const strain = Math.sqrt(
          2 * (du * du + dv * dv + dw * dw) + 1e-12,
        );
        const kh = Math.min(nuCap, nu0 * strain) / PR;
        const kv = Math.min(nuCap, nuV * strain) / PR;
        const fx =
          (kh / (dx * dx)) *
          (f.theta[iR + j * nx + k * nxny] -
            2 * f.theta[c] +
            f.theta[iL + j * nx + k * nxny]);
        const fy =
          (kh / (dy * dy)) *
          (f.theta[i + jT * nx + k * nxny] -
            2 * f.theta[c] +
            f.theta[i + jB * nx + k * nxny]);
        const fz =
          (kv / (dz * dz)) *
          (f.theta[i + j * nx + kU * nxny] -
            2 * f.theta[c] +
            f.theta[i + j * nx + kD * nxny]);
        thTmp[id] = f.theta[c] + (fx + fy + fz) * dt;

        const qx =
          (kh / (dx * dx)) *
          (f.qv[iR + j * nx + k * nxny] -
            2 * f.qv[c] +
            f.qv[iL + j * nx + k * nxny]);
        const qy =
          (kh / (dy * dy)) *
          (f.qv[i + jT * nx + k * nxny] -
            2 * f.qv[c] +
            f.qv[i + jB * nx + k * nxny]);
        const qz =
          (kv / (dz * dz)) *
          (f.qv[i + j * nx + kU * nxny] -
            2 * f.qv[c] +
            f.qv[i + j * nx + kD * nxny]);
        qvTmp[id] = Math.max(0, f.qv[c] + (qx + qy + qz) * dt);
      }
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const id = i + j * nx;
        f.theta[id + k * nxny] = thTmp[id];
        f.qv[id + k * nxny] = qvTmp[id];
      }
    }
  }

  // Momentum diffusion on u/v faces, capped.
  const nuMom = Math.min(nuCap, nu0 * 0.02); // mild background + strain handled weakly
  const uTmp = new Float32Array(f.u.length);
  uTmp.set(f.u);
  const vTmp = new Float32Array(f.v.length);
  vTmp.set(f.v);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 1; i < nx; i++) {
        if (openK && (k < openK[i + j * nx] || k < openK[i - 1 + j * nx])) {
          continue;
        }
        const id = grid.uIdx(i, j, k);
        const iL = grid.uIdx(i - 1, j, k);
        const iR = grid.uIdx(i + 1, j, k);
        const jB = j > 0 ? grid.uIdx(i, j - 1, k) : id;
        const jT = j < ny - 1 ? grid.uIdx(i, j + 1, k) : id;
        const lap =
          (f.u[iR] - 2 * f.u[id] + f.u[iL]) / (dx * dx) +
          (f.u[jT] - 2 * f.u[id] + f.u[jB]) / (dy * dy);
        uTmp[id] = f.u[id] + nuMom * lap * dt;
      }
    }
    for (let j = 1; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (openK && (k < openK[i + j * nx] || k < openK[i + (j - 1) * nx])) {
          continue;
        }
        const id = grid.vIdx(i, j, k);
        const iL = i > 0 ? grid.vIdx(i - 1, j, k) : id;
        const iR = i < nx - 1 ? grid.vIdx(i + 1, j, k) : id;
        const jB = grid.vIdx(i, j - 1, k);
        const jT = grid.vIdx(i, j + 1, k);
        const lap =
          (f.v[iR] - 2 * f.v[id] + f.v[iL]) / (dx * dx) +
          (f.v[jT] - 2 * f.v[id] + f.v[jB]) / (dy * dy);
        vTmp[id] = f.v[id] + nuMom * lap * dt;
      }
    }
  }
  f.u.set(uTmp);
  f.v.set(vTmp);
}
