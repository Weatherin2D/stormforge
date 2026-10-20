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
  /** Enable synoptic systems (highs, lows, fronts) to affect the simulation. */
  enabled?: boolean;
  /** Enable jetstream. */
  jetstream?: boolean;
  /** How far south the jetstream can reach, 0-1 normalized (higher = further south). */
  jetstreamSouth?: number;
  /** Move systems west->east through the domain over time. */
  move?: boolean;
  /** Translation speed in domain units per second (0-1 scale). */
  moveSpeed?: number;
}

export interface SynopticSample {
  dTheta: number;
  qScale: number;
  du: number;
  dv: number;
}

interface FrontSpec {
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
}

const FRONT_SPEC: Record<FrontKind, FrontSpec> = {
  cold: {
    dTheta: -7.5,
    qDrop: 0.58,
    depth: 2200,
    wind: 10,
    windDepth: 1800,
    warmBump: 1.35,
    converge: 4,
    along: 8,
  },
  warm: {
    dTheta: 3.2,
    qDrop: -0.12,
    depth: 2000,
    wind: 6,
    windDepth: 1800,
    warmBump: 0,
    converge: 3,
    along: 4,
  },
  stationary: {
    dTheta: -4,
    qDrop: 0.32,
    depth: 1800,
    wind: 5,
    windDepth: 1600,
    warmBump: 0.7,
    converge: 2,
    along: 3,
  },
  dryline: {
    dTheta: 2.4,
    qDrop: 0.8,
    depth: 2000,
    wind: 8,
    windDepth: 1800,
    warmBump: 0,
    converge: 3,
    along: 2,
  },
  outflow: {
    dTheta: -4.8,
    qDrop: 0.22,
    depth: 550,
    wind: 7,
    windDepth: 700,
    warmBump: 0,
    converge: 1,
    along: 0,
  },
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
    enabled: false,
    jetstream: false,
    jetstreamSouth: 0.5,
    move: true,
    moveSpeed: 0.08,
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

let advectedTime = 0;

export function advanceSynoptic(dt: number): void {
  if (active.enabled === false) return;
  if (!active.move) return;
  const speed = active.moveSpeed !== undefined ? Math.max(0, active.moveSpeed) : 0.08;
  advectedTime += dt;
  const dx = speed * dt;
  if (Math.abs(dx) < 1e-12) return;
  // Move all fronts to the east
  for (const front of active.fronts) {
    if (!front.enabled) continue;
    for (const p of front.points) {
      p.x += dx;
      // Wrap around domain
      if (p.x > 1.05) p.x -= 1.1;
      if (p.x < -0.05) p.x += 1.1;
    }
  }
  // Move pressure centers
  for (const c of active.centers) {
    if (!c.enabled) continue;
    c.x += dx;
    if (c.x > 1.05) c.x -= 1.1;
    if (c.x < -0.05) c.x += 1.1;
  }
}

export interface PolyHit {
  dist: number;
  /** Positive on the left of the drawn direction. */
  signed: number;
  tx: number;
  ty: number;
}

export function nearestOnPolyline(
  points: MapPoint[],
  x: number,
  y: number,
): PolyHit | null {
  let best = Infinity;
  let signed = 0;
  let tx = 1;
  let ty = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const ax = points[i].x;
    const ay = points[i].y;
    const bx = points[i + 1].x;
    const by = points[i + 1].y;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-8) continue;
    let t = ((x - ax) * dx + (y - ay) * dy) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = ax + t * dx;
    const py = ay + t * dy;
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
  if (!Number.isFinite(best)) return null;
  return { dist: best, signed, tx, ty };
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

function halfWidth(kind: FrontKind): number {
  if (kind === "dryline") return 0.05;
  if (kind === "outflow") return 0.04;
  return 0.08;
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
    const hit = nearestOnPolyline(front.points, xn, yn);
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

function sampleAt(
  setup: SynopticSetup,
  xn: number,
  yn: number,
  z: number,
): SynopticSample {
  let dTheta = 0;
  let qScale = 1;
  let du = 0;
  let dv = 0;

  if (setup.enabled === false) {
    // Jetstream can still be applied if explicitly enabled even if other systems disabled
    const synEnabled = setup.enabled !== false;
    if (setup.jetstream && synEnabled) {
      // Apply jetstream
    }
    // If disabled completely, just apply jetstream if requested
  }

  for (const front of setup.fronts) {
    if (!front.enabled || front.points.length < 2) continue;
    if (setup.enabled === false) continue; // skip if synoptic systems disabled
    const hit = nearestOnPolyline(front.points, xn, yn);
    if (!hit) continue;
    const spec = FRONT_SPEC[front.kind];
    const half = halfWidth(front.kind);
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

    const zWind = Math.exp(-z / spec.windDepth);
    const surge =
      spec.wind * sideW * (0.4 + 0.6 * Math.exp(-hit.dist / 0.3)) * zWind;
    let wx: number;
    let wy: number;
    if (front.kind === "outflow" && isClosed(front.points)) {
      const c = centroid(front.points);
      const rx = xn - c.x;
      const ry = yn - c.y;
      const r = Math.hypot(rx, ry) || 1;
      wx = rx / r;
      wy = ry / r;
    } else {
      wx = hit.ty;
      wy = -hit.tx;
    }
    du += wx * surge;
    dv += wy * surge;
    const toward =
      (1 - sideW) * Math.exp(-hit.dist / 0.2) * spec.converge * zWind;
    du += -wx * toward;
    dv += -wy * toward;
    const along =
      (1 - sideW) * Math.exp(-hit.dist / 0.45) * spec.along * Math.exp(-z / 2200);
    du += hit.tx * along;
    dv += hit.ty * along;
  }

  const hemi = setup.latitudeDeg >= 0 ? 1 : -1;
  const sigma = 0.16;
  if (setup.enabled !== false) {
    for (const c of setup.centers) {
      if (!c.enabled) continue;
      const rx = xn - c.x;
      const ry = yn - c.y;
      const r = Math.hypot(rx, ry);
      const g = Math.exp(-(r * r) / (2 * sigma * sigma));
      const ring = (r / Math.max(sigma, 1e-3)) * g;
      const spd = (c.hPa / 6) * 11 * ring * Math.exp(-z / 1600);
      const rot = (c.kind === "low" ? 1 : -1) * hemi;
      if (r > 1e-4) {
        du += rot * spd * (-ry / r);
        dv += rot * spd * (rx / r);
        const radial = (c.kind === "low" ? -0.28 : 0.22) * spd;
        du += radial * (rx / r);
        dv += radial * (ry / r);
      }
      dTheta += (c.kind === "low" ? 1.6 : -1.6) * g * Math.exp(-z / 1400);
    }

    if (setup.marine) {
      const coast =
        smoothstep((xn - 0.7) / 0.1) * smoothstep((0.3 - yn) / 0.1);
      const zMarine = Math.exp(-z / 450);
      dTheta += coast * -2.6 * zMarine;
      if (coast > 0) qScale += (1.02 - qScale) * coast * zMarine * 0.55;
      du += coast * zMarine * -5;
      dv += coast * zMarine * 5;
    }
  }

  // Jetstream
  if (setup.jetstream && setup.enabled !== false) {
    const jetSouth = setup.jetstreamSouth !== undefined ? Math.max(0, Math.min(1, setup.jetstreamSouth)) : 0.5;
    // Jet core at mid-upper levels, stronger at ~9-12km
    const zJet = Math.exp(-Math.pow((z - 9000) / 2500, 2));
    if (zJet > 0.01) {
      // Jet position shifts south with jetSouth
      const jetLatitude = 0.6 + jetSouth * 0.3; // normalized y position (north up in our coords? yn is 0=south, 1=north)
      const jetWidth = 0.15 + (1 - jetSouth) * 0.05;
      const distFromJet = Math.abs(yn - jetLatitude);
      const jetProfile = Math.exp(-(distFromJet * distFromJet) / (2 * jetWidth * jetWidth));
      if (jetProfile > 0.01) {
        const jetSpeed = 40 + jetSouth * 30; // m/s
        du += jetSpeed * jetProfile * zJet * 1.2; // westerly
        // Ageostrophic component near jet streak
        dv += jetSpeed * jetProfile * zJet * 0.15 * (xn - 0.5);
      }
    }
  }

  if (dTheta < -14) dTheta = -14;
  else if (dTheta > 8) dTheta = 8;

  return { dTheta, qScale: Math.max(0.05, qScale), du, dv };
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
  if (setup?.enabled === false) {
    // Still apply base state without perturbations? But applySynopticFeatures sets theta/v etc.
    // If disabled, maybe just skip perturbing? But currently it overwrites with perturbations; let's handle
  }
  const { nx, ny, nz, dz } = grid;
  const xDen = Math.max(1, nx - 1);
  const yDen = Math.max(1, ny - 1);

  for (let k = 0; k < nz; k++) {
    const z = (k + 0.5) * dz;
    const p = fields.p0[k];
    const kBase = k * nx * ny;
    for (let j = 0; j < ny; j++) {
      const yn = j / yDen;
      const row = j * nx;
      for (let i = 0; i < nx; i++) {
        const s = sampleSynoptic(i / xDen, yn, z);
        const id = row + i + kBase;
        const th = fields.theta0[k] + s.dTheta;
        fields.theta[id] = th;
        const qv = fields.qv0[k] * s.qScale;
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
