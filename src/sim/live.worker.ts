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
import { HybridNestBackend } from "./HybridNestBackend";
import { WebGPUBackend } from "./WebGPUBackend";
import { setupNeedsCpu, type SurfaceSpec } from "./surface";

/** Live solver: CPU, GPU, or hybrid GPU-parent + CPU-nest. */
type LiveSolver = FluidSolver | WebGPUBackend | HybridNestBackend;

let solver: LiveSolver | null = null;

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

function asLive(s: LiveSolver): {
  prepareView(): void;
  displayFields: import("./InitFromSounding").SimFields;
  viewGrid: Grid3D;
  viewFields: import("./InitFromSounding").SimFields;
  groundCoverOffset(): { east: number; north: number };
  rollDisplayLightning(dt: number): LightningStrike[];
  getNestInfo(): ReturnType<FluidSolver["getNestInfo"]>;
  setMapDomain?(domain: "parent" | "nest"): void;
} {
  return s as unknown as {
    prepareView(): void;
    displayFields: import("./InitFromSounding").SimFields;
    viewGrid: Grid3D;
    viewFields: import("./InitFromSounding").SimFields;
    groundCoverOffset(): { east: number; north: number };
    rollDisplayLightning(dt: number): LightningStrike[];
    getNestInfo(): ReturnType<FluidSolver["getNestInfo"]>;
    setMapDomain?(domain: "parent" | "nest"): void;
  };
}

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
  const live = asLive(solver);
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
    nest: live.getNestInfo(),
    probe: extra.probe ?? null,
    section: extra.section ?? null,
  };
  (self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void }).postMessage(
    payload,
    transfers,
  );
}

async function buildSolver(
  grid: Grid3D,
  sounding: SoundingLevel[],
  opts: InitOptions,
): Promise<LiveSolver> {
  const surface = opts.surface as SurfaceSpec | null | undefined;
  // Complex terrain stays CPU. Nest uses hybrid GPU parent + CPU child when
  // WebGPU is available; plain sandbox uses GPU-resident pack path.
  if (setupNeedsCpu(surface ? { ...surface, nest: null } : null)) {
    const cpu = new FluidSolver(grid);
    cpu.rebuild(grid, sounding, opts);
    return cpu;
  }
  const created = await HybridNestBackend.create(grid, sounding, opts);
  return created;
}

self.onmessage = (ev: MessageEvent) => {
  void handleMessage(ev.data);
};

async function handleMessage(msg: unknown): Promise<void> {
  const data = msg as
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

  if (data.type === "rebuild") {
    try {
      const grid = new Grid3D(data.grid);
      solver = await buildSolver(grid, data.sounding, data.opts);
      solver.setRadiation(data.radiation);
      solver.clockPaused = data.clockPaused;
      if (data.hydrostatic) solver.hydrostatic = data.hydrostatic;
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
    if (data.type === "step" || data.type === "view") {
      (self as unknown as { postMessage(message: unknown): void }).postMessage({
        type: "error",
        message: "Physics is not ready.",
      });
    }
    return;
  }
  if (data.type === "reset") {
    solver.reset(data.sounding, data.opts);
    publish({ volume: null, map: null, mapId: null, winds: null, strikes: [] });
    return;
  }
  if (data.type === "bubble") {
    solver.respawnBubble({ bubbleStrength: data.strength });
    return;
  }
  if (data.type === "radiation") {
    solver.setRadiation(data.radiation);
    return;
  }
  if (data.type === "clock") {
    solver.clockPaused = data.paused;
    return;
  }
  if (data.type === "synoptic") {
    solver.setSynoptic(data.setup);
    return;
  }
  if (data.type === "followStorm") {
    solver.setFollowStorm(!!data.on);
    return;
  }
  if (data.type === "step") {
    try {
      if (data.dt > 1e-6) {
        const result = solver.step(data.dt) as void | Promise<void>;
        if (result && typeof (result as Promise<void>).then === "function") {
          await result;
        }
      }
      const live = asLive(solver);
      publish({
        volume: null,
        map: null,
        mapId: null,
        winds: null,
        strikes: live.rollDisplayLightning(data.wall),
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
  if (data.type !== "view") return;
  try {
    const live = asLive(solver);
    live.setMapDomain?.(data.mapDomain === "nest" ? "nest" : "parent");

    const needFields =
      !!data.map ||
      data.winds ||
      !!data.wantSwath ||
      !!data.wantColdPool ||
      !!(data.fieldMode && data.fieldMode !== "off") ||
      !!data.wantVortex ||
      !!data.probe ||
      !!data.section;

    const syncable = solver as LiveSolver & {
      syncDisplay?: () => Promise<void>;
      syncFields?: () => Promise<void>;
    };
    if (syncable.syncDisplay) await syncable.syncDisplay();
    if (needFields && syncable.syncFields) await syncable.syncFields();

    live.prepareView();
    const shown = solver.displayGrid;
    const shownFields = live.displayFields;
    const mapped = live.viewGrid;
    const mappedFields = live.viewFields;
    let volume: Uint8Array | null = null;
    if (data.wantVolume) {
      const d = volumeDisplaySize(shown.nx, shown.ny, shown.nz);
      volume = new Uint8Array(d.nx * d.ny * d.nz * 4);
      solver.packVolumeRGBA(volume);
    }
    let map: Uint8Array | null = null;
    if (data.map) {
      map = new Uint8Array(mapped.nx * mapped.ny * 4);
      solver.packMapProduct(data.map, map);
    }
    const winds = data.winds ? sampleSurfaceWinds(shown, shownFields) : null;
    let swath: Uint8Array | null = null;
    if (data.wantSwath) {
      swath = new Uint8Array(shown.nx * shown.ny * 4);
      packRainSwath(shown, shownFields, swath);
    }
    let coldPool: Uint8Array | null = null;
    if (data.wantColdPool) {
      coldPool = new Uint8Array(shown.nx * shown.ny * 4);
      packColdPoolMap(shown, shownFields, coldPool);
    }
    let field: Uint8Array | null = null;
    const fieldMode = data.fieldMode && data.fieldMode !== "off" ? data.fieldMode : null;
    if (fieldMode) {
      const d = volumeDisplaySize(shown.nx, shown.ny, shown.nz);
      field = new Uint8Array(d.nx * d.ny * d.nz * 4);
      packFieldVolume(fieldMode, shown, shownFields, field);
    }
    let vortex: Float32Array | null = null;
    if (data.wantVortex) {
      vortex = packVortexLevels(findVortexColumn(shown, shownFields));
    }
    let ground: Uint8Array | null = null;
    if (data.wantVolume || data.map || data.winds || data.wantSwath || data.wantColdPool) {
      ground = new Uint8Array(shown.nx * shown.ny * 4);
      packGroundCover(shown, shownFields, ground, live.groundCoverOffset());
    }
    const probe = data.probe
      ? sampleColumn(mapped, mappedFields, data.probe.i, data.probe.j, solver.time)
      : null;
    const section = data.section
      ? sampleSection(mapped, mappedFields, data.section)
      : null;
    publish({
      volume,
      map,
      mapId: data.map,
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
      refreshStats: !!data.wantVolume,
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
}

(self as unknown as { postMessage(message: unknown): void }).postMessage({
  type: "hello",
});
