import { SoundingLevel } from "./thermo";
import { InitOptions } from "./InitFromSounding";
import { RadiationOptions } from "./SurfaceRadiation";
import { MapProductId } from "./mapProducts";
import { SurfaceWindSample } from "./surfaceWinds";
import type { LightningStrike } from "./FluidSolver";
import type { DrawnFront, SynopticSetup } from "./synoptic";
import type { OverlayField } from "../render/fields";
import type { ColumnProbe, SectionImage, SectionRequest, ProbeRequest } from "./inspect";

export interface LiveState {
  type: "state";
  time: number;
  cloudMax: number;
  rainMax: number;
  cloudMass: number;
  solarHour: number;
  sunFrac: number;
  isDay: boolean;
  clock: string;
  label: string;
  dThSfc: number;
  strikes: LightningStrike[];
  volume: Uint8Array | null;
  map: Uint8Array | null;
  mapId: MapProductId | null;
  winds: SurfaceWindSample[] | null;
  /** Where the fronts are now, so the map line follows the simulation. */
  fronts: DrawnFront[];
  /** Accumulated precip swath (nx×ny RGBA), when requested. */
  swath: Uint8Array | null;
  /** Cold-pool ground shade (nx×ny RGBA), when requested. */
  coldPool: Uint8Array | null;
  /** 3D scalar field volume (display RGBA), when requested. */
  field: Uint8Array | null;
  fieldMode: OverlayField | null;
  /** Flattened vortex rings [x,y,z,r,zeta,…], when requested. */
  vortex: Float32Array | null;
  /**
   * Ground cover, nx·ny RGBA.
   * R rain wetness, G snow depth, B hail diameter, A hail frequency.
   */
  ground: Uint8Array | null;
  /** Domain travel over the ground while follow-storm is on (metres). */
  frameEast: number;
  frameNorth: number;
  followStorm: boolean;
  /** Pinned column, when the Maps 2D probe is active. */
  probe: ColumnProbe | null;
  /** Vertical curtain, when a cross-section is defined. */
  section: SectionImage | null;
}

/** Physics runs off the render thread so the camera stays smooth. */
export class LiveBridge {
  private worker: Worker;
  busy = false;
  ready = false;
  state: LiveState | null = null;
  onState: ((state: LiveState) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL("./live.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (ev: MessageEvent<LiveState>) => {
      this.busy = false;
      this.ready = true;
      this.state = ev.data;
      this.onState?.(ev.data);
    };
  }

  rebuild(payload: {
    grid: {
      nx: number;
      ny: number;
      nz: number;
      zTop: number;
      xExtent?: number;
      yExtent?: number;
    };
    sounding: SoundingLevel[];
    opts: InitOptions;
    radiation: RadiationOptions;
    clockPaused: boolean;
  }): void {
    this.ready = false;
    this.busy = true;
    this.worker.postMessage({ type: "rebuild", ...payload });
  }

  reset(sounding: SoundingLevel[], opts: InitOptions): void {
    this.busy = true;
    this.worker.postMessage({ type: "reset", sounding, opts });
  }

  bubble(strength: number): void {
    this.worker.postMessage({ type: "bubble", strength });
  }

  radiation(radiation: Partial<RadiationOptions>): void {
    this.worker.postMessage({ type: "radiation", radiation });
  }

  clock(paused: boolean): void {
    this.worker.postMessage({ type: "clock", paused });
  }

  /** Replace the synoptic pattern of the running simulation. */
  synoptic(setup: SynopticSetup): void {
    this.worker.postMessage({ type: "synoptic", setup });
  }

  /** Keep the domain centered on the storm (Galilean frame). */
  followStorm(on: boolean): void {
    this.worker.postMessage({ type: "followStorm", on });
  }

  step(payload: {
    dt: number;
    wall: number;
    lightning: boolean;
    wantVolume: boolean;
    map: MapProductId | null;
    winds: boolean;
    wantSwath?: boolean;
    wantColdPool?: boolean;
    fieldMode?: OverlayField;
    wantVortex?: boolean;
    probe?: ProbeRequest | null;
    section?: SectionRequest | null;
    mapDomain?: "parent" | "nest";
  }): boolean {
    if (this.busy || !this.ready) return false;
    this.busy = true;
    this.worker.postMessage({ type: "step", ...payload });
    return true;
  }

  dispose(): void {
    this.worker.terminate();
  }
}
