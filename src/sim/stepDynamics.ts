/**
 * Additional dynamics for diverse cloud types:
 *   - Cloud-top radiative cooling (drives stratocumulus)
 *   - Boundary-layer turbulent mixing (fog, stratus)
 *   - Synoptic-scale vertical motion (nimbostratus near lows)
 *   - Marine stratus trigger
 *
 * Cold microphysics (ice/snow/graupel/hail) now lives in `coldMicrophysics.ts`.
 */

import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import { dewpointFromE, esatFast, mixingRatio } from "./thermo";
import { sampleSynoptic, getActiveSynoptic } from "./synoptic";
import { getAdvanced } from "./AdvancedSettings";
import { integrateCapeCin } from "./cape";


/**
 * Cloud-top longwave cooling.
 * Cools the top few cells of each cloud column, driving stratocumulus
 * overturning and preventing cloud layers from becoming too stable.
 * Rate: ~2 K/hr at cloud top, decaying rapidly downward.
 */
export function stepCloudTopCooling(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  exner: Float32Array,
): void {
  const { nx, ny, nz } = grid;
  const nxny = nx * ny;
  const coolRate = (2.0 / 3600) * dt; // K per step at cloud top

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      // Find cloud top (highest k with qc > threshold)
      let cloudTop = -1;
      for (let k = nz - 1; k >= 0; k--) {
        if (f.qc[i + nx * (j + ny * k)] > 5e-5) {
          cloudTop = k;
          break;
        }
      }
      if (cloudTop < 1) continue;

      // Cool the top 3 levels with exponential decay
      for (let dk = 0; dk <= 2; dk++) {
        const k = cloudTop - dk;
        if (k < 0) break;
        const id = i + nx * (j + ny * k);
        const amp = Math.exp(-dk * 1.5);
        f.theta[id] -= coolRate * amp;
        // Floor: don't cool below base state - 2K
        if (f.theta[id] < f.theta0[k] - 2) f.theta[id] = f.theta0[k] - 2;
      }
    }
  }
  void exner;
}

/**
 * Boundary-layer turbulent mixing.
 * Mixes Î¸ and qv vertically in the lowest levels toward a well-mixed profile.
 * This builds a realistic mixed layer and allows fog/stratus to form when
 * the BL is near-saturated, without requiring surface CAPE.
 */
export function stepBLMixing(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  exner: Float32Array,
): void {
  const { nx, ny, nz } = grid;
  const nxny = nx * ny;
  // Mix the lowest ~15% of the domain or 8 levels, whichever is less
  const kMix = Math.min(8, Math.floor(nz * 0.15));
  if (kMix < 2) return;

  // Mixing coefficient: stronger near surface, weaker aloft
  // ~0.05 per step at k=0, decaying exponentially
  const mixBase =
    Math.min(0.06, 0.015 * dt) *
    getAdvanced().vertMixing *
    getAdvanced().horizMixing;

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < kMix - 1; k++) {
        const id0 = i + nx * (j + ny * k);
        const id1 = i + nx * (j + ny * (k + 1));
        const mix = mixBase * Math.exp(-k * 0.6);
        if (mix < 1e-4) continue;

        const th0 = f.theta[id0];
        const th1 = f.theta[id1];
        const qv0 = f.qv[id0];
        const qv1 = f.qv[id1];

        // Only mix if lower layer is warmer (unstable) or nearly neutral
        const dTh = th0 - th1;
        if (dTh < -0.5) continue; // stable â€” suppress mixing

        const dThMix = dTh * mix;
        f.theta[id0] -= dThMix;
        f.theta[id1] += dThMix;

        const dQv = (qv0 - qv1) * mix;
        f.qv[id0] -= dQv;
        f.qv[id1] += dQv;
        if (f.qv[id0] < 0) f.qv[id0] = 0;
        if (f.qv[id1] < 0) f.qv[id1] = 0;
      }
    }
  }
  void exner;
  void nxny;
}

/**
 * Synoptic-scale vertical motion (omega forcing).
 * Lows produce gentle ascent (~2-5 cm/s), highs produce subsidence.
 * This drives nimbostratus and altostratus near lows, and suppresses
 * convection near highs â€” without needing surface CAPE.
 */
export function stepSynopticOmega(
  grid: Grid3D,
  f: SimFields,
  dt: number,
): void {
  const { nx, ny, nz, dz } = grid;
  const nxny = nx * ny;
  const xDen = Math.max(1, nx - 1);
  const yDen = Math.max(1, ny - 1);
  const synoptic = getActiveSynoptic();
  if (synoptic.enabled === false) return;
  if (!synoptic.centers.length) return;

  for (let j = 0; j < ny; j++) {
    const yn = j / yDen;
    for (let i = 0; i < nx; i++) {
      const xn = i / xDen;
      // Sample pressure center influence
      let omega = 0; // Pa/s, negative = ascent
      for (const c of synoptic.centers) {
        if (!c.enabled) continue;
        const r = Math.hypot(xn - c.x, yn - c.y);
        const g = Math.exp(-(r * r) / (2 * 0.18 * 0.18));
        // Low â†’ ascent (negative omega), High â†’ subsidence
        omega += (c.kind === "low" ? -1 : 1) * (c.hPa / 10) * g * 0.015;
      }
      if (Math.abs(omega) < 1e-4) continue;

      // Convert omega (Pa/s) to w (m/s): w â‰ˆ -omega / (rho * g)
      for (let k = 1; k < nz - 1; k++) {
        const rho = f.rho0[k];
        const wForce = -omega / Math.max(rho * 9.81, 1e-3);
        // Taper near surface and top
        const zFrac = k / (nz - 1);
        const taper = Math.sin(Math.PI * zFrac);
        const wIdx = grid.wIdx(i, j, k);
        f.w[wIdx] += wForce * taper * dt * 0.1;
      }
    }
  }
  void dz;
  void nxny;
  void sampleSynoptic;
}

/**
 * Marine stratus trigger.
 * Over cool moist marine surfaces, if the BL is near-saturated and stable,
 * seed a thin cloud layer at the top of the marine inversion.
 * This produces stratocumulus without needing surface CAPE.
 */
export function stepMarineStratus(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  exner: Float32Array,
  landMask: Float32Array,
): void {
  const { nx, ny, nz } = grid;
  const nxny = nx * ny;
  if (landMask.length < nx * ny) return;

  const seedRate = 0.00008 * dt; // kg/kg per step

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const ij = i + j * nx;
      const land = landMask[ij];
      if (land > 0.2) continue; // only over water (low land mask values)

      // Find the marine inversion top: first level where Î¸ increases sharply
      let inversionK = -1;
      for (let k = 1; k < Math.min(nz - 1, 12); k++) {
        const id0 = i + nx * (j + ny * (k - 1));
        const id1 = i + nx * (j + ny * k);
        const dTh = f.theta[id1] - f.theta[id0];
        if (dTh > 1.5) { // inversion
          inversionK = k;
          break;
        }
      }
      if (inversionK < 1) continue;

      // Check BL is near-saturated
      const idSfc = i + nx * j; // k=0
      const T0 = f.theta[idSfc] * exner[0];
      const qv0 = f.qv[idSfc];
      const qs0 = Math.max(1e-8, mixingRatio(esatFast(T0), f.p0[0]));
      if (qv0 < qs0 * 0.82) continue; // not moist enough

      // Seed cloud at inversion top
      const kCloud = inversionK;
      const id = i + nx * (j + ny * kCloud);
      const T = f.theta[id] * exner[kCloud];
      const qs = Math.max(1e-8, mixingRatio(esatFast(T), f.p0[kCloud]));
      const qv = f.qv[id];
      if (qv > qs * 0.88) {
        f.qc[id] = Math.min(f.qc[id] + seedRate, 0.0006);
      }
    }
  }
  void nxny;
}

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

