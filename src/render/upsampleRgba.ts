/** Bilinear upsample of a tightly packed RGBA image. `factor` is an integer ≥ 1. */
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
    const gy = (y + 0.5) / f - 0.5;
    const y0 = Math.max(0, Math.floor(gy));
    const y1 = Math.min(ny - 1, y0 + 1);
    const fy = Math.min(1, Math.max(0, gy - y0));
    const row0 = y0 * nx;
    const row1 = y1 * nx;
    for (let x = 0; x < w; x++) {
      const gx = (x + 0.5) / f - 0.5;
      const x0 = Math.max(0, Math.floor(gx));
      const x1 = Math.min(nx - 1, x0 + 1);
      const fx = Math.min(1, Math.max(0, gx - x0));
      const o = (x + y * w) * 4;
      const i00 = (row0 + x0) * 4;
      const i10 = (row0 + x1) * 4;
      const i01 = (row1 + x0) * 4;
      const i11 = (row1 + x1) * 4;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      dst[o] = (src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11) | 0;
      dst[o + 1] =
        (src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11) | 0;
      dst[o + 2] =
        (src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11) | 0;
      dst[o + 3] =
        (src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11) | 0;
    }
  }
}
