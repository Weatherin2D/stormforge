/**
 * Grid-scale helpers shared by the storm and hydrostatic cores:
 *   - CAPE-gated frontal upglide amplitude
 *   - Stable-column draft relaxation
 *   - Post-projection frontal upglide restore
 *   - Horizontal spike broadening (mixGridScale)
 *
 * Painted “slow physics” writers (cloud-top cooling, synoptic omega forcing,
 * marine stratus seeding, BL mixing writers) intentionally do not live here.
 */

import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import { dewpointFromE } from "./thermo";
import { getAdvanced } from "./AdvancedSettings";
import { integrateCapeCin } from "./cape";

let scratchN = 0;
let colT = new Float32Array(0);
let colTd = new Float32Array(0);
let colZ = new Float32Array(0);
let colP = new Float32Array(0);

function dewpointK(qv: number, p: number): number {
  const q = qv > 0 ? qv : 0;
  const e = (q * p) / (0.622 + (q > 1e-8 ? q : 1e-8));
  return dewpointFromE(e > 1 ? e : 1) + 273.15;
}

/**
 * How hard each column's front may lift, in m/s at the ridge.
 * Stable or capped air stays at a few centimetres per second so a front
 * can make a cloud deck without a thunderstorm. Real CAPE is allowed a
 * deeper push; the storm itself then comes from buoyancy, not from this.
 */
export function frontalUpglideAmplitude(
  grid: Grid3D,
  theta0: Float32Array,
  qv0: Float32Array,
  thetaEnv: Float32Array,
  qvEnv: Float32Array,
  p0: Float32Array,
  exner: Float32Array,
  liftK: Float32Array,
  frontDist: Float32Array,
  out: Float32Array,
  stable: Uint8Array,
): void {
  const { nx, ny, nz, dz, zTop } = grid;
  const nxy = nx * ny;
  if (scratchN !== nz) {
    scratchN = nz;
    colT = new Float32Array(nz);
    colTd = new Float32Array(nz);
    colZ = new Float32Array(nz);
    colP = new Float32Array(nz);
  }
  for (let k = 0; k < nz; k++) {
    colZ[k] = (k + 0.5) * dz;
    colP[k] = p0[k];
    const T = theta0[k] * exner[k];
    colT[k] = T;
    const td = dewpointK(qv0[k], p0[k]);
    colTd[k] = td < T ? td : T;
  }
  const base = integrateCapeCin(colZ, colP, colT, colTd, nz, zTop, false);
  const baseCapped = base.cape < 200 || (base.cin > 100 && base.cape < 800);

  for (let j = 0; j < ny; j++) {
    const row = j * nx;
    for (let i = 0; i < nx; i++) {
      const ij = row + i;
      const lift = liftK[ij];
      // Convergence that feeds the phantom draft extends past the warm ridge.
      if (frontDist[ij] >= 0.25 && lift < 0.2) {
        out[ij] = 0;
        stable[ij] = baseCapped ? 1 : 0;
        continue;
      }
      for (let k = 0; k < nz; k++) {
        const id = ij + k * nxy;
        const T = thetaEnv[id] * exner[k];
        colT[k] = T;
        const td = dewpointK(qvEnv[id], p0[k]);
        colTd[k] = td < T ? td : T;
      }
      const ix = integrateCapeCin(colZ, colP, colT, colTd, nz, zTop, false);
      const ridge = lift < 2.5 ? lift / 2.5 : 1;
      const capped = ix.cape < 200 || (ix.cin > 100 && ix.cape < 800);
      stable[ij] = capped ? 1 : 0;
      const storm = capped ? 0.08 : Math.min(1.6, 0.35 + ix.cape / 2800);
      out[ij] = lift >= 0.2 ? storm * ridge : 0;
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
      if (openK && openK[ij] > 0) continue;
      if (height && height[ij] > 40) continue;
      const a = amp[ij];
      for (let k = 1; k < nz; k++) {
        const z = k * dz;
        const below = ij + (k - 1) * nxy;
        const above = ij + Math.min(nz - 1, k) * nxy;
        const anomaly = Math.max(
          Math.abs(theta[below] - thetaEnv[below]),
          Math.abs(theta[above] - thetaEnv[above]),
        );
        if (anomaly > 2.5) continue;
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
        if (target < 0.02) continue;
        const id = grid.wIdx(i, j, k);
        const wk = w[id];
        if (wk < target && wk > -0.5) w[id] = target;
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
  // How much of a spike's excess over its neighbors is handed outward.
  const bite = Math.min(0.7, 0.28 + 0.22 * mix);
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
