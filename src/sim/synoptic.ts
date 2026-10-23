import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import { TFromTheta, qsat } from "./thermo";

/**
 * Drawn fronts and pressure centers laid over the 1D sounding.
 * A front's cold / dry air is on the left of the direction it was drawn.
 * Symbols on the map point the other way, into the air the front moves toward.
 */

export type FrontKind = "cold" | "warm" | "stationary" | "dryline" | "outflow";

export interface MapPoint {
  /** 0 = west, 1 = east */
  x: number;
  /** 0 = south, 1 = north */
  y: number;
}

export interface DrawnFront {
  id: string;
  kind: FrontKind;
  enabled: boolean;
  points: MapPoint[];
}

export interface PressureCenter {
  id: string;
  kind: "low" | "high";
  enabled: boolean;
  x: number;
  y: number;
  /** Strength magnitude in hPa. */
  hPa: number;
}

export interface SynopticSetup {
  fronts: DrawnFront[];
  centers: PressureCenter[];
  /** Southeast water and a shallow cool marine layer. */
  marine: boolean;
  /** Sign of the circulation around highs and lows. */
  latitudeDeg: number;
  /** Enable synoptic systems (highs/lows/fronts) to affect the simulation. */
  enabled?: boolean;
  /** Enable jetstream. */
  jetstream?: boolean;
  /** How far south the jetstream can reach, 0-1 normalized (higher = further south). */
  jetstreamSouth?: number;
  /** Move systems west->east through the domain over time. */
  move?: boolean;
  /** Translation speed of the systems in km/h. */
  moveSpeed?: number;
}

export interface SynopticSample {
  dTheta: number;
  qScale: number;
  du: number;
  dv: number;
  /**
   * Strength of the marine layer pulling the vapor ratio back toward its
   * humid target (0 = no pull). Applied after the qScale factors combine.
   */
  qPull: number;
}

export interface FrontSpec {
  /** Temperature change on the left-hand side (K). */
  dTheta: number;
  /** Fraction of vapor removed on the left-hand side. Negative moistens. */
  qDrop: number;
  depth: number;
  wind: number;
  windDepth: number;
  /** Extra warmth on the right-hand side so that wind is not nudged away. */
  warmBump: number;
  converge: number;
  along: number;
  /**
   * Half-width of the band around the front that the running simulation
   * keeps re-imposed (normalized domain units). The band holds the sharp
   * air-mass edge and the warm-side buoyancy that lifts air along the front.
   */
  band: number;
  /** Warm anomaly on the front line itself (K) — this is what lifts air. */
  lift: number;
  /** Width of the lift ridge (normalized). */
  liftWidth: number;
  /** Offset of the lift ridge toward the warm side (normalized). */
  liftOffset: number;
  /** Vertical scale of the lift (m). */
  liftDepth: number;
}

export const FRONT_SPEC: Record<FrontKind, FrontSpec> = {
  cold: {
    dTheta: -7.5,
    qDrop: 0.58,
    depth: 2200,
    wind: 10,
    windDepth: 1800,
    warmBump: 1.2,
    converge: 4,
    along: 8,
    band: 0.1,
    lift: 3,
    liftWidth: 0.03,
    liftOffset: 0.012,
    liftDepth: 2800,
  },
  warm: {
    dTheta: 3.2,
    qDrop: -0.12,
    depth: 2000,
    wind: 6,
    windDepth: 1800,
    warmBump: 1,
    converge: 3,
    along: 4,
    band: 0.14,
    lift: 1.8,
    liftWidth: 0.05,
    liftOffset: 0.03,
    liftDepth: 2200,
  },
  stationary: {
    dTheta: -4,
    qDrop: 0.32,
    depth: 1800,
    wind: 5,
    windDepth: 1600,
    warmBump: 1.1,
    converge: 2,
    along: 3,
    band: 0.1,
    lift: 2.2,
    liftWidth: 0.035,
    liftOffset: 0.012,
    liftDepth: 2500,
  },
  dryline: {
    dTheta: 2.4,
    qDrop: 0.8,
    depth: 2000,
    wind: 8,
    windDepth: 1800,
    warmBump: 1,
    converge: 3,
    along: 2,
    band: 0.07,
    lift: 2.6,
    liftWidth: 0.022,
    liftOffset: 0.008,
    liftDepth: 2800,
  },
  outflow: {
    dTheta: -4.8,
    qDrop: 0.22,
    depth: 550,
    wind: 7,
    windDepth: 700,
    warmBump: 0.6,
    converge: 1,
    along: 0,
    band: 0.08,
    lift: 0.8,
    liftWidth: 0.03,
    liftOffset: 0,
    liftDepth: 1200,
  },
};

/**
 * Warm anomaly along the front line. This is the front's lift: a narrow
 * buoyant ridge that raises air where the front is, which is what turns a
 * drawn front into a line of weather instead of a static air-mass edge.
 */
export function frontLift(
  spec: FrontSpec,
  signed: number,
  z: number,
): number {
  if (spec.lift <= 0) return 0;
  const s = signed + spec.liftOffset;
  const w = Math.max(1e-4, spec.liftWidth);
  return (
    spec.lift *
    Math.exp(-(s * s) / (2 * w * w)) *
    Math.exp(-z / spec.liftDepth)
  );
}

/** Front colours shared by the setup map and the live map overlay. */
export const FRONT_COLORS: Record<FrontKind, string> = {
  cold: "#4db8ff",
  warm: "#ff5d5d",
  stationary: "#c084fc",
  dryline: "#e0a15a",
  outflow: "#d070e0",
};

export const FRONT_LABELS: Record<FrontKind, string> = {
  cold: "Cold front",
  warm: "Warm front",
  stationary: "Stationary",
  dryline: "Dryline",
  outflow: "Outflow",
};

function smoothstep(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

function circle(cx: number, cy: number, r: number, n: number): MapPoint[] {
  const pts: MapPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/** The pattern a new run starts with: cold front, dryline, outflow, marine layer. */
export function defaultSynoptic(): SynopticSetup {
  return {
    marine: true,
    latitudeDeg: 35,
    enabled: true,
    jetstream: false,
    jetstreamSouth: 0.5,
    move: true,
    moveSpeed: 35,
    fronts: [
      {
        id: "front-cold",
        kind: "cold",
        enabled: true,
        points: [
          { x: 0.02, y: 0.2 },
          { x: 0.42, y: 0.6 },
          { x: 0.84, y: 0.98 },
        ],
      },
      {
        id: "front-dry",
        kind: "dryline",
        enabled: true,
        points: [
          { x: 0.4, y: 0.02 },
          { x: 0.4, y: 0.28 },
          { x: 0.4, y: 0.52 },
        ],
      },
      {
        id: "front-outflow",
        kind: "outflow",
        enabled: true,
        points: circle(0.66, 0.58, 0.1, 18),
      },
    ],
    centers: [],
  };
}

export function cloneSynoptic(setup: SynopticSetup): SynopticSetup {
  return {
    marine: setup.marine,
    latitudeDeg: setup.latitudeDeg,
    enabled: setup.enabled,
    jetstream: setup.jetstream,
    jetstreamSouth: setup.jetstreamSouth,
    move: setup.move,
    moveSpeed: setup.moveSpeed,
    fronts: setup.fronts.map((f) => ({
      ...f,
      points: f.points.map((p) => ({ x: p.x, y: p.y })),
    })),
    centers: setup.centers.map((c) => ({ ...c })),
  };
}

let active: SynopticSetup = defaultSynoptic();

export function setActiveSynoptic(setup: SynopticSetup | undefined): void {
  active = cloneSynoptic(setup ?? defaultSynoptic());
}

export function getActiveSynoptic(): SynopticSetup {
  return active;
}

/**
 * Move the drawn systems east. `speedKmh` is the translation speed in km/h
 * and `domainWidthM` the physical width of the domain, so a front crosses a
 * 64 km sandbox at a believable pace instead of teleporting.
 *
 * A front that runs off the east edge re-enters on the west side; the whole
 * front is shifted at once so its shape survives the trip.
 */
export function advanceSynoptic(dt: number, domainWidthM: number): void {
  if (active.enabled === false) return;
  if (!active.move) return;
  const speedKmh =
    active.moveSpeed !== undefined ? Math.max(0, active.moveSpeed) : 35;
  if (speedKmh <= 0) return;
  const width = Math.max(1, domainWidthM);
  const dx = ((speedKmh * 1000) / 3600) * dt / width;
  if (Math.abs(dx) < 1e-12) return;
  for (const front of active.fronts) {
    if (!front.enabled || front.points.length < 2) continue;
    for (const p of front.points) p.x += dx;
    // A front that has left the domain altogether comes back in on the
    // other side. A front that only partly leaves it keeps its shape: the
    // part that is off the map re-enters through the boundary.
    let minX = Infinity;
    let maxX = -Infinity;
    for (const p of front.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    }
    if (minX >= 1) {
      for (const p of front.points) p.x -= 1;
    } else if (maxX < 0) {
      for (const p of front.points) p.x += 1;
    }
  }
  // Move pressure centers
  for (const c of active.centers) {
    if (!c.enabled) continue;
    c.x += dx;
    if (c.x > 1.05) c.x -= 1;
    else if (c.x < -0.05) c.x += 1;
  }
}

export interface PolyHit {
  dist: number;
  /** Positive on the left of the drawn direction. */
  signed: number;
  tx: number;
  ty: number;
}

interface PolySegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

const segmentPool: PolySegment[] = [];
let segmentCount = 0;

function pushSeg(ax: number, ay: number, bx: number, by: number): void {
  let s = segmentPool[segmentCount];
  if (!s) {
    s = { ax, ay, bx, by };
    segmentPool[segmentCount] = s;
  } else {
    s.ax = ax;
    s.ay = ay;
    s.bx = bx;
    s.by = by;
  }
  segmentCount++;
}

/**
 * The pieces of a front line that lie inside the domain. A segment that
 * runs off one side comes back in on the other, so a front that has travelled
 * past the east edge keeps its shape instead of losing the part that is off
 * the map.
 */
export function splitPolyline(points: MapPoint[]): PolySegment[] {
  const n = fillSegments(points);
  const out: PolySegment[] = [];
  for (let i = 0; i < n; i++) {
    const s = segmentPool[i];
    out.push({ ax: s.ax, ay: s.ay, bx: s.bx, by: s.by });
  }
  return out;
}

/** Fill the segment pool with the pieces of a front line inside the domain. */
function fillSegments(points: MapPoint[]): number {
  segmentCount = 0;
  for (let i = 0; i < points.length - 1; i++) {
    splitSegment(
      points[i].x,
      points[i].y,
      points[i + 1].x,
      points[i + 1].y,
    );
  }
  return segmentCount;
}

/**
 * Split a segment that runs off one side of the domain into the piece that
 * stays inside and the piece that re-enters on the other side. A front that
 * has travelled past the east edge therefore keeps its shape instead of
 * losing the part that is off the map.
 */
function splitSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  // The parameter values where the segment crosses x = 1 or x = 0.
  let tEast = -1;
  let tWest = -1;
  if (Math.abs(dx) > 1e-9) {
    const te = (1 - ax) / dx;
    if (te > 1e-9 && te < 1 - 1e-9) tEast = te;
    const tw = (0 - ax) / dx;
    if (tw > 1e-9 && tw < 1 - 1e-9) tWest = tw;
  }
  if (tEast < 0 && tWest < 0) {
    pushSeg(ax, ay, bx, by);
    return;
  }
  const t0 = tEast < 0 ? tWest : tWest < 0 ? tEast : Math.min(tEast, tWest);
  const t1 = tEast < 0 ? tWest : tWest < 0 ? tEast : Math.max(tEast, tWest);
  emitPiece(ax, ay, dx, dy, 0, t0);
  emitPiece(ax, ay, dx, dy, t0, t1);
  emitPiece(ax, ay, dx, dy, t1, 1);
}

function emitPiece(
  ax: number,
  ay: number,
  dx: number,
  dy: number,
  t0: number,
  t1: number,
): void {
  const x0 = ax + t0 * dx;
  const y0 = ay + t0 * dy;
  const x1 = ax + t1 * dx;
  const y1 = ay + t1 * dy;
  // A piece that lies off the map comes back in on the far side.
  let wx0 = x0;
  let wx1 = x1;
  if (x0 >= 1) {
    wx0 -= 1;
    wx1 -= 1;
  } else if (x0 < 0) {
    wx0 += 1;
    wx1 += 1;
  }
  pushSeg(wx0, y0, wx1, y1);
}

export function nearestOnPolyline(
  points: MapPoint[],
  x: number,
  y: number,
): PolyHit | null {
  if (!nearestOnPolylineInto(points, x, y, polyHitScratch)) return null;
  return {
    dist: polyHitScratch.dist,
    signed: polyHitScratch.signed,
    tx: polyHitScratch.tx,
    ty: polyHitScratch.ty,
  };
}

const polyHitScratch: PolyHit = { dist: 0, signed: 0, tx: 1, ty: 0 };

/**
 * Nearest point on a front line, written into a reusable result.
 */
export function nearestOnPolylineInto(
  points: MapPoint[],
  x: number,
  y: number,
  out: PolyHit,
): boolean {
  return nearestOnPoolInto(x, y, fillSegments(points), out);
}

/**
 * Load a front line into the shared segment pool. The pool holds one front
 * at a time, so a front can be prepared once and then searched for every
 * cell without splitting its segments over and over.
 */
export function beginPolyline(points: MapPoint[]): number {
  return fillSegments(points);
}

/** Nearest point on the front currently held in the segment pool. */
export function nearestOnPoolInto(
  x: number,
  y: number,
  count: number,
  out: PolyHit,
): boolean {
  let best = Infinity;
  let signed = 0;
  let tx = 1;
  let ty = 0;
  for (let s = 0; s < count; s++) {
    const seg = segmentPool[s];
    const dx = seg.bx - seg.ax;
    const dy = seg.by - seg.ay;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-8) continue;
    let t = ((x - seg.ax) * dx + (y - seg.ay) * dy) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = seg.ax + t * dx;
    const py = seg.ay + t * dy;
    const ox = x - px;
    const oy = y - py;
    const dist = Math.hypot(ox, oy);
    if (dist < best) {
      best = dist;
      const len = Math.sqrt(len2);
      tx = dx / len;
      ty = dy / len;
      const cross = tx * oy - ty * ox;
      signed = (cross >= 0 ? 1 : -1) * dist;
    }
  }
  if (!Number.isFinite(best)) return false;
  out.dist = best;
  out.signed = signed;
  out.tx = tx;
  out.ty = ty;
  return true;
}

/**
 * Nearest point on a front line. The domain is not wrapped: a front that has
 * travelled off the east edge comes back on the west side as a whole, so the
 * line never appears twice in the same place.
 */
export function nearestOnPolylineWrapped(
  points: MapPoint[],
  x: number,
  y: number,
): PolyHit | null {
  return nearestOnPolyline(points, x, y);
}

export function isClosed(points: MapPoint[]): boolean {
  if (points.length < 4) return false;
  const a = points[0];
  const b = points[points.length - 1];
  return Math.hypot(a.x - b.x, a.y - b.y) < 0.04;
}

export function centroid(points: MapPoint[]): MapPoint {
  const n = isClosed(points) ? points.length - 1 : points.length;
  let x = 0;
  let y = 0;
  const count = Math.max(1, n);
  for (let i = 0; i < count; i++) {
    x += points[i].x;
    y += points[i].y;
  }
  return { x: x / count, y: y / count };
}

export function halfWidth(kind: FrontKind): number {
  if (kind === "dryline") return 0.05;
  if (kind === "outflow") return 0.04;
  return 0.08;
}

/** Half-width of the band the running simulation keeps re-imposed. */
export function frontBandWidth(kind: FrontKind): number {
  return FRONT_SPEC[kind].band;
}

/** Cold-side and dry-side weights for the setup map preview. */
export function previewMasses(
  setup: SynopticSetup,
  xn: number,
  yn: number,
): { cold: number; dry: number; low: number; high: number } {
  let cold = 0;
  let dry = 0;
  for (const front of setup.fronts) {
    if (!front.enabled || front.points.length < 2) continue;
    const hit = nearestOnPolylineWrapped(front.points, xn, yn);
    if (!hit) continue;
    const half = halfWidth(front.kind);
    const side = smoothstep((hit.signed + half) / (2 * half));
    if (front.kind === "dryline") dry = Math.max(dry, side);
    else if (front.kind !== "warm") cold = Math.max(cold, side);
  }
  let low = 0;
  let high = 0;
  for (const c of setup.centers) {
    if (!c.enabled) continue;
    const r = Math.hypot(xn - c.x, yn - c.y);
    const g = Math.exp(-(r * r) / (2 * 0.16 * 0.16));
    if (c.kind === "low") low = Math.max(low, g);
    else high = Math.max(high, g);
  }
  return { cold, dry, low, high };
}

/**
 * Horizontal geometry of the fronts at one map position: distance to the
 * line, which side of it the point is on, the line direction, and the
 * direction the front's wind blows from.
 */
export interface FrontHit {
  dist: number;
  signed: number;
  tx: number;
  ty: number;
  /** Unit vector of the front's wind (normal to the line, or radial). */
  wx: number;
  wy: number;
  kind: FrontKind;
  /** Index of the kind in FRONT_KINDS — for the cached level profiles. */
  kindIdx: number;
  /** Weight of the cold/dry side: 0 on the warm side, 1 on the cold side. */
  sideW: number;
  /** exp(-dist/0.35) — how far the warm bump reaches. */
  expBump: number;
  /** 0.4 + 0.6·exp(-dist/0.3) — how far the wind surge reaches. */
  expSurge: number;
  /** exp(-dist/0.2) — how far the convergence reaches. */
  expToward: number;
  /** exp(-dist/0.45) — how far the along-line flow reaches. */
  expAlong: number;
  /** Amplitude of the lift ridge at this point. */
  ridge: number;
}

export interface FrontGeometry {
  hits: FrontHit[];
  /** Distance to the closest front line. */
  nearest: number;
}

/** The front kinds, in the order the level profiles use. */
export const FRONT_KINDS: FrontKind[] = [
  "cold",
  "warm",
  "stationary",
  "dryline",
  "outflow",
];

export function frontKindIndex(kind: FrontKind): number {
  const i = FRONT_KINDS.indexOf(kind);
  return i < 0 ? 0 : i;
}

function makeHit(kind: FrontKind): FrontHit {
  return {
    dist: Infinity,
    signed: 0,
    tx: 1,
    ty: 0,
    wx: 0,
    wy: -1,
    kind,
    kindIdx: frontKindIndex(kind),
    sideW: 0,
    expBump: 0,
    expSurge: 0.4,
    expToward: 0,
    expAlong: 0,
    ridge: 0,
  };
}

/** Fill in the parts of a hit that do not depend on height. */
export function prepareHit(hit: FrontHit): FrontHit {
  const spec = FRONT_SPEC[hit.kind];
  const half = halfWidth(hit.kind);
  hit.sideW = smoothstep((hit.signed + half) / (2 * half));
  hit.expBump = Math.exp(-hit.dist / 0.35);
  hit.expSurge = 0.4 + 0.6 * Math.exp(-hit.dist / 0.3);
  hit.expToward = Math.exp(-hit.dist / 0.2);
  hit.expAlong = Math.exp(-hit.dist / 0.45);
  const s = hit.signed + spec.liftOffset;
  const w = Math.max(1e-4, spec.liftWidth);
  hit.ridge = spec.lift * Math.exp(-(s * s) / (2 * w * w));
  return hit;
}

/** Front geometry at a normalized map position. */
export function frontGeometry(
  setup: SynopticSetup,
  xn: number,
  yn: number,
  out: FrontGeometry,
): FrontGeometry {
  out.hits.length = 0;
  let nearest = Infinity;
  for (const front of setup.fronts) {
    if (!front.enabled || front.points.length < 2) {
      out.hits.push(makeHit(front.kind));
      continue;
    }
    const hit = nearestOnPolylineWrapped(front.points, xn, yn);
    if (!hit) {
      out.hits.push(makeHit(front.kind));
      continue;
    }
    let wx = hit.ty;
    let wy = -hit.tx;
    if (front.kind === "outflow" && isClosed(front.points)) {
      // Outflow spreads radially away from the storm centre.
      const c = centroid(front.points);
      const rx = xn - c.x;
      const ry = yn - c.y;
      const r = Math.hypot(rx, ry) || 1;
      wx = rx / r;
      wy = ry / r;
    }
    out.hits.push(
      prepareHit({
        dist: hit.dist,
        signed: hit.signed,
        tx: hit.tx,
        ty: hit.ty,
        wx,
        wy,
        kind: front.kind,
        kindIdx: frontKindIndex(front.kind),
        sideW: 0,
        expBump: 0,
        expSurge: 0.4,
        expToward: 0,
        expAlong: 0,
        ridge: 0,
      }),
    );
    if (hit.dist < nearest) nearest = hit.dist;
  }
  out.nearest = nearest;
  return out;
}

/**
 * Vertical profiles of the front and background terms, cached per grid.
 * The running simulation re-checks the pattern every step, so it needs
 * these factors ready-made instead of calling exp() for every cell.
 */
export interface LevelProfiles {
  nz: number;
  dz: number;
  /** exp(-z/depth) per front kind, indexed kindIdx * nz + k. */
  depthW: Float32Array;
  /** exp(-z/liftDepth) per front kind, indexed kindIdx * nz + k. */
  liftW: Float32Array;
  /** exp(-z/windDepth) per front kind, indexed kindIdx * nz + k. */
  windW: Float32Array;
  /** exp(-z/1600) */
  z1600: Float32Array;
  /** exp(-z/2200) */
  z2200: Float32Array;
  /** exp(-z/1400) */
  z1400: Float32Array;
  /** exp(-z/450) */
  z450: Float32Array;
  /** exp(-((z-9000)/2500)^2) */
  zJet: Float32Array;
}

let profileCache: LevelProfiles | null = null;

export function levelProfiles(nz: number, dz: number): LevelProfiles {
  if (profileCache && profileCache.nz === nz && profileCache.dz === dz) {
    return profileCache;
  }
  const nKinds = FRONT_KINDS.length;
  const depthW = new Float32Array(nKinds * nz);
  const liftW = new Float32Array(nKinds * nz);
  const windW = new Float32Array(nKinds * nz);
  for (let ki = 0; ki < nKinds; ki++) {
    const spec = FRONT_SPEC[FRONT_KINDS[ki]];
    for (let k = 0; k < nz; k++) {
      const z = (k + 0.5) * dz;
      depthW[ki * nz + k] = Math.exp(-z / spec.depth);
      liftW[ki * nz + k] = Math.exp(-z / spec.liftDepth);
      windW[ki * nz + k] = Math.exp(-z / spec.windDepth);
    }
  }
  const z1600 = new Float32Array(nz);
  const z2200 = new Float32Array(nz);
  const z1400 = new Float32Array(nz);
  const z450 = new Float32Array(nz);
  const zJet = new Float32Array(nz);
  for (let k = 0; k < nz; k++) {
    const z = (k + 0.5) * dz;
    z1600[k] = Math.exp(-z / 1600);
    z2200[k] = Math.exp(-z / 2200);
    z1400[k] = Math.exp(-z / 1400);
    z450[k] = Math.exp(-z / 450);
    zJet[k] = Math.exp(-Math.pow((z - 9000) / 2500, 2));
  }
  profileCache = {
    nz,
    dz,
    depthW,
    liftW,
    windW,
    z1600,
    z2200,
    z1400,
    z450,
    zJet,
  };
  return profileCache;
}

/** Front contribution to θ, vapor and wind at one height. */
export function frontSample(
  hits: FrontHit[],
  z: number,
  out: SynopticSample,
): SynopticSample {
  let dTheta = 0;
  let qScale = 1;
  let du = 0;
  let dv = 0;

  for (const hit of hits) {
    if (!Number.isFinite(hit.dist)) continue;
    const spec = FRONT_SPEC[hit.kind];
    const half = halfWidth(hit.kind);
    const sideW = smoothstep((hit.signed + half) / (2 * half));
    const zW = Math.exp(-z / spec.depth);
    dTheta += spec.dTheta * sideW * zW;
    if (spec.qDrop >= 0) qScale *= 1 - spec.qDrop * sideW * zW;
    else qScale *= 1 + -spec.qDrop * sideW * zW;
    if (spec.warmBump > 0) {
      dTheta +=
        spec.warmBump *
        (1 - sideW) *
        Math.exp(-hit.dist / 0.35) *
        Math.exp(-z / 1600);
    }
    dTheta += frontLift(spec, hit.signed, z);

    const zWind = Math.exp(-z / spec.windDepth);
    const surge =
      spec.wind * sideW * (0.4 + 0.6 * Math.exp(-hit.dist / 0.3)) * zWind;
    du += hit.wx * surge;
    dv += hit.wy * surge;
    const toward =
      (1 - sideW) * Math.exp(-hit.dist / 0.2) * spec.converge * zWind;
    du += -hit.wx * toward;
    dv += -hit.wy * toward;
    const along =
      (1 - sideW) * Math.exp(-hit.dist / 0.45) * spec.along * Math.exp(-z / 2200);
    du += hit.tx * along;
    dv += hit.ty * along;
  }

  out.dTheta = dTheta;
  out.qScale = qScale;
  out.du = du;
  out.dv = dv;
  out.qPull = 0;
  return out;
}

/**
 * Front contribution at one model level, using the cached vertical profiles.
 * Same result as `frontSample`, but without the exp() calls.
 */
export function frontSampleLevel(
  hits: FrontHit[],
  k: number,
  prof: LevelProfiles,
  out: SynopticSample,
): SynopticSample {
  let dTheta = 0;
  let qScale = 1;
  let du = 0;
  let dv = 0;
  const nz = prof.nz;

  for (const hit of hits) {
    if (!Number.isFinite(hit.dist)) continue;
    const spec = FRONT_SPEC[hit.kind];
    const sideW = hit.sideW;
    const base = hit.kindIdx * nz;
    const zW = prof.depthW[base + k];
    dTheta += spec.dTheta * sideW * zW;
    qScale *= 1 - spec.qDrop * sideW * zW;
    if (spec.warmBump > 0) {
      dTheta +=
        spec.warmBump * (1 - sideW) * hit.expBump * prof.z1600[k];
    }
    dTheta += hit.ridge * prof.liftW[base + k];

    const zWind = prof.windW[base + k];
    const surge = spec.wind * sideW * hit.expSurge * zWind;
    du += hit.wx * surge;
    dv += hit.wy * surge;
    const toward = (1 - sideW) * hit.expToward * spec.converge * zWind;
    du += -hit.wx * toward;
    dv += -hit.wy * toward;
    const along = (1 - sideW) * hit.expAlong * spec.along * prof.z2200[k];
    du += hit.tx * along;
    dv += hit.ty * along;
  }

  out.dTheta = dTheta;
  out.qScale = qScale;
  out.du = du;
  out.dv = dv;
  out.qPull = 0;
  return out;
}

/**
 * Horizontal-only coefficients of the synoptic background (pressure centers,
 * marine layer, jetstream). Computed once per map cell and combined with the
 * vertical profiles for every height, so the running simulation can afford
 * to re-check the pattern every step.
 */
export interface BackgroundWeights {
  /** × exp(-z/1400) — cooling under a low, warming under a high. */
  dTheta1400: number;
  /** × exp(-z/450) — the cool marine layer. */
  dTheta450: number;
  /** × exp(-z/450) — the marine layer pulling vapor back to saturation. */
  qPull450: number;
  /** × exp(-z/1600) — circulation around highs and lows. */
  du1600: number;
  dv1600: number;
  /** × exp(-z/450) — the marine layer flow. */
  du450: number;
  dv450: number;
  /** × exp(-((z-9000)/2500)^2) — the jetstream. */
  duJet: number;
  dvJet: number;
}

export function backgroundWeights(
  setup: SynopticSetup,
  xn: number,
  yn: number,
  out: BackgroundWeights,
): BackgroundWeights {
  const w = out;
  if (setup.enabled === false) return w;

  const hemi = setup.latitudeDeg >= 0 ? 1 : -1;
  const sigma = 0.16;
  for (const c of setup.centers) {
    if (!c.enabled) continue;
    const rx = xn - c.x;
    const ry = yn - c.y;
    const r = Math.hypot(rx, ry);
    const g = Math.exp(-(r * r) / (2 * sigma * sigma));
    const ring = (r / Math.max(sigma, 1e-3)) * g;
    const spd = (c.hPa / 6) * 11 * ring;
    const rot = (c.kind === "low" ? 1 : -1) * hemi;
    if (r > 1e-4) {
      w.du1600 += rot * spd * (-ry / r);
      w.dv1600 += rot * spd * (rx / r);
      const radial = (c.kind === "low" ? -0.28 : 0.22) * spd;
      w.du1600 += radial * (rx / r);
      w.dv1600 += radial * (ry / r);
    }
    w.dTheta1400 += (c.kind === "low" ? 1.6 : -1.6) * g;
  }

  if (setup.marine) {
    const coast = smoothstep((xn - 0.7) / 0.1) * smoothstep((0.3 - yn) / 0.1);
    w.dTheta450 += coast * -2.6;
    w.qPull450 += coast * 0.55;
    w.du450 += coast * -5;
    w.dv450 += coast * 5;
  }

  if (setup.jetstream) {
    const jetSouth =
      setup.jetstreamSouth !== undefined
        ? Math.max(0, Math.min(1, setup.jetstreamSouth))
        : 0.5;
    const jetLatitude = 0.6 + jetSouth * 0.3;
    const jetWidth = 0.15 + (1 - jetSouth) * 0.05;
    const distFromJet = Math.abs(yn - jetLatitude);
    const jetProfile = Math.exp(
      -(distFromJet * distFromJet) / (2 * jetWidth * jetWidth),
    );
    if (jetProfile > 0.01) {
      const jetSpeed = 40 + jetSouth * 30;
      w.duJet += jetSpeed * jetProfile * 1.2;
      w.dvJet += jetSpeed * jetProfile * 0.15 * (xn - 0.5);
    }
  }

  return w;
}

/** Combine the background coefficients with the vertical profiles. */
export function backgroundFromWeights(
  w: BackgroundWeights,
  z: number,
  out: SynopticSample,
): SynopticSample {
  const z450 = Math.exp(-z / 450);
  const z1400 = Math.exp(-z / 1400);
  const z1600 = Math.exp(-z / 1600);
  const zJet = Math.exp(-Math.pow((z - 9000) / 2500, 2));
  out.dTheta = w.dTheta1400 * z1400 + w.dTheta450 * z450;
  out.qScale = 1;
  out.du = w.du1600 * z1600 + w.du450 * z450 + w.duJet * zJet;
  out.dv = w.dv1600 * z1600 + w.dv450 * z450 + w.dvJet * zJet;
  out.qPull = w.qPull450 * z450;
  return out;
}

/** Combine the background coefficients with the cached vertical profiles. */
export function backgroundFromWeightsLevel(
  w: BackgroundWeights,
  k: number,
  prof: LevelProfiles,
  out: SynopticSample,
): SynopticSample {
  out.dTheta = w.dTheta1400 * prof.z1400[k] + w.dTheta450 * prof.z450[k];
  out.qScale = 1;
  out.du =
    w.du1600 * prof.z1600[k] +
    w.du450 * prof.z450[k] +
    w.duJet * prof.zJet[k];
  out.dv =
    w.dv1600 * prof.z1600[k] +
    w.dv450 * prof.z450[k] +
    w.dvJet * prof.zJet[k];
  out.qPull = w.qPull450 * prof.z450[k];
  return out;
}

/**
 * Synoptic-scale background (pressure centers, marine layer, jetstream) with
 * no front contribution. Kept separate so the front geometry can be reused
 * across many heights.
 */
export function backgroundSample(
  setup: SynopticSetup,
  xn: number,
  yn: number,
  z: number,
): SynopticSample {
  const out: SynopticSample = { dTheta: 0, qScale: 1, du: 0, dv: 0, qPull: 0 };
  if (setup.enabled === false) return out;
  const w: BackgroundWeights = {
    dTheta1400: 0,
    dTheta450: 0,
    qPull450: 0,
    du1600: 0,
    dv1600: 0,
    du450: 0,
    dv450: 0,
    duJet: 0,
    dvJet: 0,
  };
  backgroundFromWeights(backgroundWeights(setup, xn, yn, w), z, out);
  if (out.dTheta < -14) out.dTheta = -14;
  else if (out.dTheta > 8) out.dTheta = 8;
  return out;
}

function sampleAt(
  setup: SynopticSetup,
  xn: number,
  yn: number,
  z: number,
): SynopticSample {
  const out: SynopticSample = { dTheta: 0, qScale: 1, du: 0, dv: 0, qPull: 0 };
  if (setup.enabled !== false) {
    const geo = frontGeometry(setup, xn, yn, { hits: [], nearest: Infinity });
    frontSample(geo.hits, z, out);
  }
  const bg = backgroundSample(setup, xn, yn, z);
  out.dTheta += bg.dTheta;
  out.qScale *= bg.qScale;
  out.du += bg.du;
  out.dv += bg.dv;
  // The marine layer pulls the combined vapor ratio back toward saturation.
  if (bg.qPull > 0) out.qScale += (1.02 - out.qScale) * bg.qPull;
  if (out.dTheta < -14) out.dTheta = -14;
  else if (out.dTheta > 8) out.dTheta = 8;
  return out;
}

/** Full pattern (fronts + background) of any setup at a map position. */
export function samplePattern(
  setup: SynopticSetup,
  xn: number,
  yn: number,
  z: number,
): SynopticSample {
  return sampleAt(setup, xn, yn, z);
}

/** Perturbation at a normalized column using the pattern for the running sim. */
export function sampleSynoptic(xn: number, yn: number, z: number): SynopticSample {
  return sampleAt(active, xn, yn, z);
}

/** Placed highs and lows, in hPa, added on the surface pressure map. */
export function surfacePressureBiasHpa(xn: number, yn: number): number {
  let h = 0;
  const sigma = 0.16;
  if (active.enabled === false) return h;
  for (const c of active.centers) {
    if (!c.enabled) continue;
    const r = Math.hypot(xn - c.x, yn - c.y);
    const g = Math.exp(-(r * r) / (2 * sigma * sigma));
    h += (c.kind === "low" ? -c.hPa : c.hPa) * g;
  }
  return h;
}

/**
 * Paint enabled fronts, pressure centers, and the marine layer
 * onto a horizontally uniform sounding.
 */
export function applySynopticFeatures(
  grid: Grid3D,
  fields: SimFields,
  setup?: SynopticSetup,
): void {
  setActiveSynoptic(setup);
  const { nx, ny, nz, dz } = grid;
  const xDen = Math.max(1, nx - 1);
  const yDen = Math.max(1, ny - 1);
  const geo: FrontGeometry = { hits: [], nearest: Infinity };
  const front: SynopticSample = { dTheta: 0, qScale: 1, du: 0, dv: 0, qPull: 0 };
  const bg: SynopticSample = { dTheta: 0, qScale: 1, du: 0, dv: 0, qPull: 0 };
  const weights: BackgroundWeights = {
    dTheta1400: 0,
    dTheta450: 0,
    qPull450: 0,
    du1600: 0,
    dv1600: 0,
    du450: 0,
    dv450: 0,
    duJet: 0,
    dvJet: 0,
  };
  const nxny = nx * ny;

  for (let j = 0; j < ny; j++) {
    const yn = j / yDen;
    for (let i = 0; i < nx; i++) {
      const xn = i / xDen;
      frontGeometry(active, xn, yn, geo);
      backgroundWeights(active, xn, yn, weights);
      for (let k = 0; k < nz; k++) {
        const z = (k + 0.5) * dz;
        front.dTheta = 0;
        front.qScale = 1;
        front.du = 0;
        front.dv = 0;
        frontSample(geo.hits, z, front);
        backgroundFromWeights(weights, z, bg);
        let dTheta = front.dTheta + bg.dTheta;
        if (dTheta < -14) dTheta = -14;
        else if (dTheta > 8) dTheta = 8;
        let qScale = front.qScale * bg.qScale;
        if (bg.qPull > 0) qScale += (1.02 - qScale) * bg.qPull;
        const id = i + j * nx + k * nxny;
        const th = fields.theta0[k] + dTheta;
        fields.theta[id] = th;
        const p = fields.p0[k];
        const qv = fields.qv0[k] * qScale;
        const cap = qsat(TFromTheta(th, p), p) * 0.98;
        fields.qv[id] = Math.min(Math.max(0, qv), cap);
      }
    }
  }

  for (let k = 0; k < nz; k++) {
    const z = (k + 0.5) * dz;
    for (let j = 0; j < ny; j++) {
      const yn = j / yDen;
      for (let i = 0; i <= nx; i++) {
        const s0 = sampleSynoptic(Math.max(0, i - 1) / xDen, yn, z);
        const s1 = sampleSynoptic(Math.min(nx - 1, i) / xDen, yn, z);
        fields.u[grid.uIdx(i, j, k)] = fields.u0[k] + 0.5 * (s0.du + s1.du);
      }
    }
    for (let j = 0; j <= ny; j++) {
      const yn0 = Math.max(0, j - 1) / yDen;
      const yn1 = Math.min(ny - 1, j) / yDen;
      for (let i = 0; i < nx; i++) {
        const xn = i / xDen;
        const s0 = sampleSynoptic(xn, yn0, z);
        const s1 = sampleSynoptic(xn, yn1, z);
        fields.v[grid.vIdx(i, j, k)] = fields.v0[k] + 0.5 * (s0.dv + s1.dv);
      }
    }
  }
}
