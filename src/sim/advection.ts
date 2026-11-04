/**
 * Flux-form MUSCL (monotonized-central) reconstruction helpers for the
 * anelastic C-grid. Used by FluidSolver for momentum and scalar transport.
 */

/** Monotonized-central limited slope from left/right differences. */
export function mcSlope(dl: number, dr: number): number {
  if (dl * dr <= 0) return 0;
  const s = 0.5 * (dl + dr);
  const lim = 2 * (Math.abs(dl) < Math.abs(dr) ? dl : dr);
  if (s > 0) return s < lim ? s : lim;
  return s > lim ? s : lim;
}

/**
 * Upwind MUSCL face value at the interface between cells `a` (left/below)
 * and `b` (right/above), with outer neighbors `aL` and `bR`.
 * `vel` is the advecting face velocity; positive carries a → b.
 */
export function musclFace(
  aL: number,
  a: number,
  b: number,
  bR: number,
  vel: number,
): number {
  if (vel >= 0) {
    const s = mcSlope(a - aL, b - a);
    return a + 0.5 * s;
  }
  const s = mcSlope(b - a, bR - b);
  return b - 0.5 * s;
}

/** Clamp an index into [0, n-1]. */
export function clampIdx(i: number, n: number): number {
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}
