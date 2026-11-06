import { Grid3D, volumeDisplaySize } from "./Grid3D";
import { FluidSolver, type LightningStrike } from "./FluidSolver";
import type { SimBackend } from "./SimBackend";
import { SoundingLevel } from "./thermo";
import { InitOptions } from "./InitFromSounding";
import { RadiationOptions } from "./SurfaceRadiation";
import { MapProductId } from "./mapProducts";
import { sampleSurfaceWinds, SurfaceWindSample } from "./surfaceWinds";
import { DrawnFront, getActiveSynoptic } from "./synoptic";
import type { SynopticSetup } from "./synoptic";
import type { OverlayField } from "../render/fields";
import {
  packRainSwath,
  packColdPoolMap,
  packFieldVolume,
  packGroundCover,
  findVortexColumn,
  packVortexLevels,
} from "./fieldPack";
import {
  sampleColumn,
  sampleSection,
  type ColumnProbe,
  type ProbeRequest,
  type SectionImage,
  type SectionRequest,
} from "./inspect";

let solver: FluidSolver | null = null;

interface StepMsg {
  type: "step";
  dt: number;
  wall: number;
}

interface ViewMsg {
  type: "view";
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

/** Where the fronts are right now, so the map can follow them. */
function frontPositions(): DrawnFront[] {
  const active = getActiveSynoptic();
  if (active.enabled === false) return [];
  return active.fronts
    .filter((f) => f.enabled && f.points.length >= 2)
    .map((f) => ({
      id: f.id,
      kind: f.kind,
      enabled: f.enabled,
      points: f.points.map((p) => ({ x: p.x, y: p.y })),
    }));
}

/** Last full hydrometeor scan — reused when the volume was not repacked. */
let cachedStats = { cloudMax: 0, rainMax: 0, cloudMass: 0 };
let statsAge = 0;

function publish(extra: {
  volume: Uint8Array | null;
  map: Uint8Array | null;
  mapId: MapProductId | null;
  winds: SurfaceWindSample[] | null;
  strikes: LightningStrike[];
  swath?: Uint8Array | null;
  coldPool?: Uint8Array | null;
  field?: Uint8Array | null;
  fieldMode?: OverlayField | null;
  vortex?: Float32Array | null;
  ground?: Uint8Array | null;
  probe?: ColumnProbe | null;
  section?: SectionImage | null;
  refreshStats?: boolean;
}): void {
  if (!solver) return;
  const sun = solver.getSolarStatus();
  statsAge++;
  if (extra.refreshStats || extra.volume || statsAge >= 24) {
    cachedStats = solver.cloudRainStats();
    statsAge = 0;
  }
  const stats = cachedStats;
  const transfers: Transferable[] = [];
  if (extra.volume) transfers.push(extra.volume.buffer);
  if (extra.map) transfers.push(extra.map.buffer);
  if (extra.swath) transfers.push(extra.swath.buffer);
  if (extra.coldPool) transfers.push(extra.coldPool.buffer);
  if (extra.field) transfers.push(extra.field.buffer);
  if (extra.vortex) transfers.push(extra.vortex.buffer);
  if (extra.ground) transfers.push(extra.ground.buffer);
  if (extra.probe) transfers.push(extra.probe.levels.buffer);
  if (extra.section) transfers.push(extra.section.rgba.buffer);
  const fo = solver.frameOffset();
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
    fronts: frontPositions(),
    swath: extra.swath ?? null,
    coldPool: extra.coldPool ?? null,
    field: extra.field ?? null,
    fieldMode: extra.fieldMode ?? null,
    vortex: extra.vortex ?? null,
    ground: extra.ground ?? null,
    frameEast: fo.east,
    frameNorth: fo.north,
    followStorm: solver.getFollowStorm(),
    probe: extra.probe ?? null,
    section: extra.section ?? null,
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
        hydrostatic?: "on" | "off" | "auto";
      }
    | { type: "reset"; sounding: SoundingLevel[]; opts: InitOptions }
    | { type: "bubble"; strength: number }
    | { type: "radiation"; radiation: Partial<RadiationOptions> }
    | { type: "clock"; paused: boolean }
    | { type: "synoptic"; setup: SynopticSetup }
    | { type: "followStorm"; on: boolean }
    | StepMsg
    | ViewMsg;
  if (msg.type === "rebuild") {
    try {
      const grid = new Grid3D(msg.grid);
      solver = new FluidSolver(grid);
      solver.rebuild(grid, msg.sounding, msg.opts);
      solver.setRadiation(msg.radiation);
      solver.clockPaused = msg.clockPaused;
      if (msg.hydrostatic) solver.hydrostatic = msg.hydrostatic;
      cachedStats = { cloudMax: 0, rainMax: 0, cloudMass: 0 };
      statsAge = 99;
      publish({
        volume: null,
        map: null,
        mapId: null,
        winds: null,
        strikes: [],
        refreshStats: true,
      });
    } catch (err) {
      console.error("Stormforge rebuild failed", err);
      (self as unknown as { postMessage(message: unknown): void }).postMessage({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }
  if (!solver) {
    // A step sent before rebuild finished must still answer, or the clock
    // waits forever on a worker that has nothing to advance.
    if (msg.type === "step" || msg.type === "view") {
      (self as unknown as { postMessage(message: unknown): void }).postMessage({
        type: "error",
        message: "Physics is not ready.",
      });
    }
    return;
  }
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
  if (msg.type === "synoptic") {
    // Fronts edited while the run is going: swap the pattern in place.
    solver.setSynoptic(msg.setup);
    return;
  }
  if (msg.type === "followStorm") {
    solver.setFollowStorm(!!msg.on);
    return;
  }
  // Physics returns before any texture pack, so the next step can start
  // while the picture is built on its own message.
  if (msg.type === "step") {
    try {
      // One pass. App already caps dt with stableOuterDt; splitting here
      // would repeat the whole dynamics core on coarse grids.
      if (msg.dt > 1e-6) solver.step(msg.dt);
      publish({
        volume: null,
        map: null,
        mapId: null,
        winds: null,
        strikes: solver.rollDisplayLightning(msg.wall),
        refreshStats: false,
      });
    } catch (err) {
      console.error("Stormforge step failed", err);
      publish({
        volume: null,
        map: null,
        mapId: null,
        winds: null,
        strikes: [],
        refreshStats: false,
      });
    }
    return;
  }
  if (msg.type !== "view") return;
  try {
  solver.setMapDomain(msg.mapDomain === "nest" ? "nest" : "parent");
  solver.prepareView();
  const shown = solver.displayGrid;
  const shownFields = solver.displayFields;
  const mapped = solver.viewGrid;
  const mappedFields = solver.viewFields;
  let volume: Uint8Array | null = null;
  if (msg.wantVolume) {
    const d = volumeDisplaySize(shown.nx, shown.ny, shown.nz);
    // Display texture is at most 128×128×48. A full-grid buffer is rejected
    // by the renderer, which is why clouds vanished above that size.
    volume = new Uint8Array(d.nx * d.ny * d.nz * 4);
    solver.packVolumeRGBA(volume);
  }
  let map: Uint8Array | null = null;
  if (msg.map) {
    map = new Uint8Array(mapped.nx * mapped.ny * 4);
    solver.packMapProduct(msg.map, map);
  }
  const winds = msg.winds ? sampleSurfaceWinds(shown, shownFields) : null;
  let swath: Uint8Array | null = null;
  if (msg.wantSwath) {
    swath = new Uint8Array(shown.nx * shown.ny * 4);
    packRainSwath(shown, shownFields, swath);
  }
  let coldPool: Uint8Array | null = null;
  if (msg.wantColdPool) {
    coldPool = new Uint8Array(shown.nx * shown.ny * 4);
    packColdPoolMap(shown, shownFields, coldPool);
  }
  let field: Uint8Array | null = null;
  const fieldMode = msg.fieldMode && msg.fieldMode !== "off" ? msg.fieldMode : null;
  if (fieldMode) {
    const d = volumeDisplaySize(shown.nx, shown.ny, shown.nz);
    field = new Uint8Array(d.nx * d.ny * d.nz * 4);
    packFieldVolume(fieldMode, shown, shownFields, field);
  }
  let vortex: Float32Array | null = null;
  if (msg.wantVortex) {
    vortex = packVortexLevels(findVortexColumn(shown, shownFields));
  }
  // Ground cover only when something visible is refreshing — packing it every
  // physics reply dominates large domains.
  let ground: Uint8Array | null = null;
  if (msg.wantVolume || msg.map || msg.winds || msg.wantSwath || msg.wantColdPool) {
    ground = new Uint8Array(shown.nx * shown.ny * 4);
    packGroundCover(shown, shownFields, ground, solver.groundCoverOffset());
  }
  const probe = msg.probe
    ? sampleColumn(mapped, mappedFields, msg.probe.i, msg.probe.j, solver.time)
    : null;
  const section = msg.section
    ? sampleSection(mapped, mappedFields, msg.section)
    : null;
  publish({
    volume,
    map,
    mapId: msg.map,
    winds,
    strikes: [],
    swath,
    coldPool,
    field,
    fieldMode,
    vortex,
    ground,
    probe,
    section,
    refreshStats: !!msg.wantVolume,
  });
  } catch (err) {
    console.error("Stormforge view pack failed", err);
    publish({
      volume: null,
      map: null,
      mapId: null,
      winds: null,
      strikes: [],
      refreshStats: false,
    });
  }
};

(self as unknown as { postMessage(message: unknown): void }).postMessage({
  type: "hello",
});
