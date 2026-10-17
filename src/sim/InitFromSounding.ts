import { Grid3D } from "./Grid3D";
import { SynopticSetup, applySynopticFeatures } from "./synoptic";
import {
  SoundingLevel,
  eFromDewpointC,
  interpolateProfile,
  mixingRatio,
  qsat,
  thetaFromT,
  TFromTheta,
} from "./thermo";

export interface SimFields {
  /** C-grid u on x-faces ((nx+1)·ny·nz). */
  u: Float32Array;
  /** C-grid v on y-faces (nx·(ny+1)·nz). */
  v: Float32Array;
  /** C-grid w on z-faces (nx·ny·(nz+1)). */
  w: Float32Array;
  theta: Float32Array;
  qv: Float32Array;
  qc: Float32Array;
  qr: Float32Array;
  /** Anelastic pressure / π' at cell centers. */
  p: Float32Array;
  /** Base-state potential temperature (1D, nz). */
  theta0: Float32Array;
  /** Base-state vapor (1D, nz). */
  qv0: Float32Array;
  /** Base-state pressure (1D, nz). */
  p0: Float32Array;
  /** Base-state density at cell centers (1D, nz). */
  rho0: Float32Array;
  /** Base-state density on w-faces (1D, nz+1). */
  rho0w: Float32Array;
  /** Base-state u/v wind (1D, nz). */
  u0: Float32Array;
  v0: Float32Array;
}

export function createFields(grid: Grid3D): SimFields {
  const n = grid.n;
  const nz = grid.nz;
  return {
    u: new Float32Array(grid.nu),
    v: new Float32Array(grid.nv),
    w: new Float32Array(grid.nw),
    theta: new Float32Array(n),
    qv: new Float32Array(n),
    qc: new Float32Array(n),
    qr: new Float32Array(n),
    p: new Float32Array(n),
    theta0: new Float32Array(nz),
    qv0: new Float32Array(nz),
    p0: new Float32Array(nz),
    rho0: new Float32Array(nz),
    rho0w: new Float32Array(nz + 1),
    u0: new Float32Array(nz),
    v0: new Float32Array(nz),
  };
}

export interface InitOptions {
  bubbleStrength: number; // K at center
  bubbleRadiusFrac?: number; // fraction of domain
  /** Drawn fronts, highs, and lows. Omitted runs use the default pattern. */
  synoptic?: SynopticSetup;
}

/** Near-surface warm/moist bubble geometry (domain horizontal center). */
export function bubbleGeometry(grid: Grid3D, radiusFrac = 0.14) {
  const bubbleR =
    radiusFrac * Math.min(grid.xExtent, grid.yExtent, grid.zTop);
  return {
    bubbleR,
    cx: grid.xExtent / 2,
    cy: grid.yExtent / 2,
    cz: Math.min(1400, Math.max(grid.dz * 2.5, grid.zTop * 0.1)),
  };
}

/**
 * Inject a CM1-style warm moist bubble into the current fields
 * without wiping the rest of the domain.
 */
export function spawnInitBubble(
  grid: Grid3D,
  fields: SimFields,
  opts: InitOptions,
): void {
  if (opts.bubbleStrength <= 0) return;
  const { nx, ny, nz, dx, dy, dz } = grid;
  const { bubbleR, cx, cy, cz } = bubbleGeometry(
    grid,
    opts.bubbleRadiusFrac ?? 0.14,
  );

  for (let k = 0; k < nz; k++) {
    const z = (k + 0.5) * dz;
    for (let j = 0; j < ny; j++) {
      const y = (j + 0.5) * dy;
      for (let i = 0; i < nx; i++) {
        const x = (i + 0.5) * dx;
        const rx = (x - cx) / bubbleR;
        const ry = (y - cy) / bubbleR;
        const rz = (z - cz) / (bubbleR * 0.65);
        const r2 = rx * rx + ry * ry + rz * rz;
        if (r2 >= 1) continue;

        const id = grid.idx(i, j, k);
        const wgt = Math.cos(0.5 * Math.PI * Math.sqrt(r2));
        const amp = wgt * wgt;
        let th = fields.theta[id] + opts.bubbleStrength * amp;
        const qsBubble = qsat(TFromTheta(th, fields.p0[k]), fields.p0[k]);
        const qcSeed = 0.0015 * amp * Math.max(0.4, opts.bubbleStrength / 3);
        const qv = Math.max(fields.qv[id], qsBubble * (1.01 + 0.04 * amp));

        fields.theta[id] = th;
        fields.qv[id] = Math.max(0, qv);
        fields.qc[id] = Math.max(fields.qc[id], qcSeed);
        // Kick a small updraft on the w-faces bounding this cell
        const kick = 2.5 * amp;
        const wk = grid.wIdx(i, j, k);
        const wk1 = grid.wIdx(i, j, k + 1);
        fields.w[wk] = Math.max(fields.w[wk], kick * 0.5);
        fields.w[wk1] = Math.max(fields.w[wk1], kick * 0.5);
      }
    }
  }
  // Enforce impermeable lids
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      fields.w[grid.wIdx(i, j, 0)] = 0;
      fields.w[grid.wIdx(i, j, nz)] = 0;
    }
  }
}

/**
 * Initialize horizontally uniform columns from a sounding,
 * plus an optional warm moist bubble (CM1-style trigger).
 */
export function initFromSounding(
  grid: Grid3D,
  sounding: SoundingLevel[],
  fields: SimFields,
  opts: InitOptions,
): void {
  const { nx, ny, nz } = grid;

  for (let k = 0; k < nz; k++) {
    const z = (k + 0.5) * grid.dz;
    const lvl = interpolateProfile(sounding, z);
    const tdC = lvl.Td - 273.15;
    const e = eFromDewpointC(tdC);
    const qv = Math.min(mixingRatio(e, lvl.p), qsat(lvl.T, lvl.p) * 0.98);
    const th = thetaFromT(lvl.T, lvl.p);
    fields.theta0[k] = th;
    fields.qv0[k] = qv;
    fields.p0[k] = lvl.p;
    fields.rho0[k] = lvl.p / (287.05 * lvl.T);
    fields.u0[k] = lvl.u;
    fields.v0[k] = lvl.v;
  }

  // w-face densities (extrapolate at lids)
  fields.rho0w[0] = fields.rho0[0];
  fields.rho0w[nz] = fields.rho0[nz - 1];
  for (let k = 1; k < nz; k++) {
    fields.rho0w[k] = 0.5 * (fields.rho0[k - 1] + fields.rho0[k]);
  }

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const id = grid.idx(i, j, k);
        fields.theta[id] = fields.theta0[k];
        fields.qv[id] = fields.qv0[k];
        fields.qc[id] = 0;
        fields.qr[id] = 0;
        fields.p[id] = 0;
      }
    }
  }

  // Face winds from sounding
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i <= nx; i++) {
        fields.u[grid.uIdx(i, j, k)] = fields.u0[k];
      }
    }
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i < nx; i++) {
        fields.v[grid.vIdx(i, j, k)] = fields.v0[k];
      }
    }
  }
  fields.w.fill(0);

  applySynopticFeatures(grid, fields, opts.synoptic);

  if (opts.bubbleStrength > 0) {
    spawnInitBubble(grid, fields, opts);
  }
}
