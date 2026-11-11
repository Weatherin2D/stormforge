/**
 * Nearest-neighbor upsample of a tightly packed RGBA image.
 * `factor` is an integer ≥ 1.
 *
 * Palette / LUT images must not be bilinear-filtered in RGB — that invents
 * false mid-ramp colors (cyan→green→yellow fringe) at hard echo edges,
 * which gets ugly on coarse continental grids.
 */
export function upsampleRgba(
  src: ArrayLike<number>,
  nx: number,
  ny: number,
  factor: number,
  dst: { [i: number]: number },
): void {
  const f = Math.max(1, factor | 0);
  if (f <= 1) {
    const n = nx * ny * 4;
    for (let i = 0; i < n; i++) dst[i] = src[i];
    return;
  }
  const w = nx * f;
  const h = ny * f;
  for (let y = 0; y < h; y++) {
    const sy = Math.min(ny - 1, (y / f) | 0);
    const row = sy * nx;
    for (let x = 0; x < w; x++) {
      const sx = Math.min(nx - 1, (x / f) | 0);
      const o = (x + y * w) * 4;
      const i = (row + sx) * 4;
      dst[o] = src[i];
      dst[o + 1] = src[i + 1];
      dst[o + 2] = src[i + 2];
      dst[o + 3] = src[i + 3];
    }
  }
}
