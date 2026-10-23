/**
 * Solver backend contract.
 *
 * The CPU FluidSolver is the reference fallback backend. A WebGPU backend
 * (Phase 2) implements the same operations — initialization, reset, step,
 * diagnostics, and field readback — while performing the arithmetic on the GPU
 * and performing async command submission/readback under the hood. The shell
 * (App, LiveBridge, BatchRunner) programs against this interface so no backend
 * can be swapped in without changing the synchronous solver contract.
 *
 * Field storage is deliberately exposed as SimFields views. For the CPU backend
 * these are the live Float32Arrays. A tiled/GPU backend materializes read-only
 * views on readback (packVolumeRGBA/packMapProduct/cloudRainStats) rather than
 * keeping one monolithic resident array.
 */

import type { Grid3D } from "./Grid3D";
import type { SimFields, InitOptions } from "./InitFromSounding";
import type { SoundingLevel } from "./thermo";
import type { RadiationOptions, SolarStatus } from "./SurfaceRadiation";
import type { MapProductId } from "./mapProducts";
import type { LightningStrike } from "./FluidSolver";
import type { SynopticSetup } from "./synoptic";

/** Backend selector. "cpu" is the only shipping backend; "gpu" is Phase 2. */
export type SolverKind = "cpu" | "gpu";

export type HydrostaticMode = "auto" | "on" | "off";

export interface PhysicsMode {
  /** hydrostatic dynamics for large dx; nonhydrostatic below the threshold. */
  hydrostatic: HydrostaticMode;
  /** Cumulus parameterization on coarse grids (off in convection-resolving nests). */
  cumulusParameterization: boolean;
  /** Run slow physics (radiation/microphysics/BL) at reduced cadence. */
  splitPhysics: boolean;
}

/** One nested refinement region, in normalized [0..1]^2 domain coords. */
export interface NestDef {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  refinement: number; // >= 1, integer
  dtFactor: number; // timestep relative to parent
}

/**
 * Extent + resolution description of a domain, independent of cell count.
 * nx/ny are derived from extent/dx; physical extent is the source of truth.
 */
export interface DomainConfig {
  extentX: number; // meters
  extentY: number; // meters
  dx: number; // target cell size X (m)
  dy: number; // target cell size Y (m)
  nz: number;
  zTop: number;
  nests?: NestDef[];
  physics?: PhysicsMode;
}

/** Aggregate readback diagnostics the shell displays each frame. */
export interface SimDiagnostics {
  time: number;
  stepCount: number;
  cloudMax: number;
  rainMax: number;
  cloudMass: number;
  solarHour: number;
}

/**
 * Equivalent operations across CPU and GPU backends. step(dt) is synchronous
 * from the shell's perspective; a GPU backend may batch work internally and
 * synchronize before returning so the next readback sees a consistent state.
 */
export interface SimBackend {
  readonly kind: SolverKind;
  readonly grid: Grid3D;
  /** Current field snapshot (live arrays on CPU; materialized view on GPU). */
  fields: SimFields;
  time: number;
  readonly stepCount: number;
  clockPaused: boolean;
  /** Hydrostatic balance mode. "auto" uses hydrostatic balance above ~5 km dx. */
  hydrostatic: HydrostaticMode;
  readonly radiation: RadiationOptions;
  vorticityStrength: number;

  rebuild(grid: Grid3D, sounding: SoundingLevel[], opts: InitOptions): void;
  reset(sounding: SoundingLevel[], opts: InitOptions): void;
  /**
   * Replace the synoptic pattern (fronts, highs/lows) of the running
   * simulation without restarting it. The new pattern is re-imposed on the
   * fields by the front forcing, so edits take effect on the next step.
   */
  setSynoptic(setup: SynopticSetup): void;
  setRadiation(partial: Partial<RadiationOptions>): void;
  setSolarHour(hour: number): void;
  getSolarStatus(): SolarStatus;
  step(dt: number): void;
  respawnBubble(opts?: Partial<InitOptions>): void;
  packVolumeRGBA(out: Uint8Array): void;
  packMapProduct(id: MapProductId, out: Uint8Array): void;
  cloudRainStats(): { cloudMax: number; rainMax: number; cloudMass: number };
  rollLightning(dt: number): LightningStrike[];
  dispose?(): void;
}
