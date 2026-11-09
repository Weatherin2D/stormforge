/**
 * Phase 4 hybrid: GPU parent dynamics (pack-resident) + CPU one-way nest.
 * Nest blend / follow / auto-spawn stay on the CPU FluidSolver host; the
 * parent step runs on WebGPU and mirrors fields only when the nest needs them.
 */
import { Grid3D } from "./Grid3D";
import type { SimBackend, SolverKind, HydrostaticMode } from "./SimBackend";
import type { SimFields, InitOptions } from "./InitFromSounding";
import type { SoundingLevel } from "./thermo";
import type { RadiationOptions, SolarStatus } from "./SurfaceRadiation";
import type { MapProductId } from "./mapProducts";
import type { LightningStrike } from "./FluidSolver";
import { FluidSolver } from "./FluidSolver";
import { WebGPUBackend } from "./WebGPUBackend";
import type { SynopticSetup } from "./synoptic";
import { setupNeedsCpu, type SurfaceSpec } from "./surface";

export class HybridNestBackend implements SimBackend {
  readonly kind: SolverKind = "gpu";
  private gpu: WebGPUBackend;
  private host: FluidSolver;
  private nestActive = false;

  constructor(gpu: WebGPUBackend, host: FluidSolver) {
    this.gpu = gpu;
    this.host = host;
    this.gpu.fullReadback = false;
  }

  get grid(): Grid3D {
    return this.gpu.grid;
  }
  get displayGrid(): Grid3D {
    return this.host.displayGrid;
  }
  get fields(): SimFields {
    return this.host.fields;
  }
  set fields(v: SimFields) {
    this.host.fields = v;
  }
  get time(): number {
    return this.gpu.time;
  }
  set time(v: number) {
    this.gpu.time = v;
    this.host.time = v;
  }
  get stepCount(): number {
    return this.gpu.stepCount;
  }
  get clockPaused(): boolean {
    return this.gpu.clockPaused;
  }
  set clockPaused(v: boolean) {
    this.gpu.clockPaused = v;
    this.host.clockPaused = v;
  }
  get hydrostatic(): HydrostaticMode {
    return this.gpu.hydrostatic;
  }
  set hydrostatic(v: HydrostaticMode) {
    this.gpu.hydrostatic = v;
    this.host.hydrostatic = v;
  }
  get radiation(): RadiationOptions {
    return this.gpu.radiation;
  }
  get vorticityStrength(): number {
    return this.gpu.vorticityStrength;
  }
  set vorticityStrength(v: number) {
    this.gpu.vorticityStrength = v;
    this.host.vorticityStrength = v;
  }

  static async create(
    grid: Grid3D,
    sounding: SoundingLevel[],
    opts: InitOptions,
  ): Promise<HybridNestBackend | FluidSolver | WebGPUBackend> {
    const surface = opts.surface as SurfaceSpec | null | undefined;
    const needsNest = !!(surface && surface.nest);
    const complexTerrain = setupNeedsCpu(
      surface ? { ...surface, nest: null } : null,
    );

    if (complexTerrain) {
      const cpu = new FluidSolver(grid);
      cpu.rebuild(grid, sounding, opts);
      return cpu;
    }

    const gpu = new WebGPUBackend();
    await gpu.whenReady();
    if (!gpu.available) {
      const cpu = new FluidSolver(grid);
      cpu.rebuild(grid, sounding, opts);
      return cpu;
    }

    if (!needsNest) {
      gpu.rebuild(grid, sounding, opts);
      return gpu;
    }

    gpu.rebuild(grid, sounding, { ...opts, surface: surface ? { ...surface, nest: null } : null });
    const host = new FluidSolver(grid);
    host.rebuild(grid, sounding, opts);
    const hybrid = new HybridNestBackend(gpu, host);
    hybrid.nestActive = true;
    return hybrid;
  }

  rebuild(grid: Grid3D, sounding: SoundingLevel[], opts: InitOptions): void {
    const surface = opts.surface as SurfaceSpec | null | undefined;
    this.nestActive = !!(surface && surface.nest);
    this.gpu.rebuild(
      grid,
      sounding,
      surface ? { ...opts, surface: { ...surface, nest: null } } : opts,
    );
    this.host.rebuild(grid, sounding, opts);
  }

  reset(sounding: SoundingLevel[], opts: InitOptions): void {
    const surface = opts.surface as SurfaceSpec | null | undefined;
    this.nestActive = !!(surface && surface.nest);
    this.gpu.reset(
      sounding,
      surface ? { ...opts, surface: { ...surface, nest: null } } : opts,
    );
    this.host.reset(sounding, opts);
  }

  setSynoptic(setup: SynopticSetup): void {
    this.gpu.setSynoptic(setup);
    this.host.setSynoptic(setup);
  }

  setRadiation(partial: Partial<RadiationOptions>): void {
    this.gpu.setRadiation(partial);
    this.host.setRadiation(partial);
  }
  setSolarHour(hour: number): void {
    this.gpu.setSolarHour(hour);
    this.host.setSolarHour(hour);
  }
  getSolarStatus(): SolarStatus {
    return this.host.getSolarStatus();
  }
  setFollowStorm(on: boolean): void {
    this.gpu.setFollowStorm(on);
    this.host.setFollowStorm(on);
  }
  getFollowStorm(): boolean {
    return this.host.getFollowStorm();
  }
  frameOffset(): { east: number; north: number } {
    return this.gpu.frameOffset();
  }

  async step(dt: number): Promise<void> {
    await this.gpu.step(dt);
    if (this.nestActive || this.host.getNestRect()) {
      await this.gpu.syncFields();
      this.host.ingestParentFields(this.gpu.fields);
      this.host.time = this.gpu.time;
      this.host.advanceNestOnly(dt);
      this.nestActive = !!this.host.getNestRect();
    }
  }

  async syncDisplay(): Promise<void> {
    if (this.nestActive && this.host.getNestRect()) {
      // Nest is the display grid — pack from CPU child.
      return;
    }
    await this.gpu.syncDisplay();
  }

  async syncFields(): Promise<void> {
    await this.gpu.syncFields();
    this.host.ingestParentFields(this.gpu.fields);
  }

  respawnBubble(opts?: Partial<InitOptions>): void {
    this.gpu.respawnBubble(opts);
    this.host.respawnBubble(opts);
  }

  packVolumeRGBA(out: Uint8Array): void {
    if (this.host.getNestRect()) {
      this.host.packVolumeRGBA(out);
      return;
    }
    this.gpu.packVolumeRGBA(out);
  }

  packMapProduct(id: MapProductId, out: Uint8Array): void {
    this.host.packMapProduct(id, out);
  }

  cloudRainStats(): { cloudMax: number; rainMax: number; cloudMass: number } {
    if (this.host.getNestRect()) return this.host.cloudRainStats();
    return this.gpu.cloudRainStats();
  }

  rollLightning(dt: number): LightningStrike[] {
    return this.host.rollLightning(dt);
  }

  setMapDomain(domain: "parent" | "nest"): void {
    this.host.setMapDomain?.(domain);
  }

  prepareView(): void {
    this.host.prepareView();
  }
  get displayFields(): SimFields {
    return this.host.displayFields;
  }
  get viewGrid(): Grid3D {
    return this.host.viewGrid;
  }
  get viewFields(): SimFields {
    return this.host.viewFields;
  }
  groundCoverOffset(): { east: number; north: number } {
    return this.host.frameOffset();
  }
  rollDisplayLightning(dt: number): LightningStrike[] {
    return this.host.rollDisplayLightning(dt);
  }
  getNestRect() {
    return this.host.getNestRect();
  }
  getNestInfo() {
    return this.host.getNestInfo();
  }
  setNestFollow(on: boolean | null): void {
    this.host.setNestFollow(on);
  }
  getNestFollow(): boolean {
    return this.host.getNestFollow();
  }
}
