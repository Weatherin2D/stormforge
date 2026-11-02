/**
 * MeteoLAB volume + column packing (view.ts updateVolume).
 * Volume RGBA: R cloud opacity, G shafts (1/km / SHAFT_MAX), B updraught/20,
 * A ice share of the cloud. Columns RGBA: rotation, anvilBase×presence,
 * anvil presence, cloud base / BASE_SCALE.
 */
import type { Grid3D } from "./Grid3D";
import { volumeDisplaySize } from "./Grid3D";
import type { SimFields } from "./InitFromSounding";
import { TFromTheta } from "./thermo";

const ICE_EXTINCTION = 0.25;
const SNOW_EXTINCTION = 0.08;
const RIMER_EXTINCTION = 0.03;
const SHAFT_MAX = 6;
/** Approx MeteoLAB extinction() prefactors for Marshall–Palmer-like shafts. */
const SHAFT_RAIN = 2.2;
const SHAFT_SNOW = 10;
const SHAFT_GRAUPEL = 4;
const SHAFT_HAIL = 1.5;
const SNOW_VEIL = 0.12;
const VEIL_FALL = 2500;
const UPDRAUGHT_SCALE = 20;
const TOWER_LEVELS = 2;
const BASE_SCALE = 10_000;
const BASE_SEARCH = 6000;
const ANVIL_BASE_SCALE = 20_000;
const ANVIL_OPACITY = 0.05;
const ROTATION_SCALE = 0.02;

export const cloudOpacity = (c: number): number =>
  c > 2.5e-5 ? 1 - Math.exp(-(c - 2.5e-5) / 6e-4) : 0;

const clamp01 = (v: number): number => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const byte01 = (v: number): number => {
  if (v <= 0) return 0;
  const x = v * 255;
  return x >= 255 ? 255 : x | 0;
};

function wCenter(f: SimFields, g: Grid3D, i: number, j: number, k: number): number {
  return g.wCenter(f.w, i, j, k);
}

/**
 * Pack the GPU cloud volume exactly as MeteoLAB does (cell-centred, Y-up
 * display layout: X east, Y up, Z south).
 */
export function packMeteoLabVolume(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
): void {
  const { nx, ny, nz, dx, dy, dz } = grid;
  const n = nx * ny * nz;
  const layer = nx * ny;
  const mass = new Float32Array(n);
  const shafts = new Float32Array(n);
  const share = new Float32Array(n);
  const vertical = new Float32Array(n);
  const tower = new Float32Array(n);
  const fallen = new Float32Array(n);

  // Distance under the cloud over each point (for snow veil).
  for (let c = 0; c < layer; c++) {
    let base = Number.POSITIVE_INFINITY;
    for (let z = nz - 1; z >= 0; z--) {
      const id = c + z * layer;
      const icy = f.qi[id] + f.qs[id];
      const rimers = f.qg[id] + f.qh[id];
      const m =
        f.qc[id] +
        ICE_EXTINCTION * f.qi[id] +
        SNOW_EXTINCTION * f.qs[id] +
        RIMER_EXTINCTION * rimers;
      if (cloudOpacity(m) > 0.5) base = (z + 0.5) * dz;
      fallen[id] = base - (z + 0.5) * dz;
    }
  }

  for (let z = 0; z < nz; z++) {
    const p = f.p0[z];
    const rho = Math.max(0.1, f.rho0[z]);
    const rhoG = rho * 1000;
    for (let c = 0; c < layer; c++) {
      const id = c + z * layer;
      const T = TFromTheta(f.theta[id], p);
      const frozen = T < 273.15;
      const rimers = f.qg[id] + f.qh[id];
      const icy = f.qi[id] + f.qs[id];
      const frozenShaft =
        SHAFT_SNOW * Math.pow(Math.max(0, f.qs[id]) * rhoG, 0.75) +
        SHAFT_GRAUPEL * Math.pow(Math.max(0, f.qg[id]) * rhoG, 0.75) +
        SHAFT_HAIL * Math.pow(Math.max(0, f.qh[id]) * rhoG, 0.75);
      const cloudy = frozen
        ? cloudOpacity(f.qc[id] + ICE_EXTINCTION * f.qi[id])
        : 0;
      const veil = Math.max(
        clamp01((T - 265.15) / 8),
        1 - clamp01((fallen[id] - 300) / VEIL_FALL),
      );
      const veilMix = SNOW_VEIL + (1 - SNOW_VEIL) * veil;
      mass[id] =
        f.qc[id] +
        ICE_EXTINCTION * f.qi[id] +
        (SNOW_EXTINCTION * f.qs[id] + RIMER_EXTINCTION * rimers) * cloudy;
      shafts[id] =
        SHAFT_RAIN * Math.pow(Math.max(0, f.qr[id]) * rhoG, 0.75) +
        frozenShaft * (1 - cloudy) * veilMix;
      share[id] = f.qc[id] + icy > 0 ? icy / (f.qc[id] + icy) : 1;
    }
  }

  // Strongest updraught within ±TOWER_LEVELS, then ±1 column (MeteoLAB tower).
  for (let z = 0; z < nz; z++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let w = 0;
        for (
          let k = Math.max(0, z - TOWER_LEVELS);
          k <= Math.min(nz - 1, z + TOWER_LEVELS);
          k++
        ) {
          w = Math.max(w, wCenter(f, grid, i, j, k));
        }
        vertical[i + j * nx + z * layer] = w;
      }
    }
  }
  for (let z = 0; z < nz; z++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let w = 0;
        for (let dj = -1; dj <= 1; dj++) {
          const jj = Math.min(ny - 1, Math.max(0, j + dj));
          for (let di = -1; di <= 1; di++) {
            const ii = Math.min(nx - 1, Math.max(0, i + di));
            w = Math.max(w, vertical[ii + jj * nx + z * layer]);
          }
        }
        tower[i + j * nx + z * layer] = w;
      }
    }
  }

  const writeId = (id: number, o: number): void => {
    out[o] = byte01(cloudOpacity(mass[id]));
    out[o + 1] = byte01(clamp01(shafts[id] / SHAFT_MAX));
    out[o + 2] = byte01(clamp01(tower[id] / UPDRAUGHT_SCALE));
    out[o + 3] = byte01(clamp01(share[id]));
  };

  if (out.length >= n * 4) {
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        const row = k + nz * (ny - 1 - j);
        for (let i = 0; i < nx; i++) {
          writeId(i + nx * (j + ny * k), (i + nx * row) * 4);
        }
      }
    }
    return;
  }

  // Max-pool onto the display grid so thin cloud is not dropped.
  const d = volumeDisplaySize(nx, ny, nz);
  for (let k = 0; k < d.nz; k++) {
    const k0 = Math.min(nz - 1, k * d.sz);
    const k1 = Math.min(nz, k0 + d.sz);
    for (let j = 0; j < d.ny; j++) {
      const j0 = Math.min(ny - 1, j * d.sy);
      const j1 = Math.min(ny, j0 + d.sy);
      const row = k + d.nz * (d.ny - 1 - j);
      for (let i = 0; i < d.nx; i++) {
        const i0 = Math.min(nx - 1, i * d.sx);
        const i1 = Math.min(nx, i0 + d.sx);
        let bestR = 0;
        let bestG = 0;
        let bestB = 0;
        let bestA = 0;
        for (let kk = k0; kk < k1; kk++) {
          for (let jj = j0; jj < j1; jj++) {
            for (let ii = i0; ii < i1; ii++) {
              const id = ii + nx * (jj + ny * kk);
              const r = cloudOpacity(mass[id]);
              const g = clamp01(shafts[id] / SHAFT_MAX);
              const b = clamp01(tower[id] / UPDRAUGHT_SCALE);
              const a = clamp01(share[id]);
              if (r > bestR) bestR = r;
              if (g > bestG) bestG = g;
              if (b > bestB) bestB = b;
              if (a > bestA) bestA = a;
            }
          }
        }
        const o = (i + d.nx * row) * 4;
        out[o] = byte01(bestR);
        out[o + 1] = byte01(bestG);
        out[o + 2] = byte01(bestB);
        out[o + 3] = byte01(bestA);
      }
    }
  }
  void dx;
  void dy;
}

/**
 * Column map for flat bases / mammatus / striations (display or full nx×ny).
 * out length >= nx*ny*4 (or display nx*ny*4 when `display` is true).
 */
export function packMeteoLabColumns(
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
  display = true,
): void {
  const { nx, ny, nz, dz } = grid;
  const layer = nx * ny;
  const d = display ? volumeDisplaySize(nx, ny, nz) : { nx, ny, nz, sx: 1, sy: 1, sz: 1 };
  const need = d.nx * d.ny * 4;
  if (out.length < need) return;

  const opacityAt = (i: number, j: number, k: number): number => {
    const id = i + nx * (j + ny * k);
    const rimers = f.qg[id] + f.qh[id];
    const m =
      f.qc[id] +
      ICE_EXTINCTION * f.qi[id] +
      SNOW_EXTINCTION * f.qs[id] +
      RIMER_EXTINCTION * rimers;
    return cloudOpacity(m);
  };
  const shareAt = (i: number, j: number, k: number): number => {
    const id = i + nx * (j + ny * k);
    const icy = f.qi[id] + f.qs[id];
    return f.qc[id] + icy > 0 ? icy / (f.qc[id] + icy) : 1;
  };
  const wAt = (i: number, j: number, k: number): number =>
    wCenter(f, grid, i, j, k);

  const zTop = Math.min(nz - 1, Math.ceil(BASE_SEARCH / dz));
  const z5 = Math.min(nz - 1, Math.ceil(5000 / dz));
  const bases: number[] = [];
  const baseOf = new Float32Array(layer);
  baseOf.fill(-1);

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = i + j * nx;
      for (let z = 1; z <= zTop; z++) {
        if (opacityAt(i, j, z) >= ANVIL_OPACITY) {
          const below = opacityAt(i, j, z - 1);
          const o = opacityAt(i, j, z);
          const frac = (ANVIL_OPACITY - below) / Math.max(o - below, 1e-6);
          baseOf[c] = (z - 1 + clamp01(frac) + 0.5) * dz;
          bases.push(baseOf[c]);
          break;
        }
      }
    }
  }
  bases.sort((a, b) => a - b);
  const median = bases.length ? bases[bases.length >> 1] : 0;

  for (let jj = 0; jj < d.ny; jj++) {
    const j = Math.min(ny - 1, jj * d.sy);
    for (let ii = 0; ii < d.nx; ii++) {
      const i = Math.min(nx - 1, ii * d.sx);
      const c = i + j * nx;
      // Match volume Z: north → V = 0 (same flip as packVolumeRGBA).
      const o = (ii + d.nx * (d.ny - 1 - jj)) * 4;

      // Rotation proxy: max |ζ|-like shear of w around the column at 1–6 km.
      let spin = 0;
      const z1 = Math.max(1, Math.floor(1000 / dz));
      const z6 = Math.min(nz - 2, Math.ceil(6000 / dz));
      for (let z = z1; z <= z6; z++) {
        if (wAt(i, j, z) < 5) continue;
        const iL = Math.max(0, i - 1);
        const iR = Math.min(nx - 1, i + 1);
        const jB = Math.max(0, j - 1);
        const jT = Math.min(ny - 1, j + 1);
        const dvdx =
          (wCenter(f, grid, iR, j, z) - wCenter(f, grid, iL, j, z)) /
          Math.max(grid.dx, 1);
        const dudy =
          (wCenter(f, grid, i, jT, z) - wCenter(f, grid, i, jB, z)) /
          Math.max(grid.dy, 1);
        // Not true ζ; enough to drive mild striations when organised.
        spin = Math.max(spin, Math.abs(dvdx - dudy) * 0.25);
      }
      out[o] = byte01(clamp01(spin / ROTATION_SCALE));

      let anvilBase = 0;
      let presence = 0;
      for (let z = z5 + 1; z < nz; z++) {
        if (opacityAt(i, j, z) < ANVIL_OPACITY) continue;
        const below = opacityAt(i, j, z - 1);
        const op = opacityAt(i, j, z);
        const frac = (ANVIL_OPACITY - below) / Math.max(op - below, 1e-6);
        anvilBase = (z - 1 + clamp01(frac) + 0.5) * dz;
        const tower = wAt(i, j, z);
        const sh = shareAt(i, j, z);
        const zThick = Math.min(nz - 1, z + Math.max(1, Math.round(1000 / dz)));
        const thick = opacityAt(i, j, zThick);
        presence =
          clamp01((sh - 0.6) / 0.2) *
          (1 - clamp01((tower - 1.6) / 2)) *
          clamp01((thick - 0.15) / 0.2);
        break;
      }
      out[o + 1] = byte01(clamp01((anvilBase / ANVIL_BASE_SCALE) * presence));
      out[o + 2] = byte01(clamp01(presence));

      const base = baseOf[c] < 0 ? median : baseOf[c];
      out[o + 3] = byte01(clamp01(base / BASE_SCALE));
    }
  }
}
