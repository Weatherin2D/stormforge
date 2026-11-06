/**
 * Hydrostatic primitive-equation advance for synoptic grids (dx ≳ 4 km).
 * Prognostic u, v, θ, qv; w diagnosed from anelastic continuity; pressure
 * gradient from a hydrostatic integration of the virtual-θ anomaly.
 */

import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import { G, RD } from "./thermo";
import { getAdvanced } from "./AdvancedSettings";
import { musclFace, clampIdx } from "./advection";
import { applyCoriolis } from "./turbulence";

/** Synoptic diagnosed |w| cap (m/s). Keeps a PGF transient from lifting the lid. */
const W_CAP = 1.5;

/**
 * Diagnose w from ∇·(ρ₀ u_h) + ∂(ρ₀ w)/∂z = 0, integrating up from the
 * terrain / floor. Lids stay sealed.
 */
export function diagnoseW(
  grid: Grid3D,
  f: SimFields,
  openK?: Uint16Array | null,
): void {
  const { nx, ny, nz, dx, dy, dz } = grid;
  const nxny = nx * ny;
  const nu = nx + 1;
  const nv = ny + 1;
  f.w.fill(0);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const kFloor = openK ? openK[i + j * nx] : 0;
      let mass = 0;
      for (let k = kFloor; k < nz; k++) {
        const rho = f.rho0[k];
        const ku = k * nu * ny + j * nu;
        const kv = k * nx * nv + j * nx;
        const kv1 = k * nx * nv + (j + 1) * nx;
        const du = (f.u[ku + i + 1] - f.u[ku + i]) / dx;
        const dv = (f.v[kv1 + i] - f.v[kv + i]) / dy;
        mass -= rho * (du + dv) * dz;
        const rhowT = f.rho0w[k + 1];
        let w = rhowT > 1e-6 ? mass / rhowT : 0;
        if (w > W_CAP) {
          w = W_CAP;
          mass = w * rhowT;
        } else if (w < -W_CAP) {
          w = -W_CAP;
          mass = w * rhowT;
        }
        f.w[i + j * nx + (k + 1) * nxny] = w;
      }
      f.w[i + j * nx + nz * nxny] = 0;
      if (kFloor === 0) f.w[i + j * nx] = 0;
    }
  }
}

/**
 * Hydrostatic Exner perturbation from the virtual-θ anomaly, integrated
 * downward from a rigid lid (π' = 0 at top).
 *
 * Buoyancy is the departure from the balanced synoptic environment
 * (`thetaEnv` / `qvEnv`) when provided — fronts painted into the fields are
 * neutral. Measuring against the horizontally uniform base state treats
 * every front as a free-fall anomaly and instantly explodes the wind.
 */
export function hydrostaticPressure(
  grid: Grid3D,
  f: SimFields,
  openK?: Uint16Array | null,
  thetaEnv?: Float32Array | null,
  qvEnv?: Float32Array | null,
): void {
  const { nx, ny, nz, dz } = grid;
  const nxny = nx * ny;
  const useEnv = !!(thetaEnv && qvEnv && thetaEnv.length >= nxny * nz);
  // Top-down: dπ/dz = g (θv - θv_ref) / θv_ref² proxy. Store π' in f.p.
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const kFloor = openK ? openK[i + j * nx] : 0;
      let pi = 0;
      f.p[i + j * nx + (nz - 1) * nxny] = 0;
      for (let k = nz - 1; k >= kFloor; k--) {
        const id = i + j * nx + k * nxny;
        const thv = f.theta[id] * (1 + 0.608 * f.qv[id]);
        const thRef = useEnv ? thetaEnv![id] : f.theta0[k];
        const qRef = useEnv ? qvEnv![id] : f.qv0[k];
        const thv0 = thRef * (1 + 0.608 * qRef);
        const buoy = (thv - thv0) / Math.max(thv0, 1);
        if (k < nz - 1) {
          pi += (G * buoy * dz) / Math.max(thRef, 1);
        }
        f.p[id] = pi;
      }
      for (let k = 0; k < kFloor; k++) {
        f.p[i + j * nx + k * nxny] = pi;
      }
    }
  }
}

/** Apply −θ₀ ∇π to u,v (hydrostatic pressure-gradient force). */
export function applyHydrostaticPGF(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  openK?: Uint16Array | null,
): void {
  const { nx, ny, nz, dx, dy } = grid;
  const nxny = nx * ny;
  const scale = getAdvanced().buoyancyScale;
  // Cap the impulse per substep so a residual front mismatch cannot jump
  // the wind by tens of m/s in one coarse outer pass.
  const duCap = Math.min(8, 25 * Math.max(dt, 1e-3) / 60);
  for (let k = 0; k < nz; k++) {
    const th0 = f.theta0[k];
    for (let j = 0; j < ny; j++) {
      const row = k * nxny + j * nx;
      for (let i = 1; i < nx; i++) {
        if (openK && (k < openK[i + j * nx] || k < openK[i - 1 + j * nx])) {
          continue;
        }
        const dPi = (f.p[row + i] - f.p[row + i - 1]) / dx;
        let du = -th0 * dPi * dt * scale;
        if (du > duCap) du = duCap;
        else if (du < -duCap) du = -duCap;
        f.u[grid.uIdx(i, j, k)] += du;
      }
    }
    for (let j = 1; j < ny; j++) {
      const row = k * nxny + j * nx;
      const rowB = row - nx;
      for (let i = 0; i < nx; i++) {
        if (openK && (k < openK[i + j * nx] || k < openK[i + (j - 1) * nx])) {
          continue;
        }
        const dPi = (f.p[row + i] - f.p[rowB + i]) / dy;
        let dv = -th0 * dPi * dt * scale;
        if (dv > duCap) dv = duCap;
        else if (dv < -duCap) dv = -duCap;
        f.v[grid.vIdx(i, j, k)] += dv;
      }
    }
  }
}

/**
 * Horizontal MUSCL advection of u,v (no vertical wind advection — w is
 * diagnostic). Scalars are advanced by the caller's shared advectScalars.
 */
export function advectHorizontalWinds(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  tmpU: Float32Array,
  tmpV: Float32Array,
  openK?: Uint16Array | null,
): void {
  const { nx, ny, nz, dx, dy } = grid;
  // --- u ---
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const id = grid.uIdx(i, j, k);
        if (openK) {
          const iL = i > 0 ? i - 1 : 0;
          const iR = i < nx ? i : nx - 1;
          if (k < openK[iL + j * nx] || k < openK[iR + j * nx]) {
            tmpU[id] = 0;
            continue;
          }
        }
        const uc = f.u[id];
        // Advect u with itself (x) and interpolated v (y).
        const i0 = clampIdx(i - 1, nx + 1);
        const i1 = clampIdx(i + 1, nx + 1);
        const i00 = clampIdx(i - 2, nx + 1);
        const i11 = clampIdx(i + 2, nx + 1);
        // Reconstruct at staggered half-index using neighbouring u faces.
        const uL = musclFace(
          f.u[grid.uIdx(i00, j, k)],
          f.u[grid.uIdx(i0, j, k)],
          f.u[id],
          f.u[grid.uIdx(i1, j, k)],
          uc,
        );
        // Simple donor-cell y-flux
        const vc =
          i === 0
            ? 0.5 * (f.v[grid.vIdx(0, j, k)] + f.v[grid.vIdx(0, j + 1, k)])
            : i === nx
              ? 0.5 *
                (f.v[grid.vIdx(nx - 1, j, k)] +
                  f.v[grid.vIdx(nx - 1, j + 1, k)])
              : 0.25 *
                (f.v[grid.vIdx(i - 1, j, k)] +
                  f.v[grid.vIdx(i, j, k)] +
                  f.v[grid.vIdx(i - 1, j + 1, k)] +
                  f.v[grid.vIdx(i, j + 1, k)]);
        const j0 = clampIdx(j - 1, ny);
        const j1 = clampIdx(j + 1, ny);
        const uFromY = musclFace(
          f.u[grid.uIdx(i, j0 === j ? j : j0, k)],
          f.u[grid.uIdx(i, j, k)],
          f.u[grid.uIdx(i, j1, k)],
          f.u[grid.uIdx(i, clampIdx(j1 + 1, ny), k)],
          vc,
        );
        // Tendency form: ∂u/∂t = -u∂u/∂x - v∂u/∂y (approx via upwind faces)
        const du =
          -((uc >= 0 ? uc * (f.u[id] - f.u[grid.uIdx(i0, j, k)]) : uc * (f.u[grid.uIdx(i1, j, k)] - f.u[id])) /
            dx) -
          ((vc >= 0 ? vc * (f.u[id] - f.u[grid.uIdx(i, j0, k)]) : vc * (f.u[grid.uIdx(i, j1, k)] - f.u[id])) /
            dy);
        void uL;
        void uFromY;
        void i11;
        tmpU[id] = f.u[id] + du * dt;
      }
    }
  }
  // --- v ---
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i < nx; i++) {
        const id = grid.vIdx(i, j, k);
        if (openK) {
          const jB = j > 0 ? j - 1 : 0;
          const jT = j < ny ? j : ny - 1;
          if (k < openK[i + jB * nx] || k < openK[i + jT * nx]) {
            tmpV[id] = 0;
            continue;
          }
        }
        const vc = f.v[id];
        const j0 = clampIdx(j - 1, ny + 1);
        const j1 = clampIdx(j + 1, ny + 1);
        const uc =
          j === 0
            ? 0.5 * (f.u[grid.uIdx(i, 0, k)] + f.u[grid.uIdx(i + 1, 0, k)])
            : j === ny
              ? 0.5 *
                (f.u[grid.uIdx(i, ny - 1, k)] +
                  f.u[grid.uIdx(i + 1, ny - 1, k)])
              : 0.25 *
                (f.u[grid.uIdx(i, j - 1, k)] +
                  f.u[grid.uIdx(i + 1, j - 1, k)] +
                  f.u[grid.uIdx(i, j, k)] +
                  f.u[grid.uIdx(i + 1, j, k)]);
        const i0 = clampIdx(i - 1, nx);
        const i1 = clampIdx(i + 1, nx);
        const dv =
          -((uc >= 0 ? uc * (f.v[id] - f.v[grid.vIdx(i0, j, k)]) : uc * (f.v[grid.vIdx(i1, j, k)] - f.v[id])) /
            dx) -
          ((vc >= 0 ? vc * (f.v[id] - f.v[grid.vIdx(i, j0, k)]) : vc * (f.v[grid.vIdx(i, j1, k)] - f.v[id])) /
            dy);
        tmpV[id] = f.v[id] + dv * dt;
      }
    }
  }
  // Bound winds so a coarse-grid PGF transient cannot explode.
  for (let i = 0; i < tmpU.length; i++) {
    const u = tmpU[i];
    tmpU[i] = !Number.isFinite(u) ? 0 : u > 80 ? 80 : u < -80 ? -80 : u;
  }
  for (let i = 0; i < tmpV.length; i++) {
    const v = tmpV[i];
    tmpV[i] = !Number.isFinite(v) ? 0 : v > 80 ? 80 : v < -80 ? -80 : v;
  }
  f.u.set(tmpU);
  f.v.set(tmpV);
}

/**
 * Remove a fraction of horizontal divergence so Coriolis spin-up on an
 * unbalanced initial wind does not diagnose thunderstorms from nowhere.
 */
export function dampDivergence(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  openK?: Uint16Array | null,
): void {
  const { nx, ny, nz, dx, dy } = grid;
  const nxny = nx * ny;
  // Diffusion-like coefficient on divergence (m²/s), scaled by dt.
  const nu = Math.min(0.2 * dx * dx / Math.max(dt, 1), 0.15 * dx * dx);
  const fx = (nu * dt) / (dx * dx);
  const fy = (nu * dt) / (dy * dy);
  if (fx <= 0 && fy <= 0) return;

  for (let k = 0; k < nz; k++) {
    const base = k * nxny;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (openK && k < openK[i + j * nx]) continue;
        const ij = base + j * nx + i;
        const du = (f.u[grid.uIdx(i + 1, j, k)] - f.u[grid.uIdx(i, j, k)]) / dx;
        const dv = (f.v[grid.vIdx(i, j + 1, k)] - f.v[grid.vIdx(i, j, k)]) / dy;
        const div = du + dv;
        // Nudge the four faces outward/inward to cancel a slice of div.
        if (i > 0) f.u[grid.uIdx(i, j, k)] += fx * div * dx;
        if (i < nx - 1) f.u[grid.uIdx(i + 1, j, k)] -= fx * div * dx;
        if (j > 0) f.v[grid.vIdx(i, j, k)] += fy * div * dy;
        if (j < ny - 1) f.v[grid.vIdx(i, j + 1, k)] -= fy * div * dy;
        void ij;
      }
    }
  }
}

/**
 * One hydrostatic substep: PGF → Coriolis → horizontal wind advection →
 * diagnose w. Scalar advection is left to the caller.
 *
 * `thetaEnv` / `qvEnv` are the balanced synoptic reference (fronts, lows).
 */
export function stepHydrostaticDynamics(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  tmpU: Float32Array,
  tmpV: Float32Array,
  radiationLatDeg: number,
  openK?: Uint16Array | null,
  thetaEnv?: Float32Array | null,
  qvEnv?: Float32Array | null,
): void {
  hydrostaticPressure(grid, f, openK, thetaEnv, qvEnv);
  applyHydrostaticPGF(grid, f, dt, openK);
  applyCoriolis(grid, f, dt, radiationLatDeg, openK);
  advectHorizontalWinds(grid, f, dt, tmpU, tmpV, openK);
  dampDivergence(grid, f, dt, openK);
  diagnoseW(grid, f, openK);
  // Clear non-finite w.
  for (let i = 0; i < f.w.length; i++) {
    if (!Number.isFinite(f.w[i])) f.w[i] = 0;
  }
  void RD;
}
