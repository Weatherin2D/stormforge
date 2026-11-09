/**
 * Painted terrain and cover, resampled onto a run grid, plus one nest rectangle.
 * Heights are metres above the flat model bottom. Cover is land, lake, or ocean,
 * with a water temperature, soil moisture, and vegetation on the same editor grid.
 */
import { Grid3D, gridFromExtentAndResolution } from "./Grid3D";
import type { SimFields } from "./InitFromSounding";
import { TFromTheta } from "./thermo";

export const SURFACE_N = 128;

export interface NestRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 2 or 3. */
  refinement: number;
  /**
   * When true (default), the live solver recenters this box on the storm.
   * Manual draws stay as the initial footprint; tracking may move them.
   */
  follow?: boolean;
}

/** 0 land, 1 lake, 2 ocean. */
export const COVER_LAND = 0;
export const COVER_LAKE = 1;
export const COVER_OCEAN = 2;

export interface SurfaceSpec {
  /** Metres, length SURFACE_N², row-major, j = 0 at the south. */
  terrain?: ArrayLike<number> | null;
  /** 0 land … 1 water, same layout as terrain. Ocean keeps its painted fraction. */
  water?: ArrayLike<number> | null;
  /** 0 land, 1 lake, 2 ocean. Absent on older saves: any water is ocean. */
  kind?: ArrayLike<number> | null;
  /** Water temperature in °C. Absent saves fill every water cell from sstC. */
  waterTemp?: ArrayLike<number> | null;
  /** Soil moisture, 0–1, land only. */
  soil?: ArrayLike<number> | null;
  /** Vegetation, 0 bare … 1 forest, land only. */
  veg?: ArrayLike<number> | null;
  sstC?: number;
  nest?: NestRect | null;
}

export interface ResolvedCover {
  kind: Float32Array;
  water: Float32Array;
  ocean: Float32Array;
  waterTemp: Float32Array;
  soil: Float32Array;
  veg: Float32Array;
}

export interface SampledCover extends ResolvedCover {
  anyWater: boolean;
  anySoil: boolean;
  anyVeg: boolean;
}

const TERRAIN_FRACTION = 0.4;
const OPEN_LEVELS = 8;
const RELAX_W_S = 60;
const RELAX_SST_S = 1800;

let editorWater: Float32Array | null = null;
let drawH: Float32Array | null = null;
let drawW: Float32Array | null = null;
let drawKind: Float32Array | null = null;
let drawTemp: Float32Array | null = null;
let drawSoil: Float32Array | null = null;
let drawVeg: Float32Array | null = null;
let drawSst = 22;
let floorK: Uint16Array | null = null;
let floorNx = 0;

export function setActiveWater(mask: ArrayLike<number> | null): void {
  if (!mask || mask.length !== SURFACE_N * SURFACE_N) {
    editorWater = null;
    return;
  }
  let wet = false;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > 0.02) {
      wet = true;
      break;
    }
  }
  if (!wet) {
    editorWater = null;
    return;
  }
  const out = new Float32Array(SURFACE_N * SURFACE_N);
  for (let i = 0; i < out.length; i++) out[i] = mask[i];
  editorWater = out;
}

/** Water fraction at a normalized map point, or null when the legacy sea is in use. */
export function marineFractionAt(xn: number, yn: number): number | null {
  if (!editorWater) return null;
  return bilinear(editorWater, SURFACE_N, xn, yn);
}

export function bindColumnFloor(openK: Uint16Array | null, nx: number): void {
  floorK = openK;
  floorNx = nx;
}

export function columnBaseK(nx: number, i: number, j: number): number {
  if (!floorK || floorNx !== nx || floorK.length < nx) return 0;
  const k = floorK[i + j * nx] || 0;
  return k > 0 ? k : 0;
}

export function bindSurfaceDraw(
  height: Float32Array | null,
  water: Float32Array | null,
  sstC: number,
  cover?: {
    kind?: Float32Array | null;
    temp?: Float32Array | null;
    soil?: Float32Array | null;
    veg?: Float32Array | null;
  } | null,
): void {
  drawH = height;
  drawW = water;
  drawSst = sstC;
  drawKind = cover?.kind ?? null;
  drawTemp = cover?.temp ?? null;
  drawSoil = cover?.soil ?? null;
  drawVeg = cover?.veg ?? null;
}

/**
 * True when painted terrain / water / soil needs the CPU FluidSolver.
 * Nest alone does not force CPU — hybrid GPU parent + CPU nest handles that.
 */
export function setupNeedsCpu(spec: SurfaceSpec | null | undefined): boolean {
  if (!spec) return false;
  if (spec.terrain) {
    for (let i = 0; i < spec.terrain.length; i++) {
      if (spec.terrain[i] > 1) return true;
    }
  }
  if (spec.water) {
    for (let i = 0; i < spec.water.length; i++) {
      if (spec.water[i] > 0.02) return true;
    }
  }
  if (spec.kind) {
    for (let i = 0; i < spec.kind.length; i++) {
      if (spec.kind[i] >= 0.5) return true;
    }
  }
  if (spec.soil) {
    for (let i = 0; i < spec.soil.length; i++) {
      if (spec.soil[i] > 0.02) return true;
    }
  }
  if (spec.veg) {
    for (let i = 0; i < spec.veg.length; i++) {
      if (spec.veg[i] > 0.02) return true;
    }
  }
  return false;
}

export function crestCap(zTop: number): number {
  return Math.max(0, TERRAIN_FRACTION * zTop);
}

/** Highest terrain that still leaves OPEN_LEVELS cell centres above the ground. */
export function heightCap(zTop: number, dz: number, nz: number): number {
  const byLevels = (Math.max(0, nz - OPEN_LEVELS) + 0.5) * dz;
  return Math.max(0, Math.min(crestCap(zTop), byLevels));
}

export function capHeight(
  metres: number,
  water: number,
  zTop: number,
  dz: number,
  nz: number,
): number {
  if (water > 0.5) return 0;
  const cap = heightCap(zTop, dz, nz);
  if (metres <= 0) return 0;
  return metres < cap ? metres : cap;
}

export function openLevel(height: number, dz: number, nz: number): number {
  if (height <= 0) return 0;
  let k = Math.ceil(height / dz - 0.5);
  if (k < 0) k = 0;
  const maxK = Math.max(0, nz - OPEN_LEVELS);
  if (k > maxK) k = maxK;
  return k;
}

export function normalizeNest(nest: NestRect): NestRect {
  let x0 = clamp01(nest.x0);
  let x1 = clamp01(nest.x1);
  let y0 = clamp01(nest.y0);
  let y1 = clamp01(nest.y1);
  if (x1 < x0) {
    const t = x0;
    x0 = x1;
    x1 = t;
  }
  if (y1 < y0) {
    const t = y0;
    y0 = y1;
    y1 = t;
  }
  const xs = expandSpan(x0, x1);
  const ys = expandSpan(y0, y1);
  const refinement = nest.refinement >= 3 ? 3 : 2;
  const out: NestRect = { x0: xs.a, x1: xs.b, y0: ys.a, y1: ys.b, refinement };
  if (nest.follow === false) out.follow = false;
  else if (nest.follow === true) out.follow = true;
  return out;
}

function expandSpan(a0: number, a1: number): { a: number; b: number } {
  if (a1 - a0 >= 0.2) return { a: a0, b: a1 };
  const mid = (a0 + a1) * 0.5;
  let a = mid - 0.1;
  let b = mid + 0.1;
  if (a < 0) {
    b -= a;
    a = 0;
  }
  if (b > 1) {
    a -= b - 1;
    b = 1;
  }
  return { a: Math.max(0, a), b: Math.min(1, b) };
}

export function nestGrid(parent: Grid3D, nest: NestRect): Grid3D {
  const n = normalizeNest(nest);
  const fx = Math.max(1e-3, n.x1 - n.x0);
  const fy = Math.max(1e-3, n.y1 - n.y0);
  const nx = clampCount(Math.round(parent.nx * fx * n.refinement));
  const ny = clampCount(Math.round(parent.ny * fy * n.refinement));
  return gridFromExtentAndResolution(
    nx,
    ny,
    parent.nz,
    parent.zTop,
    parent.xExtent * fx,
    parent.yExtent * fy,
  );
}

function clampCount(n: number): number {
  if (n < 16) return 16;
  if (n > 192) return 192;
  return n;
}

export function bilinear(src: ArrayLike<number>, n: number, xn: number, yn: number): number {
  if (src.length < n * n) return 0;
  const x = clamp01(xn) * (n - 1);
  const y = clamp01(yn) * (n - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1 < n ? x0 + 1 : x0;
  const y1 = y0 + 1 < n ? y0 + 1 : y0;
  const tx = x - x0;
  const ty = y - y0;
  const at = (ix: number, iy: number) => src[ix + n * iy];
  const a = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
  const b = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
  return a * (1 - ty) + b * ty;
}

/** Resample an editor grid onto a solver grid, optionally inside a parent rectangle. */
export function resampleField(
  src: ArrayLike<number> | null | undefined,
  nx: number,
  ny: number,
  x0 = 0,
  y0 = 0,
  x1 = 1,
  y1 = 1,
): Float32Array {
  const out = new Float32Array(nx * ny);
  if (!src || src.length < SURFACE_N * SURFACE_N) return out;
  const xDen = Math.max(1, nx - 1);
  const yDen = Math.max(1, ny - 1);
  for (let j = 0; j < ny; j++) {
    const yn = y0 + (j / yDen) * (y1 - y0);
    for (let i = 0; i < nx; i++) {
      const xn = x0 + (i / xDen) * (x1 - x0);
      out[i + j * nx] = bilinear(src, SURFACE_N, xn, yn);
    }
  }
  return out;
}

/** Nearest editor cell, so lake and ocean stay distinct across a resample. */
export function resampleNearest(
  src: ArrayLike<number> | null | undefined,
  nx: number,
  ny: number,
  x0 = 0,
  y0 = 0,
  x1 = 1,
  y1 = 1,
): Float32Array {
  const out = new Float32Array(nx * ny);
  if (!src || src.length < SURFACE_N * SURFACE_N) return out;
  const xDen = Math.max(1, nx - 1);
  const yDen = Math.max(1, ny - 1);
  const den = Math.max(1, SURFACE_N - 1);
  for (let j = 0; j < ny; j++) {
    const yn = clamp01(y0 + (j / yDen) * (y1 - y0));
    const iy = Math.round(yn * den);
    for (let i = 0; i < nx; i++) {
      const xn = clamp01(x0 + (i / xDen) * (x1 - x0));
      const ix = Math.round(xn * den);
      out[i + j * nx] = src[ix + SURFACE_N * iy];
    }
  }
  return out;
}

function snapKind(value: number): number {
  if (value >= 1.5) return COVER_OCEAN;
  if (value >= 0.5) return COVER_LAKE;
  return COVER_LAND;
}

/** Editor-resolution cover. An old save with only sstC paints that temperature on every water cell. */
export function resolveEditorCover(spec: SurfaceSpec | null | undefined): ResolvedCover {
  const n = SURFACE_N * SURFACE_N;
  const kind = new Float32Array(n);
  const water = new Float32Array(n);
  const ocean = new Float32Array(n);
  const waterTemp = new Float32Array(n);
  const soil = new Float32Array(n);
  const veg = new Float32Array(n);
  const sst = spec?.sstC ?? 22;
  waterTemp.fill(sst);
  const hasKind = !!(spec?.kind && spec.kind.length >= n);
  if (hasKind) {
    for (let i = 0; i < n; i++) kind[i] = snapKind(spec!.kind![i]);
  } else if (spec?.water && spec.water.length >= n) {
    for (let i = 0; i < n; i++) {
      if (spec.water![i] > 0.02) kind[i] = COVER_OCEAN;
    }
  }
  if (spec?.water && spec.water.length >= n) {
    for (let i = 0; i < n; i++) water[i] = spec.water![i];
  }
  for (let i = 0; i < n; i++) {
    if (kind[i] === COVER_LAKE) {
      water[i] = 1;
      ocean[i] = 0;
    } else if (kind[i] === COVER_OCEAN) {
      if (water[i] < 0.02) water[i] = 1;
      ocean[i] = water[i];
    }
  }
  if (spec?.waterTemp && spec.waterTemp.length >= n) {
    for (let i = 0; i < n; i++) waterTemp[i] = spec.waterTemp![i];
  }
  if (spec?.soil && spec.soil.length >= n) {
    for (let i = 0; i < n; i++) soil[i] = clamp01(spec.soil![i]);
  }
  if (spec?.veg && spec.veg.length >= n) {
    for (let i = 0; i < n; i++) veg[i] = clamp01(spec.veg![i]);
  }
  return { kind, water, ocean, waterTemp, soil, veg };
}

/** Ocean mask for the marine layer. Lakes stay out of it. */
export function oceanMaskOf(spec: SurfaceSpec | null | undefined): Float32Array | null {
  if (!spec) return null;
  const cover = resolveEditorCover(spec);
  let wet = false;
  for (let i = 0; i < cover.ocean.length; i++) {
    if (cover.ocean[i] > 0.02) {
      wet = true;
      break;
    }
  }
  return wet ? cover.ocean : null;
}

export function sampleCover(
  spec: SurfaceSpec | null | undefined,
  nx: number,
  ny: number,
  x0 = 0,
  y0 = 0,
  x1 = 1,
  y1 = 1,
): SampledCover {
  const src = resolveEditorCover(spec);
  const kind = resampleNearest(src.kind, nx, ny, x0, y0, x1, y1);
  const water = resampleField(src.water, nx, ny, x0, y0, x1, y1);
  const ocean = resampleField(src.ocean, nx, ny, x0, y0, x1, y1);
  const waterTemp = resampleField(src.waterTemp, nx, ny, x0, y0, x1, y1);
  const soil = resampleField(src.soil, nx, ny, x0, y0, x1, y1);
  const veg = resampleField(src.veg, nx, ny, x0, y0, x1, y1);
  let anyWater = false;
  let anySoil = false;
  let anyVeg = false;
  for (let s = 0; s < kind.length; s++) {
    kind[s] = snapKind(kind[s]);
    if (kind[s] === COVER_LAKE) {
      water[s] = 1;
      ocean[s] = 0;
      anyWater = true;
    } else if (kind[s] === COVER_OCEAN) {
      if (water[s] < ocean[s]) water[s] = ocean[s];
      if (ocean[s] < 0.02) ocean[s] = 1;
      if (water[s] < ocean[s]) water[s] = ocean[s];
      anyWater = true;
    } else {
      // Nearest-kind land wins over bilinear water bleed so coasts match
      // the jagged elevation / cover mask instead of a soft wet fringe.
      ocean[s] = 0;
      water[s] = 0;
    }
    if (soil[s] > 0.02) anySoil = true;
    if (veg[s] > 0.02) anyVeg = true;
  }
  return { kind, water, ocean, waterTemp, soil, veg, anyWater, anySoil, anyVeg };
}

/** Dark water, brighter bare ground, darker forest. */
export function coverAlbedo(kind: number, soil: number, veg: number): number {
  if (kind >= 1.5) return 0.06;
  if (kind >= 0.5) return 0.08;
  const bare = 0.3 - 0.14 * clamp01(soil);
  const forest = 0.12;
  return bare + (forest - bare) * clamp01(veg);
}

/** Smooth water, smoother bare ground, rougher forest. Metres. */
export function coverRoughness(kind: number, veg: number): number {
  if (kind >= 0.5) return 0.0002;
  return 0.01 + 0.8 * clamp01(veg);
}

export function buildHeights(
  terrain: ArrayLike<number> | null | undefined,
  water: Float32Array,
  grid: Grid3D,
  x0 = 0,
  y0 = 0,
  x1 = 1,
  y1 = 1,
): { height: Float32Array; openK: Uint16Array } {
  const raw = resampleField(terrain, grid.nx, grid.ny, x0, y0, x1, y1);
  const height = new Float32Array(grid.nx * grid.ny);
  const openK = new Uint16Array(grid.nx * grid.ny);
  for (let s = 0; s < height.length; s++) {
    const h = capHeight(raw[s], water[s] || 0, grid.zTop, grid.dz, grid.nz);
    height[s] = h;
    openK[s] = openLevel(h, grid.dz, grid.nz);
  }
  return { height, openK };
}

export function fillSoutheastSea(water: Float32Array): void {
  const n = SURFACE_N;
  const den = Math.max(1, n - 1);
  for (let j = 0; j < n; j++) {
    const yn = j / den;
    for (let i = 0; i < n; i++) {
      const xn = i / den;
      const coast = smooth(xn - 0.7, 0.1) * smooth(0.3 - yn, 0.1);
      water[i + n * j] = coast;
    }
  }
}

export function fillRidge(terrain: Float32Array, crest: number): void {
  const n = SURFACE_N;
  const den = Math.max(1, n - 1);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const xn = i / den - 0.5;
      const g = Math.exp(-(xn * xn) / (2 * 0.08 * 0.08));
      terrain[i + n * j] = crest * g;
    }
  }
}

export function fillPeak(terrain: Float32Array, crest: number): void {
  const n = SURFACE_N;
  const den = Math.max(1, n - 1);
  for (let j = 0; j < n; j++) {
    const yn = j / den - 0.55;
    for (let i = 0; i < n; i++) {
      const xn = i / den - 0.5;
      const r2 = xn * xn + yn * yn;
      terrain[i + n * j] = crest * Math.exp(-r2 / (2 * 0.09 * 0.09));
    }
  }
}

/** A lake in a lowered basin: banks around a pool that keeps its own floor. */
export function fillLakeBasin(
  terrain: Float32Array,
  kind: Float32Array,
  water: Float32Array,
  temp: Float32Array,
  banks: number,
): void {
  const n = SURFACE_N;
  const den = Math.max(1, n - 1);
  for (let j = 0; j < n; j++) {
    const yn = j / den - 0.62;
    for (let i = 0; i < n; i++) {
      const xn = i / den - 0.38;
      const r = Math.hypot(xn, yn);
      const s = i + n * j;
      if (r < 0.1) {
        kind[s] = COVER_LAKE;
        water[s] = 1;
        terrain[s] = 0;
        temp[s] = 18;
      } else if (r < 0.22) {
        const rim = Math.exp(-((r - 0.1) * (r - 0.1)) / (2 * 0.045 * 0.045));
        terrain[s] = Math.max(terrain[s], banks * rim);
      }
    }
  }
}

/** A forest patch on moist soil. */
export function fillForest(soil: Float32Array, veg: Float32Array): void {
  const n = SURFACE_N;
  const den = Math.max(1, n - 1);
  for (let j = 0; j < n; j++) {
    const yn = j / den - 0.48;
    for (let i = 0; i < n; i++) {
      const xn = i / den - 0.68;
      const r2 = xn * xn + yn * yn;
      const g = Math.exp(-r2 / (2 * 0.07 * 0.07));
      const s = i + n * j;
      veg[s] = Math.max(veg[s], g);
      soil[s] = Math.max(soil[s], 0.8 * g);
    }
  }
}

export function zeroField(buf: Float32Array): void {
  buf.fill(0);
}

/** w = u ∂h/∂x + v ∂h/∂y at one column (m/s). */
export function orographicW(
  height: Float32Array,
  nx: number,
  ny: number,
  i: number,
  j: number,
  dx: number,
  dy: number,
  u: number,
  v: number,
): number {
  const h = (ix: number, iy: number) =>
    height[Math.max(0, Math.min(nx - 1, ix)) + nx * Math.max(0, Math.min(ny - 1, iy))];
  const dhdx = (h(i + 1, j) - h(i - 1, j)) / (2 * dx);
  const dhdy = (h(i, j + 1) - h(i, j - 1)) / (2 * dy);
  return u * dhdx + v * dhdy;
}

export function relaxFactor(dt: number, tau: number): number {
  if (dt <= 0) return 0;
  return 1 - Math.exp(-dt / tau);
}

export const TERRAIN_TAU = RELAX_W_S;
export const SST_TAU = RELAX_SST_S;

function smooth(num: number, den: number): number {
  const t = num / den;
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

type Stop = [number, number, number, number];

const ELEV_STOPS: Stop[] = [
  [0, 48, 92, 48],
  [800, 140, 150, 90],
  [1800, 170, 140, 90],
  [3000, 210, 200, 190],
  [4500, 245, 245, 245],
];
const SLOPE_STOPS: Stop[] = [
  [0, 24, 32, 28],
  [5, 90, 140, 70],
  [15, 220, 170, 60],
  [30, 180, 50, 40],
];
const ASPECT_STOPS: Stop[] = [
  [0, 220, 65, 16],
  [90, 232, 209, 134],
  [180, 67, 96, 117],
  [270, 143, 108, 210],
  [360, 220, 65, 16],
];
const W_STOPS: Stop[] = [
  [-5, 43, 108, 179],
  [0, 238, 238, 238],
  [5, 220, 65, 16],
];
const TEMP_STOPS: Stop[] = [
  [-5, 43, 108, 179],
  [5, 167, 200, 206],
  [15, 232, 209, 134],
  [25, 226, 123, 18],
  [35, 180, 40, 30],
];
const CONTRAST_STOPS: Stop[] = [
  [-12, 43, 108, 179],
  [0, 238, 238, 238],
  [12, 220, 65, 16],
];
const KIND_STOPS: Stop[] = [
  [0, 120, 100, 70],
  [1, 140, 200, 214],
  [2, 18, 72, 120],
];
const MOIST_STOPS: Stop[] = [
  [0, 150, 100, 52],
  [0.5, 90, 110, 130],
  [1, 30, 80, 170],
];
const VEG_STOPS: Stop[] = [
  [0, 150, 130, 80],
  [0.5, 80, 130, 60],
  [1, 20, 90, 36],
];
const ALBEDO_STOPS: Stop[] = [
  [0, 20, 30, 40],
  [0.15, 90, 110, 80],
  [0.35, 220, 210, 180],
];
const ROUGH_STOPS: Stop[] = [
  [0, 40, 80, 110],
  [0.2, 140, 140, 90],
  [1, 40, 90, 30],
];

function paint(stops: Stop[], value: number, out: Uint8Array, o: number): void {
  const lo = stops[0][0];
  const hi = stops[stops.length - 1][0];
  const v = value < lo ? lo : value > hi ? hi : value;
  let i = 0;
  while (i < stops.length - 1 && v > stops[i + 1][0]) i++;
  const a = stops[i];
  const b = stops[Math.min(stops.length - 1, i + 1)];
  const span = Math.max(1e-6, b[0] - a[0]);
  const f = (v - a[0]) / span;
  out[o] = Math.round(a[1] + (b[1] - a[1]) * f);
  out[o + 1] = Math.round(a[2] + (b[2] - a[2]) * f);
  out[o + 2] = Math.round(a[3] + (b[3] - a[3]) * f);
  out[o + 3] = 255;
}

function mapPix(i: number, j: number, nx: number, ny: number): number {
  return (i + (ny - 1 - j) * nx) * 4;
}

export type SurfaceProductId =
  | "elev"
  | "slope"
  | "aspect"
  | "orog"
  | "sst"
  | "coast"
  | "wkind"
  | "soilm"
  | "vegc"
  | "albedo"
  | "rough";

export function isSurfaceProduct(id: string): id is SurfaceProductId {
  return (
    id === "elev" ||
    id === "slope" ||
    id === "aspect" ||
    id === "orog" ||
    id === "sst" ||
    id === "coast" ||
    id === "wkind" ||
    id === "soilm" ||
    id === "vegc" ||
    id === "albedo" ||
    id === "rough"
  );
}

/** Elevation, slope, aspect, orographic w, SST, and sea–land contrast. */
export function packSurfaceProduct(
  id: SurfaceProductId,
  grid: Grid3D,
  fields: SimFields,
  out: Uint8Array,
): void {
  const { nx, ny, dx, dy } = grid;
  const height = drawH && drawH.length === nx * ny ? drawH : null;
  const water = drawW && drawW.length === nx * ny ? drawW : null;
  const kind = drawKind && drawKind.length === nx * ny ? drawKind : null;
  const temp = drawTemp && drawTemp.length === nx * ny ? drawTemp : null;
  const soil = drawSoil && drawSoil.length === nx * ny ? drawSoil : null;
  const veg = drawVeg && drawVeg.length === nx * ny ? drawVeg : null;
  const waterTempAt = (s: number, wet: number): number =>
    wet > 0.5 && temp ? temp[s] : drawSst;
  let landT = 0;
  let landN = 0;
  if (id === "coast") {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const s = i + j * nx;
        if (water && water[s] > 0.5) continue;
        const k = columnBaseK(nx, i, j);
        landT += TFromTheta(fields.theta[grid.idx(i, j, k)], fields.p0[k]) - 273.15;
        landN++;
      }
    }
  }
  const landMean = landN > 0 ? landT / landN : drawSst;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const s = i + j * nx;
      const o = mapPix(i, j, nx, ny);
      const h = height ? height[s] : 0;
      const wet = water ? water[s] : 0;
      const knd = kind ? kind[s] : wet > 0.5 ? COVER_OCEAN : COVER_LAND;
      const soilV = soil && knd < 0.5 ? soil[s] : 0;
      const vegV = veg && knd < 0.5 ? veg[s] : 0;
      if (id === "elev") {
        paint(ELEV_STOPS, h, out, o);
      } else if (id === "slope" || id === "aspect" || id === "orog") {
        const dhdx = height
          ? (height[Math.min(nx - 1, i + 1) + nx * j] - height[Math.max(0, i - 1) + nx * j]) / (2 * dx)
          : 0;
        const dhdy = height
          ? (height[i + nx * Math.min(ny - 1, j + 1)] - height[i + nx * Math.max(0, j - 1)]) / (2 * dy)
          : 0;
        if (id === "slope") {
          const deg = (Math.atan(Math.hypot(dhdx, dhdy)) * 180) / Math.PI;
          paint(SLOPE_STOPS, deg, out, o);
        } else if (id === "aspect") {
          let deg = (Math.atan2(-dhdx, -dhdy) * 180) / Math.PI;
          if (deg < 0) deg += 360;
          paint(ASPECT_STOPS, height ? deg : 0, out, o);
        } else {
          const k = columnBaseK(nx, i, j);
          const u = grid.uCenter(fields.u, i, j, k);
          const v = grid.vCenter(fields.v, i, j, k);
          paint(W_STOPS, u * dhdx + v * dhdy, out, o);
        }
      } else if (id === "sst") {
        const k = columnBaseK(nx, i, j);
        const shown =
          wet > 0.5
            ? waterTempAt(s, wet)
            : TFromTheta(fields.theta[grid.idx(i, j, k)], fields.p0[k]) - 273.15;
        paint(TEMP_STOPS, shown, out, o);
      } else if (id === "coast") {
        const contrast = wet > 0.5 ? waterTempAt(s, wet) - landMean : 0;
        paint(CONTRAST_STOPS, contrast, out, o);
      } else if (id === "wkind") {
        paint(KIND_STOPS, knd, out, o);
      } else if (id === "soilm") {
        paint(MOIST_STOPS, soilV, out, o);
      } else if (id === "vegc") {
        paint(VEG_STOPS, vegV, out, o);
      } else if (id === "albedo") {
        paint(ALBEDO_STOPS, coverAlbedo(knd, soilV, vegV), out, o);
      } else {
        paint(ROUGH_STOPS, coverRoughness(knd, vegV), out, o);
      }
    }
  }
}
