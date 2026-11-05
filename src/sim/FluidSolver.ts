import { Grid3D } from "./Grid3D";
import type { SimBackend, SolverKind, HydrostaticMode } from "./SimBackend";
import {
  SimFields,
  createFields,
  initFromSounding,
  spawnInitBubble,
  InitOptions,
} from "./InitFromSounding";
import { stepMicrophysics } from "./Microphysics";
import { SoundingLevel, G, TFromTheta, exnerFromP, qsat } from "./thermo";
import { domainMotionFromProfile } from "./sounding";
import { getActiveSynoptic, sampleSynoptic, advanceSynoptic, setActiveSynoptic } from "./synoptic";
import type { SynopticSetup } from "./synoptic";
import { stepSynopticForcing, applySynopticPattern } from "./synopticForcing";
import {
  MapProductId,
  packLightning,
  packMapProduct as packMapProductRGBA,
} from "./mapProducts";
import { isPlannedProduct, packChargeProduct, packPlannedProduct } from "./mapPlanned";
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
import {
  stepCloudTopCooling,
  stepBLMixing,
  stepSynopticOmega,
  stepMarineStratus,
} from "./stepDynamics";
import { graupelFallSpeed, stepColdMicrophysics } from "./coldMicrophysics";
import {
  bindColumnFloor,
  bindSurfaceDraw,
  buildHeights,
  nestGrid,
  normalizeNest,
  orographicW,
  relaxFactor,
  oceanMaskOf,
  sampleCover,
  setActiveWater,
  SST_TAU,
  TERRAIN_TAU,
  type NestRect,
  type SurfaceSpec,
} from "./surface";
import { getAdvanced, getToggles } from "./AdvancedSettings";

export type LightningKind = "negcg" | "poscg" | "spider" | "ic" | "sprite";

export interface LightningStrike {
  i: number;
  j: number;
  k: number;
  kind: LightningKind;
  polarity: 1 | -1;
  endI: number;
  endJ: number;
  endK: number;
}

export function isCgKind(kind: LightningKind): boolean {
  return kind === "negcg" || kind === "poscg";
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
export class FluidSolver implements SimBackend {
  grid: Grid3D;
  fields: SimFields;
  private tmp: Float32Array;
  private tmpQv: Float32Array;
  private tmpQc: Float32Array;
  private tmpQr: Float32Array;
  private tmpQi: Float32Array = new Float32Array(0);
  private tmpQs: Float32Array = new Float32Array(0);
  private tmpQg: Float32Array = new Float32Array(0);
  private tmpQh: Float32Array = new Float32Array(0);
  private tmpNi: Float32Array = new Float32Array(0);
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
  /** Persistent net charge density (nC/m³), cell-centred. */
  private charge: Float32Array;
  private tmpCharge: Float32Array;
  /** Column-max |charge|, used to skip empty columns when rolling flashes. */
  private chargeCol: Float32Array;
  readonly kind: SolverKind = "cpu";
  /** Vorticity confinement strength. 0 = off, ~1-5 = noticeable rotation enhancement. */
  vorticityStrength = 0;
  /** Hydrostatic balance mode. "auto" uses hydrostatic balance above ~5 km dx. */
  hydrostatic: HydrostaticMode = "auto";
  radiation: RadiationOptions = { ...DEFAULT_RADIATION };
  /** When true, solar hour stays fixed while physics still advances. */
  clockPaused = false;
  time = 0;
  stepCount = 0;
  private vortScratch: Float32Array = new Float32Array(0);
  private iceScratch: Float32Array = new Float32Array(0);
  private mgLevels: MgLevel[] = [];
  private lastBubbleOpts: InitOptions = { bubbleStrength: 3 };
  /** Domain follows the storm (Galilean frame). */
  private followStorm = false;
  /** Frame velocity over the ground (u east, v north), m/s. */
  private frameU = 0;
  private frameV = 0;
  /** Integrated domain travel over the ground, metres. */
  private groundEast = 0;
  private groundNorth = 0;
  /** Column terrain height (m) and sea fraction, both nx·ny. */
  private heightGrid: Float32Array | null = null;
  private waterGrid: Float32Array | null = null;
  private kindGrid: Float32Array | null = null;
  private tempGrid: Float32Array | null = null;
  private soilGrid: Float32Array | null = null;
  private vegGrid: Float32Array | null = null;
  private openK: Uint16Array | null = null;
  private sstC = 22;
  private nestRect: NestRect | null = null;
  private child: FluidSolver | null = null;
  /** This solver is the one-way nest; it does not advance the parent clock. */
  private nestChild = false;
  private mapDomain: "parent" | "nest" = "parent";

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
    this.charge = this.tmp;
    this.tmpCharge = this.tmp;
    this.chargeCol = this.tmp;
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
    this.tmpQi = new Float32Array(n);
    this.tmpQs = new Float32Array(n);
    this.tmpQg = new Float32Array(n);
    this.tmpQh = new Float32Array(n);
    this.tmpNi = new Float32Array(n);
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
    this.charge = new Float32Array(n);
    this.tmpCharge = new Float32Array(n);
    this.chargeCol = new Float32Array(g.nx * g.ny);
    this.vortScratch = new Float32Array(g.n * 3);
    this.iceScratch = new Float32Array(g.n);
    this.buildMg();
  }

  private refreshLandMask(): void {
    this.landMask = buildLandMask(
      this.grid.nx,
      this.grid.ny,
      getActiveSynoptic().marine,
      this.waterGrid,
    );
    const soil = this.soilGrid;
    const veg = this.vegGrid;
    if (!soil && !veg) return;
    const kind = this.kindGrid;
    const n = this.grid.nx * this.grid.ny;
    for (let s = 0; s < n; s++) {
      if (kind && kind[s] >= 0.5) continue;
      const m = soil ? soil[s] : 0;
      const v = veg ? veg[s] : 0;
      // Mild albedo/roughness shade; Bowen split lives in applySurfaceRadiation.
      const shade = Math.max(0.55, 1 - 0.28 * Math.max(m * 0.6, v * 0.5));
      this.landMask[s] *= shade;
    }
  }

  /** Grid the 3D view draws. The nest, when one is running. */
  get displayGrid(): Grid3D {
    return this.child ? this.child.grid : this.grid;
  }

  get displayFields(): SimFields {
    return this.child ? this.child.fields : this.fields;
  }

  /** Grid the current map product is packed from. */
  get viewGrid(): Grid3D {
    return this.viewSolver.grid;
  }

  get viewFields(): SimFields {
    return this.viewSolver.fields;
  }

  private get viewSolver(): FluidSolver {
    return this.mapDomain === "nest" && this.child ? this.child : this;
  }

  setMapDomain(domain: "parent" | "nest"): void {
    this.mapDomain = domain;
  }

  /** Point map and column products at the grid the user is looking at. */
  prepareView(): void {
    const s = this.viewSolver;
    bindColumnFloor(s.openK, s.grid.nx);
    bindSurfaceDraw(s.heightGrid, s.waterGrid, s.sstC, {
      kind: s.kindGrid,
      temp: s.tempGrid,
      soil: s.soilGrid,
      veg: s.vegGrid,
    });
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
    this.groundEast = 0;
    this.groundNorth = 0;
    this.lastBubbleOpts = { ...opts };
    this.allocWork();
    this.prepareSurface(opts.surface);
    initFromSounding(grid, sounding, this.fields, opts);
    this.finishSurface(opts.surface, sounding, opts);
    this.refreshLandMask();
    this.refreshExner();
    if (this.followStorm) this.applyFrameToWinds(true);
  }

  reset(sounding: SoundingLevel[], opts: InitOptions): void {
    this.time = 0;
    this.stepCount = 0;
    this.groundEast = 0;
    this.groundNorth = 0;
    const synoptic = opts.synoptic ?? this.lastBubbleOpts.synoptic;
    this.lastBubbleOpts = { ...opts, synoptic };
    this.prepareSurface(this.lastBubbleOpts.surface);
    initFromSounding(this.grid, sounding, this.fields, this.lastBubbleOpts);
    this.finishSurface(this.lastBubbleOpts.surface, sounding, this.lastBubbleOpts);
    this.refreshLandMask();
    this.plumeCooldown.fill(0);
    this.flash.fill(0);
    this.charge.fill(0);
    this.chargeCol.fill(0);
    this.refreshExner();
    if (this.followStorm) this.applyFrameToWinds(true);
  }

  setFollowStorm(on: boolean): void {
    if (on === this.followStorm) return;
    if (on) {
      const m = domainMotionFromProfile(
        this.fields.u0,
        this.fields.v0,
        this.grid.dz,
      );
      const gain = getToggles().enableFollowStormGain
        ? Math.max(0.2, getAdvanced().followStormGain)
        : 1;
      this.frameU = m.u * gain;
      this.frameV = m.v * gain;
      this.applyFrameToWinds(true);
      this.followStorm = true;
    } else {
      this.applyFrameToWinds(false);
      this.frameU = 0;
      this.frameV = 0;
      this.followStorm = false;
    }
  }

  getFollowStorm(): boolean {
    return this.followStorm;
  }

  frameOffset(): { east: number; north: number } {
    return { east: this.groundEast, north: this.groundNorth };
  }

  /** Earth shift for the grid the 3D ground is packed from. */
  groundCoverOffset(): { east: number; north: number } {
    return (this.child ?? this).frameOffset();
  }

  /** Subtract (enter) or restore (leave) frame velocity on profile + 3D winds. */
  private applyFrameToWinds(enter: boolean): void {
    const s = enter ? -1 : 1;
    const du = s * this.frameU;
    const dv = s * this.frameV;
    if (du === 0 && dv === 0) return;
    const f = this.fields;
    const nz = this.grid.nz;
    for (let k = 0; k < nz; k++) {
      f.u0[k] += du;
      f.v0[k] += dv;
    }
    for (let i = 0; i < f.u.length; i++) f.u[i] += du;
    for (let i = 0; i < f.v.length; i++) f.v[i] += dv;
  }

  /** Swap the synoptic pattern of the running simulation. */
  setSynoptic(setup: SynopticSetup): void {
    const previous = getActiveSynoptic();
    setActiveSynoptic(setup);
    // Put the new pattern on the fields that are already running: only the
    // difference is applied, so the weather that has developed so far stays.
    applySynopticPattern(this.grid, this.fields, previous, setup);
    this.lastBubbleOpts = { ...this.lastBubbleOpts, synoptic: setup };
    this.refreshLandMask();
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
    if (this.child) this.child.setRadiation(this.radiation);
  }

  setSolarHour(hour: number): void {
    this.radiation.solarHour = ((hour % 24) + 24) % 24;
  }

  getSolarStatus(): SolarStatus {
    return solarStatus(this.radiation);
  }

  /** Inject a new near-surface initiation bubble into the running sim. */
  respawnBubble(opts?: Partial<InitOptions>): void {
    const S = getAdvanced();
    const scaleOn = getToggles().enableBubbleScale;
    const strength =
      (opts?.bubbleStrength ?? this.lastBubbleOpts.bubbleStrength ?? 3) *
      (scaleOn ? S.bubbleStrengthScale : 1);
    const radius =
      (opts?.bubbleRadiusFrac ?? this.lastBubbleOpts.bubbleRadiusFrac ?? 0.18) *
      (scaleOn ? S.bubbleRadiusScale : 1);
    const merged: InitOptions = {
      ...this.lastBubbleOpts,
      ...opts,
      bubbleStrength: Math.max(0.5, strength),
      bubbleRadiusFrac: Math.max(0.05, Math.min(0.45, radius)),
    };
    this.lastBubbleOpts = merged;
    spawnInitBubble(this.grid, this.fields, merged);
  }

  /** Advance simulation by dt seconds. */
  step(dt: number): void {
    const { dx, dy, dz } = this.grid;
    const f = this.fields;
    const horiz = Math.min(dx, dy);
    const isHydrostatic =
      this.hydrostatic === "on" ||
      (this.hydrostatic === "auto" && horiz > 5000);
    const adv = getAdvanced();
    const tog = getToggles();
    const cflLen = isHydrostatic ? horiz : Math.min(horiz, dz);
    const cflSafe =
      0.85 * Math.max(0.5, Math.min(1.5, adv.cflSafety));
    const cellsNow = this.grid.nx * this.grid.ny * this.grid.nz;
    const subCap = isHydrostatic
      ? 4
      : tog.enableCFLClamp
        ? cellsNow > 700_000
          ? 5
          : cellsNow > 400_000
            ? 7
            : 12
        : 24;
    // Wind that already forces the substep cap. Scanning past it cannot shrink h.
    const windStop =
      (subCap * cflSafe * cflLen) / Math.max(dt, 1e-3);
    let maxHorz = peakSpeed(f.u, windStop);
    if (maxHorz < windStop) {
      const vPeak = peakSpeed(f.v, windStop);
      if (vPeak > maxHorz) maxHorz = vPeak;
    }
    let maxVert = 1;
    if (!isHydrostatic && Math.max(maxHorz, 1) < windStop) {
      maxVert = peakSpeed(f.w, windStop);
    }
    // Sedimentation already limits fall to ~1–2 cells/step, so do not let a
    // flat +15 m/s rain budget force dozens of dynamics substeps. On large
    // horizontal grids the Courant length is dx/dy, not dz.
    let hasFall = false;
    const nQr = f.qr.length;
    const stride = Math.max(1, (nQr / 8192) | 0);
    for (let i = 0; i < nQr; i += stride) {
      if (f.qr[i] + f.qg[i] + f.qh[i] > 1e-5) {
        hasFall = true;
        break;
      }
    }
    const wind = isHydrostatic
      ? maxHorz
      : Math.max(maxHorz, maxVert) + (hasFall ? 6 : 1);
    const hMax = Math.max(1e-3, (cflSafe * cflLen) / Math.max(wind, 1));
    let sub = Math.max(1, Math.ceil(dt / hMax));
    // Hard cap keeps a busy high-res frame from exploding into 50+ substeps.
    if (sub > subCap) sub = subCap;
    const pace = tog.enablePhysicsPace
      ? Math.max(0.5, Math.min(2, adv.physicsPace))
      : 1;
    const h = (dt * pace) / sub;
    // Large / coarse domains run slow column physics once per outer step.
    const nCells = this.grid.nx * this.grid.ny * this.grid.nz;
    const slowBase =
      !tog.enableSplitPhysics
        ? 1
        : isHydrostatic || nCells > 700_000
          ? 0
          : nCells > 400_000
            ? 3
            : nCells > 180_000
              ? 2
              : 1;
    const slowEvery =
      slowBase <= 0
        ? 0
        : Math.max(1, Math.round(slowBase / Math.max(0.4, adv.slowPhysicsCadence)));
    let slowDebt = 0;
    for (let s = 0; s < sub; s++) {
      if (!isHydrostatic && tog.enableBuoyancy) this.applyBuoyancy(h);
      if (tog.enableWDamping && adv.wDamping > 1.01) {
        const wd = Math.min(0.08, (adv.wDamping - 1) * 0.02 * h);
        if (wd > 0) {
          const ww = this.fields.w;
          for (let i = 0; i < ww.length; i++) ww[i] *= 1 - wd;
        }
      }
      this.advectVelocity(h);
      const vort = tog.enableVorticity
        ? this.vorticityStrength * Math.max(0, adv.vorticityBoost)
        : 0;
      if (vort > 0) this.applyVorticityConfinement(h, vort);
      // Kinematic terrain BC must hold going into the projection so hills
      // force a divergence-free response instead of a post-hoc divergent nudge.
      this.applyTerrainKinematics(h);
      this.project(h);
      this.applyTerrain(h);
      this.advectScalars(h);
      // Warm rain stays every substep — condensation feeds buoyancy.
      if (tog.enableWarmRain) {
        stepMicrophysics(this.grid, this.fields, h, this.qrScratch, this.exner);
      }
      slowDebt += h;
      const last = s === sub - 1;
      const runSlow =
        slowEvery <= 1
          ? true
          : slowEvery === 0
            ? last
            : last || (s + 1) % slowEvery === 0;
      if (runSlow) {
        const slowDt = slowDebt;
        slowDebt = 0;
        if (tog.enableRadiation) {
          applySurfaceRadiation(
            this.grid,
            this.fields,
            slowDt,
            this.radiation,
            this.landMask,
            {
              height: this.heightGrid,
              openK: this.openK,
              soil: this.soilGrid,
              veg: this.vegGrid,
              kind: this.kindGrid,
              dx: this.grid.dx,
              dy: this.grid.dy,
            },
          );
        }
        if (tog.enableShallowCu) {
          stepShallowCu(
            this.grid,
            this.fields,
            slowDt,
            this.landMask,
            this.plumeCooldown,
            this.exner,
            this.radiation,
          );
        }
        if (tog.enableColdMicro) {
          stepColdMicrophysics(
            this.grid,
            this.fields,
            slowDt,
            this.exner,
            this.iceScratch,
            this.getSolarStatus().sunFrac,
          );
        }
        if (tog.enableCloudTopCooling) {
          stepCloudTopCooling(this.grid, this.fields, slowDt, this.exner);
        }
        if (tog.enableBLMixing) {
          stepBLMixing(this.grid, this.fields, slowDt, this.exner);
        }
        stepSynopticOmega(this.grid, this.fields, slowDt);
        stepMarineStratus(
          this.grid,
          this.fields,
          slowDt,
          this.exner,
          this.landMask,
        );
        if (!this.nestChild && tog.enableSynoptic) {
          advanceSynoptic(slowDt, this.grid.xExtent);
        }
        if (tog.enableCharge) this.updateCharge(slowDt);
      }
      if (tog.enableSponge) this.applySponge(h);
      this.applyTerrain(h);
      if (!this.nestChild && !this.clockPaused) {
        this.radiation.solarHour = advanceSolarHour(
          this.radiation.solarHour,
          h,
          this.radiation.diurnalSpeed,
        );
      }
      this.time += h;
      this.stepCount++;
      if (this.followStorm) {
        this.groundEast += this.frameU * h;
        this.groundNorth += this.frameV * h;
      }
    }
    // The fronts are a slow relaxation of the pattern onto the fields, so
    // they are put back once per step rather than once per sub-step.
    // A nest receives that pattern through its boundary, not a second copy.
    if (!this.nestChild) {
      const t = getToggles();
      if (t.enableSynoptic || t.enableFronts) {
        const force =
          dt *
          (t.enableSynoptic ? Math.max(0.2, getAdvanced().synopticForce) : 0) *
          (t.enableFronts ? Math.max(0.2, getAdvanced().frontForce) : 1);
        if (force > 0) stepSynopticForcing(this.grid, this.fields, force);
      }
    }
    this.stepNest(dt);
  }

  /** Virtual-θ buoyancy + condensate loading on interior w-faces. */
  private applyBuoyancy(dt: number): void {
    const { nx, ny, nz } = this.grid;
    const f = this.fields;
    const open = this.openK;
    const g = G * getAdvanced().buoyancyScale;
    const coldPool = getToggles().enableColdPool
      ? getAdvanced().coldPoolStrength
      : 0;

    for (let k = 1; k < nz; k++) {
      const th0a = f.theta0[k - 1];
      const th0b = f.theta0[k];
      const qv0a = f.qv0[k - 1];
      const qv0b = f.qv0[k];
      const thv0 = 0.5 * (th0a * (1 + 0.608 * qv0a) + th0b * (1 + 0.608 * qv0b));
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          // Face k sits between cells k-1 and k; skip until both are free air.
          if (open && k <= open[i + j * nx]) continue;
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
          const cold =
            0.5 *
            (f.qi[ida] + f.qi[idb] +
              f.qs[ida] + f.qs[idb] +
              f.qg[ida] + f.qg[idb] +
              f.qh[ida] + f.qh[idb]);
          const buoy =
            g *
            ((thv - thv0) / Math.max(1, thv0) -
              qc -
              1.6 * qr * coldPool -
              cold * coldPool);
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

  /** Trilinear sample of a single cell-centred field. */
  private sampleField(
    arr: Float32Array,
    x: number,
    y: number,
    z: number,
  ): number {
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
    const c000 = arr[kBase0 + row0 + i0];
    const c100 = arr[kBase0 + row0 + i1];
    const c010 = arr[kBase0 + row1 + i0];
    const c110 = arr[kBase0 + row1 + i1];
    const c001 = arr[kBase1 + row0 + i0];
    const c101 = arr[kBase1 + row0 + i1];
    const c011 = arr[kBase1 + row1 + i0];
    const c111 = arr[kBase1 + row1 + i1];
    const c00 = c000 * (1 - fx) + c100 * fx;
    const c10 = c010 * (1 - fx) + c110 * fx;
    const c01 = c001 * (1 - fx) + c101 * fx;
    const c11 = c011 * (1 - fx) + c111 * fx;
    return (
      (c00 * (1 - fy) + c10 * fy) * (1 - fz) +
      (c01 * (1 - fy) + c11 * fy) * fz
    );
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

  /**
   * Semi-Lagrangian velocity advection with a mid-point (RK2) backtrace.
   * Reduces cross-wind numerical diffusion vs single-step Euler departure.
   */
  private advectVelocity(dt: number): void {
    const g = this.grid;
    const f = this.fields;
    const { nx, ny, nz, dx, dy, dz } = g;
    const half = 0.5 * dt;
    const open = this.openK;

    // --- u faces ---
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i <= nx; i++) {
          const id = g.uIdx(i, j, k);
          if (open) {
            const iL = i > 0 ? i - 1 : 0;
            const iR = i < nx ? i : nx - 1;
            const kL = open[iL + j * nx];
            const kR = open[iR + j * nx];
            // Face is solid if either adjacent column buries this level.
            if (k < kL || k < kR) {
              this.tmpU[id] = 0;
              continue;
            }
          }
          // Face position in cell-index space: (i-0.5, j, k)
          let uc = f.u[id];
          let vc =
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
          let wc =
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
          // Mid-point estimate of the departure velocity.
          const xm = i - (uc * half) / dx;
          const ym = j - (vc * half) / dy;
          let zm = k - (wc * half) / dz;
          if (open) {
            const ii = Math.min(nx - 1, Math.max(0, i === nx ? nx - 1 : i));
            const jj = Math.min(ny - 1, Math.max(0, j));
            zm = Math.max(open[ii + jj * nx], zm);
          }
          if (xm >= 0 && xm <= nx && ym >= 0 && ym <= ny - 1) {
            uc = this.sampleU(xm, ym, zm);
            vc = this.sampleV(
              Math.min(nx - 1, Math.max(0, xm - 0.5)),
              ym,
              zm,
            );
            wc = this.sampleW(
              Math.min(nx - 1, Math.max(0, xm - 0.5)),
              Math.min(ny - 1, Math.max(0, ym)),
              zm,
            );
          }
          let x = i - (uc * dt) / dx;
          let y = j - (vc * dt) / dy;
          let z = k - (wc * dt) / dz;
          if (open) {
            const ii = Math.min(nx - 1, Math.max(0, i === nx ? nx - 1 : i));
            const jj = Math.min(ny - 1, Math.max(0, j));
            z = Math.max(open[ii + jj * nx], z);
          }
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
    // --- v faces ---
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j <= ny; j++) {
        for (let i = 0; i < nx; i++) {
          const id = g.vIdx(i, j, k);
          if (open) {
            const jB = j > 0 ? j - 1 : 0;
            const jT = j < ny ? j : ny - 1;
            const kB = open[i + jB * nx];
            const kT = open[i + jT * nx];
            if (k < kB || k < kT) {
              this.tmpV[id] = 0;
              continue;
            }
          }
          let vc = f.v[id];
          let uc =
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
          let wc =
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
          const xm = i - (uc * half) / dx;
          const ym = j - (vc * half) / dy;
          let zm = k - (wc * half) / dz;
          if (open) {
            const ii = Math.min(nx - 1, Math.max(0, i));
            const jj = Math.min(ny - 1, Math.max(0, j === ny ? ny - 1 : j));
            zm = Math.max(open[ii + jj * nx], zm);
          }
          if (xm >= 0 && xm <= nx - 1 && ym >= 0 && ym <= ny) {
            uc = this.sampleU(xm, Math.min(ny - 1, Math.max(0, ym - 0.5)), zm);
            vc = this.sampleV(xm, ym, zm);
            wc = this.sampleW(
              Math.min(nx - 1, Math.max(0, xm)),
              Math.min(ny - 1, Math.max(0, ym - 0.5)),
              zm,
            );
          }
          let x = i - (uc * dt) / dx;
          let y = j - (vc * dt) / dy;
          let z = k - (wc * dt) / dz;
          if (open) {
            const ii = Math.min(nx - 1, Math.max(0, i));
            const jj = Math.min(ny - 1, Math.max(0, j === ny ? ny - 1 : j));
            z = Math.max(open[ii + jj * nx], z);
          }
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

    // --- w faces ---
    const height = this.heightGrid;
    for (let k = 0; k <= nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const id = g.wIdx(i, j, k);
          if (k === nz) {
            this.tmpW[id] = 0;
            continue;
          }
          if (k === 0) {
            // Domain floor stays sealed except where sub-grid terrain needs
            // a kinematic flux (openK == 0 but height > 0).
            const s = i + j * nx;
            if (
              open &&
              open[s] === 0 &&
              height &&
              height[s] > 1e-3
            ) {
              this.tmpW[id] = f.w[id];
            } else {
              this.tmpW[id] = 0;
            }
            continue;
          }
          // openK is the first free cell; face k==openK carries orographic w.
          if (open && k < open[i + j * nx]) {
            this.tmpW[id] = 0;
            continue;
          }
          let wc = f.w[id];
          let uc =
            0.25 *
            (f.u[g.uIdx(i, j, k - 1)] +
              f.u[g.uIdx(i + 1, j, k - 1)] +
              f.u[g.uIdx(i, j, k)] +
              f.u[g.uIdx(i + 1, j, k)]);
          let vc =
            0.25 *
            (f.v[g.vIdx(i, j, k - 1)] +
              f.v[g.vIdx(i, j + 1, k - 1)] +
              f.v[g.vIdx(i, j, k)] +
              f.v[g.vIdx(i, j + 1, k)]);
          const xm = i - (uc * half) / dx;
          const ym = j - (vc * half) / dy;
          let zm = k - (wc * half) / dz;
          if (open) zm = Math.max(open[i + j * nx] + 0.5, zm);
          if (xm >= 0 && xm <= nx - 1 && ym >= 0 && ym <= ny - 1) {
            uc = this.sampleU(xm, ym, zm);
            vc = this.sampleV(xm, ym, zm);
            wc = this.sampleW(xm, ym, zm);
          }
          let x = i - (uc * dt) / dx;
          let y = j - (vc * dt) / dy;
          let z = k - (wc * dt) / dz;
          if (open) z = Math.max(open[i + j * nx] + 0.5, z);
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
   * One backtrace for θ, qv, qc, qr, and the cold species qi/qs/qg/qh plus
   * the cloud-ice crystal number ni.
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
    const qiD = this.tmpQi;
    const qsD = this.tmpQs;
    const qgD = this.tmpQg;
    const qhD = this.tmpQh;
    const niD = this.tmpNi;
    const invDx = dt / dx;
    const invDy = dt / dy;
    const invDz = dt / dz;
    const halfDx = 0.5 * invDx;
    const halfDy = 0.5 * invDy;
    const halfDz = 0.5 * invDz;
    const xMax = nx - 1;
    const yMax = ny - 1;
    const samp = this.samp4;
    const open = this.openK;

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
          const kFloor = open ? open[i + j * nx] : 0;
          if (k < kFloor) {
            // Buried under terrain — keep base-state air, no condensate.
            thD[id] = th0;
            qvD[id] = qv0;
            qcD[id] = 0;
            qrD[id] = 0;
            qiD[id] = 0;
            qsD[id] = 0;
            qgD[id] = 0;
            qhD[id] = 0;
            niD[id] = 0;
            continue;
          }
          let uu = 0.5 * (u[ju + i] + u[ju + i + 1]);
          let vv = 0.5 * (v[jv + i] + v[jv1 + i]);
          let ww = 0.5 * (w[jw + i] + w[jw1 + i]);
          // RK2 mid-point departure for less diffusive scalar transport.
          const xm = i - uu * halfDx;
          const ym = j - vv * halfDy;
          let zm = Math.max(kFloor, k - ww * halfDz);
          if (xm >= 0 && xm <= xMax && ym >= 0 && ym <= yMax) {
            const ix = Math.min(xMax, Math.max(0, xm | 0));
            const iy = Math.min(yMax, Math.max(0, ym | 0));
            const iz = Math.min(nz - 1, Math.max(kFloor, zm | 0));
            const juM = iz * nu * ny + iy * nu;
            const jvM = iz * nx * nv + iy * nx;
            const jv1M = iz * nx * nv + (iy + 1 < nv ? iy + 1 : iy) * nx;
            const jwM = iz * nxny + iy * nx;
            const jw1M = Math.min(nz, iz + 1) * nxny + iy * nx;
            uu = 0.5 * (u[juM + ix] + u[juM + Math.min(nx, ix + 1)]);
            vv = 0.5 * (v[jvM + ix] + v[jv1M + ix]);
            ww = 0.5 * (w[jwM + ix] + w[jw1M + ix]);
          }
          const x = i - uu * invDx;
          const y = j - vv * invDy;
          const z = Math.max(kFloor, k - ww * invDz);
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
            qiD[id] = 0;
            qsD[id] = 0;
            qgD[id] = 0;
            qhD[id] = 0;
            niD[id] = 0;
           } else {
             this.sampleQuad(f.theta, f.qv, f.qc, f.qr, x, y, z);
             thD[id] = samp[0];
             qvD[id] = samp[1];
             qcD[id] = samp[2];
             qrD[id] = samp[3];
             this.sampleQuad(f.qi, f.qs, f.qg, f.qh, x, y, z);
             qiD[id] = samp[0];
             qsD[id] = samp[1];
             qgD[id] = samp[2];
             qhD[id] = samp[3];
             niD[id] = this.sampleField(f.ni, x, y, z);
           }
           // Cap per-step theta change to prevent localized transients
           // (e.g. semi-Lagrangian advection across a moving front) from
           // spiking a cell by tens of K in one step.
           const _dth = thD[id] - f.theta[id];
           if (_dth > 3) thD[id] = f.theta[id] + 3;
           else if (_dth < -3) thD[id] = f.theta[id] - 3;
        }
      }
    }
    f.theta.set(thD);
    f.qv.set(qvD);
    f.qc.set(qcD);
    f.qr.set(qrD);
    f.qi.set(qiD);
    f.qs.set(qsD);
    f.qg.set(qgD);
    f.qh.set(qhD);
    f.ni.set(niD);
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
    const open = this.openK;
    const height = this.heightGrid;
    const nxny = nx * ny;
    for (let j = 0; j < ny; j++) {
      const row = j * nx;
      const top = nz * nxny + row;
      for (let i = 0; i < nx; i++) {
        const s = row + i;
        // Preserve kinematic floor flux over unresolved terrain slopes.
        if (!open || open[s] > 0 || !height || height[s] <= 1e-3) {
          w[row + i] = 0;
        }
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
    const open = this.openK;
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
          if (open && k < open[i + j * nx]) {
            div[row + i] = 0;
            continue;
          }
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
    const open = this.openK;
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
          if (open && (k < open[i + j * nx] || k < open[i - 1 + j * nx])) {
            f.u[ju + i] = 0;
            continue;
          }
          f.u[ju + i] -= (p[row + i] - p[row + i - 1]) * invDx;
        }
      }
      for (let j = 1; j < ny; j++) {
        const row = kBase + j * nx;
        const rowB = row - nx;
        const jv = kv + j * nx;
        for (let i = 0; i < nx; i++) {
          if (open && (k < open[i + j * nx] || k < open[i + (j - 1) * nx])) {
            f.v[jv + i] = 0;
            continue;
          }
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
          // Face at openK is the terrain surface — leave its kinematic value.
          if (open && k <= open[i + j * nx]) {
            if (k < open[i + j * nx]) f.w[wj + i] = 0;
            continue;
          }
          f.w[wj + i] -= (p[rj + i] - p[rb + i]) * invDz;
        }
      }
    }
    this.sealBuriedVelocity();
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
    // One cycle is enough when the field was already quiet, or the first
    // pass cut most of the divergence. The second pass is the expensive case.
    if (max0 > 0.15) {
      const max1 = this.fillDivergence(invDt);
      if (max1 > 0.2 && max1 > 0.72 * max0) {
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
  }

  /** Vorticity confinement: amplifies existing rotation to counteract numerical diffusion. */
  private applyVorticityConfinement(dt: number, strength?: number): void {
    const g = this.grid;
    const { nx, ny, nz, dx, dy, dz } = g;
    const f = this.fields;
    const eps = strength ?? this.vorticityStrength;
    const vc = this.vortScratch; // nx*ny*nz * 3: (wx, wy, wz) curl at cell centres
    const n = nx * ny * nz;
    vc.fill(0);
    // Compute curl of velocity at cell centres using centred differences on face velocities
    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const c = i + nx * (j + ny * k);
          // dw/dy - dv/dz
          const wx = (f.w[g.wIdx(i, j + 1, k)] - f.w[g.wIdx(i, j - 1, k)]) / (2 * dy)
                   - (f.v[g.vIdx(i, j, k + 1)] - f.v[g.vIdx(i, j, k - 1)]) / (2 * dz);
          // du/dz - dw/dx
          const wy = (f.u[g.uIdx(i, j, k + 1)] - f.u[g.uIdx(i, j, k - 1)]) / (2 * dz)
                   - (f.w[g.wIdx(i + 1, j, k)] - f.w[g.wIdx(i - 1, j, k)]) / (2 * dx);
          // dv/dx - du/dy
          const wz = (f.v[g.vIdx(i + 1, j, k)] - f.v[g.vIdx(i - 1, j, k)]) / (2 * dx)
                   - (f.u[g.uIdx(i, j + 1, k)] - f.u[g.uIdx(i, j - 1, k)]) / (2 * dy);
          vc[c * 3    ] = wx;
          vc[c * 3 + 1] = wy;
          vc[c * 3 + 2] = wz;
        }
      }
    }
    // Gradient of |omega| then cross with omega to get confinement force
    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const c = i + nx * (j + ny * k);
          const mag = (p: number) => Math.sqrt(vc[p*3]*vc[p*3] + vc[p*3+1]*vc[p*3+1] + vc[p*3+2]*vc[p*3+2]);
          let nx_ = (mag(c + 1) - mag(c - 1)) / (2 * dx);
          let ny_ = (mag(c + nx) - mag(c - nx)) / (2 * dy);
          let nz_ = (mag(c + nx * ny) - mag(c - nx * ny)) / (2 * dz);
          const nl = Math.sqrt(nx_*nx_ + ny_*ny_ + nz_*nz_) + 1e-8;
          nx_ /= nl; ny_ /= nl; nz_ /= nl;
          const wx = vc[c*3], wy = vc[c*3+1], wz = vc[c*3+2];
          // force = eps * (N x omega)
          const fx = eps * (ny_ * wz - nz_ * wy);
          const fy = eps * (nz_ * wx - nx_ * wz);
          const fz = eps * (nx_ * wy - ny_ * wx);
          // Apply to surrounding u/v/w faces
          f.u[g.uIdx(i,   j, k)] -= fx * dt * 0.5;
          f.u[g.uIdx(i+1, j, k)] += fx * dt * 0.5;
          f.v[g.vIdx(i, j,   k)] -= fy * dt * 0.5;
          f.v[g.vIdx(i, j+1, k)] += fy * dt * 0.5;
          f.w[g.wIdx(i, j, k  )] -= fz * dt * 0.5;
          f.w[g.wIdx(i, j, k+1)] += fz * dt * 0.5;
        }
      }
    }
    void n;
  }

  private applySponge(dt: number): void {
    const g = this.grid;
    const { nx, ny, nz } = g;
    const f = this.fields;

    const sponge = getAdvanced().spongeStrength;
    // Upper lid sponge (cell centers for θ; faces for wind)
    const kSponge = Math.floor(nz * 0.75);
    for (let k = kSponge; k < nz; k++) {
      const t = (k - kSponge) / Math.max(1, nz - 1 - kSponge);
      // A long coarse-grid step must relax toward the base state. The old
      // rate*dt form goes past 1 and flips the wind.
      const damp = 1 - Math.exp(-0.05 * t * t * dt * sponge);
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
        const damp = Math.min(0.85, 0.12 * t * t * dt * sponge);
        if (damp <= 0) continue;
        for (let k = 0; k < nz; k++) {
          const id = g.idx(i, j, k);
          f.qc[id] *= 1 - damp;
          f.qr[id] *= 1 - damp;
          f.qi[id] *= 1 - damp;
          f.qs[id] *= 1 - damp;
          f.qg[id] *= 1 - damp;
          f.qh[id] *= 1 - damp;
          f.ni[id] *= 1 - damp;
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
   * R = cloud liquid opacity (MeteoLAB cloudOpacity of qc),
   * G = cold opacity (ice cloud, plus a snow curtain that shows at a few 0.01 g/kg),
   * B = rain ((qr/0.0015)^0.65 → 1.0 so drizzle still curtains).
   * A = hail core (qh / 2 g kg⁻¹, compressed). Particles and the cloud shader
   * read A on its own so hail is not smeared into the ice anvil.
   */
  packVolumeRGBA(out: Uint8Array): void {
    if (this.child) {
      this.child.packVolumeRGBA(out);
      return;
    }
    const f = this.fields;
    const { nx, ny, nz, n } = this.grid;
    // Between stock MeteoLAB (too binary) and over-soft (invisible thin decks).
    const cloudOpacity = (c: number): number =>
      c > 2.5e-5 ? 1 - Math.exp(-(c - 2.5e-5) / 6e-4) : 0;
    // Ice/snow/graupel/hail extinction weights vs liquid (MeteoLAB ICE/SNOW/RIMER).
    const coldOpacity = (id: number): number => {
      const iceCloud = cloudOpacity(0.25 * f.qi[id]);
      const qs = f.qs[id];
      const snow = qs > 1e-8 ? Math.min(1, Math.pow(qs / 0.00015, 0.55)) : 0;
      const graupel = cloudOpacity(0.2 * f.qg[id]);
      return Math.min(1, iceCloud + snow * 0.85 + graupel);
    };
    // Rain channel saturates near 1.5 g/kg. M^0.65 boosts drizzle so a few-dBZ
    // shaft still packs a transparent curtain instead of vanishing to 0.
    const rainUnit = 0.0015;
    const byte01 = (v: number): number => {
      if (v <= 0) return 0;
      const x = v * 255;
      return x >= 255 ? 255 : x | 0;
    };
    const rainByte = (qr: number): number => {
      if (qr <= 0) return 0;
      const x = Math.pow(qr / rainUnit, 0.65) * 255;
      return x >= 255 ? 255 : x | 0;
    };
    // Hail core. 2 g/kg reads as a solid core; lighter hail stays translucent.
    const hailByte = (qh: number): number => {
      if (qh <= 1e-7) return 0;
      const x = Math.pow(qh / 0.0008, 0.65) * 255;
      return x >= 255 ? 255 : x | 0;
    };
    const write = (id: number, _k: number, o: number): void => {
      out[o] = byte01(cloudOpacity(f.qc[id]));
      out[o + 1] = byte01(coldOpacity(id));
      out[o + 2] = rainByte(f.qr[id]);
      out[o + 3] = hailByte(f.qh[id]);
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
   * Persistent charge: non-inductive graupel–ice charging, slow advection,
   * graupel sedimentation, and weak recombination. The 2D flash field is
   * only a recent-discharge diagnostic (updated when a flash fires).
   */
  private updateCharge(dt: number): void {
    if (dt <= 0) return;
    const { nx, ny, nz, dx, dy, dz } = this.grid;
    const f = this.fields;
    const nxny = nx * ny;
    const q = this.charge;
    const dest = this.tmpCharge;
    const S = getAdvanced();
    const recomb = Math.exp(-dt / (600 / Math.max(0.3, S.recombination)));
    const T_REV = 258.15;
    const T_MELT = 273.15;
    const CAP = S.chargeCap;

    for (let k = 0; k < nz; k++) {
      const p = f.p0[k];
      const kBase = k * nxny;
      for (let j = 0; j < ny; j++) {
        const row = kBase + j * nx;
        for (let i = 0; i < nx; i++) {
          const id = row + i;
          let c = q[id] * recomb;
          const rimer = f.qg[id] + f.qh[id];
          const ice = f.qi[id] + 0.7 * f.qs[id];
          if (rimer > 1e-6 && ice > 5e-8) {
            const T = TFromTheta(f.theta[id], p);
            if (T < T_MELT) {
              const rimerN = Math.min(1, rimer / 2e-3);
              const iceN = Math.min(1, ice / 4e-4);
              const lwcN = Math.min(1, f.qc[id] / 5e-4);
              const mag =
                1.1 *
                S.chargeRate *
                rimerN *
                iceN *
                (0.25 + 0.75 * lwcN) *
                dt;
              if (T < T_REV) {
                c -= mag * 0.58;
                if (k + 1 < nz) q[id + nxny] += mag * 0.48;
                else c += mag * 0.2;
              } else {
                c += mag * 0.58;
                if (k + 1 < nz) q[id + nxny] -= mag * 0.48;
              }
            }
          }
          q[id] = c;
        }
      }
    }

    const u = f.u;
    const v = f.v;
    const w = f.w;
    const nu = nx + 1;
    const nv = ny + 1;
    const invDx = dt / dx;
    const invDy = dt / dy;
    const invDz = dt / dz;
    const xMax = nx - 1;
    const yMax = ny - 1;
    for (let k = 0; k < nz; k++) {
      const kBase = k * nxny;
      const ku = k * nu * ny;
      const kv = k * nx * nv;
      for (let j = 0; j < ny; j++) {
        const row = kBase + j * nx;
        const ju = ku + j * nu;
        const jv = kv + j * nx;
        const jv1 = kv + (j + 1) * nx;
        const jw = kBase + j * nx;
        const jw1 = kBase + nxny + j * nx;
        for (let i = 0; i < nx; i++) {
          const uu = 0.5 * (u[ju + i] + u[ju + i + 1]);
          const vv = 0.5 * (v[jv + i] + v[jv1 + i]);
          const ww = 0.5 * (w[jw + i] + w[jw1 + i]);
          const x = i - uu * invDx;
          const y = j - vv * invDy;
          const z = k - ww * invDz;
          dest[row + i] =
            x < 0 || x > xMax || y < 0 || y > yMax
              ? 0
              : this.sampleField(q, x, y, z);
        }
      }
    }
    q.set(dest);

    dest.set(q);
    for (let k = 1; k < nz; k++) {
      const rho = f.rho0[k];
      const kBase = k * nxny;
      const kDown = (k - 1) * nxny;
      for (let j = 0; j < ny; j++) {
        const row = kBase + j * nx;
        const down = kDown + j * nx;
        for (let i = 0; i < nx; i++) {
          const id = row + i;
          const rimer = f.qg[id] + f.qh[id];
          if (rimer < 1e-7) continue;
          const vt = graupelFallSpeed(rimer, rho);
          if (vt <= 0) continue;
          const ice = f.qi[id] + f.qs[id];
          const fracG = rimer / (rimer + ice + 1e-9);
          const moved = q[id] * Math.min(0.9, (vt * dt) / dz) * fracG;
          dest[id] -= moved;
          dest[down + i] += moved;
        }
      }
    }
    q.set(dest);

    const flashDecay = Math.exp(-dt / Math.max(60, getAdvanced().flashDecay));
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const ij = i + j * nx;
        let peak = 0;
        for (let k = 0; k < nz; k++) {
          const c = q[ij + k * nxny];
          if (c > CAP) q[ij + k * nxny] = CAP;
          else if (c < -CAP) q[ij + k * nxny] = -CAP;
          const a = Math.abs(q[ij + k * nxny]);
          if (a > peak) peak = a;
        }
        this.chargeCol[ij] = peak;
        this.flash[ij] *= flashDecay;
      }
    }
  }

  /**
   * Discrete flashes from the charge field.
   * `dt` is wall seconds, so bolts appear at every sim speed.
   * At most four channels per call. A strong +CG can also carry a sprite.
   */
  /** Flashes for the grid the 3D view is showing. */
  rollDisplayLightning(dt: number): LightningStrike[] {
    return (this.child ?? this).rollLightning(dt);
  }

  rollLightning(dt: number): LightningStrike[] {
    if (dt <= 0) return [];
    const lightningTog = getToggles();
    if (!lightningTog.enableLightning) return [];
    const { nx, ny, nz, dz } = this.grid;
    const f = this.fields;
    const nxny = nx * ny;
    const q = this.charge;
    const hits: {
      i: number;
      j: number;
      k: number;
      endI: number;
      endJ: number;
      endK: number;
      kind: LightningKind;
      polarity: 1 | -1;
      score: number;
    }[] = [];

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const ij = i + j * nx;
        if (this.chargeCol[ij] < getAdvanced().flashThreshold) continue;

        let qLower = 0;
        let qMid = 0;
        let qUpper = 0;
        let kNeg = 0;
        let minQ = 0;
        let kPosU = 0;
        let maxQu = 0;
        let kPosL = 0;
        let maxQl = 0;
        let topK = 1;
        let wMax = 0;
        let shaft = 0;
        for (let k = 1; k < nz - 1; k++) {
          const id = ij + k * nxny;
          const T = TFromTheta(f.theta[id], f.p0[k]) - 273.15;
          const c = q[id];
          const cond =
            f.qc[id] + f.qr[id] + f.qi[id] + f.qs[id] + f.qg[id] + f.qh[id];
          if (cond > 1e-4) topK = k;
          const ww = 0.5 * (f.w[id] + f.w[id + nxny]);
          if (ww > wMax) wMax = ww;
          if (T > -8) {
            qLower += c;
            if (c > maxQl) {
              maxQl = c;
              kPosL = k;
            }
            shaft += f.qr[id] + f.qg[id] + f.qh[id];
          } else if (T > -28) {
            qMid += c;
            if (c < minQ) {
              minQ = c;
              kNeg = k;
            }
          } else {
            qUpper += c;
            if (c > maxQu) {
              maxQu = c;
              kPosU = k;
            }
          }
        }
        if (!kNeg) kNeg = Math.max(1, Math.floor(nz * 0.4));
        if (!kPosU) kPosU = Math.max(kNeg + 1, Math.min(nz - 2, topK));
        if (!kPosL) kPosL = Math.max(1, Math.floor(kNeg * 0.45));

        let anvil = 0;
        const anvilGate = lightningTog.enableAnvilLightning
          ? 0.3 / Math.max(0.25, getAdvanced().anvilBias)
          : 1e9;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const ni = i + di;
            const nj = j + dj;
            if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
            if (this.chargeCol[ni + nj * nx] > anvilGate) anvil++;
          }
        }

        const H = Math.max(800, Math.abs(kPosU - kNeg) * dz);
        const zMid = Math.max(800, (kNeg + 0.5) * dz);
        const zAnvil = Math.max(1200, (kPosU + 0.5) * dz);
        const eIc = (Math.abs(qUpper - qMid) / (H * H)) * 4e6;
        const eNeg =
          minQ < -1 && shaft > 2e-4
            ? (Math.abs(qMid) / (zMid * zMid)) * 3e6
            : 0;
        let ePos = 0;
        if (maxQu > 1.2 && (wMax < 14 || anvil >= 2 || maxQl > 2)) {
          ePos = (Math.abs(qUpper) / (zAnvil * zAnvil)) * 2.2e6;
        }
        if (maxQl > 3 && minQ > -2) {
          ePos = Math.max(ePos, (maxQl / (zMid * zMid)) * 2e6);
        }
        const eSpi =
          qUpper > 2 && anvil >= 3 && wMax < 12 ? qUpper * anvil * 0.12 : 0;
        const eBest = Math.max(eIc, eNeg, ePos, eSpi);
        if (eBest < 0.6) continue;
        const rate = Math.min(36, 2 + eBest * 3);
        if (Math.random() > 1 - Math.exp(-(rate / 60) * dt)) continue;

        const cg = Math.max(0.2, getAdvanced().cgFraction);
        const wIc = lightningTog.enableIC ? (eIc * 1.6) / cg : 0;
        const wNeg = lightningTog.enableCG ? eNeg * 0.85 * cg : 0;
        const wPos = lightningTog.enableCG ? ePos * 0.28 * cg : 0;
        const wSpi = lightningTog.enableSpider
          ? eSpi * 0.4 * getAdvanced().anvilBias
          : 0;
        if (wIc + wNeg + wPos + wSpi <= 0) continue;
        const tot = wIc + wNeg + wPos + wSpi;
        let r = Math.random() * Math.max(1e-6, tot);
        let kind: LightningKind = "ic";
        let polarity: 1 | -1 = qUpper >= -qMid ? 1 : -1;
        let k = kNeg;
        let endI = i;
        let endJ = j;
        let endK = Math.max(kNeg + 4, kPosU, Math.min(nz - 2, topK));
        const clampI = (v: number) => Math.max(0, Math.min(nx - 1, v));
        const clampJ = (v: number) => Math.max(0, Math.min(ny - 1, v));
        const stepAway = (minCells: number, extra: number) => {
          const cells = minCells + Math.floor(Math.random() * extra);
          const ang = Math.random() * Math.PI * 2;
          return {
            i: clampI(i + Math.round(Math.cos(ang) * cells)),
            j: clampJ(j + Math.round(Math.sin(ang) * cells)),
          };
        };
        r -= wIc;
        if (r > 0) {
          r -= wNeg;
          if (r <= 0) {
            kind = "negcg";
            polarity = -1;
            k = kNeg;
            endK = 1;
          } else {
            r -= wPos;
            if (r <= 0) {
              kind = "poscg";
              polarity = 1;
              k = Math.max(kPosU, Math.min(nz - 2, topK), kNeg + 5);
              endK = 1;
              const ground = stepAway(2, 4);
              endI = ground.i;
              endJ = ground.j;
            } else {
              kind = "spider";
              polarity = 1;
              k = Math.max(kPosU, Math.min(nz - 2, topK));
              endK = k;
              const crawl = stepAway(8, 10);
              let ci = i;
              let cj = j;
              const di = Math.sign(crawl.i - i) || (Math.random() < 0.5 ? -1 : 1);
              const dj = Math.sign(crawl.j - j) || (Math.random() < 0.5 ? -1 : 1);
              const steps = Math.max(
                8,
                Math.abs(crawl.i - i) + Math.abs(crawl.j - j),
              );
              for (let s = 0; s < steps; s++) {
                let bestI = clampI(ci + di);
                let bestJ = clampJ(cj + dj);
                let bestC = -1e9;
                for (let oj = -1; oj <= 1; oj++) {
                  for (let oi = -1; oi <= 1; oi++) {
                    const ni = clampI(ci + di + oi);
                    const nj = clampJ(cj + dj + oj);
                    if (ni === ci && nj === cj) continue;
                    const cq = q[ni + nx * (nj + ny * k)];
                    if (cq > bestC) {
                      bestC = cq;
                      bestI = ni;
                      bestJ = nj;
                    }
                  }
                }
                ci = bestI;
                cj = bestJ;
              }
              endI = ci;
              endJ = cj;
            }
          }
        } else {
          const icEnd = stepAway(3, 5);
          endI = icEnd.i;
          endJ = icEnd.j;
        }

        hits.push({
          i,
          j,
          k,
          endI,
          endJ,
          endK,
          kind,
          polarity,
          score: eBest,
        });
      }
    }

    hits.sort((a, b) => b.score - a.score);
    const out: LightningStrike[] = [];
    for (const hit of hits) {
      if (out.length >= 4) break;
      const frac =
        hit.kind === "ic"
          ? 0.45
          : hit.kind === "negcg"
            ? 0.55
            : hit.kind === "poscg"
              ? 0.5
              : 0.4;
      this.neutralizeCharge(
        hit.i,
        hit.j,
        hit.k,
        hit.endI,
        hit.endJ,
        hit.endK,
        frac,
      );
      const ij = hit.i + hit.j * nx;
      this.flash[ij] += Math.min(18, 5 + hit.score);
      out.push({
        i: hit.i,
        j: hit.j,
        k: hit.k,
        kind: hit.kind,
        polarity: hit.polarity,
        endI: hit.endI,
        endJ: hit.endJ,
        endK: hit.endK,
      });
      if (
        hit.kind === "poscg" &&
        hit.score > 8 &&
        out.length < 4 &&
        Math.random() < 0.08
      ) {
        out.push({
          i: hit.i,
          j: hit.j,
          k: hit.k,
          kind: "sprite",
          polarity: 1,
          endI: hit.i,
          endJ: hit.j,
          endK: hit.k,
        });
      }
    }
    return out;
  }

  /** Reduce |charge| in a Gaussian neighborhood along a channel path. */
  private neutralizeCharge(
    i0: number,
    j0: number,
    k0: number,
    i1: number,
    j1: number,
    k1: number,
    fraction: number,
  ): void {
    const { nx, ny, nz } = this.grid;
    const nxny = nx * ny;
    const steps = Math.max(
      8,
      Math.abs(k1 - k0) + Math.abs(i1 - i0) + Math.abs(j1 - j0),
    );
    const frac = Math.min(0.85, Math.max(0.1, fraction));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const ic = Math.round(i0 + (i1 - i0) * t);
      const jc = Math.round(j0 + (j1 - j0) * t);
      const kc = Math.round(k0 + (k1 - k0) * t);
      for (let dk = -1; dk <= 1; dk++) {
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const i = ic + di;
            const j = jc + dj;
            const k = kc + dk;
            if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) {
              continue;
            }
            const w = Math.exp(-0.5 * (di * di + dj * dj + dk * dk));
            this.charge[i + nx * (j + ny * k)] *= 1 - frac * w;
          }
        }
      }
    }
    for (let j = Math.max(0, j0 - 1); j <= Math.min(ny - 1, j0 + 1); j++) {
      for (let i = Math.max(0, i0 - 1); i <= Math.min(nx - 1, i0 + 1); i++) {
        let peak = 0;
        const ij = i + j * nx;
        for (let k = 0; k < nz; k++) {
          const a = Math.abs(this.charge[ij + k * nxny]);
          if (a > peak) peak = a;
        }
        this.chargeCol[ij] = peak;
      }
    }
  }

  /** Column-max reflectivity (legacy name for 3D radar plane). */
  private prepareSurface(spec: SurfaceSpec | null | undefined): void {
    if (this.nestChild) return;
    setActiveWater(oceanMaskOf(spec ?? null));
  }

  private finishSurface(
    spec: SurfaceSpec | null | undefined,
    sounding: SoundingLevel[],
    opts: InitOptions,
  ): void {
    this.child = null;
    this.nestRect = null;
    this.heightGrid = null;
    this.waterGrid = null;
    this.kindGrid = null;
    this.tempGrid = null;
    this.soilGrid = null;
    this.vegGrid = null;
    this.openK = null;
    if (!spec || this.nestChild) return;
    this.installHeights(spec, 0, 0, 1, 1);
    if (!spec.nest) return;
    const nest = normalizeNest(spec.nest);
    this.nestRect = nest;
    const cg = nestGrid(this.grid, nest);
    const child = new FluidSolver(cg);
    child.nestChild = true;
    child.rebuild(cg, sounding, {
      bubbleStrength: opts.bubbleStrength,
      synoptic: opts.synoptic,
    });
    child.hydrostatic = this.hydrostatic;
    child.setRadiation(this.radiation);
    child.installHeights(spec, nest.x0, nest.y0, nest.x1, nest.y1);
    this.child = child;
    this.blendChild(true);
  }

  private installHeights(
    spec: SurfaceSpec,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): void {
    this.sstC = spec.sstC ?? 22;
    const cover = sampleCover(spec, this.grid.nx, this.grid.ny, x0, y0, x1, y1);
    this.kindGrid = cover.anyWater ? cover.kind : null;
    this.tempGrid = cover.anyWater ? cover.waterTemp : null;
    this.soilGrid = cover.anySoil ? cover.soil : null;
    this.vegGrid = cover.anyVeg ? cover.veg : null;
    this.waterGrid = cover.anyWater ? cover.water : null;
    const built = buildHeights(
      spec.terrain,
      cover.ocean,
      this.grid,
      x0,
      y0,
      x1,
      y1,
    );
    this.heightGrid = built.height;
    this.openK = built.openK;
    this.refreshLandMask();
    this.sealBuriedVelocity();
    this.clearBuriedScalars();
  }

  /** Zero winds inside the terrain mask (solid cells and their faces). */
  private sealBuriedVelocity(): void {
    const open = this.openK;
    if (!open) return;
    const g = this.grid;
    const f = this.fields;
    const { nx, ny } = g;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const kOpen = open[i + j * nx];
        for (let k = 0; k < kOpen; k++) {
          f.u[g.uIdx(i, j, k)] = 0;
          f.u[g.uIdx(i + 1, j, k)] = 0;
          f.v[g.vIdx(i, j, k)] = 0;
          f.v[g.vIdx(i, j + 1, k)] = 0;
          f.w[g.wIdx(i, j, k)] = 0;
        }
      }
    }
  }

  /** Reset hydrometeors / θ / qv under terrain so buried air cannot leak. */
  private clearBuriedScalars(): void {
    const open = this.openK;
    if (!open || !getToggles().enableBuriedReset) return;
    const g = this.grid;
    const f = this.fields;
    const { nx, ny } = g;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const kOpen = open[i + j * nx];
        for (let k = 0; k < kOpen; k++) {
          const id = g.idx(i, j, k);
          f.qc[id] = 0;
          f.qr[id] = 0;
          f.qi[id] = 0;
          f.qs[id] = 0;
          f.qg[id] = 0;
          f.qh[id] = 0;
          f.ni[id] = 0;
          f.theta[id] = f.theta0[k];
          f.qv[id] = f.qv0[k];
        }
      }
    }
  }

  /**
   * Hard kinematic terrain BC applied before projection:
   * seal buried faces and set surface w = u·∇h (plus a short lee-wave stack).
   */
  private applyTerrainKinematics(dt: number): void {
    const height = this.heightGrid;
    const open = this.openK;
    if (!height || !open) return;
    const g = this.grid;
    const f = this.fields;
    const { nx, ny, nz, dx, dy } = g;
    const S = getAdvanced();
    const T = getToggles();
    this.sealBuriedVelocity();
    if (!T.enableOrographic && !T.enableLeeWaves) return;
    const aw = relaxFactor(dt, TERRAIN_TAU / Math.max(0.3, S.terrainTau));
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const kOpen = open[i + j * nx];
        if (kOpen >= nz) continue;
        const uSurf = g.uCenter(f.u, i, j, kOpen);
        const vSurf = g.vCenter(f.v, i, j, kOpen);
        const target0 = T.enableOrographic
          ? orographicW(height, nx, ny, i, j, dx, dy, uSurf, vSurf) *
            S.orographicLift
          : 0;
        const waveLayers = T.enableLeeWaves
          ? Math.max(1, Math.min(6, Math.round(4 * S.leeWaveDepth)))
          : target0 !== 0
            ? 1
            : 0;
        for (let dk = 0; dk < waveLayers && kOpen + dk < nz; dk++) {
          const k = kOpen + dk;
          const face = g.wIdx(i, j, k);
          const decay = Math.exp(-dk * (0.85 / Math.max(0.5, S.leeWaveDepth)));
          const tgt = target0 * decay;
          // Surface face is a hard BC; aloft uses the usual terrain relax.
          if (dk === 0) f.w[face] = tgt;
          else f.w[face] += (tgt - f.w[face]) * aw * 0.55 * decay;
        }
      }
    }
  }

  /**
   * Terrain coupling after the revamp:
   *  - zero winds/condensate under the height field
   *  - orographic lift decaying through the first few open levels
   *  - surface drag on the lowest free layer
   *  - anabatic / katabatic slope winds from near-surface θ anomalies
   *  - SST / soil moisture exchange at the first open cell
   */
  private applyTerrain(dt: number): void {
    const height = this.heightGrid;
    const open = this.openK;
    if (!height || !open) return;
    const g = this.grid;
    const f = this.fields;
    const { nx, ny, nz, dx, dy } = g;
    const S = getAdvanced();
    const T = getToggles();
    const aw = relaxFactor(dt, TERRAIN_TAU / Math.max(0.3, S.terrainTau));
    const asst = T.enableSST
      ? relaxFactor(dt, SST_TAU / Math.max(0.3, S.sstTau))
      : 0;
    const drag = T.enableTerrainDrag
      ? relaxFactor(dt, 280 / Math.max(0.2, S.terrainDrag))
      : 0;
    const water = this.waterGrid;
    const hAt = (ii: number, jj: number) =>
      height[
        Math.max(0, Math.min(nx - 1, ii)) +
          nx * Math.max(0, Math.min(ny - 1, jj))
      ];

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const s = i + j * nx;
        const kOpen = open[s];
        for (let k = 0; k < kOpen; k++) {
          f.u[g.uIdx(i, j, k)] = 0;
          f.u[g.uIdx(i + 1, j, k)] = 0;
          f.v[g.vIdx(i, j, k)] = 0;
          f.v[g.vIdx(i, j + 1, k)] = 0;
          f.w[g.wIdx(i, j, k)] = 0;
          if (!T.enableBuriedReset) continue;
          const id = g.idx(i, j, k);
          f.qc[id] = 0;
          f.qr[id] = 0;
          f.qi[id] = 0;
          f.qs[id] = 0;
          f.qg[id] = 0;
          f.qh[id] = 0;
          f.ni[id] = 0;
          // Keep underground θ/qv near the free-air base so leaks don't seed storms.
          f.theta[id] = f.theta0[k];
          f.qv[id] = f.qv0[k];
        }
        const dhdx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * dx);
        const dhdy = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * dy);
        const slope = Math.hypot(dhdx, dhdy);

        const kWind = kOpen < nz ? kOpen : nz - 1;
        const uSurf = g.uCenter(f.u, i, j, kWind);
        const vSurf = g.vCenter(f.v, i, j, kWind);
        const target0 = T.enableOrographic
          ? orographicW(height, nx, ny, i, j, dx, dy, uSurf, vSurf) *
            S.orographicLift
          : 0;
        // Lift decays over ~3 layers so hills force a deeper wave than one face.
        const waveLayers = T.enableLeeWaves
          ? Math.max(1, Math.min(6, Math.round(4 * S.leeWaveDepth)))
          : target0 !== 0
            ? 1
            : 0;
        for (let dk = 0; dk < waveLayers && kOpen + dk < nz; dk++) {
          const k = kOpen + dk;
          const face = g.wIdx(i, j, k);
          const decay = Math.exp(-dk * (0.85 / Math.max(0.5, S.leeWaveDepth)));
          const tgt = target0 * decay;
          const mix = aw * (dk === 0 ? 1 : 0.55 * decay);
          f.w[face] += (tgt - f.w[face]) * mix;
        }

        // Quadratic-ish surface drag on the lowest free u/v faces.
        if (kOpen < nz && drag > 0) {
          const rough =
            0.35 +
            0.45 *
              (this.vegGrid ? Math.min(1, this.vegGrid[s]) : 0) *
              S.roughnessVeg +
            0.35 * Math.min(1, slope * 40);
          const dragHere = Math.min(0.45, drag * rough);
          const ku = g.uIdx(i, j, kOpen);
          const ku1 = g.uIdx(i + 1, j, kOpen);
          const kv = g.vIdx(i, j, kOpen);
          const kv1 = g.vIdx(i, j + 1, kOpen);
          f.u[ku] *= 1 - dragHere;
          f.u[ku1] *= 1 - dragHere;
          f.v[kv] *= 1 - dragHere;
          f.v[kv1] *= 1 - dragHere;
        }

        // Slope winds: daytime warm skin → anabatic (up-slope); night cool → katabatic.
        if (T.enableSlopeWinds && kOpen < nz && slope > 1e-4) {
          const id = g.idx(i, j, kOpen);
          const dTh = f.theta[id] - f.theta0[kOpen];
          // Along-slope unit vector in the horizontal (uphill).
          const invS = 1 / slope;
          const sx = dhdx * invS;
          const sy = dhdy * invS;
          // Positive dTh → accelerate uphill; cold pools drain downhill.
          const accel =
            Math.max(-4, Math.min(4, dTh * 0.085)) *
            G *
            slope *
            S.slopeWind;
          const force = accel * Math.min(1, dt);
          f.u[g.uIdx(i, j, kOpen)] += sx * force * 0.5;
          f.u[g.uIdx(i + 1, j, kOpen)] += sx * force * 0.5;
          f.v[g.vIdx(i, j, kOpen)] += sy * force * 0.5;
          f.v[g.vIdx(i, j + 1, kOpen)] += sy * force * 0.5;
          // Continuity: climbing air lifts at the first open face.
          f.w[g.wIdx(i, j, kOpen)] +=
            Math.max(0, dTh) * slope * 0.15 * S.slopeWind * Math.min(1, dt);
        }

        const kind = this.kindGrid ? this.kindGrid[s] : 0;
        const wetFrac = water ? Math.min(1, Math.max(0, water[s])) : 0;
        const onWater = kind >= 0.5 || wetFrac > 0.02;
        if (onWater && kOpen < nz && asst > 0) {
          const id = g.idx(i, j, kOpen);
          const p = f.p0[kOpen];
          const wet = kind >= 0.5 && kind < 1.5 ? 1 : wetFrac;
          const tC = this.tempGrid ? this.tempGrid[s] : this.sstC;
          const th = (tC + 273.15) / exnerFromP(p);
          f.theta[id] += (th - f.theta[id]) * asst * wet;
          const tNow = TFromTheta(f.theta[id], p);
          const qTarget = qsat(tNow, p) * 0.98;
          const moist = relaxFactor(dt, 600);
          f.qv[id] += (qTarget - f.qv[id]) * moist * wet;
        } else if (T.enableSoilMoisture && kOpen < nz && this.soilGrid) {
          const soil = this.soilGrid[s];
          const veg = this.vegGrid ? this.vegGrid[s] : 0;
          const supply =
            soil *
            S.soilMoistureFlux *
            (0.25 + 0.75 * veg * S.vegMoistureFlux);
          if (supply > 0.04) {
            const id = g.idx(i, j, kOpen);
            const p = f.p0[kOpen];
            const tNow = TFromTheta(f.theta[id], p);
            const qTarget = qsat(tNow, p) * 0.92;
            const add = (qTarget - f.qv[id]) * relaxFactor(dt, 700) * supply;
            if (add > 0) f.qv[id] += add;
          }
        }
      }
    }
  }

  private stepNest(dt: number): void {
    const child = this.child;
    const nest = this.nestRect;
    if (!child || !nest || this.nestChild || dt <= 0) return;
    child.hydrostatic = this.hydrostatic;
    child.clockPaused = true;
    child.radiation.solarHour = this.radiation.solarHour;
    const n = nest.refinement >= 3 ? 3 : 2;
    const h = dt / n;
    for (let s = 0; s < n; s++) {
      this.blendChild(false);
      child.step(h);
    }
    this.blendChild(false);
  }

  /** One-way sponge: the child's outer cells follow the parent. */
  private blendChild(full: boolean): void {
    const child = this.child;
    const nest = this.nestRect;
    if (!child || !nest) return;
    const pg = this.grid;
    const cg = child.grid;
    const pf = this.fields;
    const cf = child.fields;
    const fx = nest.x1 - nest.x0;
    const fy = nest.y1 - nest.y0;
    const keys = ["theta", "qv", "qc", "qr", "qi", "qs", "qg", "qh", "ni", "p"] as const;
    for (let j = 0; j < cg.ny; j++) {
      for (let i = 0; i < cg.nx; i++) {
        const a = haloWeight(i, j, cg.nx, cg.ny, full);
        if (a <= 0) continue;
        const xn = nest.x0 + ((i + 0.5) / cg.nx) * fx;
        const yn = nest.y0 + ((j + 0.5) / cg.ny) * fy;
        const px = xn * pg.nx - 0.5;
        const py = yn * pg.ny - 0.5;
        for (let k = 0; k < cg.nz; k++) {
          for (const key of keys) {
            const sample = bilerpPlane(pf[key], pg.nx, pg.ny, px, py, k);
            const id = cg.idx(i, j, k);
            cf[key][id] = a >= 1 ? sample : cf[key][id] * (1 - a) + sample * a;
          }
        }
      }
    }
    for (let j = 0; j < cg.ny; j++) {
      for (let i = 0; i <= cg.nx; i++) {
        const ic = i >= cg.nx ? cg.nx - 1 : i;
        const a = haloWeight(ic, j, cg.nx, cg.ny, full);
        if (a <= 0) continue;
        const xn = nest.x0 + (i / cg.nx) * fx;
        const yn = nest.y0 + ((j + 0.5) / cg.ny) * fy;
        for (let k = 0; k < cg.nz; k++) {
          const sample = bilerpPlane(pf.u, pg.nx + 1, pg.ny, xn * pg.nx, yn * pg.ny - 0.5, k);
          const id = cg.uIdx(i, j, k);
          cf.u[id] = a >= 1 ? sample : cf.u[id] * (1 - a) + sample * a;
        }
      }
    }
    for (let j = 0; j <= cg.ny; j++) {
      for (let i = 0; i < cg.nx; i++) {
        const jc = j >= cg.ny ? cg.ny - 1 : j;
        const a = haloWeight(i, jc, cg.nx, cg.ny, full);
        if (a <= 0) continue;
        const xn = nest.x0 + ((i + 0.5) / cg.nx) * fx;
        const yn = nest.y0 + (j / cg.ny) * fy;
        for (let k = 0; k < cg.nz; k++) {
          const sample = bilerpPlane(pf.v, pg.nx, pg.ny + 1, xn * pg.nx - 0.5, yn * pg.ny, k);
          const id = cg.vIdx(i, j, k);
          cf.v[id] = a >= 1 ? sample : cf.v[id] * (1 - a) + sample * a;
        }
      }
    }
    for (let j = 0; j < cg.ny; j++) {
      for (let i = 0; i < cg.nx; i++) {
        const a = haloWeight(i, j, cg.nx, cg.ny, full);
        if (a <= 0) continue;
        const xn = nest.x0 + ((i + 0.5) / cg.nx) * fx;
        const yn = nest.y0 + ((j + 0.5) / cg.ny) * fy;
        const px = xn * pg.nx - 0.5;
        const py = yn * pg.ny - 0.5;
        for (let k = 0; k <= cg.nz; k++) {
          const sample = bilerpPlane(pf.w, pg.nx, pg.ny, px, py, k);
          const id = cg.wIdx(i, j, k);
          cf.w[id] = a >= 1 ? sample : cf.w[id] * (1 - a) + sample * a;
        }
      }
    }
  }

  packRadarComposite(out: Uint8Array): void {
    this.packMapProduct("refl", out);
  }

  /** Pack a 2D map product into RGBA (nx×ny of the selected domain). */
  packMapProduct(id: MapProductId, out: Uint8Array): void {
    const view = this.viewSolver;
    if (view !== this) {
      view.packMapProduct(id, out);
      return;
    }
    const need = this.grid.nx * this.grid.ny * 4;
    if (out.length < need) return;
    this.prepareView();
    if (id === "ltg") {
      packLightning(this.grid, this.flash, out);
      return;
    }
    if (id === "charge") {
      packChargeProduct(this.grid, this.charge, this.chargeCol, out, "abs");
      return;
    }
    if (id === "chargepos") {
      packChargeProduct(this.grid, this.charge, this.chargeCol, out, "pos");
      return;
    }
    if (id === "chargeneg") {
      packChargeProduct(this.grid, this.charge, this.chargeCol, out, "neg");
      return;
    }
    if (isPlannedProduct(id)) {
      packPlannedProduct(id, this.grid, this.fields, out, {
        sunFrac: this.getSolarStatus().sunFrac,
        flash: this.flash,
      });
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
      const cold = f.qi[i] + f.qs[i] + f.qg[i] + f.qh[i];
      const cloud = f.qc[i] + cold;
      if (cloud > cloudMax) cloudMax = cloud;
      if (f.qr[i] > rainMax) rainMax = f.qr[i];
      cloudMass += cloud + f.qr[i];
    }
    return { cloudMax, rainMax, cloudMass };
  }
}

/**
 * Sim seconds one dynamics pass can cover at a typical wind.
 * Storm-scale cells stay near a few seconds so updrafts and shafts stay
 * resolved. Mesoscale and continental cells (Δx of kilometres to hundreds
 * of kilometres) advance minutes per pass, which is the same CPU work as
 * the old 1 s step.
 */
export function stableOuterDt(
  dx: number,
  dy: number,
  dz: number,
  hydrostatic: boolean,
): number {
  const horiz = Math.min(Math.max(dx, 1), Math.max(dy, 1));
  const vertical = Math.max(dz, 1);
  // Hydrostatic columns are limited by the horizontal wind. Storm-scale
  // runs stay on the vertical Courant number so one pass is not a stack
  // of substeps.
  if (hydrostatic) {
    const advective = (0.75 * horiz) / 30;
    const rain = (48 * vertical) / 20;
    const cap = horiz > 20000 ? 600 : 300;
    const dt = Math.min(advective, rain, cap);
    return dt < 1 ? 1 : dt;
  }
  const advective = (0.75 * Math.min(horiz, vertical)) / 25;
  const rain = (48 * vertical) / 16;
  const cap = horiz > 2000 ? 30 : 12;
  const dt = Math.min(advective, rain, cap);
  return dt < 1 ? 1 : dt;
}

/**
 * Peak |component|. Long arrays are read every other entry and padded, and
 * the scan stops once the wind already forces the CFL substep cap.
 */
function peakSpeed(a: Float32Array, stopAt: number): number {
  const n = a.length;
  const stride = n > 32768 ? 2 : 1;
  let m = 0;
  for (let i = 0; i < n; i += stride) {
    const v = a[i] < 0 ? -a[i] : a[i];
    if (v > m) {
      m = v;
      if (m >= stopAt) break;
    }
  }
  return stride > 1 ? m * 1.12 : m;
}

function haloWeight(
  i: number,
  j: number,
  nx: number,
  ny: number,
  full: boolean,
): number {
  if (full) return 1;
  const d = Math.min(i, j, nx - 1 - i, ny - 1 - j);
  if (d >= 4) return 0;
  return (4 - d) / 4;
}

function bilerpPlane(
  src: Float32Array,
  xStride: number,
  yCount: number,
  x: number,
  y: number,
  k: number,
): number {
  const xMax = xStride - 1;
  const yMax = yCount - 1;
  const x0 = x < 0 ? 0 : x > xMax ? xMax : Math.floor(x);
  const y0 = y < 0 ? 0 : y > yMax ? yMax : Math.floor(y);
  const x1 = x0 < xMax ? x0 + 1 : x0;
  const y1 = y0 < yMax ? y0 + 1 : y0;
  const tx = x - x0 < 0 ? 0 : x - x0 > 1 ? 1 : x - x0;
  const ty = y - y0 < 0 ? 0 : y - y0 > 1 ? 1 : y - y0;
  const at = (ix: number, iy: number) => src[ix + xStride * (iy + yCount * k)];
  const a = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
  const b = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
  return a * (1 - ty) + b * ty;
}
