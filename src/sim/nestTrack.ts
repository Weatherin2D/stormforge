/**
 * Storm-centroid tracking helpers for the adaptive nest.
 * Parent-domain coords are normalized [0..1]^2.
 */
import type { Grid3D } from "./Grid3D";
import type { SimFields } from "./InitFromSounding";
import type { NestRect } from "./surface";
import { normalizeNest } from "./surface";

/** Simulated seconds between centroid updates. */
export const NEST_TRACK_CADENCE = 90;
/** Quiet convection for this long → idle/disable auto nest. */
export const NEST_IDLE_SECONDS = 180;
/** Column condensate (qc+qi) that counts as active convection. */
export const NEST_SPAWN_THRESH = 4e-4;
export const NEST_IDLE_THRESH = 4e-5;
/** Move when centroid drifts past this fraction of nest width/height. */
export const NEST_DRIFT_FRAC = 0.25;
/** Default auto-spawn box as a fraction of the parent domain. */
export const NEST_DEFAULT_FRAC = 0.28;
export const NEST_EMA_ALPHA = 0.35;

export interface StormCentroid {
  x: number;
  y: number;
  /** Column-max qc+qi at the peak column. */
  intensity: number;
}

/** Column of max qc+qi, with a low-level updraft boost. */
export function findStormCentroid(grid: Grid3D, fields: SimFields): StormCentroid {
  const { nx, ny, nz } = grid;
  const f = fields;
  let best = 0;
  let bestI = (nx / 2) | 0;
  let bestJ = (ny / 2) | 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let col = 0;
      let wBoost = 0;
      for (let k = 0; k < nz; k++) {
        const id = i + nx * (j + ny * k);
        const q = f.qc[id] + f.qi[id];
        if (q > col) col = q;
        if (k < Math.min(nz, 12)) {
          const w = f.w[grid.wIdx(i, j, k)];
          if (w > wBoost) wBoost = w;
        }
      }
      // Reflectivity proxy: condensate + mild updraft weight so dry towers still pull.
      const score = col + Math.max(0, wBoost) * 2e-5;
      if (score > best) {
        best = score;
        bestI = i;
        bestJ = j;
      }
    }
  }
  return {
    x: (bestI + 0.5) / nx,
    y: (bestJ + 0.5) / ny,
    intensity: best,
  };
}

export function emaCentroid(
  prevX: number,
  prevY: number,
  next: StormCentroid,
  hasPrev: boolean,
  alpha = NEST_EMA_ALPHA,
): { x: number; y: number } {
  if (!hasPrev) return { x: next.x, y: next.y };
  return {
    x: prevX * (1 - alpha) + next.x * alpha,
    y: prevY * (1 - alpha) + next.y * alpha,
  };
}

/** Axis-aligned box of width/height `frac`, clamped to [0,1], centered on (cx,cy). */
export function nestBoxAround(
  cx: number,
  cy: number,
  frac: number,
  refinement: number,
): NestRect {
  const half = Math.max(0.1, Math.min(0.45, frac * 0.5));
  let x0 = cx - half;
  let x1 = cx + half;
  let y0 = cy - half;
  let y1 = cy + half;
  if (x0 < 0) {
    x1 -= x0;
    x0 = 0;
  }
  if (x1 > 1) {
    x0 -= x1 - 1;
    x1 = 1;
  }
  if (y0 < 0) {
    y1 -= y0;
    y0 = 0;
  }
  if (y1 > 1) {
    y0 -= y1 - 1;
    y1 = 1;
  }
  return normalizeNest({
    x0: Math.max(0, x0),
    x1: Math.min(1, x1),
    y0: Math.max(0, y0),
    y1: Math.min(1, y1),
    refinement: refinement >= 3 ? 3 : 2,
  });
}

export function nestCenter(nest: NestRect): { x: number; y: number } {
  return { x: (nest.x0 + nest.x1) * 0.5, y: (nest.y0 + nest.y1) * 0.5 };
}

/** True when EMA centroid has drifted past the move threshold. */
export function nestNeedsMove(nest: NestRect, cx: number, cy: number): boolean {
  const mid = nestCenter(nest);
  const wx = Math.max(1e-3, nest.x1 - nest.x0);
  const wy = Math.max(1e-3, nest.y1 - nest.y0);
  return (
    Math.abs(cx - mid.x) > wx * NEST_DRIFT_FRAC ||
    Math.abs(cy - mid.y) > wy * NEST_DRIFT_FRAC
  );
}

/** Same size box recentered on (cx,cy). */
export function shiftNestTo(nest: NestRect, cx: number, cy: number): NestRect {
  const wx = nest.x1 - nest.x0;
  const wy = nest.y1 - nest.y0;
  return nestBoxAround(cx, cy, Math.max(wx, wy), nest.refinement);
}
