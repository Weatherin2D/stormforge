import { Grid3D, volumeDisplaySize } from "./Grid3D";
import { FluidSolver, type LightningStrike } from "./FluidSolver";
import type { SimBackend } from "./SimBackend";
import { SoundingLevel } from "./thermo";
import { InitOptions } from "./InitFromSounding";
import { RadiationOptions } from "./SurfaceRadiation";
import { MapProductId } from "./mapProducts";
import { sampleSurfaceWinds, SurfaceWindSample } from "./surfaceWinds";

let solver: SimBackend | null = null;

interface StepMsg {
  type: "step";
  dt: number;
  wall: number;
  lightning: boolean;
  wantVolume: boolean;
  map: MapProductId | null;
  winds: boolean;
}

function surfaceDth(s: SimBackend): number {
  const g = s.grid;
  const f = s.fields;
  const n = g.nx * g.ny;
  let sum = 0;
  const th0 = f.theta0[0];
  for (let i = 0; i < n; i++) sum += f.theta[i] - th0;
  return n ? sum / n : 0;
}

function publish(extra: {
  volume: Uint8Array | null;
  map: Uint8Array | null;
  mapId: MapProductId | null;
  winds: SurfaceWindSample[] | null;
  strikes: LightningStrike[];
}): void {
  if (!solver) return;
  const sun = solver.getSolarStatus();
  const stats = solver.cloudRainStats();
  const transfers: Transferable[] = [];
  if (extra.volume) transfers.push(extra.volume.buffer);
  if (extra.map) transfers.push(extra.map.buffer);
  const payload = {
    type: "state" as const,
    time: solver.time,
    cloudMax: stats.cloudMax,
    rainMax: stats.rainMax,
    cloudMass: stats.cloudMass,
    solarHour: solver.radiation.solarHour,
    sunFrac: sun.sunFrac,
    isDay: sun.isDay,
    clock: sun.clock,
    label: sun.label,
    dThSfc: surfaceDth(solver),
    strikes: extra.strikes,
    volume: extra.volume,
    map: extra.map,
    mapId: extra.mapId,
    winds: extra.winds,
  };
  (self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void }).postMessage(
    payload,
    transfers,
  );
}

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as
    | {
        type: "rebuild";
        grid: { nx: number; ny: number; nz: number; zTop: number };
        sounding: SoundingLevel[];
        opts: InitOptions;
        radiation: RadiationOptions;
        clockPaused: boolean;
      }
    | { type: "reset"; sounding: SoundingLevel[]; opts: InitOptions }
    | { type: "bubble"; strength: number }
    | { type: "radiation"; radiation: Partial<RadiationOptions> }
    | { type: "clock"; paused: boolean }
    | StepMsg;
  if (msg.type === "rebuild") {
    const grid = new Grid3D(msg.grid);
    solver = new FluidSolver(grid);
    solver.rebuild(grid, msg.sounding, msg.opts);
    solver.setRadiation(msg.radiation);
    solver.clockPaused = msg.clockPaused;
    publish({ volume: null, map: null, mapId: null, winds: null, strikes: [] });
    return;
  }
  if (!solver) return;
  if (msg.type === "reset") {
    solver.reset(msg.sounding, msg.opts);
    publish({ volume: null, map: null, mapId: null, winds: null, strikes: [] });
    return;
  }
  if (msg.type === "bubble") {
    solver.respawnBubble({ bubbleStrength: msg.strength });
    return;
  }
  if (msg.type === "radiation") {
    solver.setRadiation(msg.radiation);
    return;
  }
  if (msg.type === "clock") {
    solver.clockPaused = msg.paused;
    return;
  }
  solver.step(msg.dt);
  const strikes = msg.lightning ? solver.rollLightning(msg.wall) : [];
  let volume: Uint8Array | null = null;
  if (msg.wantVolume) {
    const g = solver.grid;
    const d = volumeDisplaySize(g.nx, g.ny, g.nz);
    // Display texture is at most 128×128×48. A full-grid buffer is rejected
    // by the renderer, which is why clouds vanished above that size.
    volume = new Uint8Array(d.nx * d.ny * d.nz * 4);
    solver.packVolumeRGBA(volume);
  }
  let map: Uint8Array | null = null;
  if (msg.map) {
    map = new Uint8Array(solver.grid.nx * solver.grid.ny * 4);
    solver.packMapProduct(msg.map, map);
  }
  const winds = msg.winds ? sampleSurfaceWinds(solver.grid, solver.fields) : null;
  publish({ volume, map, mapId: msg.map, winds, strikes });
};
