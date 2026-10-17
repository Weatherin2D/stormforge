import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";

/** One surface wind sample at cell center (k = 0). */
export interface SurfaceWindSample {
  i: number;
  j: number;
  u: number;
  v: number;
  /** Horizontal speed (m/s). */
  spd: number;
}

/**
 * Subsample cell-centered surface winds (C-grid k=0).
 * Targets ~24 samples along the longer horizontal axis.
 */
export function sampleSurfaceWinds(
  grid: Grid3D,
  fields: SimFields,
  targetPerAxis = 24,
): SurfaceWindSample[] {
  const { nx, ny } = grid;
  const stride = Math.max(
    1,
    Math.floor(Math.max(nx, ny) / Math.max(4, targetPerAxis)),
  );
  const out: SurfaceWindSample[] = [];
  const i0 = Math.floor(stride / 2);
  const j0 = Math.floor(stride / 2);
  for (let j = j0; j < ny; j += stride) {
    for (let i = i0; i < nx; i += stride) {
      const u = grid.uCenter(fields.u, i, j, 0);
      const v = grid.vCenter(fields.v, i, j, 0);
      out.push({ i, j, u, v, spd: Math.hypot(u, v) });
    }
  }
  return out;
}

/** Suggest arrow length scale from a set of samples (m/s → unit length). */
export function windSpeedScale(samples: SurfaceWindSample[]): number {
  let max = 1;
  for (const s of samples) {
    if (s.spd > max) max = s.spd;
  }
  return max;
}
