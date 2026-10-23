import { Grid3D } from "./Grid3D";
import type { SimFields } from "./InitFromSounding";
import { TFromTheta, qsat } from "./thermo";
import {
  BackgroundWeights,
  FRONT_KINDS,
  FRONT_SPEC,
  FrontGeometry,
  FrontHit,
  FrontKind,
  PolyHit,
  SynopticSample,
  SynopticSetup,
  backgroundFromWeightsLevel,
  backgroundWeights,
  beginPolyline,
  centroid,
  frontGeometry,
  frontKindIndex,
  frontSampleLevel,
  getActiveSynoptic,
  halfWidth,
  isClosed,
  levelProfiles,
  nearestOnPoolInto,
  prepareHit,
} from "./synoptic";

/**
 * Keeps the drawn fronts alive in the running simulation.
 *
 * The front pattern is painted into the initial state, but from there the
 * solver owns the fields: numerical diffusion softens the air-mass edge, the
 * warm-side buoyancy that lifts air along the front decays, and the
 * anelastic projection removes the convergence a front would otherwise use to
 * raise warm air. A drawn front therefore stops mattering a few minutes into
 * a run, and moving it west->east changes nothing inside the domain.
 *
 * Two tiers put the front back:
 *
 * - A narrow band around the line holds the sharp edge, the wind shift and
 *   the ridge of warm air that lifts parcels into cloud.
 * - The air mass behind the line is held over the whole side of the front,
 *   so the cold, dry air a cold front drags in stays cold and dry instead of
 *   being smoothed away. That correction only acts on air that has drifted
 *   back toward the base state; weather that has pushed past the pattern is
 *   left alone, so a storm that grows on the front is not erased by it.
 */

/** Relaxation time of the sharp edge around the front line (s). */
const TAU_BAND = 400;
/** Relaxation time that puts a mixed-away air mass back (s). */
const TAU_MASS = 600;
/** Relaxation time for weather that has pushed past the pattern (s). */
const TAU_MASS_SLOW = 9000;
/** Vapor relaxation time (s). */
const TAU_MOIST = 700;
/** Wind relaxation time (s) — the front's own flow, mostly along the line. */
const TAU_WIND = 1200;
/** Largest θ change the forcing may make in a single step (K). */
const MAX_DTHETA_STEP = 2;
/** Air-mass anomaly below this is not worth holding (K). */
const MIN_AIR_ANOMALY = 0.2;
/** Deviations smaller than this are left alone (K). */
const DEADBAND = 0.3;

interface Buffers {
  nx: number;
  ny: number;
  nF: number;
  dist: Float32Array;
  signed: Float32Array;
  tx: Float32Array;
  ty: Float32Array;
  wx: Float32Array;
  wy: Float32Array;
  side: Float32Array;
  kind: Int8Array;
}

/** Pool of front hits, reused for every cell so the loop allocates nothing. */
const hitPool: FrontHit[] = [];

function getHit(i: number): FrontHit {
  let h = hitPool[i];
  if (!h) {
    h = {
      dist: Infinity,
      signed: 0,
      tx: 1,
      ty: 0,
      wx: 0,
      wy: -1,
      kind: "cold",
      kindIdx: 0,
      sideW: 0,
      expBump: 0,
      expSurge: 0.4,
      expToward: 0,
      expAlong: 0,
      ridge: 0,
    };
    hitPool[i] = h;
  }
  return h;
}

let buffers: Buffers | null = null;

function getBuffers(nx: number, ny: number, nF: number): Buffers {
  if (
    buffers &&
    buffers.nx === nx &&
    buffers.ny === ny &&
    buffers.nF === nF
  ) {
    return buffers;
  }
  const n = nx * ny * nF;
  buffers = {
    nx,
    ny,
    nF,
    dist: new Float32Array(n),
    signed: new Float32Array(n),
    tx: new Float32Array(n),
    ty: new Float32Array(n),
    wx: new Float32Array(n),
    wy: new Float32Array(n),
    side: new Float32Array(n),
    kind: new Int8Array(n),
  };
  return buffers;
}

/**
 * Re-impose the drawn front pattern on the running simulation.
 * `dt` is the solver sub-step in seconds.
 */
export function stepSynopticForcing(
  grid: Grid3D,
  f: SimFields,
  dt: number,
): void {
  const setup = getActiveSynoptic();
  if (setup.enabled === false) return;
  const fronts = setup.fronts.filter(
    (fr) => fr.enabled && fr.points.length >= 2,
  );
  if (!fronts.length) return;

  const { nx, ny, nz, dz } = grid;
  const xDen = Math.max(1, nx - 1);
  const yDen = Math.max(1, ny - 1);
  const nF = fronts.length;
  const buf = getBuffers(nx, ny, nF);
  buf.dist.fill(Infinity);
  const prof = levelProfiles(nz, dz);

  // Front geometry for every cell: the band follows the line, the air mass
  // fills the whole side of it.
    const hitScratch: PolyHit = { dist: 0, signed: 0, tx: 1, ty: 0 };
    for (let fi = 0; fi < nF; fi++) {
      const front = fronts[fi];
      const kind = front.kind;
      const kindIdx = frontKindIndex(kind);
      const half = halfWidth(kind);
      const closed = kind === "outflow" && isClosed(front.points);
      // The front's geometry is built once and then searched for every cell.
      const segCount = beginPolyline(front.points);
      let cx = 0;
      let cy = 0;
      if (closed) {
        const c = centroid(front.points);
        cx = c.x;
        cy = c.y;
      }
      for (let j = 0; j < ny; j++) {
        const yn = j / yDen;
        for (let i = 0; i < nx; i++) {
          const xn = i / xDen;
          if (!nearestOnPoolInto(xn, yn, segCount, hitScratch)) continue;
        const id = (j * nx + i) * nF + fi;
        buf.dist[id] = hitScratch.dist;
        buf.signed[id] = hitScratch.signed;
        buf.tx[id] = hitScratch.tx;
        buf.ty[id] = hitScratch.ty;
        if (closed) {
          const rx = xn - cx;
          const ry = yn - cy;
          const r = Math.hypot(rx, ry) || 1;
          buf.wx[id] = rx / r;
          buf.wy[id] = ry / r;
        } else {
          buf.wx[id] = hitScratch.ty;
          buf.wy[id] = -hitScratch.tx;
        }
        buf.kind[id] = kindIdx;
        const t = (hitScratch.signed + half) / (2 * half);
        const x = t < 0 ? 0 : t > 1 ? 1 : t;
        buf.side[id] = x * x * (3 - 2 * x);
      }
    }
  }

  const sample: SynopticSample = {
    dTheta: 0,
    qScale: 1,
    du: 0,
    dv: 0,
    qPull: 0,
  };
  const bg: SynopticSample = { dTheta: 0, qScale: 1, du: 0, dv: 0, qPull: 0 };
  const hits: FrontHit[] = [];
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
  const rateBand = Math.min(1, dt / TAU_BAND);
  const rateMass = Math.min(1, dt / TAU_MASS);
  const rateMassSlow = Math.min(1, dt / TAU_MASS_SLOW);
  const rateMoist = Math.min(1, dt / TAU_MOIST);
  const rateWind = Math.min(1, dt / TAU_WIND);
  const nxny = nx * ny;

  for (let j = 0; j < ny; j++) {
    const yn = j / yDen;
    for (let i = 0; i < nx; i++) {
      const xn = i / xDen;
      const cell = j * nx + i;
      const base = cell * nF;

      // The fronts that reach this cell, and the band around them.
      hits.length = 0;
      let bandW = 0;
      let airW = 0;
      let airKind: FrontKind = "cold";
      let airKindIdx = 0;
      let airMass = 0;
      for (let fi = 0; fi < nF; fi++) {
        const id = base + fi;
        const d = buf.dist[id];
        if (!Number.isFinite(d)) continue;
        const kindIdx = buf.kind[id];
        const kind = FRONT_KINDS[kindIdx];
        const spec = FRONT_SPEC[kind];
        const half = halfWidth(kind);
        const sideW = buf.side[id];
        const hit = getHit(hits.length);
        hit.dist = d;
        hit.signed = buf.signed[id];
        hit.tx = buf.tx[id];
        hit.ty = buf.ty[id];
        hit.wx = buf.wx[id];
        hit.wy = buf.wy[id];
        hit.kind = kind;
        hit.kindIdx = kindIdx;
        prepareHit(hit);
        hits.push(hit);
        const w = Math.exp(-(d * d) / (2 * half * half));
        if (w > bandW) bandW = w;
        // The air mass a front carries: the cold/dry side of its line.
        const mass = sideW * Math.abs(spec.dTheta);
        if (mass > airMass) {
          airMass = mass;
          airW = sideW;
          airKind = kind;
          airKindIdx = kindIdx;
        }
      }
      if (!hits.length) continue;

      const hasBand = bandW > 0.01;
      const airSpec = FRONT_SPEC[airKind];
      // The front's air mass: cold and dry behind a cold front, warm and
      // moist ahead of a warm front.
      const airSign = airSpec.dTheta < 0 ? -1 : 1;
      const qSign = airSpec.qDrop > 0 ? -1 : 1;
      const onAirSide = airW > 0.5;
      backgroundWeights(setup, xn, yn, weights);

      const airBase = airKindIdx * nz;
      for (let k = 0; k < nz; k++) {
        const idx = cell + k * nxny;
        let dTheta = 0;
        let qScale = 1;

        if (hasBand) {
          frontSampleLevel(hits, k, prof, sample);
          backgroundFromWeightsLevel(weights, k, prof, bg);
          dTheta = sample.dTheta + bg.dTheta;
          if (dTheta < -14) dTheta = -14;
          else if (dTheta > 8) dTheta = 8;
          qScale = sample.qScale * bg.qScale;
          if (bg.qPull > 0) qScale += (1.02 - qScale) * bg.qPull;
        } else {
          // Away from the line only the air mass and the background are left.
          backgroundFromWeightsLevel(weights, k, prof, bg);
          const zW = prof.depthW[airBase + k];
          dTheta = airSpec.dTheta * airW * zW + bg.dTheta;
          if (dTheta < -14) dTheta = -14;
          else if (dTheta > 8) dTheta = 8;
          qScale = (1 - airSpec.qDrop * airW * zW) * bg.qScale;
          if (bg.qPull > 0) qScale += (1.02 - qScale) * bg.qPull;
        }

        // The band holds the sharp edge and the ridge of rising air.
        if (hasBand) {
          const thTarget = f.theta0[k] + dTheta;
          const err = f.theta[idx] - thTarget;
          f.theta[idx] += clamp(
            -err * bandW * rateBand,
            -MAX_DTHETA_STEP,
            MAX_DTHETA_STEP,
          );

          const qTarget = f.qv0[k] * qScale;
          const qErr = f.qv[idx] - qTarget;
          f.qv[idx] = Math.max(0, f.qv[idx] - qErr * bandW * rateMoist);

          // Front flow: the along-line component survives the anelastic
          // projection, so keeping it preserves the front's own wind field.
          const uTarget = f.u0[k] + sample.du + bg.du;
          const vTarget = f.v0[k] + sample.dv + bg.dv;
          const wPull = bandW * rateWind;
          for (let ii = 0; ii <= 1; ii++) {
            const gid = grid.uIdx(Math.min(nx, i + ii), j, k);
            f.u[gid] += (uTarget - f.u[gid]) * wPull;
          }
          for (let jj = 0; jj <= 1; jj++) {
            const gid = grid.vIdx(i, Math.min(ny, j + jj), k);
            f.v[gid] += (vTarget - f.v[gid]) * wPull;
          }
        }

        // The air mass holds its side of the domain: the cold, dry air
        // behind a cold front stays cold and dry, and the warm air ahead of
        // it stays warm. Only air that has drifted back toward the base
        // state is corrected quickly — weather that has pushed past the
        // pattern is left alone.
        const thTarget = f.theta0[k] + dTheta;
        const err = f.theta[idx] - thTarget;
        if (Math.abs(err) > DEADBAND) {
          let rate: number;
          if (onAirSide) {
            rate = airSign * err < 0 ? rateMass : rateMassSlow;
          } else {
            // On the other side the front's air mass can drift in. Take it
            // back, but only where there is no weather of its own.
            const wet = f.qc[idx] + f.qr[idx] > 1e-5;
            rate = !wet && airSign * err > 0 ? rateMass : rateMassSlow;
          }
          f.theta[idx] += clamp(
            -err * rate,
            -MAX_DTHETA_STEP,
            MAX_DTHETA_STEP,
          );
        }

        const qTarget = f.qv0[k] * qScale;
        const qErr = f.qv[idx] - qTarget;
        if (Math.abs(qErr) > 1e-5) {
          const wet = f.qc[idx] + f.qr[idx] > 1e-5;
          let rate: number;
          if (onAirSide) {
            rate = qSign * qErr < 0 ? rateMass : rateMassSlow;
          } else {
            rate = !wet && qSign * qErr > 0 ? rateMass : rateMassSlow;
          }
          f.qv[idx] = Math.max(0, f.qv[idx] - qErr * rate);
        }
      }
    }
  }
}

/**
 * Re-impose a changed pattern on the running simulation.
 *
 * Only the difference between the old and the new pattern is applied, so the
 * weather that has already developed is left alone: a front drawn while the
 * simulation runs adds its air mass and its band of rising air without
 * wiping out the storms that are already going.
 */
export function applySynopticPattern(
  grid: Grid3D,
  f: SimFields,
  oldSetup: SynopticSetup,
  newSetup: SynopticSetup,
): void {
  const { nx, ny, nz, dz } = grid;
  const xDen = Math.max(1, nx - 1);
  const yDen = Math.max(1, ny - 1);
  const nxny = nx * ny;
  const prof = levelProfiles(nz, dz);
  const geoOld: FrontGeometry = { hits: [], nearest: Infinity };
  const geoNew: FrontGeometry = { hits: [], nearest: Infinity };
  const sOld: SynopticSample = { dTheta: 0, qScale: 1, du: 0, dv: 0, qPull: 0 };
  const sNew: SynopticSample = { dTheta: 0, qScale: 1, du: 0, dv: 0, qPull: 0 };
  const bgOld: SynopticSample = { dTheta: 0, qScale: 1, du: 0, dv: 0, qPull: 0 };
  const bgNew: SynopticSample = { dTheta: 0, qScale: 1, du: 0, dv: 0, qPull: 0 };
  const wOld: BackgroundWeights = {
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
  const wNew: BackgroundWeights = {
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

  const combine = (
    s: SynopticSample,
    b: SynopticSample,
    outDTheta: { v: number },
    outQ: { v: number },
  ): void => {
    let d = s.dTheta + b.dTheta;
    if (d < -14) d = -14;
    else if (d > 8) d = 8;
    outDTheta.v = d;
    let q = s.qScale * b.qScale;
    if (b.qPull > 0) q += (1.02 - q) * b.qPull;
    outQ.v = q;
  };

  const dOld = { v: 0 };
  const dNew = { v: 0 };
  const qOld = { v: 1 };
  const qNew = { v: 1 };

  for (let j = 0; j < ny; j++) {
    const yn = j / yDen;
    for (let i = 0; i < nx; i++) {
      const xn = i / xDen;
      frontGeometry(oldSetup, xn, yn, geoOld);
      frontGeometry(newSetup, xn, yn, geoNew);
      backgroundWeights(oldSetup, xn, yn, wOld);
      backgroundWeights(newSetup, xn, yn, wNew);
      for (let k = 0; k < nz; k++) {
        frontSampleLevel(geoOld.hits, k, prof, sOld);
        frontSampleLevel(geoNew.hits, k, prof, sNew);
        backgroundFromWeightsLevel(wOld, k, prof, bgOld);
        backgroundFromWeightsLevel(wNew, k, prof, bgNew);
        combine(sOld, bgOld, dOld, qOld);
        combine(sNew, bgNew, dNew, qNew);
        const id = i + j * nx + k * nxny;
        f.theta[id] += clamp(dNew.v - dOld.v, -6, 6);
        const ratio = qOld.v > 1e-6 ? qNew.v / qOld.v : 1;
        const p = f.p0[k];
        const th = f.theta[id];
        const cap = qsat(TFromTheta(th, p), p) * 0.98;
        f.qv[id] = Math.min(cap, Math.max(0, f.qv[id] * ratio));
      }
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
