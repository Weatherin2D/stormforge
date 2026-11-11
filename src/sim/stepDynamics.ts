/**
 * Grid-scale helpers shared by the storm and hydrostatic cores:
 *   - Gentle frontal upglide amplitude
 *   - Stable-column draft relaxation
 *   - Post-projection frontal upglide restore
 *   - Horizontal spike broadening (mixGridScale)
 *
 * Painted “slow physics” writers (cloud-top cooling, synoptic omega forcing,
 * marine stratus seeding, BL mixing writers) intentionally do not live here.
 */

import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import { getAdvanced } from "./AdvancedSettings";

/**
 * How hard each column's front may lift, in m/s at the ridge.
 * Kept to gentle synoptic values. Deep storms must come from buoyancy;
 * CAPE-gated storm-strength upglide previously detonated every front ridge
 * on the default sounding.
 */
export function frontalUpglideAmplitude(
  grid: Grid3D,
  _theta0: Float32Array,
  _qv0: Float32Array,
  _thetaEnv: Float32Array,
  _qvEnv: Float32Array,
  _p0: Float32Array,
  _exner: Float32Array,
  liftK: Float32Array,
  frontDist: Float32Array,
  out: Float32Array,
  stable: Uint8Array,
): void {
  const { nx, ny } = grid;
  for (let j = 0; j < ny; j++) {
    const row = j * nx;
    for (let i = 0; i < nx; i++) {
      const ij = row + i;
      const lift = liftK[ij];
      // Convergence that feeds the phantom draft extends past the warm ridge.
      if (frontDist[ij] >= 0.25 && lift < 0.2) {
        out[ij] = 0;
        // Always mark for phantom-draft damping; real warm cores are spared
        // inside relaxStableDrafts via the θ-anomaly check.
        stable[ij] = 1;
        continue;
      }
      const ridge = lift < 2.5 ? lift / 2.5 : 1;
      stable[ij] = 1;
      out[ij] = lift >= 0.2 ? 0.03 * ridge : 0;
    }
  }
}

/**
 * A front's wind nudge is convergent, and the projection turns that into
 * `w`. The nudge is applied again every step, so on a stable sounding the
 * draft ratchets up to thunderstorm strength and the line breaks into a
 * checkerboard. Pull that phantom draft back. Buoyancy still acts every
 * substep, so a real thermal settles at a few metres per second. A draft
 * with nothing to hold it up falls back to the gentle upglide.
 */
export function relaxStableDrafts(
  grid: Grid3D,
  theta: Float32Array,
  thetaEnv: Float32Array,
  w: Float32Array,
  amp: Float32Array,
  stable: Uint8Array,
  openK: Uint16Array | null,
  height: Float32Array | null,
): void {
  // The projection rebuilds this draft from the imposed synoptic wind on
  // every substep. A capped column has no storm to maintain, so put w back
  // to the gentle upglide. Hills and a real thermal (a few kelvin off the
  // balanced pattern) are left alone.
  const { nx, ny, nz, dz } = grid;
  const nxy = nx * ny;
  const depth = 2800;
  for (let j = 0; j < ny; j++) {
    const row = j * nx;
    for (let i = 0; i < nx; i++) {
      const ij = row + i;
      if (!stable[ij]) continue;
      // Only relax phantom drafts on frontal columns. Elsewhere amp is 0 and
      // writing `a * shape` would zero every thermal whose θ anomaly dips
      // below the 2.5 K spare threshold — that killed the init bubble.
      const a = amp[ij];
      if (!(a > 0)) continue;
      if (openK && openK[ij] > 0) continue;
      if (height && height[ij] > 40) continue;
      for (let k = 1; k < nz; k++) {
        const z = k * dz;
        const below = ij + (k - 1) * nxy;
        const above = ij + Math.min(nz - 1, k) * nxy;
        const anomaly = Math.max(
          Math.abs(theta[below] - thetaEnv[below]),
          Math.abs(theta[above] - thetaEnv[above]),
        );
        // Spare only a real warm-core thermal (init bubble is ~3–4 K). A
        // 1–2 K anomaly from frontal lift + condensation must stay damped
        // or the line unlocks into domain-wide convection.
        if (anomaly > 4.5) continue;
        const shape =
          z > 8000
            ? 0
            : Math.sin(Math.PI * Math.min(1, z / 6000)) * Math.exp(-z / depth);
        w[grid.wIdx(i, j, k)] = a * shape;
      }
    }
  }
}

/**
 * Bleed off convergent wind that would recreate a phantom draft after
 * `relaxStableDrafts` resets w. Without this, projection → relax fights
 * every substep and latent heating eventually unlocks the line.
 */
export function dampPhantomConvergence(
  grid: Grid3D,
  f: SimFields,
  thetaEnv: Float32Array,
  amp: Float32Array,
  stable: Uint8Array,
  openK: Uint16Array | null,
): void {
  const { nx, ny, nz, dx, dy } = grid;
  const nxy = nx * ny;
  const bleed = 0.55;
  for (let j = 1; j < ny - 1; j++) {
    const row = j * nx;
    for (let i = 1; i < nx - 1; i++) {
      const ij = row + i;
      if (!stable[ij] || !(amp[ij] > 0)) continue;
      if (openK && openK[ij] > 0) continue;
      // Leave columns with a real warm core alone.
      let anom = 0;
      for (let k = 0; k < Math.min(nz, 12); k++) {
        const id = ij + k * nxy;
        const d = Math.abs(f.theta[id] - thetaEnv[id]);
        if (d > anom) anom = d;
      }
      if (anom > 4.5) continue;
      for (let k = 0; k < nz; k++) {
        if (openK && k < openK[ij]) continue;
        const du =
          (f.u[grid.uIdx(i + 1, j, k)] - f.u[grid.uIdx(i, j, k)]) / dx;
        const dv =
          (f.v[grid.vIdx(i, j + 1, k)] - f.v[grid.vIdx(i, j, k)]) / dy;
        const div = du + dv;
        if (!(div < -1e-5)) continue; // only convergent
        // div < 0: reduce inflow / raise outflow on each axis.
        const adjX = bleed * 0.5 * div * dx;
        const adjY = bleed * 0.5 * div * dy;
        f.u[grid.uIdx(i, j, k)] += adjX;
        f.u[grid.uIdx(i + 1, j, k)] -= adjX;
        f.v[grid.vIdx(i, j, k)] += adjY;
        f.v[grid.vIdx(i, j + 1, k)] -= adjY;
      }
    }
  }
}

/**
 * Put the frontal upglide back after the projection removes unbalanced w.
 * A stronger draft already in the column (a real storm, or a downdraft)
 * is left alone.
 */
export function applyFrontalUpglide(
  grid: Grid3D,
  w: Float32Array,
  amp: Float32Array,
  openK: Uint16Array | null,
): void {
  const { nx, ny, nz, dz } = grid;
  const depth = 2800;
  for (let j = 0; j < ny; j++) {
    const row = j * nx;
    for (let i = 0; i < nx; i++) {
      const ij = row + i;
      const a = amp[ij];
      if (a <= 0) continue;
      const kFloor = openK ? openK[ij] : 0;
      for (let k = 1; k < nz; k++) {
        if (k <= kFloor) continue;
        const z = k * dz;
        if (z > 8000) break;
        const shape =
          Math.sin(Math.PI * Math.min(1, z / 6000)) * Math.exp(-z / depth);
        const target = a * shape;
        if (target < 0.01) continue;
        const id = grid.wIdx(i, j, k);
        const wk = w[id];
        // Soft restore: the projection removes the balanced lift each step.
        // Slamming w to `target` locked a storm-strength draft along the
        // whole front; ease a fraction back instead.
        if (wk < target && wk > -0.5) w[id] = wk + (target - wk) * 0.2;
      }
    }
  }
}

/**
 * Spread a one-column spike sideways, then stop.
 *
 * Advection does not mix across the wind, so an updraft and its rain stay
 * one column wide and stretch into a ribbon. A ribbon is a line of spikes:
 * each column is much stronger than the air on either side. That excess is
 * handed to the neighboring columns until the line is a few cells wide.
 * A storm that already spans several columns is not a spike, so its core
 * stays put. The balanced front (the part in thetaEnv / qvEnv) is not touched.
 */
let mixPlane: Float32Array = new Float32Array(0);
let mixOut: Float32Array = new Float32Array(0);
const mixLow = new Int32Array(8);

export function mixGridScale(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  thetaEnv: Float32Array,
  qvEnv: Float32Array,
  openK: Uint16Array | null,
): void {
  const mix = getAdvanced().horizMixing;
  if (mix <= 0 || dt <= 0) return;
  // Rate form so coarse hydrostatic steps and fine storm steps spread
  // spikes at the same physical pace (old bite was per-substep).
  const biteRate = 0.07 + 0.05 * mix; // 1/s of excess handed outward
  const bite = Math.min(0.55, 1 - Math.exp(-biteRate * dt));
  const { nx, ny, nz } = grid;
  broadenCells(f.theta, thetaEnv, nx, ny, nz, bite, 0.35, openK, false);
  broadenCells(f.qv, qvEnv, nx, ny, nz, bite, 2e-5, openK, true);
  broadenCells(f.qc, null, nx, ny, nz, bite, 1e-5, openK, true);
  broadenCells(f.qr, null, nx, ny, nz, bite, 1e-5, openK, true);
  broadenCells(f.qi, null, nx, ny, nz, bite, 1e-6, openK, true);
  broadenCells(f.qs, null, nx, ny, nz, bite, 1e-6, openK, true);
  broadenCells(f.qg, null, nx, ny, nz, bite, 1e-6, openK, true);
  broadenCells(f.qh, null, nx, ny, nz, bite, 1e-6, openK, true);
  broadenCells(f.ni, null, nx, ny, nz, bite, 1, openK, true);
  broadenCells(f.w, null, nx, ny, nz + 1, bite, 0.3, openK, false, true);
}

function planePair(n: number): [Float32Array, Float32Array] {
  if (mixPlane.length < n) mixPlane = new Float32Array(n);
  if (mixOut.length < n) mixOut = new Float32Array(n);
  return [mixPlane, mixOut];
}

/**
 * Hand the excess of a one-column extremum to the weaker cells around it.
 * `wFaces` indexes the staggered vertical velocity (an extra level, lids skipped).
 */
function broadenCells(
  field: Float32Array,
  env: Float32Array | null,
  nx: number,
  ny: number,
  nz: number,
  bite: number,
  eps: number,
  openK: Uint16Array | null,
  nonNeg: boolean,
  wFaces = false,
): void {
  const nxy = nx * ny;
  const [src, out] = planePair(nxy);
  const k0 = wFaces ? 1 : 0;
  const k1 = wFaces ? nz - 1 : nz;
  for (let k = k0; k < k1; k++) {
    const base = k * nxy;
    for (let s = 0; s < nxy; s++) {
      const buried = openK
        ? wFaces
          ? k <= openK[s]
          : k < openK[s]
        : false;
      if (buried) {
        src[s] = 0;
        continue;
      }
      src[s] = env ? field[base + s] - env[base + s] : field[base + s];
    }
    out.set(src);
    for (let j = 0; j < ny; j++) {
      const row = j * nx;
      for (let i = 0; i < nx; i++) {
        const s = row + i;
        const buried = openK
          ? wFaces
            ? k <= openK[s]
            : k < openK[s]
          : false;
        if (buried) continue;
        const c = src[s];
        if (Math.abs(c) < eps) continue;
        let sum = 0;
        let count = 0;
        let lowN = 0;
        let extremum = true;
        for (let dj = -1; dj <= 1; dj++) {
          const jj = j + dj;
          if (jj < 0 || jj >= ny) continue;
          for (let di = -1; di <= 1; di++) {
            if (di === 0 && dj === 0) continue;
            const ii = i + di;
            if (ii < 0 || ii >= nx) continue;
            const ns = jj * nx + ii;
            const nb = openK
              ? wFaces
                ? k <= openK[ns]
                : k < openK[ns]
              : false;
            if (nb) continue;
            const v = src[ns];
            sum += v;
            count++;
            if (c > 0 ? v > c : v < c) extremum = false;
            if (Math.abs(v) < Math.abs(c)) mixLow[lowN++] = ns;
          }
        }
        if (!extremum || count < 3 || lowN === 0) continue;
        const avg = sum / count;
        if (Math.abs(c) <= 1.22 * Math.abs(avg)) continue;
        const move = bite * (c - avg);
        out[s] -= move;
        const share = move / lowN;
        for (let n = 0; n < lowN; n++) out[mixLow[n]] += share;
      }
    }
    for (let s = 0; s < nxy; s++) {
      const buried = openK
        ? wFaces
          ? k <= openK[s]
          : k < openK[s]
        : false;
      if (buried) continue;
      let next = out[s];
      if (nonNeg && !env && next < 0) next = 0;
      const id = base + s;
      if (env) {
        const v = env[id] + next;
        field[id] = nonNeg && v < 0 ? 0 : v;
      } else {
        field[id] = next;
      }
    }
  }
}
