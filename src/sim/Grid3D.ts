export interface GridConfig {
  nx: number;
  ny: number;
  nz: number;
  zTop: number; // meters (domain altitude)
  /**
   * Optional override for base horizontal cell size at reference resolution (64).
   * Default 1000 m. Higher X/Y both grow the domain and shrink cells (more detail).
   */
  dxMeters?: number;
}

/** Reference grid count where dx ≈ base cell size. */
const RES_REF = 64;
/** Share of resolution increase that goes to finer cells (rest grows domain). */
const DETAIL_POWER = 0.55;

function cellSizeForAxis(n: number, baseMeters: number): number {
  const scale = Math.pow(RES_REF / Math.max(8, n), DETAIL_POWER);
  return Math.max(250, Math.min(2000, baseMeters * scale));
}

/**
 * Arakawa C-grid layout:
 * - scalars at cell centers (nx × ny × nz)
 * - u on x-faces ((nx+1) × ny × nz), i = 0..nx
 * - v on y-faces (nx × (ny+1) × nz), j = 0..ny
 * - w on z-faces (nx × ny × (nz+1)), k = 0..nz
 */
export class Grid3D {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly zTop: number;
  /** Physical domain width (X), meters. */
  readonly xExtent: number;
  /** Physical domain depth (Y), meters. */
  readonly yExtent: number;
  /** Convenience: max horizontal extent. */
  readonly xyExtent: number;
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  /** Cell-center count. */
  readonly n: number;
  readonly nu: number;
  readonly nv: number;
  readonly nw: number;

  constructor(cfg: GridConfig) {
    this.nx = Math.max(8, Math.floor(cfg.nx));
    this.ny = Math.max(8, Math.floor(cfg.ny));
    this.nz = Math.max(8, Math.floor(cfg.nz));
    this.zTop = Math.max(2000, cfg.zTop);

    const base = Math.max(200, cfg.dxMeters ?? 1000);
    // Higher X/Y → smaller cells (detail) and larger domain (distance)
    this.dx = cellSizeForAxis(this.nx, base);
    this.dy = cellSizeForAxis(this.ny, base);
    this.xExtent = this.nx * this.dx;
    this.yExtent = this.ny * this.dy;
    this.xyExtent = Math.max(this.xExtent, this.yExtent);
    // Z always refines with nz for fixed altitude
    this.dz = this.zTop / this.nz;
    this.n = this.nx * this.ny * this.nz;
    this.nu = (this.nx + 1) * this.ny * this.nz;
    this.nv = this.nx * (this.ny + 1) * this.nz;
    this.nw = this.nx * this.ny * (this.nz + 1);
  }

  /** Scalar / cell-center index. */
  idx(i: number, j: number, k: number): number {
    return i + this.nx * (j + this.ny * k);
  }

  /** u-face index; i in [0, nx]. */
  uIdx(i: number, j: number, k: number): number {
    return i + (this.nx + 1) * (j + this.ny * k);
  }

  /** v-face index; j in [0, ny]. */
  vIdx(i: number, j: number, k: number): number {
    return i + this.nx * (j + (this.ny + 1) * k);
  }

  /** w-face index; k in [0, nz]. */
  wIdx(i: number, j: number, k: number): number {
    return i + this.nx * (j + this.ny * k);
  }

  cellCount(): number {
    return this.n;
  }

  /** Rough RAM estimate for main fields (bytes). */
  estimateBytes(): number {
    // scalars + staggered winds + base arrays
    return (this.n * 5 + this.nu + this.nv + this.nw + this.nz * 7) * 4;
  }

  /** Cell-centered u from C-grid faces. */
  uCenter(u: Float32Array, i: number, j: number, k: number): number {
    return 0.5 * (u[this.uIdx(i, j, k)] + u[this.uIdx(i + 1, j, k)]);
  }

  /** Cell-centered v from C-grid faces. */
  vCenter(v: Float32Array, i: number, j: number, k: number): number {
    return 0.5 * (v[this.vIdx(i, j, k)] + v[this.vIdx(i, j + 1, k)]);
  }

  /** Cell-centered w from C-grid faces. */
  wCenter(w: Float32Array, i: number, j: number, k: number): number {
    return 0.5 * (w[this.wIdx(i, j, k)] + w[this.wIdx(i, j, k + 1)]);
  }
}

/** GPU cloud texture caps. Physics stays on the full grid. */
const VOLUME_DISP_NX = 128;
const VOLUME_DISP_NY = 128;
const VOLUME_DISP_NZ = 48;

/** Stride-sampled volume size, at most 128×128×48. */
export function volumeDisplaySize(
  nx: number,
  ny: number,
  nz: number,
): { nx: number; ny: number; nz: number; sx: number; sy: number; sz: number } {
  const sx = Math.max(1, Math.ceil(nx / VOLUME_DISP_NX));
  const sy = Math.max(1, Math.ceil(ny / VOLUME_DISP_NY));
  const sz = Math.max(1, Math.ceil(nz / VOLUME_DISP_NZ));
  return {
    sx,
    sy,
    sz,
    nx: Math.ceil(nx / sx),
    ny: Math.ceil(ny / sy),
    nz: Math.ceil(nz / sz),
  };
}

/** Copy a full-resolution RGBA volume into a stride-sampled display buffer. */
export function copyFullVolumeToDisplay(
  src: Uint8Array,
  nx: number,
  ny: number,
  nz: number,
  dst: Uint8Array,
): void {
  const d = volumeDisplaySize(nx, ny, nz);
  const need = d.nx * d.ny * d.nz * 4;
  if (dst.length < need || src.length < nx * ny * nz * 4) return;
  if (d.sx === 1 && d.sy === 1 && d.sz === 1) {
    dst.set(src.subarray(0, need));
    return;
  }
  // Same layout as packVolumeRGBA: X east, Y up, Z south.
  for (let k = 0; k < d.nz; k++) {
    const ks = Math.min(nz - 1, k * d.sz);
    for (let j = 0; j < d.ny; j++) {
      const js = Math.min(ny - 1, j * d.sy);
      const srcRow = ks + nz * (ny - 1 - js);
      const dstRow = k + d.nz * (d.ny - 1 - j);
      for (let i = 0; i < d.nx; i++) {
        const is = Math.min(nx - 1, i * d.sx);
        const s = (is + nx * srcRow) * 4;
        const o = (i + d.nx * dstRow) * 4;
        dst[o] = src[s];
        dst[o + 1] = src[s + 1];
        dst[o + 2] = src[s + 2];
        dst[o + 3] = src[s + 3];
      }
    }
  }
}

export function perfWarning(grid: Grid3D): string | null {
  const cells = grid.cellCount();
  if (cells > 512 * 512 * 64) {
    return `Very high resolution (${cells.toLocaleString()} cells). Expect heavy CPU load — try ≤128×128×48 for interactive rates.`;
  }
  if (cells > 96 * 96 * 48) {
    return `High resolution (${cells.toLocaleString()} cells). Simulation may run slowly on some machines.`;
  }
  return null;
}
