import { SoundingLevel } from "./thermo";
import { InitOptions } from "./InitFromSounding";
import { RadiationOptions } from "./SurfaceRadiation";
import { MapProductId } from "./mapProducts";
import { SurfaceWindSample } from "./surfaceWinds";
import type { LightningStrike } from "./FluidSolver";
import type { DrawnFront, SynopticSetup } from "./synoptic";

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
    grid: { nx: number; ny: number; nz: number; zTop: number };
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

  step(payload: {
    dt: number;
    wall: number;
    lightning: boolean;
    wantVolume: boolean;
    map: MapProductId | null;
    winds: boolean;
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
