import { Grid3D } from "./Grid3D";
import {
  SimFields,
  createFields,
  initFromSounding,
  spawnInitBubble,
  InitOptions,
} from "./InitFromSounding";
import { stepMicrophysics } from "./Microphysics";
import { SoundingLevel, G, TFromTheta, exnerFromP, qsat } from "./thermo";
import { getActiveSynoptic, sampleSynoptic } from "./synoptic";
import {
  MapProductId,
  packLightning,
  packMapProduct as packMapProductRGBA,
  reflectivityDbz,
} from "./mapProducts";
import { volumeDisplaySize } from "./Grid3D";
import {
  RadiationOptions,
  DEFAULT_RADIATION,
  applySurfaceRadiation,
  advanceSolarHour,
  solarStatus,
  SolarStatus,
  buildLandMask,
} from "./SurfaceRadiation";
import { stepShallowCu } from "./shallowCu";

export type LightningKind = "cg" | "sprite";

export interface LightningStrike {
  i: number;
  j: number;
  k: number;
  kind: LightningKind;
}

/** One xy-coarsened level of the anelastic pressure V-cycle. */
interface MgLevel {
  nx: number;
  ny: number;
  nz: number;
  dx: number;
  dy: number;
  dz: number;
  n: number;
  /** Coarse correction. Fine level uses fields.p. */
  p: Float32Array | null;
  /** Coarse right-hand side. Fine level uses div. */
  rhs: Float32Array | null;
  resid: Float32Array;
}

/**
 * CM1-like anelastic core on an Arakawa C-grid:
 * buoyancy → face-wind advection → density-weighted projection → scalar advection
 * → surface radiation → Kessler microphysics → sponges.
 */
export class FluidSolver {
  grid: Grid3D;
  fields: SimFields;
  private tmp: Float32Array;
  private tmpQv: Float32Array;
  private tmpQc: Float32Array;
  private tmpQr: Float32Array;
  private tmpU: Float32Array;
  private tmpV: Float32Array;
  private tmpW: Float32Array;
  private div: Float32Array;
  private qrScratch: Float32Array;
  private samp4 = new Float32Array(4);
  private exner: Float32Array;
  private landMask: Float32Array;
  private plumeCooldown: Float32Array;
  /** Recent flash rate, flashes per minute, decaying over ~5 minutes. */
  private flash: Float32Array;
  private mgLevels: MgLevel[] = [];
  private lastBubbleOpts: InitOptions = { bubbleStrength: 3 };
  radiation: RadiationOptions = { ...DEFAULT_RADIATION };
  /** When true, solar hour stays fixed while physics still advances. */
  clockPaused = false;
  time = 0;
  stepCount = 0;

  constructor(grid: Grid3D) {
    this.grid = grid;
    this.fields = createFields(grid);
    this.tmp = new Float32Array(0);
    this.tmpQv = this.tmp;
    this.tmpQc = this.tmp;
    this.tmpQr = this.tmp;
    this.tmpU = this.tmp;
    this.tmpV = this.tmp;
    this.tmpW = this.tmp;
    this.div = this.tmp;
    this.qrScratch = this.tmp;
    this.exner = this.tmp;
    this.landMask = this.tmp;
    this.plumeCooldown = this.tmp;
    this.flash = this.tmp;
    this.allocWork();
  }

  /** Scratch buffers, land mask, and multigrid levels for the current grid. */
  private allocWork(): void {
    const g = this.grid;
    const n = g.n;
    this.tmp = new Float32Array(n);
    this.tmpQv = new Float32Array(n);
    this.tmpQc = new Float32Array(n);
    this.tmpQr = new Float32Array(n);
    this.tmpU = new Float32Array(g.nu);
    this.tmpV = new Float32Array(g.nv);
    this.tmpW = new Float32Array(g.nw);
    this.div = new Float32Array(n);
    this.qrScratch = new Float32Array(n);
    this.exner = new Float32Array(g.nz);
    this.exner.fill(1);
    this.landMask = buildLandMask(g.nx, g.ny);
    this.plumeCooldown = new Float32Array(g.nx * g.ny);
    this.flash = new Float32Array(g.nx * g.ny);
    this.buildMg();
  }

  private refreshLandMask(): void {
    this.landMask = buildLandMask(
      this.grid.nx,
      this.grid.ny,
      getActiveSynoptic().marine,
    );
  }

  private refreshExner(): void {
    const nz = this.grid.nz;
    const p0 = this.fields.p0;
    for (let k = 0; k < nz; k++) this.exner[k] = exnerFromP(p0[k]);
  }

  rebuild(grid: Grid3D, sounding: SoundingLevel[], opts: InitOptions): void {
    this.grid = grid;
    this.fields = createFields(grid);
    this.time = 0;
    this.stepCount = 0;
    this.lastBubbleOpts = { ...opts };
    this.allocWork();
    initFromSounding(grid, sounding, this.fields, opts);
    this.refreshLandMask();
    this.refreshExner();
  }

  reset(sounding: SoundingLevel[], opts: InitOptions): void {
    this.time = 0;
    this.stepCount = 0;
    const synoptic = opts.synoptic ?? this.lastBubbleOpts.synoptic;
    this.lastBubbleOpts = { ...opts, synoptic };
    initFromSounding(this.grid, sounding, this.fields, this.lastBubbleOpts);
    this.refreshLandMask();
    this.plumeCooldown.fill(0);
    this.flash.fill(0);
    this.refreshExner();
  }

  setRadiation(partial: Partial<RadiationOptions>): void {
    this.radiation = { ...this.radiation, ...partial };
    if (this.radiation.month < 1) this.radiation.month = 1;
    if (this.radiation.month > 12) this.radiation.month = 12;
    this.radiation.latitudeDeg = Math.max(
      -90,
      Math.min(90, this.radiation.latitudeDeg),
    );
    this.radiation.solarHour =
      ((this.radiation.solarHour % 24) + 24) % 24;
  }

  setSolarHour(hour: number): void {
    this.radiation.solarHour = ((hour % 24) + 24) % 24;
  }

  getSolarStatus(): SolarStatus {
    return solarStatus(this.radiation);
  }

  /** Inject a new near-surface initiation bubble into the running sim. */
  respawnBubble(opts?: Partial<InitOptions>): void {
    const strength =
      opts?.bubbleStrength ?? this.lastBubbleOpts.bubbleStrength ?? 3;
    const merged: InitOptions = {
      ...this.lastBubbleOpts,
      ...opts,
      bubbleStrength: Math.max(0.5, strength),
    };
    this.lastBubbleOpts = merged;
    spawnInitBubble(this.grid, this.fields, merged);
  }

  /** Advance simulation by dt seconds. */
  step(dt: number): void {
    const { dx, dy, dz } = this.grid;
    const f = this.fields;
    let maxSpd = 1;
    for (let i = 0; i < f.u.length; i++) {
      const a = Math.abs(f.u[i]);
      if (a > maxSpd) maxSpd = a;
    }
    for (let i = 0; i < f.v.length; i++) {
      const a = Math.abs(f.v[i]);
      if (a > maxSpd) maxSpd = a;
    }
    for (let i = 0; i < f.w.length; i++) {
      const a = Math.abs(f.w[i]);
      if (a > maxSpd) maxSpd = a;
    }
    maxSpd += 15; // rain-fall CFL budget
    const minDx = Math.min(dx, dy, dz);
    const hMax = Math.max(1e-3, (0.85 * minDx) / maxSpd);
    let sub = Math.max(1, Math.ceil(dt / hMax));
    if (sub > 2) sub = 2;
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      this.applyBuoyancy(h);
      this.advectVelocity(h);
      this.project(h);
      this.advectScalars(h);
      applySurfaceRadiation(
        this.grid,
        this.fields,
        h,
        this.radiation,
        this.landMask,
      );
      stepShallowCu(
        this.grid,
        this.fields,
        h,
        this.landMask,
        this.plumeCooldown,
        this.exner,
        this.radiation,
      );
      stepMicrophysics(this.grid, this.fields, h, this.qrScratch, this.exner);
      this.updateLightning(h);
      this.applySponge(h);
      if (!this.clockPaused) {
        this.radiation.solarHour = advanceSolarHour(
          this.radiation.solarHour,
          h,
          this.radiation.diurnalSpeed,
        );
      }
      this.time += h;
      this.stepCount++;
    }
  }

  /** Virtual-θ buoyancy + condensate loading on interior w-faces. */
  private applyBuoyancy(dt: number): void {
    const { nx, ny, nz } = this.grid;
    const f = this.fields;
    const g = G;

    for (let k = 1; k < nz; k++) {
      const th0a = f.theta0[k - 1];
      const th0b = f.theta0[k];
      const qv0a = f.qv0[k - 1];
      const qv0b = f.qv0[k];
      const thv0 = 0.5 * (th0a * (1 + 0.608 * qv0a) + th0b * (1 + 0.608 * qv0b));
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const ida = this.grid.idx(i, j, k - 1);
          const idb = this.grid.idx(i, j, k);
          const tha = f.theta[ida];
          const thb = f.theta[idb];
          const qva = f.qv[ida];
          const qvb = f.qv[idb];
          const thv =
            0.5 *
            (tha * (1 + 0.608 * qva) + thb * (1 + 0.608 * qvb));
          const qc = 0.5 * (f.qc[ida] + f.qc[idb]);
          const qr = 0.5 * (f.qr[ida] + f.qr[idb]);
          const buoy = g * ((thv - thv0) / Math.max(1, thv0) - qc - 1.6 * qr);
          f.w[this.grid.wIdx(i, j, k)] += buoy * dt;
        }
      }
    }
  }

  /**
   * Trilinear sample of four cell-centered fields into samp4.
   * Weights are shared so θ, qv, qc, and qr backtrace once.
   */
  private sampleQuad(
    a: Float32Array,
    b: Float32Array,
    c: Float32Array,
    d: Float32Array,
    x: number,
    y: number,
    z: number,
  ): void {
    const { nx, ny, nz } = this.grid;
    const xx = x < 0 ? 0 : x > nx - 1.001 ? nx - 1.001 : x;
    const yy = y < 0 ? 0 : y > ny - 1.001 ? ny - 1.001 : y;
    const zz = z < 0 ? 0 : z > nz - 1.001 ? nz - 1.001 : z;
    const i0 = xx | 0;
    const j0 = yy | 0;
    const k0 = zz | 0;
    const i1 = i0 + 1 < nx ? i0 + 1 : nx - 1;
    const j1 = j0 + 1 < ny ? j0 + 1 : ny - 1;
    const k1 = k0 + 1 < nz ? k0 + 1 : nz - 1;
    const fx = xx - i0;
    const fy = yy - j0;
    const fz = zz - k0;
    const nxny = nx * ny;
    const row0 = j0 * nx;
    const row1 = j1 * nx;
    const kBase0 = k0 * nxny;
    const kBase1 = k1 * nxny;
    const i00 = kBase0 + row0 + i0;
    const i10 = kBase0 + row0 + i1;
    const i01 = kBase0 + row1 + i0;
    const i11 = kBase0 + row1 + i1;
    const j00 = kBase1 + row0 + i0;
    const j10 = kBase1 + row0 + i1;
    const j01 = kBase1 + row1 + i0;
    const j11 = kBase1 + row1 + i1;
    const omx = 1 - fx;
    const omy = 1 - fy;
    const omz = 1 - fz;
    const out = this.samp4;
    const a00 = a[i00] * omx + a[i10] * fx;
    const a10 = a[i01] * omx + a[i11] * fx;
    const a01 = a[j00] * omx + a[j10] * fx;
    const a11 = a[j01] * omx + a[j11] * fx;
    out[0] = (a00 * omy + a10 * fy) * omz + (a01 * omy + a11 * fy) * fz;
    const b00 = b[i00] * omx + b[i10] * fx;
    const b10 = b[i01] * omx + b[i11] * fx;
    const b01 = b[j00] * omx + b[j10] * fx;
    const b11 = b[j01] * omx + b[j11] * fx;
    out[1] = (b00 * omy + b10 * fy) * omz + (b01 * omy + b11 * fy) * fz;
    const c00 = c[i00] * omx + c[i10] * fx;
    const c10 = c[i01] * omx + c[i11] * fx;
    const c01 = c[j00] * omx + c[j10] * fx;
    const c11 = c[j01] * omx + c[j11] * fx;
    out[2] = (c00 * omy + c10 * fy) * omz + (c01 * omy + c11 * fy) * fz;
    const d00 = d[i00] * omx + d[i10] * fx;
    const d10 = d[i01] * omx + d[i11] * fx;
    const d01 = d[j00] * omx + d[j10] * fx;
    const d11 = d[j01] * omx + d[j11] * fx;
    out[3] = (d00 * omy + d10 * fy) * omz + (d01 * omy + d11 * fy) * fz;
  }

  /** Sample u on its native face grid (coords in face-index space). */
  private sampleU(x: number, y: number, z: number): number {
    const g = this.grid;
    const nxu = g.nx + 1;
    const xx = Math.min(nxu - 1.001, Math.max(0, x));
    const yy = Math.min(g.ny - 1.001, Math.max(0, y));
    const zz = Math.min(g.nz - 1.001, Math.max(0, z));
    const i0 = Math.floor(xx);
    const j0 = Math.floor(yy);
    const k0 = Math.floor(zz);
    const i1 = Math.min(nxu - 1, i0 + 1);
    const j1 = Math.min(g.ny - 1, j0 + 1);
    const k1 = Math.min(g.nz - 1, k0 + 1);
    const fx = xx - i0;
    const fy = yy - j0;
    const fz = zz - k0;
    const arr = this.fields.u;
    const row0 = j0 * nxu;
    const row1 = j1 * nxu;
    const k0b = k0 * nxu * g.ny;
    const k1b = k1 * nxu * g.ny;
    const c000 = arr[k0b + row0 + i0];
    const c100 = arr[k0b + row0 + i1];
    const c010 = arr[k0b + row1 + i0];
    const c110 = arr[k0b + row1 + i1];
    const c001 = arr[k1b + row0 + i0];
    const c101 = arr[k1b + row0 + i1];
    const c011 = arr[k1b + row1 + i0];
    const c111 = arr[k1b + row1 + i1];
    const c00 = c000 * (1 - fx) + c100 * fx;
    const c10 = c010 * (1 - fx) + c110 * fx;
    const c01 = c001 * (1 - fx) + c101 * fx;
    const c11 = c011 * (1 - fx) + c111 * fx;
    const c0 = c00 * (1 - fy) + c10 * fy;
    const c1 = c01 * (1 - fy) + c11 * fy;
    return c0 * (1 - fz) + c1 * fz;
  }

  private sampleV(x: number, y: number, z: number): number {
    const g = this.grid;
    const nyv = g.ny + 1;
    const xx = Math.min(g.nx - 1.001, Math.max(0, x));
    const yy = Math.min(nyv - 1.001, Math.max(0, y));
    const zz = Math.min(g.nz - 1.001, Math.max(0, z));
    const i0 = Math.floor(xx);
    const j0 = Math.floor(yy);
    const k0 = Math.floor(zz);
    const i1 = Math.min(g.nx - 1, i0 + 1);
    const j1 = Math.min(nyv - 1, j0 + 1);
    const k1 = Math.min(g.nz - 1, k0 + 1);
    const fx = xx - i0;
    const fy = yy - j0;
    const fz = zz - k0;
    const arr = this.fields.v;
    const nx = g.nx;
    const row0 = j0 * nx;
    const row1 = j1 * nx;
    const kStride = nx * nyv;
    const k0b = k0 * kStride;
    const k1b = k1 * kStride;
    const c000 = arr[k0b + row0 + i0];
    const c100 = arr[k0b + row0 + i1];
    const c010 = arr[k0b + row1 + i0];
    const c110 = arr[k0b + row1 + i1];
    const c001 = arr[k1b + row0 + i0];
    const c101 = arr[k1b + row0 + i1];
    const c011 = arr[k1b + row1 + i0];
    const c111 = arr[k1b + row1 + i1];
    const c00 = c000 * (1 - fx) + c100 * fx;
    const c10 = c010 * (1 - fx) + c110 * fx;
    const c01 = c001 * (1 - fx) + c101 * fx;
    const c11 = c011 * (1 - fx) + c111 * fx;
    const c0 = c00 * (1 - fy) + c10 * fy;
    const c1 = c01 * (1 - fy) + c11 * fy;
    return c0 * (1 - fz) + c1 * fz;
  }

  private sampleW(x: number, y: number, z: number): number {
    const g = this.grid;
    const nzw = g.nz + 1;
    const xx = Math.min(g.nx - 1.001, Math.max(0, x));
    const yy = Math.min(g.ny - 1.001, Math.max(0, y));
    const zz = Math.min(nzw - 1.001, Math.max(0, z));
    const i0 = Math.floor(xx);
    const j0 = Math.floor(yy);
    const k0 = Math.floor(zz);
    const i1 = Math.min(g.nx - 1, i0 + 1);
    const j1 = Math.min(g.ny - 1, j0 + 1);
    const k1 = Math.min(nzw - 1, k0 + 1);
    const fx = xx - i0;
    const fy = yy - j0;
    const fz = zz - k0;
    const arr = this.fields.w;
    const nx = g.nx;
    const row0 = j0 * nx;
    const row1 = j1 * nx;
    const kStride = nx * g.ny;
    const k0b = k0 * kStride;
    const k1b = k1 * kStride;
    const c000 = arr[k0b + row0 + i0];
    const c100 = arr[k0b + row0 + i1];
    const c010 = arr[k0b + row1 + i0];
    const c110 = arr[k0b + row1 + i1];
    const c001 = arr[k1b + row0 + i0];
    const c101 = arr[k1b + row0 + i1];
    const c011 = arr[k1b + row1 + i0];
    const c111 = arr[k1b + row1 + i1];
    const c00 = c000 * (1 - fx) + c100 * fx;
    const c10 = c010 * (1 - fx) + c110 * fx;
    const c01 = c001 * (1 - fx) + c101 * fx;
    const c11 = c011 * (1 - fx) + c111 * fx;
    const c0 = c00 * (1 - fy) + c10 * fy;
    const c1 = c01 * (1 - fy) + c11 * fy;
    return c0 * (1 - fz) + c1 * fz;
  }

  private advectVelocity(dt: number): void {
    const g = this.grid;
    const f = this.fields;
    const { nx, ny, nz, dx, dy, dz } = g;

    // --- u faces ---
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i <= nx; i++) {
          const id = g.uIdx(i, j, k);
          // Face position in cell-index space: (i-0.5, j, k)
          const uc = f.u[id];
          const vc =
            i === 0
              ? f.v[g.vIdx(0, j, k)] * 0.5 + f.v[g.vIdx(0, j + 1, k)] * 0.5
              : i === nx
                ? f.v[g.vIdx(nx - 1, j, k)] * 0.5 +
                  f.v[g.vIdx(nx - 1, j + 1, k)] * 0.5
                : 0.25 *
                  (f.v[g.vIdx(i - 1, j, k)] +
                    f.v[g.vIdx(i, j, k)] +
                    f.v[g.vIdx(i - 1, j + 1, k)] +
                    f.v[g.vIdx(i, j + 1, k)]);
          const wc =
            i === 0
              ? 0.5 * (f.w[g.wIdx(0, j, k)] + f.w[g.wIdx(0, j, k + 1)])
              : i === nx
                ? 0.5 *
                  (f.w[g.wIdx(nx - 1, j, k)] + f.w[g.wIdx(nx - 1, j, k + 1)])
                : 0.25 *
                  (f.w[g.wIdx(i - 1, j, k)] +
                    f.w[g.wIdx(i, j, k)] +
                    f.w[g.wIdx(i - 1, j, k + 1)] +
                    f.w[g.wIdx(i, j, k + 1)]);
          const x = i - (uc * dt) / dx;
          const y = j - (vc * dt) / dy;
          const z = k - (wc * dt) / dz;
          if (x < 0 || x > nx) {
            const yn = Math.min(ny - 1, Math.max(0, j)) / Math.max(1, ny - 1);
            const s = sampleSynoptic(x < 0 ? 0 : 1, yn, (k + 0.5) * dz);
            this.tmpU[id] = f.u0[k] + s.du;
          } else {
            this.tmpU[id] = this.sampleU(x, y, z);
          }
        }
      }
    }
    // --- v faces (still using pre-advect winds) ---
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j <= ny; j++) {
        for (let i = 0; i < nx; i++) {
          const id = g.vIdx(i, j, k);
          const vc = f.v[id];
          const uc =
            j === 0
              ? 0.5 * (f.u[g.uIdx(i, 0, k)] + f.u[g.uIdx(i + 1, 0, k)])
              : j === ny
                ? 0.5 *
                  (f.u[g.uIdx(i, ny - 1, k)] + f.u[g.uIdx(i + 1, ny - 1, k)])
                : 0.25 *
                  (f.u[g.uIdx(i, j - 1, k)] +
                    f.u[g.uIdx(i + 1, j - 1, k)] +
                    f.u[g.uIdx(i, j, k)] +
                    f.u[g.uIdx(i + 1, j, k)]);
          const wc =
            j === 0
              ? 0.5 * (f.w[g.wIdx(i, 0, k)] + f.w[g.wIdx(i, 0, k + 1)])
              : j === ny
                ? 0.5 *
                  (f.w[g.wIdx(i, ny - 1, k)] + f.w[g.wIdx(i, ny - 1, k + 1)])
                : 0.25 *
                  (f.w[g.wIdx(i, j - 1, k)] +
                    f.w[g.wIdx(i, j, k)] +
                    f.w[g.wIdx(i, j - 1, k + 1)] +
                    f.w[g.wIdx(i, j, k + 1)]);
          const x = i - (uc * dt) / dx;
          const y = j - (vc * dt) / dy;
          const z = k - (wc * dt) / dz;
          if (y < 0 || y > ny) {
            const xn = Math.min(nx - 1, Math.max(0, i)) / Math.max(1, nx - 1);
            const s = sampleSynoptic(xn, y < 0 ? 0 : 1, (k + 0.5) * dz);
            this.tmpV[id] = f.v0[k] + s.dv;
          } else {
            this.tmpV[id] = this.sampleV(x, y, z);
          }
        }
      }
    }

    // --- w faces (still using pre-advect winds) ---
    for (let k = 0; k <= nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const id = g.wIdx(i, j, k);
          if (k === 0 || k === nz) {
            this.tmpW[id] = 0;
            continue;
          }
          const wc = f.w[id];
          const uc =
            0.25 *
            (f.u[g.uIdx(i, j, k - 1)] +
              f.u[g.uIdx(i + 1, j, k - 1)] +
              f.u[g.uIdx(i, j, k)] +
              f.u[g.uIdx(i + 1, j, k)]);
          const vc =
            0.25 *
            (f.v[g.vIdx(i, j, k - 1)] +
              f.v[g.vIdx(i, j + 1, k - 1)] +
              f.v[g.vIdx(i, j, k)] +
              f.v[g.vIdx(i, j + 1, k)]);
          const x = i - (uc * dt) / dx;
          const y = j - (vc * dt) / dy;
          const z = k - (wc * dt) / dz;
          if (x < 0 || x > nx - 1 || y < 0 || y > ny - 1) {
            this.tmpW[id] = 0;
          } else {
            this.tmpW[id] = this.sampleW(x, y, z);
          }
        }
      }
    }

    f.u.set(this.tmpU);
    f.v.set(this.tmpV);
    f.w.set(this.tmpW);

    // Quiet air relaxes toward the hodograph. Stormy cells (condensate or a
    // real θ anomaly) keep their inflow, outflow, and cold-pool winds.
    const baseNudge = Math.min(0.2, 0.01 * dt);
    const nxny = nx * ny;
    const nu = nx + 1;
    const th = f.theta;
    const qc = f.qc;
    const qr = f.qr;
    const th0k = f.theta0;
    for (let k = 0; k < nz; k++) {
      const z = (k + 0.5) * dz;
      const nudge = z < 1500 ? baseNudge * 0.15 : baseNudge;
      const kBase = k * nxny;
      const t0 = th0k[k];
      const ku = k * nu * ny;
      const kv = k * nx * (ny + 1);
      for (let j = 0; j < ny; j++) {
        const row = kBase + j * nx;
        const ju = ku + j * nu;
        for (let i = 0; i <= nx; i++) {
          let storm = false;
          if (i > 0) {
            const c = row + i - 1;
            const dth = th[c] - t0;
            if (qc[c] + qr[c] > 1e-5 || dth > 0.6 || dth < -0.6) storm = true;
          }
          if (!storm && i < nx) {
            const c = row + i;
            const dth = th[c] - t0;
            if (qc[c] + qr[c] > 1e-5 || dth > 0.6 || dth < -0.6) storm = true;
          }
          if (storm) continue;
          const id = ju + i;
          f.u[id] += (f.u0[k] - f.u[id]) * nudge;
        }
      }
      for (let j = 0; j <= ny; j++) {
        const jv = kv + j * nx;
        for (let i = 0; i < nx; i++) {
          let storm = false;
          if (j > 0) {
            const c = kBase + (j - 1) * nx + i;
            const dth = th[c] - t0;
            if (qc[c] + qr[c] > 1e-5 || dth > 0.6 || dth < -0.6) storm = true;
          }
          if (!storm && j < ny) {
            const c = kBase + j * nx + i;
            const dth = th[c] - t0;
            if (qc[c] + qr[c] > 1e-5 || dth > 0.6 || dth < -0.6) storm = true;
          }
          if (storm) continue;
          const id = jv + i;
          f.v[id] += (f.v0[k] - f.v[id]) * nudge;
        }
      }
    }
  }

  /**
   * One backtrace for θ, qv, qc, and qr.
   * Open lateral BC: inflow from the synoptic boundary state, condensate from zero.
   */
  private advectScalars(dt: number): void {
    const g = this.grid;
    const f = this.fields;
    const { nx, ny, nz, dx, dy, dz } = g;
    const nxny = nx * ny;
    const nu = nx + 1;
    const nv = ny + 1;
    const u = f.u;
    const v = f.v;
    const w = f.w;
    const thD = this.tmp;
    const qvD = this.tmpQv;
    const qcD = this.tmpQc;
    const qrD = this.tmpQr;
    const invDx = dt / dx;
    const invDy = dt / dy;
    const invDz = dt / dz;
    const xMax = nx - 1;
    const yMax = ny - 1;
    const samp = this.samp4;

    for (let k = 0; k < nz; k++) {
      const th0 = f.theta0[k];
      const qv0 = f.qv0[k];
      const kBase = k * nxny;
      const ku = k * nu * ny;
      const kv = k * nx * nv;
      const kw = k * nxny;
      const kw1 = (k + 1) * nxny;
      for (let j = 0; j < ny; j++) {
        const jBase = kBase + j * nx;
        const ju = ku + j * nu;
        const jv = kv + j * nx;
        const jv1 = kv + (j + 1) * nx;
        const jw = kw + j * nx;
        const jw1 = kw1 + j * nx;
        for (let i = 0; i < nx; i++) {
          const id = jBase + i;
          const uu = 0.5 * (u[ju + i] + u[ju + i + 1]);
          const vv = 0.5 * (v[jv + i] + v[jv1 + i]);
          const ww = 0.5 * (w[jw + i] + w[jw1 + i]);
          const x = i - uu * invDx;
          const y = j - vv * invDy;
          const z = k - ww * invDz;
          if (x < 0 || x > xMax || y < 0 || y > yMax) {
            const xn = (x < 0 ? 0 : x > xMax ? xMax : i) / Math.max(1, xMax);
            const yn = (y < 0 ? 0 : y > yMax ? yMax : j) / Math.max(1, yMax);
            const s = sampleSynoptic(xn, yn, (k + 0.5) * dz);
            const th = th0 + s.dTheta;
            const p = f.p0[k];
            const qv = qv0 * s.qScale;
            const cap = qsat(TFromTheta(th, p), p) * 0.98;
            thD[id] = th;
            qvD[id] = Math.min(Math.max(0, qv), cap);
            qcD[id] = 0;
            qrD[id] = 0;
          } else {
            this.sampleQuad(f.theta, f.qv, f.qc, f.qr, x, y, z);
            thD[id] = samp[0];
            qvD[id] = samp[1];
            qcD[id] = samp[2];
            qrD[id] = samp[3];
          }
        }
      }
    }
    f.theta.set(thD);
    f.qv.set(qvD);
    f.qc.set(qcD);
    f.qr.set(qrD);
  }

  /**
   * Halve x and y until the coarse grid is at most 16 cells on a side.
   * Density varies only in z, so every level keeps the full column.
   */
  private buildMg(): void {
    const levels: MgLevel[] = [];
    let nx = this.grid.nx;
    let ny = this.grid.ny;
    const nz = this.grid.nz;
    const xExtent = this.grid.xExtent;
    const yExtent = this.grid.yExtent;
    let dx = this.grid.dx;
    let dy = this.grid.dy;
    const dz = this.grid.dz;
    while (true) {
      const n = nx * ny * nz;
      const fine = levels.length === 0;
      levels.push({
        nx,
        ny,
        nz,
        dx,
        dy,
        dz,
        n,
        p: fine ? null : new Float32Array(n),
        rhs: fine ? null : new Float32Array(n),
        resid: new Float32Array(n),
      });
      if (Math.min(nx, ny) <= 16) break;
      const nx2 = nx >> 1;
      const ny2 = ny >> 1;
      if (nx2 < 8 || ny2 < 8) break;
      nx = nx2;
      ny = ny2;
      dx = xExtent / nx;
      dy = yExtent / ny;
    }
    this.mgLevels = levels;
  }

  private setLids(): void {
    const { nx, ny, nz } = this.grid;
    const w = this.fields.w;
    const nxny = nx * ny;
    for (let j = 0; j < ny; j++) {
      const row = j * nx;
      const top = nz * nxny + row;
      for (let i = 0; i < nx; i++) {
        w[row + i] = 0;
        w[top + i] = 0;
      }
    }
  }

  /** Write ∇·(ρ₀ u)/Δt into div. Returns max |∇·u| in 1/s. */
  private fillDivergence(invDt: number): number {
    const g = this.grid;
    const { nx, ny, nz, dx, dy, dz } = g;
    const f = this.fields;
    const div = this.div;
    const nxny = nx * ny;
    const nu = nx + 1;
    const nv = ny + 1;
    const invDx = 1 / dx;
    const invDy = 1 / dy;
    const invDz = 1 / dz;
    let maxKin = 0;
    for (let k = 0; k < nz; k++) {
      const rho = f.rho0[k];
      const rhowB = f.rho0w[k];
      const rhowT = f.rho0w[k + 1];
      const kBase = k * nxny;
      const ku = k * nu * ny;
      const kv = k * nx * nv;
      const kw = k * nxny;
      const kw1 = (k + 1) * nxny;
      for (let j = 0; j < ny; j++) {
        const ju = ku + j * nu;
        const jv = kv + j * nx;
        const jv1 = kv + (j + 1) * nx;
        const jw = kw + j * nx;
        const jw1 = kw1 + j * nx;
        const row = kBase + j * nx;
        for (let i = 0; i < nx; i++) {
          const du = rho * (f.u[ju + i + 1] - f.u[ju + i]) * invDx;
          const dv = rho * (f.v[jv1 + i] - f.v[jv + i]) * invDy;
          const dw = (rhowT * f.w[jw1 + i] - rhowB * f.w[jw + i]) * invDz;
          const kin = du + dv + dw;
          const ak = kin < 0 ? -kin : kin;
          if (ak > maxKin) maxKin = ak;
          div[row + i] = kin * invDt;
        }
      }
    }
    return maxKin;
  }

  private smoothLevel(
    level: MgLevel,
    p: Float32Array,
    rhs: Float32Array,
    iters: number,
  ): void {
    const { nx, ny, nz, dx, dy, dz } = level;
    const dx2 = dx * dx;
    const dy2 = dy * dy;
    const dz2 = dz * dz;
    const rho0 = this.fields.rho0;
    const rho0w = this.fields.rho0w;
    const nxny = nx * ny;

    for (let it = 0; it < iters; it++) {
      for (let k = 0; k < nz; k++) {
        const rho = rho0[k];
        const rhowB = rho0w[k];
        const rhowT = rho0w[k + 1];
        const diag =
          (2 * rho) / dx2 + (2 * rho) / dy2 + rhowT / dz2 + rhowB / dz2;
        const invDiag = 1 / diag;
        const rhoDx = rho / dx2;
        const rhoDy = rho / dy2;
        const rT = rhowT / dz2;
        const rB = rhowB / dz2;
        const kOff = k * nxny;
        const kpOff = k < nz - 1 ? (k + 1) * nxny : kOff;
        const kmOff = k > 0 ? (k - 1) * nxny : kOff;

        if (nx > 2 && ny > 2) {
          for (let j = 1; j < ny - 1; j++) {
            const jOff = kOff + j * nx;
            const jpOff = jOff + nx;
            const jmOff = jOff - nx;
            const jpk = kpOff + j * nx;
            const jmk = kmOff + j * nx;
            for (let i = 1; i < nx - 1; i++) {
              const id = jOff + i;
              const sum =
                rhoDx * (p[id + 1] + p[id - 1]) +
                rhoDy * (p[jpOff + i] + p[jmOff + i]) +
                rT * p[jpk + i] +
                rB * p[jmk + i];
              p[id] = (sum - rhs[id]) * invDiag;
            }
          }
        }

        const relax = (i: number, j: number): void => {
          const ip = i < nx - 1 ? i + 1 : i;
          const im = i > 0 ? i - 1 : i;
          const jp = j < ny - 1 ? j + 1 : j;
          const jm = j > 0 ? j - 1 : j;
          const id = kOff + j * nx + i;
          const sum =
            rhoDx * (p[kOff + j * nx + ip] + p[kOff + j * nx + im]) +
            rhoDy * (p[kOff + jp * nx + i] + p[kOff + jm * nx + i]) +
            rT * p[kpOff + j * nx + i] +
            rB * p[kmOff + j * nx + i];
          p[id] = (sum - rhs[id]) * invDiag;
        };
        for (let i = 0; i < nx; i++) {
          relax(i, 0);
          if (ny > 1) relax(i, ny - 1);
        }
        for (let j = 1; j < ny - 1; j++) {
          relax(0, j);
          if (nx > 1) relax(nx - 1, j);
        }
      }
    }
  }

  private residualLevel(
    level: MgLevel,
    p: Float32Array,
    rhs: Float32Array,
    resid: Float32Array,
  ): void {
    const { nx, ny, nz, dx, dy, dz } = level;
    const dx2 = dx * dx;
    const dy2 = dy * dy;
    const dz2 = dz * dz;
    const rho0 = this.fields.rho0;
    const rho0w = this.fields.rho0w;
    const nxny = nx * ny;
    for (let k = 0; k < nz; k++) {
      const rho = rho0[k];
      const rhowB = rho0w[k];
      const rhowT = rho0w[k + 1];
      const diag =
        (2 * rho) / dx2 + (2 * rho) / dy2 + rhowT / dz2 + rhowB / dz2;
      const rhoDx = rho / dx2;
      const rhoDy = rho / dy2;
      const rT = rhowT / dz2;
      const rB = rhowB / dz2;
      const kOff = k * nxny;
      const kpOff = k < nz - 1 ? (k + 1) * nxny : kOff;
      const kmOff = k > 0 ? (k - 1) * nxny : kOff;
      for (let j = 0; j < ny; j++) {
        const jp = j < ny - 1 ? j + 1 : j;
        const jm = j > 0 ? j - 1 : j;
        for (let i = 0; i < nx; i++) {
          const ip = i < nx - 1 ? i + 1 : i;
          const im = i > 0 ? i - 1 : i;
          const id = kOff + j * nx + i;
          const sum =
            rhoDx * (p[kOff + j * nx + ip] + p[kOff + j * nx + im]) +
            rhoDy * (p[kOff + jp * nx + i] + p[kOff + jm * nx + i]) +
            rT * p[kpOff + j * nx + i] +
            rB * p[kmOff + j * nx + i];
          resid[id] = rhs[id] - sum + diag * p[id];
        }
      }
    }
  }

  /** Average each 2×2 (or edge) block of residual onto the coarse cell. */
  private restrictResidual(fine: MgLevel, coarse: MgLevel): void {
    const acc = coarse.rhs!;
    const wgt = coarse.resid;
    acc.fill(0);
    wgt.fill(0);
    const { nx, ny, nz } = fine;
    const nxc = coarse.nx;
    const nyc = coarse.ny;
    const nxny = nx * ny;
    const cnxny = nxc * nyc;
    const src = fine.resid;
    for (let k = 0; k < nz; k++) {
      const fBase = k * nxny;
      const cBase = k * cnxny;
      for (let j = 0; j < ny; j++) {
        const jc = j >> 1 < nyc ? j >> 1 : nyc - 1;
        const row = fBase + j * nx;
        const cRow = cBase + jc * nxc;
        for (let i = 0; i < nx; i++) {
          const ic = i >> 1 < nxc ? i >> 1 : nxc - 1;
          const idc = cRow + ic;
          acc[idc] += src[row + i];
          wgt[idc] += 1;
        }
      }
    }
    for (let id = 0; id < coarse.n; id++) {
      acc[id] = wgt[id] > 0 ? acc[id] / wgt[id] : 0;
    }
  }

  private prolongAdd(coarse: MgLevel, fineP: Float32Array, fine: MgLevel): void {
    const cp = coarse.p!;
    const { nx, ny, nz } = fine;
    const nxc = coarse.nx;
    const nyc = coarse.ny;
    const nxny = nx * ny;
    const cnxny = nxc * nyc;
    for (let k = 0; k < nz; k++) {
      const fBase = k * nxny;
      const cBase = k * cnxny;
      for (let j = 0; j < ny; j++) {
        const y = j * 0.5;
        let jc0 = y | 0;
        let fy = y - jc0;
        if (jc0 >= nyc - 1) {
          jc0 = nyc - 1;
          fy = 0;
        }
        const jc1 = jc0 + 1 < nyc ? jc0 + 1 : jc0;
        const row0 = cBase + jc0 * nxc;
        const row1 = cBase + jc1 * nxc;
        const fRow = fBase + j * nx;
        const omfy = 1 - fy;
        for (let i = 0; i < nx; i++) {
          const x = i * 0.5;
          let ic0 = x | 0;
          let fx = x - ic0;
          if (ic0 >= nxc - 1) {
            ic0 = nxc - 1;
            fx = 0;
          }
          const ic1 = ic0 + 1 < nxc ? ic0 + 1 : ic0;
          const omx = 1 - fx;
          fineP[fRow + i] +=
            cp[row0 + ic0] * omx * omfy +
            cp[row0 + ic1] * fx * omfy +
            cp[row1 + ic0] * omx * fy +
            cp[row1 + ic1] * fx * fy;
        }
      }
    }
  }

  private vcycle(levelIndex: number): void {
    const level = this.mgLevels[levelIndex];
    const p = levelIndex === 0 ? this.fields.p : level.p!;
    const rhs = levelIndex === 0 ? this.div : level.rhs!;
    const coarsest = levelIndex === this.mgLevels.length - 1;
    if (coarsest) {
      if (levelIndex > 0) p.fill(0);
      this.smoothLevel(level, p, rhs, 4);
      return;
    }
    this.smoothLevel(level, p, rhs, 1);
    this.residualLevel(level, p, rhs, level.resid);
    const coarse = this.mgLevels[levelIndex + 1];
    this.restrictResidual(level, coarse);
    coarse.p!.fill(0);
    this.vcycle(levelIndex + 1);
    this.prolongAdd(coarse, p, level);
    this.smoothLevel(level, p, rhs, 1);
  }

  private correctVelocity(dt: number): void {
    const g = this.grid;
    const { nx, ny, nz, dx, dy, dz } = g;
    const f = this.fields;
    const p = f.p;
    const nxny = nx * ny;
    const nu = nx + 1;
    const nv = ny + 1;
    const invDx = dt / dx;
    const invDy = dt / dy;
    const invDz = dt / dz;
    for (let k = 0; k < nz; k++) {
      const kBase = k * nxny;
      const ku = k * nu * ny;
      const kv = k * nx * nv;
      for (let j = 0; j < ny; j++) {
        const row = kBase + j * nx;
        const ju = ku + j * nu;
        for (let i = 1; i < nx; i++) {
          f.u[ju + i] -= (p[row + i] - p[row + i - 1]) * invDx;
        }
      }
      for (let j = 1; j < ny; j++) {
        const row = kBase + j * nx;
        const rowB = row - nx;
        const jv = kv + j * nx;
        for (let i = 0; i < nx; i++) {
          f.v[jv + i] -= (p[row + i] - p[rowB + i]) * invDy;
        }
      }
    }
    for (let k = 1; k < nz; k++) {
      const rowK = k * nxny;
      const rowB = (k - 1) * nxny;
      const kw = k * nxny;
      for (let j = 0; j < ny; j++) {
        const rj = rowK + j * nx;
        const rb = rowB + j * nx;
        const wj = kw + j * nx;
        for (let i = 0; i < nx; i++) {
          f.w[wj + i] -= (p[rj + i] - p[rb + i]) * invDz;
        }
      }
    }
  }

  /**
   * Anelastic projection: ∇·(ρ₀ ∇π) = ∇·(ρ₀ u*)/Δt, then u -= Δt ∇π.
   * One xy multigrid V-cycle, warm-started from the previous π.
   * A second cycle runs when the divergence is still large.
   */
  /** Divergence on the 2x-coarser grid, sampled from the fine winds. */
  private fillCoarseDivergence(coarse: MgLevel, invDt: number): void {
    const f = this.fields;
    const fineNx = this.grid.nx;
    const fineNy = this.grid.ny;
    const { nx, ny, nz, dx, dy, dz } = coarse;
    const rhs = coarse.rhs!;
    const nu = fineNx + 1;
    const nv = fineNy + 1;
    const nxnyF = fineNx * fineNy;
    const u = f.u;
    const v = f.v;
    const w = f.w;
    const invDx = 1 / dx;
    const invDy = 1 / dy;
    const invDz = 1 / dz;
    const uSj = nu;
    const vSj = fineNx;
    const vSk = fineNx * nv;
    for (let k = 0; k < nz; k++) {
      const rho = f.rho0[k];
      const rhowB = f.rho0w[k];
      const rhowT = f.rho0w[k + 1];
      const uK = k * uSj * fineNy;
      const vK = k * vSk;
      const wK = k * nxnyF;
      const wK1 = (k + 1) * nxnyF;
      const cBase = k * nx * ny;
      for (let J = 0; J < ny; J++) {
        const j0 = J * 2;
        const j1 = j0 + 1 < fineNy ? j0 + 1 : j0;
        const jTop = j0 + 2 <= fineNy ? j0 + 2 : fineNy;
        const row = cBase + J * nx;
        const u0 = uK + j0 * uSj;
        const u1 = uK + j1 * uSj;
        const v0 = vK + j0 * vSj;
        const v1 = vK + jTop * vSj;
        const wb = wK + j0 * fineNx;
        const wb1 = wK + j1 * fineNx;
        const wt = wK1 + j0 * fineNx;
        const wt1 = wK1 + j1 * fineNx;
        for (let I = 0; I < nx; I++) {
          const i0 = I * 2;
          const i1 = i0 + 1 < fineNx ? i0 + 1 : i0;
          const uL = 0.5 * (u[u0 + i0] + u[u1 + i0]);
          const uR = 0.5 * (u[u0 + i0 + 2] + u[u1 + i0 + 2]);
          const vB = 0.5 * (v[v0 + i0] + v[v0 + i1]);
          const vT = 0.5 * (v[v1 + i0] + v[v1 + i1]);
          const wB = 0.25 * (w[wb + i0] + w[wb + i1] + w[wb1 + i0] + w[wb1 + i1]);
          const wT = 0.25 * (w[wt + i0] + w[wt + i1] + w[wt1 + i0] + w[wt1 + i1]);
          rhs[row + I] =
            (rho * (uR - uL) * invDx +
              rho * (vT - vB) * invDy +
              (rhowT * wT - rhowB * wB) * invDz) *
            invDt;
        }
      }
    }
  }

  private project(dt: number): void {
    const invDt = 1 / Math.max(1e-6, dt);
    this.setLids();
    const levels = this.mgLevels;
    if (
      levels.length > 1 &&
      levels[0].nx >= 48 &&
      levels[0].ny >= 48 &&
      (levels[0].nx & 1) === 0 &&
      (levels[0].ny & 1) === 0
    ) {
      const coarse = levels[1];
      this.fillCoarseDivergence(coarse, invDt);
      coarse.p!.fill(0);
      this.vcycle(1);
      this.fields.p.fill(0);
      this.prolongAdd(coarse, this.fields.p, levels[0]);
      this.correctVelocity(dt);
      this.setLids();
      return;
    }
    const max0 = this.fillDivergence(invDt);
    this.vcycle(0);
    this.correctVelocity(dt);
    this.setLids();
    const max1 = this.fillDivergence(invDt);
    if (max1 > 0.08 && max0 > 1e-8 && max1 > 0.5 * max0) {
      // Second cycle is a correction on the leftover divergence, then
      // folded back into π so the next step can warm-start.
      const saved = this.tmp;
      saved.set(this.fields.p);
      this.fields.p.fill(0);
      this.vcycle(0);
      this.correctVelocity(dt);
      const p = this.fields.p;
      for (let i = 0; i < p.length; i++) p[i] += saved[i];
      this.setLids();
    }
  }

  private applySponge(dt: number): void {
    const g = this.grid;
    const { nx, ny, nz } = g;
    const f = this.fields;

    // Upper lid sponge (cell centers for θ; faces for wind)
    const kSponge = Math.floor(nz * 0.75);
    for (let k = kSponge; k < nz; k++) {
      const t = (k - kSponge) / Math.max(1, nz - 1 - kSponge);
      const damp = 0.05 * t * t * dt;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          f.theta[g.idx(i, j, k)] +=
            (f.theta0[k] - f.theta[g.idx(i, j, k)]) * damp * 0.5;
        }
        for (let i = 0; i <= nx; i++) {
          const id = g.uIdx(i, j, k);
          f.u[id] += (f.u0[k] - f.u[id]) * damp;
        }
      }
      for (let j = 0; j <= ny; j++) {
        for (let i = 0; i < nx; i++) {
          const id = g.vIdx(i, j, k);
          f.v[id] += (f.v0[k] - f.v[id]) * damp;
        }
      }
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          f.w[g.wIdx(i, j, k)] *= 1 - damp;
          f.w[g.wIdx(i, j, k + 1)] *= 1 - damp;
        }
      }
    }

    // Thin lateral sponge — winds + condensate only (preserve θ/qv for radiation)
    const rim = Math.min(4, Math.floor(Math.min(nx, ny) / 6));
    if (rim < 1) return;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const di = Math.min(i, nx - 1 - i);
        const dj = Math.min(j, ny - 1 - j);
        const dEdge = Math.min(di, dj);
        if (dEdge >= rim) continue;
        const t = 1 - dEdge / rim;
        const damp = Math.min(0.85, 0.12 * t * t * dt);
        if (damp <= 0) continue;
        for (let k = 0; k < nz; k++) {
          const id = g.idx(i, j, k);
          f.qc[id] *= 1 - damp;
          f.qr[id] *= 1 - damp;
          f.w[g.wIdx(i, j, k)] *= 1 - damp;
          f.w[g.wIdx(i, j, k + 1)] *= 1 - damp;
          f.u[g.uIdx(i, j, k)] +=
            (f.u0[k] - f.u[g.uIdx(i, j, k)]) * damp * 0.5;
          f.u[g.uIdx(i + 1, j, k)] +=
            (f.u0[k] - f.u[g.uIdx(i + 1, j, k)]) * damp * 0.5;
          f.v[g.vIdx(i, j, k)] +=
            (f.v0[k] - f.v[g.vIdx(i, j, k)]) * damp * 0.5;
          f.v[g.vIdx(i, j + 1, k)] +=
            (f.v0[k] - f.v[g.vIdx(i, j + 1, k)]) * damp * 0.5;
        }
      }
    }

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        f.w[g.wIdx(i, j, 0)] = 0;
        f.w[g.wIdx(i, j, nz)] = 0;
      }
    }
  }

  /**
   * Pack the volumetric-cloud field.
   * Axes match the world box: X = east, Y = up, Z = south (north is −Z,
   * so grid j = ny−1 is texture Z = 0).
   * R = liquid, G = ice, B = rain. Warm-rain qc is split by temperature
   * (all liquid at 0°C, all ice at −20°C). 2 g/kg of cloud and 1.5 g/kg of
   * rain pack to 1.0, which is what fieldGain = 1 expects for a dense core.
   * A = max channel, used only by the empty-volume check.
   */
  packVolumeRGBA(out: Uint8Array): void {
    const f = this.fields;
    const { nx, ny, nz, n } = this.grid;
    const ex = this.exner;
    const cloudUnit = 0.002;
    const rainUnit = 0.0015;
    const byte = (q: number, unit: number): number => {
      if (q <= 0) return 0;
      const v = (q / unit) * 255;
      return v >= 255 ? 255 : v | 0;
    };
    const write = (id: number, k: number, o: number): void => {
      const tC = f.theta[id] * ex[k] - 273.15;
      const iceFrac = tC >= 0 ? 0 : tC <= -20 ? 1 : -tC / 20;
      const qc = f.qc[id];
      const liq = byte(qc * (1 - iceFrac), cloudUnit);
      const ice = byte(qc * iceFrac, cloudUnit);
      const rain = byte(f.qr[id], rainUnit);
      out[o] = liq;
      out[o + 1] = ice;
      out[o + 2] = rain;
      const m = liq > ice ? liq : ice;
      out[o + 3] = m > rain ? m : rain;
    };
    if (out.length >= n * 4) {
      for (let k = 0; k < nz; k++) {
        for (let j = 0; j < ny; j++) {
          const row = k + nz * (ny - 1 - j);
          for (let i = 0; i < nx; i++) {
            write(i + nx * (j + ny * k), k, (i + nx * row) * 4);
          }
        }
      }
      return;
    }
    const d = volumeDisplaySize(nx, ny, nz);
    for (let k = 0; k < d.nz; k++) {
      const ks = Math.min(nz - 1, k * d.sz);
      for (let j = 0; j < d.ny; j++) {
        const js = Math.min(ny - 1, j * d.sy);
        const row = k + d.nz * (d.ny - 1 - j);
        for (let i = 0; i < d.nx; i++) {
          const is = Math.min(nx - 1, i * d.sx);
          write(is + nx * (js + ny * ks), ks, (i + d.nx * row) * 4);
        }
      }
    }
  }

  /**
   * Warm-rain lightning proxy. A column with a strong updraft and heavy rain
   * approaches a flash rate; the rate eases off over about 5 minutes.
   */
  private updateLightning(dt: number): void {
    const { nx, ny, nz } = this.grid;
    const f = this.fields;
    const decay = Math.exp(-dt / 300);
    const nxny = nx * ny;
    const w = f.w;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const ij = i + j * nx;
        let wMax = 0;
        let dbz = -30;
        for (let k = 0; k < nz; k++) {
          const id = ij + k * nxny;
          const ww = 0.5 * (w[id] + w[id + nxny]);
          if (ww > wMax) wMax = ww;
          const qr = f.qr[id];
          const qc = f.qc[id];
          if (qr < 1e-5 && qc < 1e-5) continue;
          const d = reflectivityDbz(qr, qc);
          if (d > dbz) dbz = d;
        }
        let next = this.flash[ij] * decay;
        if (wMax > 6 && dbz > 40) {
          const excess = Math.min(1, (dbz - 40) / 30);
          const wFac = Math.min(2, (wMax - 6) / 10);
          const inst = 4 + 16 * excess * wFac;
          next += inst * (1 - decay);
        }
        this.flash[ij] = next;
      }
    }
  }

  /**
   * Discrete flashes from the lightning-hotspot field.
   * `dt` is wall seconds, so bolts appear at every sim speed.
   * At most four channels per call. A strong ground stroke can also
   * carry a sprite, which does not count as its own roll.
   */
  rollLightning(dt: number): LightningStrike[] {
    if (dt <= 0) return [];
    const { nx, ny, nz } = this.grid;
    const f = this.fields;
    const nxny = nx * ny;
    const hits: { i: number; j: number; k: number; rate: number }[] = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const rate = this.flash[i + j * nx];
        if (rate < 0.8) continue;
        const p = 1 - Math.exp(-(rate / 60) * dt);
        if (Math.random() > p) continue;
        let bestK = Math.floor(nz * 0.45);
        let best = -1e9;
        for (let k = 1; k < nz - 1; k++) {
          const id = i + nx * (j + ny * k);
          const score = f.qr[id] * 4 + f.qc[id] + Math.max(0, f.w[id + nxny]) * 0.002;
          if (score > best) {
            best = score;
            bestK = k;
          }
        }
        hits.push({ i, j, k: bestK, rate });
      }
    }
    hits.sort((a, b) => b.rate - a.rate);
    const picked = hits.slice(0, 4);
    const out: LightningStrike[] = [];
    for (const hit of picked) {
      if (out.length >= 4) break;
      out.push({ i: hit.i, j: hit.j, k: hit.k, kind: "cg" });
      if (hit.rate > 8 && out.length < 4 && Math.random() < 0.25) {
        out.push({ i: hit.i, j: hit.j, k: hit.k, kind: "sprite" });
      }
    }
    return out;
  }

  /** Column-max reflectivity (legacy name for 3D radar plane). */
  packRadarComposite(out: Uint8Array): void {
    this.packMapProduct("refl", out);
  }

  /** Pack a 2D map product into RGBA (nx×ny). */
  packMapProduct(id: MapProductId, out: Uint8Array): void {
    const need = this.grid.nx * this.grid.ny * 4;
    if (out.length < need) return;
    if (id === "ltg") {
      packLightning(this.grid, this.flash, out);
      return;
    }
    packMapProductRGBA(id, this.grid, this.fields, out);
  }

  cloudRainStats(): { cloudMax: number; rainMax: number; cloudMass: number } {
    const f = this.fields;
    let cloudMax = 0;
    let rainMax = 0;
    let cloudMass = 0;
    for (let i = 0; i < f.qc.length; i++) {
      if (f.qc[i] > cloudMax) cloudMax = f.qc[i];
      if (f.qr[i] > rainMax) rainMax = f.qr[i];
      cloudMass += f.qc[i] + f.qr[i];
    }
    return { cloudMax, rainMax, cloudMass };
  }
}
