import { SetupScreen, SetupValues } from "./setup/SetupScreen";
import { SynopticSetup, defaultSynoptic, cloneSynoptic } from "./sim/synoptic";
import type { DrawnFront, MapPoint } from "./sim/synoptic";
import {
  copyFullVolumeToDisplay,
  Grid3D,
  gridFromDomain,
  type DomainConfig,
} from "./sim/Grid3D";
import { FluidSolver } from "./sim/FluidSolver";
import type { LightningKind } from "./sim/FluidSolver";
import type { SimBackend } from "./sim/SimBackend";
import { WebGPUBackend } from "./sim/WebGPUBackend";
import { LiveBridge, LiveState } from "./sim/LiveBridge";
import { CloudRainRenderer } from "./render/CloudRainRenderer";
import { Radar2DView } from "./render/Radar2DView";
import { SkewTEditor } from "./skewt/SkewTEditor";
import { HodographEditor } from "./skewt/HodographEditor";
import { SynopticEditor } from "./setup/SynopticEditor";
import { defaultSounding, SoundingLevel } from "./sim/thermo";
import { formatSolarClock, sunDirection } from "./sim/SurfaceRadiation";
import { MAP_PRODUCTS, MapProductId, paintLegend } from "./sim/mapProducts";
import { sampleSurfaceWinds } from "./sim/surfaceWinds";
import { FrameStore } from "./sim/FrameStore";
import { BATCH_FIXED_DT, runBatch } from "./sim/BatchRunner";
import { downloadSave, parseSave, StormforgeSave } from "./sim/SaveFile";

type PanelView = "skewt" | "hodograph" | "fronts";
type SessionMode = "live" | "batching" | "playback";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** True when two front polylines are the same line. */
function samePoints(a: MapPoint[], b: MapPoint[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i].x - b[i].x) > 1e-6) return false;
    if (Math.abs(a[i].y - b[i].y) > 1e-6) return false;
  }
  return true;
}

export class App {
  private setup: SetupScreen;
  private simScreen: HTMLElement;
  private viewport: HTMLElement;
  private statsEl: HTMLElement;
  private importBox: HTMLElement;
  private importText: HTMLTextAreaElement;
  private skewtCanvas: HTMLCanvasElement | null = null;
  private hodoCanvas: HTMLCanvasElement | null = null;
  private modeTabs: HTMLElement | null = null;
  private panelTitle: HTMLElement | null = null;
  private panelDesc: HTMLElement | null = null;
  private renderer: CloudRainRenderer | null = null;
  private radar2d: Radar2DView | null = null;
  private solver: SimBackend | null = null;
  private skewt: SkewTEditor | null = null;
  private hodo: HodographEditor | null = null;
  /** Front editor inside the running simulation. */
  private frontEditor: SynopticEditor | null = null;
  private frontsApplyTimer = 0;
  private sounding: SoundingLevel[] = defaultSounding(12000, 41);
  private panelView: PanelView = "skewt";
  private bubbleStrength = 3;
  private paused = false;
  /** Freeze sun/clock only; simulation keeps running. */
  private clockPaused = false;
  private lightningFreq = 1;
  private raf = 0;
  private lastTs = 0;
  private runName = "Stormforge Run";
  private scrubbingSolar = false;
  private showClouds = true;
  /** 3D radar plane in the Three.js viewport. */
  private showRadar3d = false;
  /** Full 2D map overlay (refl / doppler / cape / tsfc). */
  private showRadar2d = false;
  /** Surface wind arrow mesh / 2D overlay (live fields only). */
  private showSurfaceWinds = false;
  private mapProduct: MapProductId = "refl";
  /** Last sim-time bucket written into the live 2D map / radar plane. */
  private mapBucket = -1;
  private mapPackedProduct: MapProductId | null = null;
  private sessionMode: SessionMode = "live";
  private frameStore: FrameStore | null = null;
  private playbackIndex = 0;
  private playbackPlaying = false;
  private playbackSpeed = 1;
  /** Sim seconds per wall second. 1 is realtime. Lightning flashes at every speed. */
  private simSpeed = 40;
  /** Live physics, off the render thread. */
  private live: LiveBridge | null = null;
  private liveDebt = 0;
  private liveVolumeAsk = 0;
  private liveDth: number | null = null;
  private liveCloud: { cloudMax: number; rainMax: number; cloudMass: number } | null = null;
  private outputIntervalSec = 5;
  private batchCancel = false;
  private pendingSetup: SetupValues | null = null;
  private synoptic: SynopticSetup = defaultSynoptic();
  /** Where the fronts are in the running simulation (they drift east). */
  private simFronts: DrawnFront[] = [];
  /** The pattern the front editor last handed over, before merging. */
  private lastEditorSetup: SynopticSetup | null = null;
  private playbackAccumMs = 0;
  /** Pending save to apply after the new run mounts (for load-save flow). */
  private pendingLoadSave: StormforgeSave | null = null;

  constructor(private host: HTMLElement) {
    this.host.innerHTML = "";
    this.setup = new SetupScreen((v) => void this.startRun(v));
    this.host.appendChild(this.setup.root);

    this.simScreen = document.createElement("div");
    this.simScreen.id = "sim-screen";
    this.simScreen.className = "screen";
    this.simScreen.innerHTML = `
      <div class="sim-body">
        <div id="viewport">
          <button type="button" id="btn-sim-menu" class="corner-menu-btn" aria-expanded="false" aria-controls="sim-menu">Menu</button>
          <div id="sim-menu" class="sim-menu hidden">
            <div class="sim-menu-head">
              <span class="brand">Stormforge</span>
              <button type="button" id="btn-sim-menu-close">Close</button>
            </div>
            <span class="stats" id="sim-stats">—</span>
            <div class="sim-menu-actions">
              <button id="btn-pause" title="Pause / resume simulation time (Space)">Pause</button>
              <button id="btn-bubble">Respawn bubble</button>
              <button id="btn-reset">Reset</button>
              <button id="btn-menu">Main menu</button>
              <button id="btn-clouds" class="active" title="3D cloud volume (turn off to reduce lag)">Clouds</button>
              <button id="btn-radar3d" title="Radar plane in the 3D view">Radar 3D</button>
              <button id="btn-radar2d" title="2D maps: Reflectivity, Doppler, CAPE, Surface T">Maps 2D</button>
              <button id="btn-winds" title="Surface wind direction arrows (overlay on 3D or Maps 2D)">Winds</button>
              <button id="btn-teleport" title="Open the map and click to move">Teleport</button>
              <button id="btn-save" title="Save current simulation setup to a .sfz file">Save</button>
              <label class="file-btn file-btn-load" title="Load a .sfz save file">
                Load
                <input id="load-file" type="file" accept=".sfz,.json" hidden />
              </label>
            </div>
            <label class="sim-speed">
              Simulation speed
              <select id="sim-speed">
                <option value="1">Realtime</option>
                <option value="5">5×</option>
                <option value="15">15×</option>
                <option value="40" selected>40×</option>
                <option value="75">75×</option>
                <option value="100">100×</option>
              </select>
            </label>
            <label class="sim-speed">
              Cloud look
              <select id="cloud-look" title="Sun and erosion matched to a reference photo. Live sun follows the clock.">
                <option value="">Live sun</option>
                <option value="A_towerWithAnvil">Tower with anvil</option>
                <option value="B_matureAnvil">Mature anvil</option>
                <option value="C_flatBaseRain">Flat base and rain</option>
                <option value="D_towerPileus">Tower with pileus</option>
              </select>
            </label>
            <div class="cloud-tune">
              <label>
                Core density
                <input id="cloud-gain" type="range" min="0.25" max="2.5" step="0.05" value="1" />
                <span id="cloud-gain-val">1.00</span>
              </label>
              <label>
                Base darkness
                <input id="cloud-sigma" type="range" min="0.015" max="0.12" step="0.005" value="0.08" />
                <span id="cloud-sigma-val">0.080</span>
              </label>
              <label>
                Liquid billow
                <input id="cloud-erosion" type="range" min="0" max="1" step="0.05" value="0.6" />
                <span id="cloud-erosion-val">0.60</span>
              </label>
              <label>
                Ice fibres
                <input id="cloud-erosion-ice" type="range" min="0" max="1" step="0.05" value="0.25" />
                <span id="cloud-erosion-ice-val">0.25</span>
              </label>
              <label>
                Rain shaft thickness
                <input id="cloud-sigma-rain" type="range" min="0.005" max="0.3" step="0.005" value="0.18" />
                <span id="cloud-sigma-rain-val">0.180</span>
              </label>
              <label>
                Lightning frequency
                <input id="lightning-freq" type="range" min="0" max="1" step="0.01" value="1" />
                <span id="lightning-freq-val">100%</span>
              </label>
              <label>
                Vorticity
                <input id="vorticity" type="range" min="0" max="5" step="0.1" value="0" />
                <span id="vorticity-val">0.0</span>
              </label>
            </div>
            <div class="sun-controls">
              <span id="sun-clock" class="sun-clock">12:00 · day</span>
              <div id="sun-panel" class="sun-panel">
                <label>
                  Hour
                  <input id="live-hour" type="range" min="0" max="23.75" step="0.25" value="12" />
                  <span id="live-hour-val">12:00</span>
                </label>
                <label>
                  Latitude
                  <input id="live-lat" type="range" min="-60" max="60" step="1" value="35" />
                  <span id="live-lat-val">35°</span>
                </label>
                <label>
                  Month
                  <input id="live-month" type="range" min="1" max="12" step="1" value="6" />
                  <span id="live-month-val">Jun</span>
                </label>
                <label>
                  Day length
                  <input id="live-daylen" type="range" min="1" max="10" step="1" value="3" />
                  <span id="live-daylen-val">~3m</span>
                </label>
                <label class="pause-time-label">
                  <input id="live-pause" type="checkbox" />
                  Pause clock / sun
                </label>
              </div>
            </div>
          </div>
          <div class="viewport-hint" id="viewport-hint">
            <span id="look-hint">Drag to look · scroll to zoom</span>
            <span id="player-where">0.0 km E · 0.0 km N · 2 m</span>
          </div>
          <div class="crosshair" id="view-crosshair" aria-hidden="true"></div>
          <div id="teleport-panel" class="teleport-panel hidden">
            <div class="teleport-card">
              <h3>Teleport</h3>
              <p class="hint">Click the map. North is up. You stay facing the way you were looking.</p>
              <canvas id="teleport-map" width="280" height="280"></canvas>
              <label class="teleport-alt">
                Altitude
                <input id="teleport-alt" type="range" min="2" max="12000" step="10" value="2" />
                <span id="teleport-alt-val">2 m</span>
              </label>
              <p class="hint" id="teleport-where">Center · 2 m</p>
            </div>
          </div>
          <div id="radar-legend" class="radar-legend hidden" aria-hidden="true">
            <div class="radar-legend-title">dBZ</div>
            <div class="radar-legend-bar"></div>
            <div class="radar-legend-ticks"><span>5</span><span>30</span><span>50</span><span>70</span></div>
          </div>
          <div id="batch-overlay" class="batch-overlay hidden" aria-live="polite">
            <div class="batch-overlay-card">
              <h3>Batch run</h3>
              <p id="batch-status">Preparing…</p>
              <div class="batch-progress-track">
                <div id="batch-progress-bar" class="batch-progress-bar"></div>
              </div>
              <p id="batch-progress-meta" class="hint">—</p>
              <button type="button" id="btn-batch-cancel">Cancel</button>
            </div>
          </div>
          <div id="playback-bar" class="playback-bar hidden">
            <button type="button" id="btn-playback-play">Play</button>
            <input id="playback-scrub" type="range" min="0" max="0" step="1" value="0" />
            <select id="playback-speed" title="Playback speed">
              <option value="0.5">0.5×</option>
              <option value="1" selected>1×</option>
              <option value="2">2×</option>
              <option value="4">4×</option>
            </select>
            <span id="playback-meta" class="playback-meta">frame 0/0</span>
          </div>
        </div>
        <aside class="side-panel">
          <div class="side-panel-head">
            <h2 id="panel-title">Skew-T</h2>
            <button id="btn-hide-panel" class="panel-close" title="Hide panel">✕</button>
          </div>
          <p class="panel-desc" id="panel-desc">Orange = T, green = Td. Wind barbs are readout — use Hodograph to edit wind.</p>
          <div class="panel-toggle">
            <button id="view-skewt" class="active">Skew-T</button>
            <button id="view-hodo">Hodograph</button>
            <button id="view-fronts">Fronts</button>
          </div>
          <div class="mode-tabs" id="mode-tabs">
            <button id="mode-t" class="active">T</button>
            <button id="mode-td">Td</button>
          </div>
          <canvas id="skewt-canvas"></canvas>
          <div id="skewt-metrics" class="skewt-metrics"></div>
          <canvas id="hodo-canvas" class="hidden"></canvas>
          <div id="hodo-metrics" class="skewt-metrics hidden"></div>
          <div id="fronts-panel" class="fronts-panel hidden">
            <div id="fronts-editor-host"></div>
            <div class="fronts-apply-row">
              <button id="btn-apply-fronts" class="primary">Apply fronts</button>
              <span class="hint" id="fronts-status">Applies to the running simulation</span>
            </div>
          </div>
          <div class="panel-actions">
            <button id="btn-apply" class="primary">Apply sounding</button>
            <button id="btn-export">Export</button>
            <button id="btn-import">Import</button>
            <button id="btn-default">Default</button>
          </div>
          <div id="import-box">
            <textarea id="import-text" placeholder="Paste SHARPpy %RAW%, Extra CSV, SPC/UWYO, CM1 input_sounding, or Stormforge CSV…"></textarea>
            <div class="import-row">
              <button id="btn-import-go" class="primary">Load &amp; apply</button>
              <label class="file-btn">
                Open file
                <input id="import-file" type="file" accept="*/*" hidden />
              </label>
            </div>
            <span class="hint" id="import-msg">Formats: SHARPpy · Extra · SPC · CM1 · Stormforge (any filename)</span>
          </div>
        </aside>
        <button id="btn-show-panel" class="panel-reopen hidden">Show sounding ▸</button>
      </div>
    `;
    this.host.appendChild(this.simScreen);
    paintLegend(
      this.simScreen.querySelector("#radar-legend .radar-legend-bar") as HTMLElement,
      this.simScreen.querySelector("#radar-legend .radar-legend-ticks") as HTMLElement,
      MAP_PRODUCTS.refl,
    );

    this.viewport = this.simScreen.querySelector("#viewport") as HTMLElement;
    this.statsEl = this.simScreen.querySelector("#sim-stats") as HTMLElement;
    this.importBox = this.simScreen.querySelector("#import-box") as HTMLElement;
    this.importText = this.simScreen.querySelector(
      "#import-text",
    ) as HTMLTextAreaElement;
    this.skewtCanvas = this.simScreen.querySelector(
      "#skewt-canvas",
    ) as HTMLCanvasElement;
    this.hodoCanvas = this.simScreen.querySelector(
      "#hodo-canvas",
    ) as HTMLCanvasElement;
    this.modeTabs = this.simScreen.querySelector("#mode-tabs") as HTMLElement;
    this.panelTitle = this.simScreen.querySelector("#panel-title") as HTMLElement;
    this.panelDesc = this.simScreen.querySelector("#panel-desc") as HTMLElement;

    this.bindSimUi();
  }

  private syncSoundingFromEditors(): SoundingLevel[] {
    if (this.panelView === "hodograph" && this.hodo) {
      this.sounding = this.hodo.getLevels();
      this.skewt?.setLevels(this.sounding);
    } else if (this.skewt) {
      this.sounding = this.skewt.getLevels();
      this.hodo?.setLevels(this.sounding);
    }
    return this.sounding;
  }

  private setPanelView(view: PanelView): void {
    this.panelView = view;
    const q = (id: string) => this.simScreen.querySelector(id) as HTMLElement;
    q("#view-skewt").classList.toggle("active", view === "skewt");
    q("#view-hodo").classList.toggle("active", view === "hodograph");
    q("#view-fronts").classList.toggle("active", view === "fronts");

    const metrics = this.simScreen.querySelector(
      "#skewt-metrics",
    ) as HTMLElement | null;
    const hodoMetrics = this.simScreen.querySelector(
      "#hodo-metrics",
    ) as HTMLElement | null;
    const frontsPanel = this.simScreen.querySelector(
      "#fronts-panel",
    ) as HTMLElement | null;

    if (view === "fronts") {
      // Keep the sounding edits in sync before the front map is shown.
      const hodo = this.hodo;
      const skewt = this.skewt;
      if (hodo) {
        this.sounding = hodo.getLevels();
        skewt?.setLevels(this.sounding);
      } else if (skewt) {
        this.sounding = skewt.getLevels();
      }
      this.skewtCanvas?.classList.add("hidden");
      metrics?.classList.add("hidden");
      this.hodoCanvas?.classList.add("hidden");
      hodoMetrics?.classList.add("hidden");
      this.modeTabs?.classList.add("hidden");
      frontsPanel?.classList.remove("hidden");
      if (this.panelTitle) this.panelTitle.textContent = "Fronts";
      if (this.panelDesc) {
        this.panelDesc.textContent =
          "Draw a front: the air on the left of your stroke is the cold or dry side. Edits apply to the running simulation.";
      }
      requestAnimationFrame(() => this.frontEditor?.resize());
      return;
    }

    frontsPanel?.classList.add("hidden");

    if (view === "skewt") {
      // Pull wind edits from hodograph before showing thermo
      if (this.hodo) {
        this.sounding = this.hodo.getLevels();
        this.skewt?.setLevels(this.sounding);
      }
      this.skewtCanvas?.classList.remove("hidden");
      metrics?.classList.remove("hidden");
      hodoMetrics?.classList.add("hidden");
      this.hodoCanvas?.classList.add("hidden");
      this.modeTabs?.classList.remove("hidden");
      if (this.panelTitle) this.panelTitle.textContent = "Skew-T";
      if (this.panelDesc) {
        this.panelDesc.textContent =
          "Orange = T, green = Td. Metrics update as you edit. Wind via Hodograph.";
      }
      requestAnimationFrame(() => this.skewt?.resize());
    } else {
      if (this.skewt) {
        this.sounding = this.skewt.getLevels();
        this.hodo?.setLevels(this.sounding);
      }
      this.skewtCanvas?.classList.add("hidden");
      metrics?.classList.add("hidden");
      hodoMetrics?.classList.remove("hidden");
      this.hodoCanvas?.classList.remove("hidden");
      this.modeTabs?.classList.add("hidden");
      if (this.panelTitle) this.panelTitle.textContent = "Hodograph";
      if (this.panelDesc) {
        this.panelDesc.textContent =
          "Pick a height on the left, drag the tip (or scroll for speed). Plot is north-up: tip shows wind toward (+v up, +u right). Apply when done.";
      }
      // Two frames: display:none → visible must layout before measuring
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this.hodo?.resize());
      });
    }
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.syncPauseButton();
  }

  /**
   * Push a new synoptic pattern into the running simulation. The front
   * forcing re-imposes the pattern on the fields, so the change shows up in
   * the next steps instead of waiting for a restart.
   */
  private applyFronts(setup: SynopticSetup): void {
    this.lastEditorSetup = cloneSynoptic(setup);
    const merged = this.mergeSimPositions(setup);
    this.synoptic = merged;
    this.solver?.setSynoptic(merged);
    this.live?.synoptic(merged);
    this.pushFrontsToMap();
    const status = this.simScreen.querySelector("#fronts-status") as HTMLElement | null;
    if (status) {
      const fronts = merged.fronts.filter((f) => f.enabled).length;
      status.textContent = `Applied · ${fronts} front${fronts === 1 ? "" : "s"} active`;
    }
  }

  /**
   * Fronts travel east while the simulation runs, so the pattern the editor
   * holds is behind the one on the map. A front the user has not touched
   * keeps the position it has in the simulation, so applying the pattern
   * does not snap it back to where it was drawn.
   */
  private mergeSimPositions(setup: SynopticSetup): SynopticSetup {
    const out = cloneSynoptic(setup);
    if (!this.simFronts.length) return out;
    for (const front of out.fronts) {
      const sim = this.simFronts.find((f) => f.id === front.id);
      if (!sim) continue;
      const prev = this.lastEditorSetup?.fronts.find((f) => f.id === front.id);
      const untouched = !prev || samePoints(prev.points, front.points);
      if (!untouched) continue;
      front.points = sim.points.map((p) => ({ x: p.x, y: p.y }));
    }
    return out;
  }

  /** Apply the edited pattern a moment after the user stops changing it. */
  private scheduleFrontsApply(setup: SynopticSetup): void {
    const status = this.simScreen.querySelector("#fronts-status") as HTMLElement | null;
    if (status) status.textContent = "Pending…";
    if (this.frontsApplyTimer) window.clearTimeout(this.frontsApplyTimer);
    this.frontsApplyTimer = window.setTimeout(() => {
      this.frontsApplyTimer = 0;
      this.applyFronts(setup);
    }, 500);
  }

  /** Draw the active fronts on the 2D map so they are visible while running. */
  private pushFrontsToMap(): void {
    this.radar2d?.setFronts(this.synoptic.fronts);
  }

  private syncPauseButton(): void {
    const btn = this.simScreen.querySelector(
      "#btn-pause",
    ) as HTMLButtonElement | null;
    if (!btn) return;
    if (this.sessionMode === "playback") {
      btn.disabled = false;
      btn.textContent = this.playbackPlaying ? "Pause" : "Resume";
      btn.classList.toggle("active", !this.playbackPlaying);
      btn.title = "Pause / resume playback (Space)";
    } else if (this.sessionMode === "batching") {
      btn.textContent = "Pause";
      btn.classList.remove("active");
      btn.disabled = true;
      btn.title = "Batch integrating…";
    } else {
      btn.disabled = false;
      btn.textContent = this.paused ? "Resume" : "Pause";
      btn.classList.toggle("active", this.paused);
      btn.title = "Pause / resume simulation time (Space)";
    }
  }

  private setPlaybackPlaying(playing: boolean): void {
    this.playbackPlaying = playing;
    this.paused = !playing;
    const playBtn = this.simScreen.querySelector(
      "#btn-playback-play",
    ) as HTMLButtonElement | null;
    if (playBtn) {
      playBtn.textContent = playing ? "Pause" : "Play";
      playBtn.classList.toggle("active", playing);
    }
    this.syncPauseButton();
  }

  private syncSessionControls(): void {
    const review = this.sessionMode === "playback";
    const batching = this.sessionMode === "batching";
    const lockPhysics = review || batching;
    for (const id of [
      "#btn-bubble",
      "#btn-reset",
      "#btn-apply",
      "#btn-import",
      "#btn-import-go",
      "#btn-default",
    ]) {
      const el = this.simScreen.querySelector(id) as HTMLButtonElement | null;
      if (el) el.disabled = lockPhysics;
    }
    const sunPanel = this.simScreen.querySelector(
      "#sun-panel",
    ) as HTMLElement | null;
    if (sunPanel) {
      for (const input of sunPanel.querySelectorAll("input")) {
        (input as HTMLInputElement).disabled = lockPhysics;
      }
    }
    this.radar2d?.setRecordedOnly(review);
    // Winds need live fields — not stored in batch frames
    if (review && this.showSurfaceWinds) {
      this.showSurfaceWinds = false;
      this.renderer?.setWindsVisible(false);
      this.radar2d?.setWindsVisible(false);
      this.simScreen
        .querySelector("#btn-winds")
        ?.classList.remove("active");
    }
    const windsBtn = this.simScreen.querySelector(
      "#btn-winds",
    ) as HTMLButtonElement | null;
    if (windsBtn) {
      windsBtn.disabled = review;
      windsBtn.title = review
        ? "Surface winds not recorded in batch review"
        : "Surface wind direction arrows (overlay on 3D or Maps 2D)";
    }
    this.viewport.classList.toggle("playback-mode", review);
    this.simScreen
      .querySelector("#playback-bar")
      ?.classList.toggle("hidden", !review);
    this.simScreen
      .querySelector("#batch-overlay")
      ?.classList.toggle("hidden", !batching);
    const hint = this.simScreen.querySelector("#look-hint") as HTMLElement | null;
    if (hint) {
      if (review) {
        hint.textContent = "Scrub the timeline · open Menu for clouds and maps";
      } else if (batching) {
        hint.textContent = "Integrating batch run…";
      } else {
        hint.textContent = "Drag to look · scroll to zoom";
      }
    }
    this.syncPauseButton();
  }

  private setClockPaused(paused: boolean): void {
    this.clockPaused = paused;
    if (this.solver) this.solver.clockPaused = paused;
    this.live?.clock(paused);
    const chk = this.simScreen.querySelector(
      "#live-pause",
    ) as HTMLInputElement | null;
    if (chk) chk.checked = paused;
  }

  private bindSimUi(): void {
    const q = (id: string) => this.simScreen.querySelector(id) as HTMLElement;

    q("#btn-hide-panel").addEventListener("click", () => {
      const aside = this.simScreen.querySelector(".side-panel") as HTMLElement;
      aside.classList.add("hidden");
      q("#btn-show-panel").classList.remove("hidden");
      // resize the renderer to fill
      this.renderer?.resize();
    });
    q("#btn-show-panel").addEventListener("click", () => {
      const aside = this.simScreen.querySelector(".side-panel") as HTMLElement;
      aside.classList.remove("hidden");
      q("#btn-show-panel").classList.add("hidden");
      this.skewt?.resize();
      this.hodo?.resize();
      this.renderer?.resize();
     });
    q("#btn-pause").addEventListener("click", () => {
      if (this.sessionMode === "batching") return;
      if (this.sessionMode === "playback") {
        this.setPlaybackPlaying(!this.playbackPlaying);
      } else {
        this.setPaused(!this.paused);
      }
    });

    q("#live-pause").addEventListener("change", () => {
      if (this.sessionMode !== "live") return;
      this.setClockPaused((q("#live-pause") as HTMLInputElement).checked);
    });

    window.addEventListener("keydown", (e) => {
      if (e.code !== "Space") return;
      if (!this.simScreen.classList.contains("active")) return;
      if (this.sessionMode === "batching") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      if (this.sessionMode === "playback") {
        this.setPlaybackPlaying(!this.playbackPlaying);
      } else {
        this.setPaused(!this.paused);
      }
    });

    q("#btn-bubble").addEventListener("click", () => {
      if (this.sessionMode !== "live" || !this.solver) return;
      this.solver.respawnBubble({ bubbleStrength: this.bubbleStrength });
      this.live?.bubble(this.bubbleStrength);
    });

    q("#btn-reset").addEventListener("click", () => {
      if (this.sessionMode !== "live" || !this.solver) return;
      const levels = this.syncSoundingFromEditors();
      const opts = {
        bubbleStrength: this.bubbleStrength,
        synoptic: this.synoptic,
      };
      this.solver.reset(levels, opts);
      this.live?.reset(levels, opts);
    });

    q("#btn-batch-cancel").addEventListener("click", () => {
      this.batchCancel = true;
    });

    q("#btn-playback-play").addEventListener("click", () => {
      if (this.sessionMode !== "playback") return;
      this.setPlaybackPlaying(!this.playbackPlaying);
    });

    const scrub = q("#playback-scrub") as HTMLInputElement;
    scrub.addEventListener("input", () => {
      if (this.sessionMode !== "playback") return;
      this.playbackIndex = Number(scrub.value);
      this.playbackAccumMs = 0;
      this.showPlaybackFrame(this.playbackIndex);
    });

    const speedSel = q("#playback-speed") as HTMLSelectElement;
    speedSel.addEventListener("change", () => {
      this.playbackSpeed = Number(speedSel.value) || 1;
    });

    q("#btn-menu").addEventListener("click", () => {
      if (this.sessionMode === "batching") {
        // Let beginBatch observe cancel and tear down safely
        this.batchCancel = true;
        const status = this.simScreen.querySelector(
          "#batch-status",
        ) as HTMLElement | null;
        if (status) status.textContent = "Cancelling…";
        return;
      }
      this.returnToMenu();
    });

    const anyRadar = () => this.showRadar3d || this.showRadar2d;
    const ensureOneView = () => {
      if (!this.showClouds && !anyRadar()) this.showClouds = true;
    };

    const syncViewToggles = () => {
      q("#btn-clouds").classList.toggle("active", this.showClouds);
      q("#btn-radar3d").classList.toggle("active", this.showRadar3d);
      q("#btn-radar2d").classList.toggle("active", this.showRadar2d);
      q("#btn-winds").classList.toggle("active", this.showSurfaceWinds);
      const legend = q("#radar-legend");
      // 3D legend only when 3D radar is on and 2D overlay is not covering
      const show3dLegend = this.showRadar3d && !this.showRadar2d;
      legend.classList.toggle("hidden", !show3dLegend);
      legend.setAttribute("aria-hidden", show3dLegend ? "false" : "true");
      this.radar2d?.setVisible(this.showRadar2d);
      this.renderer?.setWindsVisible(
        this.showSurfaceWinds && !this.showRadar2d,
      );
      this.radar2d?.setWindsVisible(
        this.showSurfaceWinds && this.showRadar2d,
      );
    };

    q("#btn-clouds").addEventListener("click", () => {
      this.showClouds = !this.showClouds;
      ensureOneView();
      syncViewToggles();
      if (this.sessionMode === "playback") {
        this.showPlaybackFrame(this.playbackIndex);
      }
    });

    q("#btn-radar3d").addEventListener("click", () => {
      this.showRadar3d = !this.showRadar3d;
      if (this.showRadar3d) this.mapBucket = -1;
      ensureOneView();
      syncViewToggles();
      if (this.sessionMode === "playback") {
        this.showPlaybackFrame(this.playbackIndex);
      }
    });

    q("#btn-radar2d").addEventListener("click", () => {
      this.showRadar2d = !this.showRadar2d;
      if (this.showRadar2d) this.mapBucket = -1;
      ensureOneView();
      syncViewToggles();
      if (this.sessionMode === "playback") {
        this.showPlaybackFrame(this.playbackIndex);
      }
    });

    q("#btn-winds").addEventListener("click", () => {
      if (this.sessionMode === "playback" || this.sessionMode === "batching") {
        return;
      }
      this.showSurfaceWinds = !this.showSurfaceWinds;
      syncViewToggles();
      this.pushSurfaceWinds();
    });

    this.bindTeleport();

    const menu = q("#sim-menu");
    const menuBtn = q("#btn-sim-menu");
    const setMenu = (open: boolean) => {
      menu.classList.toggle("hidden", !open);
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    };
    menuBtn.addEventListener("click", () => {
      setMenu(menu.classList.contains("hidden"));
    });
    q("#btn-sim-menu-close").addEventListener("click", () => setMenu(false));

    const speedEl = q("#sim-speed") as HTMLSelectElement;
    speedEl.addEventListener("change", () => {
      const next = Number(speedEl.value);
      this.simSpeed = next === 1 || next === 5 || next === 15 || next === 40 || next === 75 || next === 100 ? next : 40;
      if (this.simSpeed !== 1) {
        this.renderer?.clearLightning();
        this.radar2d?.setLightning([]);
      }
    });

    const lookEl = q("#cloud-look") as HTMLSelectElement;
    const gainEl = q("#cloud-gain") as HTMLInputElement;
    const sigmaEl = q("#cloud-sigma") as HTMLInputElement;
    const sigmaRainEl = q("#cloud-sigma-rain") as HTMLInputElement;
    const erosionEl = q("#cloud-erosion") as HTMLInputElement;
    const erosionIceEl = q("#cloud-erosion-ice") as HTMLInputElement;
    const lightningFreqEl = q("#lightning-freq") as HTMLInputElement;
    const showTune = () => {
      const tune = this.renderer?.cloudTune();
      if (!tune) return;
      gainEl.value = String(tune.gain);
      sigmaEl.value = String(tune.sigmaLiquid);
      sigmaRainEl.value = String(tune.sigmaRain);
      erosionEl.value = String(tune.erosionLiquid);
      erosionIceEl.value = String(tune.erosionIce);
      (q("#cloud-gain-val") as HTMLElement).textContent = tune.gain.toFixed(2);
      (q("#cloud-sigma-val") as HTMLElement).textContent = tune.sigmaLiquid.toFixed(3);
      (q("#cloud-sigma-rain-val") as HTMLElement).textContent = tune.sigmaRain.toFixed(3);
      (q("#cloud-erosion-val") as HTMLElement).textContent = tune.erosionLiquid.toFixed(2);
      (q("#cloud-erosion-ice-val") as HTMLElement).textContent = tune.erosionIce.toFixed(2);
    };
    const pushTune = () => {
      const gain = Number(gainEl.value);
      const sigmaLiquid = Number(sigmaEl.value);
      const sigmaRain = Number(sigmaRainEl.value);
      const erosionLiquid = Number(erosionEl.value);
      const erosionIce = Number(erosionIceEl.value);
      this.renderer?.setCloudTune({ gain, sigmaLiquid, sigmaRain, erosionLiquid, erosionIce });
      (q("#cloud-gain-val") as HTMLElement).textContent = gain.toFixed(2);
      (q("#cloud-sigma-val") as HTMLElement).textContent = sigmaLiquid.toFixed(3);
      (q("#cloud-sigma-rain-val") as HTMLElement).textContent = sigmaRain.toFixed(3);
      (q("#cloud-erosion-val") as HTMLElement).textContent = erosionLiquid.toFixed(2);
      (q("#cloud-erosion-ice-val") as HTMLElement).textContent = erosionIce.toFixed(2);
    };
    lookEl.addEventListener("change", () => {
      this.renderer?.setCloudLook(lookEl.value);
      showTune();
    });
    for (const el of [gainEl, sigmaEl, sigmaRainEl, erosionEl, erosionIceEl]) {
      el.addEventListener("input", pushTune);
    }
    lightningFreqEl.addEventListener("input", () => {
      this.lightningFreq = Number(lightningFreqEl.value);
      (q("#lightning-freq-val") as HTMLElement).textContent = Math.round(this.lightningFreq * 100) + "%";
    });
    const vorticityEl = q("#vorticity") as HTMLInputElement;
    vorticityEl.addEventListener("input", () => {
      const v = Number(vorticityEl.value);
      if (this.solver) this.solver.vorticityStrength = v;
      (q("#vorticity-val") as HTMLElement).textContent = v.toFixed(1);
    });

    const liveHour = q("#live-hour") as HTMLInputElement;
    const liveLat = q("#live-lat") as HTMLInputElement;
    const liveMonth = q("#live-month") as HTMLInputElement;
    const liveDaylen = q("#live-daylen") as HTMLInputElement;

    /** Map wall-clock day length (minutes) → diurnalSpeed. */
    const speedFromDayLen = (minutes: number) =>
      Math.max(2, Math.round(45 / Math.max(1, minutes)));

    const applyLiveSun = () => {
      if (!this.solver) return;
      const dayMin = Number(liveDaylen.value);
      const radiation = {
        solarHour: Number(liveHour.value),
        latitudeDeg: Number(liveLat.value),
        month: Number(liveMonth.value),
        diurnalSpeed: speedFromDayLen(dayMin),
      };
      this.solver.setRadiation(radiation);
      this.live?.radiation(radiation);
      (
        this.simScreen.querySelector("#live-daylen-val") as HTMLElement
      ).textContent = `~${dayMin}m`;
      this.syncSunUi(false);
    };

    liveHour.addEventListener("pointerdown", () => {
      this.scrubbingSolar = true;
    });
    liveHour.addEventListener("pointerup", () => {
      this.scrubbingSolar = false;
    });
    liveHour.addEventListener("pointerleave", () => {
      this.scrubbingSolar = false;
    });
    liveHour.addEventListener("input", applyLiveSun);
    liveLat.addEventListener("input", applyLiveSun);
    liveMonth.addEventListener("input", applyLiveSun);
    liveDaylen.addEventListener("input", applyLiveSun);

    q("#view-skewt").addEventListener("click", () => this.setPanelView("skewt"));
    q("#view-hodo").addEventListener("click", () =>
      this.setPanelView("hodograph"),
    );
    q("#view-fronts").addEventListener("click", () => this.setPanelView("fronts"));

    const applyFrontsBtn = q("#btn-apply-fronts");
    applyFrontsBtn.addEventListener("click", () => {
      if (!this.frontEditor) return;
      this.applyFronts(this.frontEditor.getSetup());
    });

    q("#mode-t").addEventListener("click", () => {
      this.skewt?.setMode("T");
      q("#mode-t").classList.add("active");
      q("#mode-td").classList.remove("active");
    });
    q("#mode-td").addEventListener("click", () => {
      this.skewt?.setMode("Td");
      q("#mode-td").classList.add("active");
      q("#mode-t").classList.remove("active");
    });

    q("#btn-apply").addEventListener("click", () => {
      if (this.sessionMode !== "live" || !this.solver) return;
      const levels = this.syncSoundingFromEditors();
      const opts = {
        bubbleStrength: this.bubbleStrength,
        synoptic: this.synoptic,
      };
      this.solver.reset(levels, opts);
      this.live?.reset(levels, opts);
    });

    q("#btn-export").addEventListener("click", () => {
      this.syncSoundingFromEditors();
      const text =
        this.skewt?.exportText() ??
        ["alt_m,p_hPa,t_C,td_C,u,v"]
          .concat(
            this.sounding.map((l) =>
              [
                l.z.toFixed(1),
                (l.p / 100).toFixed(2),
                (l.T - 273.15).toFixed(2),
                (l.Td - 273.15).toFixed(2),
                l.u.toFixed(2),
                l.v.toFixed(2),
              ].join(","),
            ),
          )
          .join("\n");
      const blob = new Blob([text], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "stormforge_sounding.txt";
      a.click();
      URL.revokeObjectURL(a.href);
    });

    q("#btn-import").addEventListener("click", () => {
      this.importBox.classList.toggle("visible");
      if (this.importBox.classList.contains("visible")) {
        const panel = this.simScreen.querySelector(".side-panel");
        panel?.scrollTo({ top: panel.scrollHeight, behavior: "smooth" });
        this.importText.focus();
      }
    });

    const applyImported = (text: string) => {
      const msg = q("#import-msg");
      if (!text.trim()) {
        msg.textContent = "Paste sounding text or open a file first.";
        msg.style.color = "var(--danger)";
        return;
      }
      if (!this.skewt) {
        msg.textContent = "Start a simulation before importing.";
        msg.style.color = "var(--danger)";
        return;
      }
      // Ensure Skew-T is visible so the user sees the result
      this.setPanelView("skewt");
      const res = this.skewt.importText(text);
      msg.textContent = res.message;
      msg.style.color = res.ok ? "var(--ok)" : "var(--danger)";
      if (res.ok) {
        this.sounding = this.skewt.getLevels();
        this.hodo?.setLevels(this.sounding);
        // Immediately re-init the sim so import is not a silent no-op
        if (this.solver && this.sessionMode === "live") {
          const opts = {
            bubbleStrength: this.bubbleStrength,
            synoptic: this.synoptic,
          };
          this.solver.reset(this.sounding, opts);
          this.live?.reset(this.sounding, opts);
          msg.textContent = `${res.message} Loaded into Skew-T and applied to the sim.`;
        } else if (res.ok) {
          msg.textContent = `${res.message} (review mode — not applied to physics)`;
        }
      }
    };

    q("#btn-import-go").addEventListener("click", () => {
      applyImported(this.importText.value);
    });

    const fileInput = this.simScreen.querySelector(
      "#import-file",
    ) as HTMLInputElement;
    fileInput?.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "");
        this.importText.value = text;
        applyImported(text);
        fileInput.value = "";
      };
      reader.readAsText(file);
    });

    q("#btn-default").addEventListener("click", () => {
      this.skewt?.resetDefault();
      if (this.skewt) {
        this.sounding = this.skewt.getLevels();
        this.hodo?.setLevels(this.sounding);
      }
    });

    // ── Save ──────────────────────────────────────────────────────────────────
    q("#btn-save").addEventListener("click", () => {
      this.saveToDisk();
    });

    // ── Load ─────────────────────────────────────────────────────────────────
    const loadFileInput = this.simScreen.querySelector(
      "#load-file",
    ) as HTMLInputElement;
    loadFileInput?.addEventListener("change", () => {
      const file = loadFileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "");
        loadFileInput.value = "";
        this.loadFromText(text);
      };
      reader.readAsText(file);
    });
  }

  private bindTeleport(): void {
    const panel = this.simScreen.querySelector("#teleport-panel") as HTMLElement;
    const map = this.simScreen.querySelector("#teleport-map") as HTMLCanvasElement;
    const alt = this.simScreen.querySelector("#teleport-alt") as HTMLInputElement;
    const altVal = this.simScreen.querySelector("#teleport-alt-val") as HTMLElement;
    const btn = this.simScreen.querySelector("#btn-teleport") as HTMLElement;

    btn.addEventListener("click", () => {
      const open = panel.classList.toggle("hidden") === false;
      btn.classList.toggle("active", open);
      if (!open || !this.renderer) return;
      const st = this.renderer.playerState();
      alt.value = String(Math.round(st.altitudeM));
      altVal.textContent = `${Math.round(st.altitudeM)} m`;
      this.drawTeleportMap();
      this.refreshPlayerHud();
    });

    alt.addEventListener("input", () => {
      altVal.textContent = `${alt.value} m`;
      if (!this.renderer) return;
      const st = this.renderer.playerState();
      this.renderer.teleportTo(st.xn, st.yn, Number(alt.value));
      this.drawTeleportMap();
      this.refreshPlayerHud();
    });

    map.addEventListener("click", (e) => {
      if (!this.renderer) return;
      const r = map.getBoundingClientRect();
      const xn = (e.clientX - r.left) / Math.max(1, r.width);
      const yn = 1 - (e.clientY - r.top) / Math.max(1, r.height);
      this.renderer.teleportTo(xn, yn, Number(alt.value));
      this.drawTeleportMap();
      this.refreshPlayerHud();
    });
  }

  private drawTeleportMap(): void {
    const map = this.simScreen.querySelector("#teleport-map") as HTMLCanvasElement | null;
    const ctx = map?.getContext("2d");
    if (!map || !ctx || !this.renderer) return;
    const w = map.width;
    const h = map.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#1d4a30";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(190, 230, 200, 0.28)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const x = (i / 8) * w;
      const y = (i / 8) * h;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#e4f2e8";
    ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.fillStyle = "#e8eef8";
    ctx.font = "12px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("N", w / 2, 6);
    ctx.textBaseline = "bottom";
    ctx.fillText("S", w / 2, h - 4);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("E", w - 16, h / 2);
    ctx.textAlign = "right";
    ctx.fillText("W", 16, h / 2);

    const p = this.renderer.playerState();
    ctx.fillStyle = "#ffd36a";
    ctx.beginPath();
    ctx.arc(p.xn * w, (1 - p.yn) * h, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#1a1408";
    ctx.stroke();
  }

  private refreshPlayerHud(): void {
    if (!this.renderer) return;
    const p = this.renderer.playerState();
    const east = p.eastM / 1000;
    const north = p.northM / 1000;
    const fmt = (km: number, pos: string, neg: string) =>
      `${Math.abs(km).toFixed(1)} km ${km >= 0 ? pos : neg}`;
    const place = `${fmt(east, "E", "W")} · ${fmt(north, "N", "S")} · ${Math.round(p.altitudeM)} m`;
    const where = this.simScreen.querySelector("#player-where");
    if (where) where.textContent = place;
    const spot = this.simScreen.querySelector("#teleport-where");
    if (spot && !this.simScreen.querySelector("#teleport-panel")?.classList.contains("hidden")) {
      spot.textContent = place;
      this.drawTeleportMap();
    }
  }

  private syncSunUi(fromSolver = true): void {
    if (!this.solver) return;
    const rad = this.solver.radiation;
    const st = this.solver.getSolarStatus();
    const sun = sunDirection(rad.latitudeDeg, rad.month, rad.solarHour);
    this.renderer?.setSun(st.sunFrac, sun);
    const g = this.solver.grid;
    const anvilK = Math.min(
      g.nz - 1,
      Math.max(0, Math.round(8000 / Math.max(g.dz, 1))),
    );
    this.renderer?.setEnvironmentWind(
      this.solver.fields.u0[anvilK],
      this.solver.fields.v0[anvilK],
    );
    const clockEl = this.simScreen.querySelector("#sun-clock") as HTMLElement;
    clockEl.textContent = `${st.clock} · ${st.label}`;
    clockEl.classList.toggle("night", !st.isDay);

    if (fromSolver && !this.scrubbingSolar) {
      const liveHour = this.simScreen.querySelector(
        "#live-hour",
      ) as HTMLInputElement;
      const liveLat = this.simScreen.querySelector(
        "#live-lat",
      ) as HTMLInputElement;
      const liveMonth = this.simScreen.querySelector(
        "#live-month",
      ) as HTMLInputElement;
      liveHour.value = String(rad.solarHour);
      liveLat.value = String(Math.round(rad.latitudeDeg));
      liveMonth.value = String(rad.month);
      (
        this.simScreen.querySelector("#live-hour-val") as HTMLElement
      ).textContent = formatSolarClock(rad.solarHour);
      (
        this.simScreen.querySelector("#live-lat-val") as HTMLElement
      ).textContent = `${Math.round(rad.latitudeDeg)}°`;
      (
        this.simScreen.querySelector("#live-month-val") as HTMLElement
      ).textContent = MONTH_NAMES[rad.month - 1] ?? String(rad.month);
    } else {
      (
        this.simScreen.querySelector("#live-hour-val") as HTMLElement
      ).textContent = formatSolarClock(rad.solarHour);
      (
        this.simScreen.querySelector("#live-lat-val") as HTMLElement
      ).textContent = `${Math.round(rad.latitudeDeg)}°`;
      (
        this.simScreen.querySelector("#live-month-val") as HTMLElement
      ).textContent = MONTH_NAMES[rad.month - 1] ?? String(rad.month);
    }
  }

  private async startRun(values: SetupValues): Promise<void> {
    this.runName = values.name;
    this.bubbleStrength = values.bubbleStrength;
    this.pendingSetup = values;
    this.outputIntervalSec = Math.max(0.5, values.outputIntervalSec);
    this.frameStore = null;
    this.batchCancel = false;
    document.title = `Stormforge — ${this.runName}`;

    let grid: Grid3D;
    const scale = values.scale ?? "sandbox";
    if (scale === "continental" || scale === "custom") {
      const domain: DomainConfig = {
        extentX: (values.extentXKm ?? 10000) * 1000,
        extentY: (values.extentYKm ?? 10000) * 1000,
        dx: (values.dxKm ?? 20) * 1000,
        dy: (values.dyKm ?? 20) * 1000,
        nz: values.nz,
        zTop: values.zTop,
      };
      grid = gridFromDomain(domain);
    } else {
      grid = new Grid3D({
        nx: values.nx,
        ny: values.ny,
        nz: values.nz,
        zTop: values.zTop,
      });
    }

    this.sounding =
      values.sounding?.length > 0
        ? values.sounding.map((l) => ({ ...l }))
        : defaultSounding(values.zTop, Math.max(20, values.nz + 1));
    this.solver = await this.createSolver(grid);
    this.synoptic = values.synoptic;
    this.solver.rebuild(grid, this.sounding, {
      bubbleStrength: values.bubbleStrength,
      synoptic: this.synoptic,
    });
    // If the WebGPU backend could not allocate device-sized buffers
    // (e.g. a continental grid exceeding maxBufferSize), fall back to CPU.
    if (this.solver instanceof WebGPUBackend && this.solver.initFailure) {
      console.warn(
        `WebGPU backend unavailable for this grid: ${this.solver.initFailure}. Falling back to CPU.`,
      );
      this.solver = new FluidSolver(grid);
      this.solver.rebuild(grid, this.sounding, {
        bubbleStrength: values.bubbleStrength,
        synoptic: this.synoptic,
      });
    }
    this.solver.hydrostatic = values.hydrostatic ? "on" : "off";
    const radiation = {
      enabled: true,
      latitudeDeg: values.latitudeDeg,
      month: values.month,
      solarHour: values.startHour,
      diurnalSpeed: 15,
    };
    this.solver.setRadiation(radiation);
    this.liveDebt = 0;
    this.liveDth = null;
    this.liveCloud = null;
    this.ensureLive().rebuild({
      grid: { nx: grid.nx, ny: grid.ny, nz: grid.nz, zTop: grid.zTop },
      sounding: this.sounding,
      opts: { bubbleStrength: values.bubbleStrength, synoptic: this.synoptic },
      radiation,
      clockPaused: this.clockPaused,
    });
    this.syncSunUi(true);

    this.setup.hide();
    this.simScreen.classList.add("active");
    this.sessionMode = values.runMode === "batch" ? "batching" : "live";
    this.setPaused(values.runMode === "batch");
    this.setClockPaused(false);
    this.showClouds = true;
    this.showRadar3d = false;
    this.showRadar2d = false;
    this.showSurfaceWinds = false;
    this.mapProduct = "refl";
    this.mapBucket = -1;
    this.mapPackedProduct = null;
    this.simScreen
      .querySelector("#btn-clouds")
      ?.classList.toggle("active", true);
    this.simScreen
      .querySelector("#btn-radar3d")
      ?.classList.toggle("active", false);
    this.simScreen
      .querySelector("#btn-radar2d")
      ?.classList.toggle("active", false);
    this.simScreen
      .querySelector("#btn-winds")
      ?.classList.toggle("active", false);
    this.simScreen.querySelector("#radar-legend")?.classList.add("hidden");
    this.syncSessionControls();

    // Wait for CSS layout so canvases/viewport get real non-zero sizes
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this.mountSimView(grid, values.zTop));
    });
  }

  /** Select the WebGPU backend when available, otherwise the CPU FluidSolver. */
  private async createSolver(grid: Grid3D): Promise<SimBackend> {
    const gpu = new WebGPUBackend();
    await gpu.whenReady();
    if (gpu.available) return gpu;
    return new FluidSolver(grid);
  }

  private mountSimView(grid: Grid3D, zTop: number): void {
    this.viewport.querySelectorAll("canvas").forEach((c) => {
      if (c.parentElement === this.viewport) c.remove();
    });
    this.radar2d?.dispose();
    this.radar2d = null;
    this.renderer?.dispose();
    this.renderer = new CloudRainRenderer(this.viewport);
    const altInput = this.simScreen.querySelector(
      "#teleport-alt",
    ) as HTMLInputElement;
    altInput.max = String(Math.max(20, Math.round(zTop) - 2));
    altInput.value = "2";
    (
      this.simScreen.querySelector("#teleport-alt-val") as HTMLElement
    ).textContent = "2 m";
    this.renderer.setGrid(grid);
    this.renderer.resize();
    this.radar2d = new Radar2DView(this.viewport);
    this.radar2d.setGrid(grid.nx, grid.ny);
    this.radar2d.setProduct(this.mapProduct);
    this.radar2d.setOnProductChange((id) => {
      this.mapProduct = id;
      this.mapBucket = -1;
      if (this.sessionMode === "playback") {
        this.showPlaybackFrame(this.playbackIndex);
      }
    });
    this.radar2d.setOnDetailChange((scale) => {
      this.renderer?.setRadarDetail(scale);
    });
    this.renderer.setRadarDetail(this.radar2d.getDetail());
    this.radar2d.setVisible(false);
    this.radar2d.setWindsVisible(false);
    this.renderer.setWindsVisible(false);
    this.mapBucket = -1;
    this.mapPackedProduct = null;

    this.skewt?.dispose();
    this.hodo?.dispose();
    this.skewtCanvas = this.simScreen.querySelector(
      "#skewt-canvas",
    ) as HTMLCanvasElement;
    this.hodoCanvas = this.simScreen.querySelector(
      "#hodo-canvas",
    ) as HTMLCanvasElement;

    // Ensure skew-t is visible for initial measure; hodo stays hidden
    this.skewtCanvas.classList.remove("hidden");
    this.hodoCanvas.classList.add("hidden");

    this.skewt = new SkewTEditor(this.skewtCanvas, zTop);
    this.hodo = new HodographEditor(this.hodoCanvas, zTop);
    const metricsEl = this.simScreen.querySelector(
      "#skewt-metrics",
    ) as HTMLElement;
    this.skewt.setMetricsElement(metricsEl);
    const hodoMetricsEl = this.simScreen.querySelector(
      "#hodo-metrics",
    ) as HTMLElement;
    this.hodo.setMetricsElement(hodoMetricsEl);
    this.skewt.setLevels(this.sounding);
    this.hodo.setLevels(this.sounding);

    this.skewt.onChange = (levels) => {
      this.sounding = levels;
    };
    this.hodo.onChange = (levels) => {
      this.sounding = levels;
    };

    // Front editor for the running simulation. It starts from the pattern the
    // run was launched with and can change it while the simulation runs.
    const frontsHost = this.simScreen.querySelector(
      "#fronts-editor-host",
    ) as HTMLElement | null;
    this.frontEditor?.root.remove();
    this.frontEditor = new SynopticEditor({
      compact: true,
      setup: this.synoptic,
    });
    this.frontEditor.onChange = (setup) => {
      this.scheduleFrontsApply(setup);
    };
    frontsHost?.appendChild(this.frontEditor.root);
    this.pushFrontsToMap();

    this.setPanelView("skewt");
    this.skewt.resize();
    this.renderer.resize();
    this.syncSessionControls();

    this.lastTs = performance.now();
    this.stopLoop();
    this.loop(this.lastTs);

    if (this.sessionMode === "batching" && this.pendingSetup) {
      void this.beginBatch(this.pendingSetup);
    }

    // Restore view state from a loaded save file (must run after renderer is ready).
    if (this.pendingLoadSave) {
      this.applyPendingLoad();
    }
  }

  private async beginBatch(values: SetupValues): Promise<void> {
    if (!this.solver) return;
    this.batchCancel = false;
    this.sessionMode = "batching";
    this.syncSessionControls();

    const status = this.simScreen.querySelector(
      "#batch-status",
    ) as HTMLElement | null;
    const bar = this.simScreen.querySelector(
      "#batch-progress-bar",
    ) as HTMLElement | null;
    const meta = this.simScreen.querySelector(
      "#batch-progress-meta",
    ) as HTMLElement | null;

    try {
      const store = await runBatch(this.solver, {
        durationSec: values.durationSec,
        outputIntervalSec: values.outputIntervalSec,
        fixedDt: BATCH_FIXED_DT,
        shouldCancel: () => this.batchCancel,
        onProgress: (p) => {
          if (status) status.textContent = p.message;
          if (bar) bar.style.width = `${(p.frac * 100).toFixed(1)}%`;
          if (meta) {
            meta.textContent = `${p.frames} frames · t=${p.t.toFixed(0)}s`;
          }
        },
      });
      if (this.batchCancel) {
        this.returnToMenu();
        return;
      }
      this.enterPlayback(store);
    } catch {
      if (this.batchCancel) {
        this.returnToMenu();
        return;
      }
      if (status) status.textContent = "Batch failed.";
      if (meta) meta.textContent = "Return to main menu and try again.";
    }
  }

  // ── Save / Load ─────────────────────────────────────────────────────────────

  /** Collect current state and trigger a .sfz download. */
  private saveToDisk(): void {
    if (!this.solver || !this.pendingSetup) return;

    const tune = this.renderer?.cloudTune() ?? {
      gain: 1,
      sigmaLiquid: 0.08,
      sigmaRain: 0.18,
      erosionLiquid: 0.6,
      erosionIce: 0.25,
    };

    const lookPreset =
      (this.simScreen.querySelector("#cloud-look") as HTMLSelectElement | null)
        ?.value ?? "";

    const simSpeedRaw = this.simSpeed;
    const simSpeed: 1 | 5 | 15 | 40 =
      simSpeedRaw === 1 || simSpeedRaw === 5 || simSpeedRaw === 15 || simSpeedRaw === 40
        ? simSpeedRaw
        : 40;

    // Build a complete SetupValues snapshot from current live state so that
    // the restored run starts with exactly the same sounding and synoptic.
    const currentSounding = this.syncSoundingFromEditors();
    const setup: typeof this.pendingSetup = {
      ...this.pendingSetup,
      sounding: currentSounding.map((l) => ({ ...l })),
      synoptic: JSON.parse(JSON.stringify(this.synoptic)),
      // Radiation fields at save time (lat, month, startHour captured from solver)
      latitudeDeg: this.solver.radiation.latitudeDeg,
      month: this.solver.radiation.month,
      startHour: this.solver.radiation.solarHour,
    };

    const save: StormforgeSave = {
      version: 1,
      created: new Date().toISOString(),
      name: this.runName,
      setup,
      simTime: this.solver.time,
      solarHour: this.solver.radiation.solarHour,
      view: {
        showClouds: this.showClouds,
        showRadar3d: this.showRadar3d,
        showRadar2d: this.showRadar2d,
        showSurfaceWinds: this.showSurfaceWinds,
        mapProduct: this.mapProduct,
        simSpeed,
        cloudLookPreset: lookPreset,
        cloudTune: { ...tune },
        lightningFreq: this.lightningFreq,
        clockPaused: this.clockPaused,
      },
    };

    downloadSave(save);
  }

  /** Parse a .sfz JSON string and restart the simulation from it. */
  private loadFromText(text: string): void {
    let save: StormforgeSave;
    try {
      save = parseSave(text);
    } catch (err) {
      alert(`Could not load save file:\n${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    // Store the view preferences — applied after mountSimView() finishes.
    this.pendingLoadSave = save;

    // Start a fresh run with the saved setup. startRun() will call mountSimView()
    // which calls applyPendingLoad() at the end.
    void this.startRun(save.setup);
  }

  /**
   * Apply the view and solar-time state from a loaded save file.
   * Called once mountSimView() has finished and the renderer/solver are live.
   */
  private applyPendingLoad(): void {
    const save = this.pendingLoadSave;
    if (!save) return;
    this.pendingLoadSave = null;

    const v = save.view;
    const q = (id: string) => this.simScreen.querySelector(id) as HTMLElement;

    // ── Solar time ────────────────────────────────────────────────────────────
    if (this.solver) {
      this.solver.setSolarHour(save.solarHour);
      this.live?.radiation({ solarHour: save.solarHour });
      this.syncSunUi(true);
    }

    // ── Sim speed ─────────────────────────────────────────────────────────────
    this.simSpeed = v.simSpeed;
    const speedEl = this.simScreen.querySelector("#sim-speed") as HTMLSelectElement | null;
    if (speedEl) speedEl.value = String(v.simSpeed);

    // ── Display toggles ───────────────────────────────────────────────────────
    this.showClouds = v.showClouds;
    this.showRadar3d = v.showRadar3d;
    this.showRadar2d = v.showRadar2d;
    this.showSurfaceWinds = v.showSurfaceWinds;
    this.mapProduct = v.mapProduct;

    q("#btn-clouds").classList.toggle("active", this.showClouds);
    q("#btn-radar3d").classList.toggle("active", this.showRadar3d);
    q("#btn-radar2d").classList.toggle("active", this.showRadar2d);
    q("#btn-winds").classList.toggle("active", this.showSurfaceWinds);

    this.renderer?.setVolumeVisible(this.showClouds);
    this.renderer?.setRadarVisible(this.showRadar3d);
    this.radar2d?.setVisible(this.showRadar2d);
    if (this.showRadar2d) this.radar2d?.setProduct(v.mapProduct);

    // ── Cloud look preset ─────────────────────────────────────────────────────
    const lookEl = this.simScreen.querySelector("#cloud-look") as HTMLSelectElement | null;
    if (lookEl) {
      lookEl.value = v.cloudLookPreset;
      this.renderer?.setCloudLook(v.cloudLookPreset);
    }

    // ── Cloud tune sliders ────────────────────────────────────────────────────
    const ct = v.cloudTune;
    this.renderer?.setCloudTune(ct);

    const setSlider = (id: string, val: number, decimals: number) => {
      const input = this.simScreen.querySelector(id) as HTMLInputElement | null;
      const span = this.simScreen.querySelector(`${id}-val`) as HTMLElement | null;
      if (input) input.value = String(val);
      if (span) span.textContent = val.toFixed(decimals);
    };
    setSlider("#cloud-gain", ct.gain, 2);
    setSlider("#cloud-sigma", ct.sigmaLiquid, 3);
    setSlider("#cloud-sigma-rain", ct.sigmaRain, 3);
    setSlider("#cloud-erosion", ct.erosionLiquid, 2);
    setSlider("#cloud-erosion-ice", ct.erosionIce, 2);
    const lf = v.lightningFreq ?? 1;
    this.lightningFreq = lf;
    const lfEl = this.simScreen.querySelector("#lightning-freq") as HTMLInputElement | null;
    if (lfEl) lfEl.value = String(lf);
    const lfVal = this.simScreen.querySelector("#lightning-freq-val") as HTMLElement | null;
    if (lfVal) lfVal.textContent = Math.round(lf * 100) + "%";

    // ── Clock pause ───────────────────────────────────────────────────────────
    this.setClockPaused(v.clockPaused);
  }

  private returnToMenu(): void {
    this.stopLoop();
    this.frameStore = null;
    this.sessionMode = "live";
    this.pendingSetup = null;
    this.pendingLoadSave = null;
    this.batchCancel = false;
    this.renderer?.dispose();
    this.renderer = null;
    this.radar2d?.dispose();
    this.radar2d = null;
    this.skewt?.dispose();
    this.skewt = null;
    this.hodo?.dispose();
    this.hodo = null;
    this.solver = null;
    this.syncSessionControls();
    this.simScreen.classList.remove("active");
    this.setup.show();
  }

  private enterPlayback(store: FrameStore): void {
    this.frameStore = store;
    this.sessionMode = "playback";
    this.playbackIndex = 0;
    this.playbackAccumMs = 0;
    this.playbackSpeed = Number(
      (this.simScreen.querySelector("#playback-speed") as HTMLSelectElement)
        ?.value || 1,
    );
    const scrub = this.simScreen.querySelector(
      "#playback-scrub",
    ) as HTMLInputElement;
    scrub.max = String(Math.max(0, store.length - 1));
    scrub.value = "0";
    this.setPlaybackPlaying(true);
    this.syncSessionControls();
    this.showPlaybackFrame(0);
  }

  private showPlaybackFrame(index: number): void {
    if (!this.frameStore || !this.renderer) return;
    const n = this.frameStore.length;
    if (n < 1) return;
    const i = Math.max(0, Math.min(n - 1, index));
    this.playbackIndex = i;
    const frame = this.frameStore.get(i);
    if (!frame) return;

    const scrub = this.simScreen.querySelector(
      "#playback-scrub",
    ) as HTMLInputElement | null;
    if (scrub) scrub.value = String(i);
    const meta = this.simScreen.querySelector(
      "#playback-meta",
    ) as HTMLElement | null;
    if (meta) {
      meta.textContent = `frame ${i + 1}/${n} · t=${frame.t.toFixed(0)}s`;
    }

    if (this.solver) {
      this.solver.setSolarHour(frame.solarHour);
    }

    if (this.showRadar2d && this.radar2d) {
      this.radar2d.setProduct("refl");
      this.mapProduct = "refl";
      this.radar2d.update((out) => {
        out.set(frame.radar);
      });
    } else {
      this.renderer.setVolumeVisible(this.showClouds);
      this.renderer.setRadarVisible(this.showRadar3d);
      if (this.showClouds) {
        this.renderer.updateVolume(
          (out) => {
            if (out.length === frame.volume.length) {
              out.set(frame.volume);
            } else if (this.solver) {
              const g = this.solver.grid;
              copyFullVolumeToDisplay(frame.volume, g.nx, g.ny, g.nz, out);
            }
          },
          1,
          1,
          true,
        );
      }
      if (this.showRadar3d) {
        this.renderer.updateRadar((out) => {
          out.set(frame.radar);
        });
      }
      this.renderer.render();
    }

    this.updateStatsLine(true, frame.t);
    this.syncSunUi(true);
  }

  /** Live 2D products refresh once per outputIntervalSec of simulation time. */
  private mapRefreshDue(product: MapProductId): boolean {
    if (!this.solver) return false;
    const every = Math.max(0.5, this.outputIntervalSec);
    const bucket = Math.floor(this.solver.time / every);
    return bucket !== this.mapBucket || product !== this.mapPackedProduct;
  }

  private markMapPacked(product: MapProductId): void {
    const every = Math.max(0.5, this.outputIntervalSec);
    this.mapBucket = Math.floor((this.solver?.time ?? 0) / every);
    this.mapPackedProduct = product;
  }

  /** Push live surface winds to the active view (3D mesh or 2D overlay). */
  private pushSurfaceWinds(): void {
    if (!this.showSurfaceWinds || !this.solver) return;
    if (this.sessionMode !== "live") return;
    const samples = sampleSurfaceWinds(
      this.solver.grid,
      this.solver.fields,
    );
    if (this.showRadar2d && this.radar2d) {
      this.radar2d.updateWinds(samples);
    } else {
      this.renderer?.updateWinds(samples);
    }
  }

  private updateStatsLine(fromPlayback: boolean, tOverride?: number): void {
    if (!this.solver) return;
    const g = this.solver.grid;
    const st = this.liveCloud ?? this.solver.cloudRainStats();
    const midK = Math.floor(g.nz * 0.25);
    const windSpd = Math.hypot(
      this.solver.fields.u0[midK],
      this.solver.fields.v0[midK],
    );
    const sun = this.solver.getSolarStatus();
    // Domain-mean surface θ anomaly vs sounding (radiation signal)
    let dThSfc = this.liveDth ?? 0;
    if (this.liveDth == null) {
      let dThSum = 0;
      let dThN = 0;
      for (let j = 0; j < g.ny; j++) {
        for (let i = 0; i < g.nx; i++) {
          const id = g.idx(i, j, 0);
          dThSum += this.solver.fields.theta[id] - this.solver.fields.theta0[0];
          dThN++;
        }
      }
      dThSfc = dThN ? dThSum / dThN : 0;
    }
    const dT =
      (dThSfc >= 0 ? "+" : "") + `${dThSfc.toFixed(1)}K`;
    const sunBit = sun.isDay
      ? `sun ${sun.sunFrac.toFixed(2)} dTs=${dT}`
      : `IR dTs=${dT}`;
    const xKm = (g.xExtent / 1000).toFixed(0);
    const yKm = (g.yExtent / 1000).toFixed(0);
    const zKm = (g.zTop / 1000).toFixed(1);
    const viewBit = (
      this.showRadar2d
        ? [`map:${this.mapProduct}`]
        : [
            this.showClouds ? "clouds" : null,
            this.showRadar3d ? "radar3d" : null,
          ]
    )
      .concat(this.showSurfaceWinds ? ["winds"] : [])
      .filter(Boolean)
      .join("+") || "—";
    const t = tOverride ?? this.solver.time;
    const modeBit =
      this.sessionMode === "playback"
        ? " · REVIEW"
        : this.sessionMode === "batching"
          ? " · BATCH"
          : "";
    this.statsEl.textContent =
      `${this.runName} · ${g.nx}×${g.ny}×${g.nz} (${xKm}×${yKm}×${zKm}km) · t=${t.toFixed(0)}s · ` +
      `${viewBit} · ${sunBit} · wind≈${windSpd.toFixed(1)}m/s · qc=${st.cloudMax.toExponential(2)} qr=${st.rainMax.toExponential(2)}` +
      (this.sessionMode === "live" && this.paused ? " · PAUSED" : "") +
      (this.sessionMode === "playback" && !this.playbackPlaying
        ? " · PAUSED"
        : "") +
      (this.clockPaused ? " · CLOCK" : "") +
      modeBit;
    void fromPlayback;
  }

  private ensureLive(): LiveBridge {
    if (!this.live) {
      this.live = new LiveBridge();
      this.live.onState = (state) => this.consumeLive(state);
    }
    return this.live;
  }

  private placeStrike(hit: {
    i: number;
    j: number;
    k: number;
    kind: LightningKind;
  }): void {
    if (!this.solver || !this.renderer) return;
    const g = this.solver.grid;
    // 25% CG bolts, 75% in-cloud flashes
    const kind: LightningKind =
      hit.kind === "cg" && Math.random() > 0.25 ? "sprite" : hit.kind;
    this.renderer.addLightning({
      i: hit.i,
      j: hit.j,
      kind,
      x: ((hit.i + 0.5) / g.nx - 0.5) * g.xExtent,
      z: -((hit.j + 0.5) / g.ny - 0.5) * g.yExtent,
      y: -g.zTop / 2 + (hit.k + 0.5) * g.dz,
    });
  }

  private consumeLive(st: LiveState): void {
    if (!this.solver || !this.renderer) return;
    this.solver.time = st.time;
    this.solver.setSolarHour(st.solarHour);
    this.liveDth = st.dThSfc;
    this.liveCloud = {
      cloudMax: st.cloudMax,
      rainMax: st.rainMax,
      cloudMass: st.cloudMass,
    };
    if (st.volume && this.showClouds && !this.showRadar2d) {
      const vol = st.volume;
      this.renderer.updateVolume(
        (out) => {
          if (out.length === vol.length) out.set(vol);
          else if (this.solver) {
            const g = this.solver.grid;
            copyFullVolumeToDisplay(vol, g.nx, g.ny, g.nz, out);
          }
        },
        st.cloudMax,
        st.rainMax,
      );
    }
    if (st.map && st.mapId && this.radar2d && this.showRadar2d) {
      const bytes = st.map;
      const id = st.mapId;
      this.radar2d.update((out) => {
        if (out.length === bytes.length) out.set(bytes);
      });
      this.markMapPacked(id);
    }
    if (st.map && st.mapId === "refl" && this.showRadar3d) {
      const bytes = st.map;
      this.renderer.updateRadar((out) => {
        if (out.length === bytes.length) out.set(bytes);
      });
      this.markMapPacked("refl");
    }
    if (st.winds) {
      if (this.showRadar2d && this.radar2d) this.radar2d.updateWinds(st.winds);
      else this.renderer.updateWinds(st.winds);
    }
    if (st.fronts) {
      // The fronts travel east in the simulation: follow them on the map.
      this.simFronts = st.fronts;
      if (this.showRadar2d && this.radar2d) this.radar2d.setFronts(st.fronts);
    }
    for (const hit of st.strikes) {
      if (this.lightningFreq >= 1 || Math.random() < this.lightningFreq) this.placeStrike(hit);
    }
    this.syncSunUi(true);
    this.updateStatsLine(false);
  }

  private syncLightning(wallSec: number): void {
    if (!this.renderer) return;
    this.renderer.tickLightning(wallSec);
    this.radar2d?.setLightning(this.renderer.lightningMarks());
  }

  private stopLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private loop = (ts: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    const dtMs = Math.min(50, ts - this.lastTs);
    this.lastTs = ts;

    if (this.sessionMode === "batching") {
      // Physics advances inside BatchRunner; keep RAF alive for UI only.
      return;
    }

    if (this.sessionMode === "playback") {
      if (this.playbackPlaying && this.frameStore && this.frameStore.length > 1) {
        const frameMs = (this.outputIntervalSec * 1000) / this.playbackSpeed;
        this.playbackAccumMs += dtMs;
        while (this.playbackAccumMs >= frameMs) {
          this.playbackAccumMs -= frameMs;
          if (this.playbackIndex >= this.frameStore.length - 1) {
            this.playbackIndex = 0;
          } else {
            this.playbackIndex += 1;
          }
          this.showPlaybackFrame(this.playbackIndex);
        }
      } else if (this.renderer && !this.showRadar2d) {
        this.renderer.render();
      }
      return;
    }

    const wall = Math.min(0.05, Math.max(0, dtMs) / 1000);
    if (this.solver && !this.paused) {
      this.liveDebt += wall;
      const live = this.ensureLive();
      // Steps longer than about 2 s drop the cloud field, so the catch-up
      // timestep stays inside that limit. A 50 ms step then still reaches 40×.
      const simDt = Math.min(2, this.liveDebt * this.simSpeed);
      const now = performance.now();
      const wantVolume =
        this.showClouds && !this.showRadar2d && now - this.liveVolumeAsk >= 120;
      const map =
        this.showRadar2d &&
        this.radar2d &&
        this.mapRefreshDue(this.radar2d.getProduct())
          ? this.radar2d.getProduct()
          : !this.showRadar2d && this.showRadar3d && this.mapRefreshDue("refl")
            ? "refl"
            : null;
      if (
        simDt >= 1e-4 &&
        live.step({
          dt: simDt,
          wall,
          lightning: true,
          wantVolume,
          map,
          winds: this.showSurfaceWinds,
        })
      ) {
        this.liveDebt = 0;
        if (wantVolume) this.liveVolumeAsk = now;
      }
    }

    if (this.solver && this.renderer) {
      this.syncLightning(wall);

      if (this.showRadar2d && this.radar2d) {
        this.mapProduct = this.radar2d.getProduct();
      } else {
        this.renderer.setVolumeVisible(this.showClouds);
        this.renderer.setRadarVisible(this.showRadar3d);
        this.renderer.setWindsVisible(this.showSurfaceWinds);
        this.renderer.render();
      }

      this.updateStatsLine(false);
      this.syncSunUi(true);
      this.refreshPlayerHud();
    }
  };
}
