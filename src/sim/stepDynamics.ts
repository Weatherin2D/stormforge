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
import { esatFast, mixingRatio } from "./thermo";
import { sampleSynoptic, getActiveSynoptic } from "./synoptic";


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
  const mixBase = Math.min(0.06, 0.015 * dt);

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
