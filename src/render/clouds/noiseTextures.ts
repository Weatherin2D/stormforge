import * as THREE from 'three';

/**
 * Tileable 3D noise for the cloud renderer.
 *
 *  shape  (64^3 RGBA8):  R = Perlin-Worley, G/B/A = Worley "billows" at 4 / 8 / 16 cells per tile
 *  detail (32^3 RGBA8):  R/G/B = Worley "billows" at 2 / 4 / 8 cells per tile
 *
 * "Billow" = 1 - F1 (distance to the nearest feature point), so values are high in the
 * middle of a cell and fall off to the cell edges. That gives round, bubbly lumps, which
 * is what produces the cauliflower tops once the sim density is eroded by it.
 *
 * Everything is generated on the CPU once at startup (about half a second for the defaults).
 * If the hitch matters, move createCloudNoise() into a Web Worker and transfer the arrays.
 */

/** Integer hash -> [0, 1) */
function hash3(x: number, y: number, z: number, seed: number): number {
  let h =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(z | 0, 1274126177) ^
    Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const wrap = (i: number, n: number): number => ((i % n) + n) % n;
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

type Noise3 = (x: number, y: number, z: number) => number;

/** Tileable Worley noise. Input in [0,1) tile space. Returns billow = 1 - F1, in 0..1. */
function makeWorleyBillow(cells: number, seed: number): Noise3 {
  const pts = new Float32Array(cells * cells * cells * 3);
  for (let z = 0; z < cells; z++) {
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const i = ((z * cells + y) * cells + x) * 3;
        pts[i] = hash3(x, y, z, seed);
        pts[i + 1] = hash3(x, y, z, seed + 101);
        pts[i + 2] = hash3(x, y, z, seed + 202);
      }
    }
  }
  return (u, v, w) => {
    const px = u * cells, py = v * cells, pz = w * cells;
    const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
    const fx = px - ix, fy = py - iy, fz = pz - iz;
    let minD2 = 1e9;
    for (let dz = -1; dz <= 1; dz++) {
      const cz = wrap(iz + dz, cells);
      for (let dy = -1; dy <= 1; dy++) {
        const cy = wrap(iy + dy, cells);
        for (let dx = -1; dx <= 1; dx++) {
          const cx = wrap(ix + dx, cells);
          const i = ((cz * cells + cy) * cells + cx) * 3;
          const rx = dx + pts[i] - fx;
          const ry = dy + pts[i + 1] - fy;
          const rz = dz + pts[i + 2] - fz;
          const d2 = rx * rx + ry * ry + rz * rz;
          if (d2 < minD2) minD2 = d2;
        }
      }
    }
    return 1 - Math.min(1, Math.sqrt(minD2));
  };
}

/** Tileable gradient (Perlin-style) noise, remapped to 0..1. */
function makePerlin(cells: number, seed: number): Noise3 {
  const grads = new Float32Array(cells * cells * cells * 3);
  for (let z = 0; z < cells; z++) {
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const i = ((z * cells + y) * cells + x) * 3;
        grads[i] = hash3(x, y, z, seed) * 2 - 1;
        grads[i + 1] = hash3(x, y, z, seed + 11) * 2 - 1;
        grads[i + 2] = hash3(x, y, z, seed + 23) * 2 - 1;
      }
    }
  }
  return (u, v, w) => {
    const px = u * cells, py = v * cells, pz = w * cells;
    const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
    const fx = px - ix, fy = py - iy, fz = pz - iz;
    const sx = fade(fx), sy = fade(fy), sz = fade(fz);

    const corner = (ox: number, oy: number, oz: number): number => {
      const cx = wrap(ix + ox, cells);
      const cy = wrap(iy + oy, cells);
      const cz = wrap(iz + oz, cells);
      const i = ((cz * cells + cy) * cells + cx) * 3;
      return grads[i] * (fx - ox) + grads[i + 1] * (fy - oy) + grads[i + 2] * (fz - oz);
    };

    const x00 = lerp(corner(0, 0, 0), corner(1, 0, 0), sx);
    const x10 = lerp(corner(0, 1, 0), corner(1, 1, 0), sx);
    const x01 = lerp(corner(0, 0, 1), corner(1, 0, 1), sx);
    const x11 = lerp(corner(0, 1, 1), corner(1, 1, 1), sx);
    const v0 = lerp(x00, x10, sy);
    const v1 = lerp(x01, x11, sy);
    return clamp01(0.5 + lerp(v0, v1, sz) * 0.9);
  };
}

function makeTexture(data: Uint8Array, size: number): THREE.Data3DTexture {
  const tex = new THREE.Data3DTexture(data as unknown as BufferSource, size, size, size);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.wrapR = THREE.RepeatWrapping;
  tex.generateMipmaps = false;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

export function createShapeNoise(size = 64, seed = 1): THREE.Data3DTexture {
  const w4 = makeWorleyBillow(4, seed + 1);
  const w8 = makeWorleyBillow(8, seed + 2);
  const w16 = makeWorleyBillow(16, seed + 3);
  const p4 = makePerlin(4, seed + 4);
  const p8 = makePerlin(8, seed + 5);
  const p16 = makePerlin(16, seed + 6);

  const data = new Uint8Array(size * size * size * 4);
  let o = 0;
  for (let z = 0; z < size; z++) {
    const w = (z + 0.5) / size;
    for (let y = 0; y < size; y++) {
      const v = (y + 0.5) / size;
      for (let x = 0; x < size; x++) {
        const u = (x + 0.5) / size;
        const b1 = w4(u, v, w);
        const b2 = w8(u, v, w);
        const b3 = w16(u, v, w);
        const wfbm = b1 * 0.625 + b2 * 0.25 + b3 * 0.125;
        const perlin = p4(u, v, w) * 0.57 + p8(u, v, w) * 0.29 + p16(u, v, w) * 0.14;
        // Perlin-Worley: Perlin remapped into [wfbm, 1]
        const pw = wfbm + perlin * (1 - wfbm);
        data[o++] = Math.round(clamp01(pw) * 255);
        data[o++] = Math.round(clamp01(b1) * 255);
        data[o++] = Math.round(clamp01(b2) * 255);
        data[o++] = Math.round(clamp01(b3) * 255);
      }
    }
  }
  return makeTexture(data, size);
}

export function createDetailNoise(size = 32, seed = 7): THREE.Data3DTexture {
  const w2 = makeWorleyBillow(2, seed + 1);
  const w4 = makeWorleyBillow(4, seed + 2);
  const w8 = makeWorleyBillow(8, seed + 3);

  const data = new Uint8Array(size * size * size * 4);
  let o = 0;
  for (let z = 0; z < size; z++) {
    const w = (z + 0.5) / size;
    for (let y = 0; y < size; y++) {
      const v = (y + 0.5) / size;
      for (let x = 0; x < size; x++) {
        const u = (x + 0.5) / size;
        data[o++] = Math.round(clamp01(w2(u, v, w)) * 255);
        data[o++] = Math.round(clamp01(w4(u, v, w)) * 255);
        data[o++] = Math.round(clamp01(w8(u, v, w)) * 255);
        data[o++] = 255;
      }
    }
  }
  return makeTexture(data, size);
}

let cachedNoise: { shape: THREE.Data3DTexture; detail: THREE.Data3DTexture } | null = null;

export function createCloudNoise(opts: { shapeSize?: number; detailSize?: number; seed?: number } = {}) {
  const seed = opts.seed ?? 1;
  const shapeSize = opts.shapeSize ?? 64;
  const detailSize = opts.detailSize ?? 32;
  if (cachedNoise && seed === 1 && shapeSize === 64 && detailSize === 32) return cachedNoise;
  const noise = {
    shape: createShapeNoise(shapeSize, seed),
    detail: createDetailNoise(detailSize, seed + 100),
  };
  if (seed === 1 && shapeSize === 64 && detailSize === 32) cachedNoise = noise;
  return noise;
}
