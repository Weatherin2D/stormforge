import {
  DrawnFront,
  FRONT_COLORS,
  FRONT_LABELS,
  FrontKind,
  MapPoint,
  PressureCenter,
  SynopticSetup,
  cloneSynoptic,
  defaultSynoptic,
  generateSynopticSystems,
} from "../sim/synoptic";
import {
  COVER_LAKE,
  COVER_OCEAN,
  SURFACE_N,
  crestCap,
  fillForest,
  fillLakeBasin,
  fillPeak,
  fillRidge,
  fillSoutheastSea,
  normalizeNest,
  zeroField,
  type NestRect,
} from "../sim/surface";

type Tool =
  | "select"
  | FrontKind
  | "low"
  | "high"
  | "raise"
  | "lower"
  | "sea"
  | "lake"
  | "land"
  | "temp"
  | "soil"
  | "veg"
  | "nest";

type CoverLayer = "terrain" | "water" | "temp" | "soil" | "veg";

export interface SurfaceExport {
  terrain?: number[];
  water?: number[];
  kind?: number[];
  waterTemp?: number[];
  soil?: number[];
  veg?: number[];
  sstC?: number;
  nest?: NestRect | null;
}

const KIND_LABEL = FRONT_LABELS;
const KIND_COLOR = FRONT_COLORS;

export interface SynopticEditorOptions {
  /** Compact layout for the in-simulation panel. */
  compact?: boolean;
  /** Nested under sounding (setup or drawer) — not a standalone column card. */
  embedded?: boolean;
  /** Pattern to show when the editor opens. */
  setup?: SynopticSetup;
}

/**
 * Setup map where fronts are drawn and toggled, and surface
 * highs and lows are placed. North is up.
 */
export class SynopticEditor {
  readonly root: HTMLElement;
  /** Fired whenever the pattern changes, so the host can apply it. */
  onChange: ((setup: SynopticSetup) => void) | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private listEl: HTMLElement;
  private strengthRow: HTMLElement;
  private strengthVal: HTMLElement;
  private strengthInput: HTMLInputElement;
  private deleteBtn: HTMLButtonElement;
  private marineInput: HTMLInputElement;
  private synopticToggle: HTMLInputElement;
  private jetstreamToggle: HTMLInputElement;
  private jetstreamRow: HTMLElement;
  private jetstreamSlider: HTMLInputElement;
  private jetstreamVal: HTMLElement;
  private moveToggle: HTMLInputElement;
  private moveRow: HTMLElement;
  private moveSpeed: HTMLInputElement;
  private moveSpeedVal: HTMLElement;
  private setup: SynopticSetup = defaultSynoptic();
  private tool: Tool = "cold";
  private selectedId: string | null = null;
  private draft: MapPoint[] | null = null;
  private dragging: { id: string; dx: number; dy: number } | null = null;
  private seq = 10;
  private ro: ResizeObserver | null = null;
  private terrain = new Float32Array(SURFACE_N * SURFACE_N);
  private water = new Float32Array(SURFACE_N * SURFACE_N);
  private kind = new Float32Array(SURFACE_N * SURFACE_N);
  private waterTemp = new Float32Array(SURFACE_N * SURFACE_N);
  private soil = new Float32Array(SURFACE_N * SURFACE_N);
  private veg = new Float32Array(SURFACE_N * SURFACE_N);
  private sstC = 22;
  private raiseStep = 80;
  private soilBrush = 0.6;
  private vegBrush = 0.8;
  private coverLayer: CoverLayer = "terrain";
  private nest: NestRect | null = null;
  private ceiling = 4800;
  private painting = false;
  private nestDrag: MapPoint | null = null;
  private sstInput: HTMLInputElement;
  private refineInput: HTMLSelectElement;
  private layerInput: HTMLSelectElement;

  constructor(opts: SynopticEditorOptions = {}) {
    const compact = opts.compact === true;
    const embedded = opts.embedded === true;
    this.root = document.createElement("aside");
    this.root.className = [
      "setup-fronts",
      compact ? "synoptic-compact" : "",
      embedded || compact ? "fronts-embedded" : "setup-card",
    ]
      .filter(Boolean)
      .join(" ");
    this.root.tabIndex = 0;
    this.root.innerHTML = `
      ${compact || embedded ? "" : "<h2>Fronts</h2>"}
      ${
        compact || embedded
          ? ""
          : `<p class="hint fronts-desc">
        Draw a front where it should sit. The air on the left of your stroke
        is the cold or dry side. Triangles point the way it will move.
      </p>`
      }
      <div class="surface-block">
      <label class="surface-field">
        Layer
        <select id="sf-cover-layer">
          <option value="terrain" selected>Terrain</option>
          <option value="water">Water</option>
          <option value="temp">Water temperature</option>
          <option value="soil">Soil moisture</option>
          <option value="veg">Vegetation</option>
        </select>
      </label>
      <div class="front-tools" id="sf-surface-tools">
        <button type="button" data-tool="raise">Raise</button>
        <button type="button" data-tool="lower">Lower</button>
        <button type="button" data-tool="sea">Ocean</button>
        <button type="button" data-tool="lake">Lake</button>
        <button type="button" data-tool="land">Land</button>
        <button type="button" data-tool="nest">Nest</button>
      </div>
      <div class="front-tools" id="sf-surface-presets">
        <button type="button" data-preset="flat">Flat</button>
        <button type="button" data-preset="ridge">Ridge</button>
        <button type="button" data-preset="peak">Peak</button>
        <button type="button" data-preset="sea">Southeast ocean</button>
        <button type="button" data-preset="lake">Lake basin</button>
        <button type="button" data-preset="forest">Forest</button>
      </div>
      <label class="surface-field" id="sf-cover-slider">
        <span id="sf-cover-label">Raise per stroke (m)</span>
        <input id="sf-sst" type="range" min="40" max="200" step="20" value="80" />
        <span id="sf-sst-val">80</span>
      </label>
      <label class="surface-field">
        Nest refinement
        <select id="sf-nest-refine">
          <option value="2" selected>2×</option>
          <option value="3">3×</option>
        </select>
      </label>
      </div>
      <div class="front-tools" id="sf-front-tools">
        <button type="button" data-tool="select">Select</button>
        <button type="button" data-tool="cold" class="active">Cold</button>
        <button type="button" data-tool="warm">Warm</button>
        <button type="button" data-tool="stationary">Stationary</button>
        <button type="button" data-tool="dryline">Dryline</button>
        <button type="button" data-tool="outflow">Outflow</button>
        <button type="button" data-tool="low">Low</button>
        <button type="button" data-tool="high">High</button>
      </div>
        <canvas id="sf-front-canvas"></canvas>
        <label class="front-marine">
          <input id="sf-front-marine" type="checkbox" checked />
          Southeast sea
        </label>
        <label class="front-marine">
          <input id="sf-synoptic-toggle" type="checkbox" />
          Enable synoptic systems (highs/lows/fronts)
        </label>
        <label class="front-marine">
          <input id="sf-jetstream-toggle" type="checkbox" />
          Enable jetstream
        </label>
        <div class="front-strength" id="sf-jetstream-row" style="display:none;">
          Jetstream south extent
          <input id="sf-jetstream-south" type="range" min="0" max="1" step="0.01" value="0.5" />
          <span id="sf-jetstream-val">50%</span>
        </div>
        <label class="front-marine">
          <input id="sf-move-toggle" type="checkbox" checked />
          Move west→east
        </label>
        <div class="front-strength" id="sf-move-row">
          Front speed (km/h)
          <input id="sf-move-speed" type="range" min="0" max="160" step="5" value="35" />
          <span id="sf-move-speed-val">35</span>
        </div>
        <div class="front-list" id="sf-front-list"></div>
        <label class="front-strength" id="sf-front-strength">
          Strength
          <input id="sf-front-hpa" type="range" min="2" max="12" step="1" value="6" />
          <span id="sf-front-hpa-val">6 hPa</span>
        </label>
       <div class="panel-actions">
         <button type="button" id="sf-front-delete" disabled>Delete</button>
         <button type="button" id="sf-front-reset">Reset pattern</button>
         <button type="button" id="sf-gen-systems">Generate systems</button>
       </div>
    `;

    this.canvas = this.root.querySelector("#sf-front-canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.listEl = this.root.querySelector("#sf-front-list") as HTMLElement;
    this.strengthRow = this.root.querySelector("#sf-front-strength") as HTMLElement;
    this.strengthVal = this.root.querySelector("#sf-front-hpa-val") as HTMLElement;
    this.strengthInput = this.root.querySelector("#sf-front-hpa") as HTMLInputElement;
    this.deleteBtn = this.root.querySelector("#sf-front-delete") as HTMLButtonElement;
    this.marineInput = this.root.querySelector("#sf-front-marine") as HTMLInputElement;
    this.synopticToggle = this.root.querySelector("#sf-synoptic-toggle") as HTMLInputElement;
    this.jetstreamToggle = this.root.querySelector("#sf-jetstream-toggle") as HTMLInputElement;
    this.jetstreamRow = this.root.querySelector("#sf-jetstream-row") as HTMLElement;
    this.jetstreamSlider = this.root.querySelector("#sf-jetstream-south") as HTMLInputElement;
    this.jetstreamVal = this.root.querySelector("#sf-jetstream-val") as HTMLElement;
    this.moveToggle = this.root.querySelector("#sf-move-toggle") as HTMLInputElement;
    this.moveRow = this.root.querySelector("#sf-move-row") as HTMLElement;
    this.moveSpeed = this.root.querySelector("#sf-move-speed") as HTMLInputElement;
    this.moveSpeedVal = this.root.querySelector("#sf-move-speed-val") as HTMLElement;
    this.sstInput = this.root.querySelector("#sf-sst") as HTMLInputElement;
    this.layerInput = this.root.querySelector("#sf-cover-layer") as HTMLSelectElement;
    this.refineInput = this.root.querySelector("#sf-nest-refine") as HTMLSelectElement;
    this.waterTemp.fill(this.sstC);
    this.syncCoverLayer(true);

    this.root.querySelector("#sf-front-tools")!.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest(
        "button[data-tool]",
      ) as HTMLButtonElement | null;
      if (!btn) return;
      this.tool = btn.dataset.tool as Tool;
      this.draft = null;
      for (const b of this.root.querySelectorAll(".front-tools button")) {
        b.classList.toggle("active", b === btn);
      }
      this.canvas.classList.toggle("drawing", this.tool !== "select");
      this.painting = false;
      this.nestDrag = null;
    });
    this.root.querySelector("#sf-surface-tools")!.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest(
        "button[data-tool]",
      ) as HTMLButtonElement | null;
      if (!btn) return;
      this.tool = btn.dataset.tool as Tool;
      this.draft = null;
      this.painting = false;
      this.nestDrag = null;
      if (this.tool === "raise" || this.tool === "lower") this.coverLayer = "terrain";
      else if (this.tool === "sea" || this.tool === "lake" || this.tool === "land") this.coverLayer = "water";
      if (this.tool !== "nest") this.layerInput.value = this.coverLayer;
      this.syncCoverLayer(this.tool === "nest");
    });
    this.root.querySelector("#sf-surface-presets")!.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest(
        "button[data-preset]",
      ) as HTMLButtonElement | null;
      if (!btn) return;
      this.applyPreset(btn.dataset.preset || "flat");
      this.notify();
    });
    this.layerInput.addEventListener("change", () => {
      const value = this.layerInput.value;
      this.coverLayer =
        value === "water" || value === "temp" || value === "soil" || value === "veg"
          ? value
          : "terrain";
      this.syncCoverLayer();
    });
    this.sstInput.addEventListener("input", () => {
      const v = Number(this.sstInput.value);
      if (this.coverLayer === "temp" || this.coverLayer === "water") this.sstC = v;
      else if (this.coverLayer === "soil") this.soilBrush = v;
      else if (this.coverLayer === "veg") this.vegBrush = v;
      else this.raiseStep = v;
      this.writeSliderLabel();
    });
    this.refineInput.addEventListener("change", () => {
      if (!this.nest) return;
      this.nest.refinement = Number(this.refineInput.value) >= 3 ? 3 : 2;
      this.draw();
    });

    this.marineInput.addEventListener("change", () => {
      this.setup.marine = this.marineInput.checked;
      if (this.marineInput.checked) this.applyPreset("sea");
      else {
        this.clearCover();
        this.draw();
      }
      this.notify();
    });
    this.synopticToggle.addEventListener("change", () => {
      this.setup.enabled = this.synopticToggle.checked;
      this.draw();
      this.notify();
    });
    this.jetstreamToggle.addEventListener("change", () => {
      this.setup.jetstream = this.jetstreamToggle.checked;
      if (this.jetstreamRow) {
        this.jetstreamRow.style.display = this.jetstreamToggle.checked ? "flex" : "none";
      }
      this.draw();
      this.notify();
    });
    this.moveToggle.addEventListener("change", () => {
      this.setup.move = this.moveToggle.checked;
      if (this.moveRow) this.moveRow.style.display = this.moveToggle.checked ? "flex" : "none";
      this.draw();
      this.notify();
    });
    this.moveSpeed.addEventListener("input", () => {
      const v = Number(this.moveSpeed.value);
      this.setup.moveSpeed = v;
      if (this.moveSpeedVal) this.moveSpeedVal.textContent = String(Math.round(v));
      this.draw();
      this.notify();
    });

    this.strengthInput.addEventListener("input", () => {
      const center = this.selectedCenter();
      if (!center) return;
      center.hPa = Number(this.strengthInput.value);
      this.strengthVal.textContent = `${center.hPa} hPa`;
      this.renderList();
      this.draw();
      this.notify();
    });

    this.deleteBtn.addEventListener("click", () => this.deleteSelected());
    this.root.querySelector("#sf-front-reset")!.addEventListener("click", () => {
      this.setup = defaultSynoptic();
      this.selectedId = null;
      this.draft = null;
      this.marineInput.checked = true;
      if (this.synopticToggle) this.synopticToggle.checked = this.setup.enabled === true;
      if (this.jetstreamToggle) {
        this.jetstreamToggle.checked = this.setup.jetstream === true;
        if (this.jetstreamRow) this.jetstreamRow.style.display = this.jetstreamToggle.checked ? "flex" : "none";
      }
      if (this.jetstreamSlider) {
        this.jetstreamSlider.value = String(this.setup.jetstreamSouth ?? 0.5);
        if (this.jetstreamVal) this.jetstreamVal.textContent = Math.round((this.setup.jetstreamSouth ?? 0.5) * 100) + "%";
      }
      if (this.moveToggle) {
        this.moveToggle.checked = this.setup.move !== false;
        if (this.moveRow) this.moveRow.style.display = this.moveToggle.checked ? "flex" : "none";
      }
      if (this.moveSpeed) {
        this.moveSpeed.value = String(this.setup.moveSpeed ?? 35);
        if (this.moveSpeedVal) this.moveSpeedVal.textContent = String(Math.round(this.setup.moveSpeed ?? 35));
      }
      this.syncSelectionUi();
      this.renderList();
      this.draw();
      this.notify();
    });
    this.root.querySelector("#sf-gen-systems")!.addEventListener("click", () => {
      this.setup = generateSynopticSystems();
      this.selectedId = null;
      this.draft = null;
      if (this.marineInput) this.marineInput.checked = this.setup.marine !== false;
      if (this.synopticToggle) this.synopticToggle.checked = this.setup.enabled === true;
      if (this.jetstreamToggle) {
        this.jetstreamToggle.checked = this.setup.jetstream === true;
        if (this.jetstreamRow) this.jetstreamRow.style.display = this.jetstreamToggle.checked ? "flex" : "none";
      }
      if (this.jetstreamSlider) {
        this.jetstreamSlider.value = String(this.setup.jetstreamSouth ?? 0.5);
        if (this.jetstreamVal) this.jetstreamVal.textContent = Math.round((this.setup.jetstreamSouth ?? 0.5) * 100) + "%";
      }
      if (this.moveToggle) {
        this.moveToggle.checked = this.setup.move !== false;
        if (this.moveRow) this.moveRow.style.display = this.moveToggle.checked ? "flex" : "none";
      }
      if (this.moveSpeed) {
        this.moveSpeed.value = String(this.setup.moveSpeed ?? 35);
        if (this.moveSpeedVal) this.moveSpeedVal.textContent = String(Math.round(this.setup.moveSpeed ?? 35));
      }
      this.syncSelectionUi();
      this.renderList();
      this.draw();
      this.notify();
    });

    this.listEl.addEventListener("click", (e) => {
      const row = (e.target as HTMLElement).closest(
        "[data-id]",
      ) as HTMLElement | null;
      if (!row) return;
      const id = row.dataset.id!;
      if ((e.target as HTMLElement).matches("input[type=checkbox]")) {
        const on = (e.target as HTMLInputElement).checked;
        const front = this.setup.fronts.find((f) => f.id === id);
        const center = this.setup.centers.find((c) => c.id === id);
        if (front) front.enabled = on;
        if (center) center.enabled = on;
        this.draw();
        this.notify();
        return;
      }
      this.selectedId = id;
      this.syncSelectionUi();
      this.renderList();
      this.draw();
    });

    this.root.addEventListener("keydown", (e) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      this.deleteSelected();
    });

    this.canvas.addEventListener("pointerdown", (e) => this.onDown(e));
    this.canvas.addEventListener("pointermove", (e) => this.onMove(e));
    this.canvas.addEventListener("pointerup", (e) => this.onUp(e));
    this.canvas.addEventListener("pointercancel", (e) => this.onUp(e));

    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(this.canvas);
    this.ro.observe(this.root);
    // Match the Skew-T when it resizes (same visual footprint).
    const st = () => document.querySelector("#sc-st");
    const bindSt = () => {
      const el = st();
      if (el && this.ro) this.ro.observe(el);
    };
    bindSt();
    // Creator mounts slightly later on setup / drawer open.
    Promise.resolve().then(bindSt);
    if (opts.setup) this.setup = cloneSynoptic(opts.setup);
    this.renderList();
    this.syncSelectionUi();
    // Initialize synoptic/jetstream UI state
    if (this.synopticToggle) this.synopticToggle.checked = this.setup.enabled === true;
    if (this.jetstreamToggle) {
      this.jetstreamToggle.checked = this.setup.jetstream === true;
      if (this.jetstreamRow) this.jetstreamRow.style.display = this.jetstreamToggle.checked ? "flex" : "none";
    }
    if (this.jetstreamSlider) {
      this.jetstreamSlider.value = String(this.setup.jetstreamSouth ?? 0.5);
      if (this.jetstreamVal) this.jetstreamVal.textContent = Math.round((this.setup.jetstreamSouth ?? 0.5) * 100) + "%";
    }
    if (this.moveToggle) {
      this.moveToggle.checked = this.setup.move !== false;
      if (this.moveRow) this.moveRow.style.display = this.moveToggle.checked ? "flex" : "none";
    }
    if (this.moveSpeed) {
      this.moveSpeed.value = String(this.setup.moveSpeed ?? 35);
      if (this.moveSpeedVal) this.moveSpeedVal.textContent = String(Math.round(this.setup.moveSpeed ?? 35));
    }
    if (this.marineInput) this.marineInput.checked = this.setup.marine !== false;
  }

  getSetup(): SynopticSetup {
    return cloneSynoptic(this.setup);
  }

  /** Load a pattern into the editor (used when a run starts). */
  setSetup(setup: SynopticSetup): void {
    this.setup = cloneSynoptic(setup);
    this.selectedId = null;
    this.draft = null;
    if (this.synopticToggle) this.synopticToggle.checked = this.setup.enabled === true;
    if (this.jetstreamToggle) {
      this.jetstreamToggle.checked = this.setup.jetstream === true;
      if (this.jetstreamRow) this.jetstreamRow.style.display = this.jetstreamToggle.checked ? "flex" : "none";
    }
    if (this.jetstreamSlider) {
      this.jetstreamSlider.value = String(this.setup.jetstreamSouth ?? 0.5);
      if (this.jetstreamVal) this.jetstreamVal.textContent = Math.round((this.setup.jetstreamSouth ?? 0.5) * 100) + "%";
    }
    if (this.moveToggle) {
      this.moveToggle.checked = this.setup.move !== false;
      if (this.moveRow) this.moveRow.style.display = this.moveToggle.checked ? "flex" : "none";
    }
    if (this.moveSpeed) {
      this.moveSpeed.value = String(this.setup.moveSpeed ?? 35);
      if (this.moveSpeedVal) this.moveSpeedVal.textContent = String(Math.round(this.setup.moveSpeed ?? 35));
    }
    if (this.marineInput) this.marineInput.checked = this.setup.marine !== false;
    this.renderList();
    this.syncSelectionUi();
    this.draw();
  }

  private notify(): void {
    this.onChange?.(this.getSetup());
  }

  resize(): void {
    const st = document.querySelector("#sc-st");
    if (st && this.ro) this.ro.observe(st);
    this.draw();
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  private selectedCenter(): PressureCenter | undefined {
    return this.setup.centers.find((c) => c.id === this.selectedId);
  }

  private deleteSelected(): void {
    if (!this.selectedId) return;
    this.setup.fronts = this.setup.fronts.filter((f) => f.id !== this.selectedId);
    this.setup.centers = this.setup.centers.filter((c) => c.id !== this.selectedId);
    this.selectedId = null;
    this.syncSelectionUi();
    this.renderList();
    this.draw();
    this.notify();
  }

  private syncSelectionUi(): void {
    const center = this.selectedCenter();
    this.deleteBtn.disabled = !this.selectedId;
    this.strengthRow.classList.toggle("visible", !!center);
    if (center) {
      this.strengthInput.value = String(center.hPa);
      this.strengthVal.textContent = `${center.hPa} hPa`;
    }
  }

  private renderList(): void {
    const rows: string[] = [];
    for (const f of this.setup.fronts) {
      rows.push(this.rowHtml(f.id, KIND_LABEL[f.kind], f.enabled, KIND_COLOR[f.kind]));
    }
    for (const c of this.setup.centers) {
      const name = c.kind === "low" ? "Surface low" : "Surface high";
      const color = c.kind === "low" ? "#ff5d5d" : "#6eb6ff";
      rows.push(this.rowHtml(c.id, `${name} ${c.hPa}`, c.enabled, color));
    }
    this.listEl.innerHTML =
      rows.join("") || `<p class="hint">No fronts yet. Pick a tool and draw on the map.</p>`;
  }

  private rowHtml(id: string, label: string, enabled: boolean, color: string): string {
    const sel = id === this.selectedId ? " selected" : "";
    return `<div class="front-row${sel}" data-id="${id}">
      <input type="checkbox" ${enabled ? "checked" : ""} aria-label="Enable ${label}" />
      <span class="front-swatch" style="background:${color}"></span>
      <span class="front-name">${label}</span>
    </div>`;
  }

  private norm(e: PointerEvent): MapPoint {
    const r = this.canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / Math.max(1, r.width);
    const y = 1 - (e.clientY - r.top) / Math.max(1, r.height);
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
  }

  private hitCenter(p: MapPoint): PressureCenter | null {
    let best: PressureCenter | null = null;
    let bestD = 0.045;
    for (const c of this.setup.centers) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  }

  private hitFront(p: MapPoint): DrawnFront | null {
    let best: DrawnFront | null = null;
    let bestD = 0.03;
    for (const f of this.setup.fronts) {
      const pts = f.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const abx = b.x - a.x, aby = b.y - a.y;
        const apx = p.x - a.x, apy = p.y - a.y;
        const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / Math.max(1e-9, abx * abx + aby * aby)));
        const px = a.x + t * abx, py = a.y + t * aby;
        const d = Math.hypot(p.x - px, p.y - py);
        if (d < bestD) { best = f; bestD = d; }
      }
    }
    return best;
  }

  private onDown(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    this.root.focus();
    const p = this.norm(e);
    if (this.isCoverTool(this.tool)) {
      this.painting = true;
      this.stamp(p);
      return;
    }
    if (this.tool === "nest") {
      this.nestDrag = p;
      this.nest = {
        x0: p.x,
        y0: p.y,
        x1: p.x,
        y1: p.y,
        refinement: Number(this.refineInput.value) >= 3 ? 3 : 2,
      };
      this.draw();
      return;
    }
    if (this.tool === "low" || this.tool === "high") {
      const center: PressureCenter = {
        id: this.nextId(this.tool),
        kind: this.tool,
        enabled: true,
        x: p.x,
        y: p.y,
        hPa: 6,
      };
      this.setup.centers.push(center);
      this.selectedId = center.id;
      this.syncSelectionUi();
      this.renderList();
      this.draw();
      this.notify();
      return;
    }
    if (this.tool === "select") {
      const center = this.hitCenter(p);
      if (center) {
        this.selectedId = center.id;
        this.dragging = { id: center.id, dx: center.x - p.x, dy: center.y - p.y };
      } else {
        const front = this.hitFront(p);
        this.selectedId = front?.id ?? null;
        this.dragging = null;
      }
      this.syncSelectionUi();
      this.renderList();
      this.draw();
      return;
    }
    this.draft = [p];
    this.draw();
  }

  private onMove(e: PointerEvent): void {
    const p = this.norm(e);
    if (this.painting) {
      this.stamp(p);
      return;
    }
    if (this.nestDrag && this.nest) {
      this.nest.x1 = p.x;
      this.nest.y1 = p.y;
      this.draw();
      return;
    }
    if (this.dragging) {
      const c = this.setup.centers.find((x) => x.id === this.dragging!.id);
      if (!c) return;
      c.x = Math.min(1, Math.max(0, p.x + this.dragging.dx));
      c.y = Math.min(1, Math.max(0, p.y + this.dragging.dy));
      this.draw();
      this.notify();
      return;
    }
    if (!this.draft) return;
    const last = this.draft[this.draft.length - 1];
    if (Math.hypot(last.x - p.x, last.y - p.y) < 0.02) return;
    this.draft.push(p);
    this.draw();
  }

  private onUp(e: PointerEvent): void {
    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
    this.dragging = null;
    if (this.painting) {
      this.painting = false;
      return;
    }
    if (this.nestDrag && this.nest) {
      this.nestDrag = null;
      const x0 = Math.min(this.nest.x0, this.nest.x1);
      const x1 = Math.max(this.nest.x0, this.nest.x1);
      const y0 = Math.min(this.nest.y0, this.nest.y1);
      const y1 = Math.max(this.nest.y0, this.nest.y1);
      this.nest = normalizeNest({
        x0,
        y0,
        x1,
        y1,
        refinement: this.nest.refinement >= 3 ? 3 : 2,
      });
      this.draw();
      return;
    }
    if (!this.draft) return;
    const pts = this.draft;
    this.draft = null;
    if (pts.length < 2) {
      this.draw();
      return;
    }
    const kind = this.tool as FrontKind;
    if (
      kind === "outflow" &&
      pts.length >= 3 &&
      Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 0.08
    ) {
      pts.push({ ...pts[0] });
    }
    const front: DrawnFront = {
      id: this.nextId(kind),
      kind,
      enabled: true,
      points: pts,
    };
    this.setup.fronts.push(front);
    this.selectedId = front.id;
    this.syncSelectionUi();
    this.renderList();
    this.draw();
    this.notify();
  }

  /** Match the on-screen Skew-T box; fall back to ST aspect in the host width. */
  private frontCssSize(): { cssW: number; cssH: number } {
    const st = document.querySelector("#sc-st") as HTMLCanvasElement | null;
    if (st && st.clientWidth > 40 && st.clientHeight > 40) {
      return { cssW: Math.round(st.clientWidth), cssH: Math.round(st.clientHeight) };
    }
    const parentW = Math.max(
      1,
      this.canvas.parentElement?.clientWidth || this.root.clientWidth || 640,
    );
    // Same logical aspect as creatorDraw ST_W/ST_H (1200×1120).
    const cssW = Math.round(Math.min(parentW, 1200));
    const cssH = Math.round(cssW * (1120 / 1200));
    return { cssW, cssH };
  }

  private draw(): void {
    const { cssW, cssH } = this.frontCssSize();
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(cssW * dpr);
    const h = Math.floor(cssH * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg")
        .trim() || "#0a0f16";
    ctx.fillRect(0, 0, cssW, cssH);
    this.paintSurface(cssW, cssH);
    this.paintTint(cssW, cssH);
    this.paintMarine(cssW, cssH);
    for (const f of this.setup.fronts) this.paintFront(f, cssW, cssH, false);
    if (
      this.draft &&
      this.draft.length > 0 &&
      (this.tool === "cold" ||
        this.tool === "warm" ||
        this.tool === "stationary" ||
        this.tool === "dryline" ||
        this.tool === "outflow")
    ) {
      this.paintFront(
        {
          id: "draft",
          kind: this.tool,
          enabled: true,
          points: this.draft,
        },
        cssW,
        cssH,
        true,
      );
    }
    for (const c of this.setup.centers) this.paintCenter(c, cssW, cssH);
    this.paintCompass(cssW, cssH);
  }

  private toPx(p: MapPoint, w: number, h: number): { x: number; y: number } {
    return { x: p.x * w, y: (1 - p.y) * h };
  }

  private previewMasses(xn: number, yn: number) {
    const s = this.setup;
    let cold = 0, dry = 0, low = 0, high = 0;
    for (const c of s.centers) {
      const d = Math.hypot(c.x - xn, c.y - yn);
      const v = Math.exp(-d * d / 0.01);
      if (c.kind === "low") low += v * Math.min(1, Math.abs(c.hPa) / 20);
      else high += v * Math.min(1, Math.abs(c.hPa) / 20);
    }
    for (const f of s.fronts) {
      if (!f.enabled) continue;
      let minD = 1;
      for (const p of f.points) minD = Math.min(minD, Math.hypot(p.x - xn, p.y - yn));
      const v = Math.exp(-minD * minD / 0.002);
      if (f.kind === "cold") cold += v * 0.8;
      else if ((f.kind as string) === "occluded") { cold += v * 0.6; dry += v * 0.4; }
      else dry += v * 0.4;
    }
    return { cold, dry, low, high };
  }

  /** Highest terrain the brush will raise to, from the domain altitude. */
  setTerrainCeiling(zTop: number): void {
    this.ceiling = crestCap(zTop);
    for (let i = 0; i < this.terrain.length; i++) {
      if (this.kind[i] >= 1.5 || (this.kind[i] < 0.5 && this.water[i] > 0.5)) this.terrain[i] = 0;
      else if (this.terrain[i] > this.ceiling) this.terrain[i] = this.ceiling;
    }
  }

  exportSurface(): SurfaceExport {
    let terrainOn = false;
    let waterOn = false;
    let soilOn = false;
    let vegOn = false;
    for (let i = 0; i < this.terrain.length; i++) {
      if (this.terrain[i] > 1) terrainOn = true;
      if (this.kind[i] >= 0.5 || this.water[i] > 0.02) waterOn = true;
      if (this.soil[i] > 0.02) soilOn = true;
      if (this.veg[i] > 0.02) vegOn = true;
    }
    const out: SurfaceExport = {};
    if (terrainOn) out.terrain = Array.from(this.terrain);
    if (waterOn) {
      out.water = Array.from(this.water);
      out.kind = Array.from(this.kind);
      out.waterTemp = Array.from(this.waterTemp);
      out.sstC = this.sstC;
    }
    if (soilOn) out.soil = Array.from(this.soil);
    if (vegOn) out.veg = Array.from(this.veg);
    if (this.nest) out.nest = { ...this.nest };
    return out;
  }

  private applyPreset(kind: string): void {
    if (kind === "flat") {
      zeroField(this.terrain);
      this.clearCover();
      this.nest = null;
      this.setup.marine = false;
      this.marineInput.checked = false;
    } else if (kind === "ridge") {
      fillRidge(this.terrain, this.ceiling * 0.55);
      this.clearWaterOnHills();
    } else if (kind === "peak") {
      fillPeak(this.terrain, this.ceiling * 0.7);
      this.clearWaterOnHills();
    } else if (kind === "lake") {
      zeroField(this.terrain);
      this.clearCover();
      fillLakeBasin(this.terrain, this.kind, this.water, this.waterTemp, this.ceiling * 0.25);
    } else if (kind === "forest") {
      fillForest(this.soil, this.veg);
      this.clearVegOnWater();
    } else {
      fillSoutheastSea(this.water);
      for (let i = 0; i < this.water.length; i++) {
        if (this.water[i] > 0.02) {
          this.kind[i] = COVER_OCEAN;
          this.waterTemp[i] = this.sstC;
          this.soil[i] = 0;
          this.veg[i] = 0;
        }
        if (this.water[i] > 0.5) this.terrain[i] = 0;
      }
      this.setup.marine = true;
      this.marineInput.checked = true;
    }
    this.draw();
  }

  private clearCover(): void {
    zeroField(this.water);
    zeroField(this.kind);
    zeroField(this.soil);
    zeroField(this.veg);
    this.waterTemp.fill(this.sstC);
  }

  private clearWaterOnHills(): void {
    for (let i = 0; i < this.terrain.length; i++) {
      if (this.terrain[i] > 1 && this.kind[i] >= 0.5) {
        this.water[i] = 0;
        this.kind[i] = 0;
      }
    }
  }

  private clearVegOnWater(): void {
    for (let i = 0; i < this.kind.length; i++) {
      if (this.kind[i] >= 0.5) {
        this.soil[i] = 0;
        this.veg[i] = 0;
      }
    }
  }

  private stamp(p: MapPoint): void {
    const n = SURFACE_N;
    const radius = 4;
    const cx = p.x * (n - 1);
    const cy = p.y * (n - 1);
    const i0 = Math.max(0, Math.floor(cx - radius));
    const i1 = Math.min(n - 1, Math.ceil(cx + radius));
    const j0 = Math.max(0, Math.floor(cy - radius));
    const j1 = Math.min(n - 1, Math.ceil(cy + radius));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(i - cx, j - cy);
        if (d > radius) continue;
        const s = i + n * j;
        if (this.tool === "raise") {
          this.kind[s] = 0;
          this.water[s] = 0;
          this.terrain[s] = Math.min(this.ceiling, this.terrain[s] + this.raiseStep);
        } else if (this.tool === "lower") {
          this.terrain[s] = Math.max(0, this.terrain[s] - this.raiseStep);
        } else if (this.tool === "sea") {
          this.kind[s] = COVER_OCEAN;
          this.water[s] = 1;
          this.waterTemp[s] = this.sstC;
          this.soil[s] = 0;
          this.veg[s] = 0;
          this.terrain[s] = 0;
        } else if (this.tool === "lake") {
          this.kind[s] = COVER_LAKE;
          this.water[s] = 1;
          this.waterTemp[s] = this.sstC;
          this.soil[s] = 0;
          this.veg[s] = 0;
        } else if (this.tool === "temp") {
          if (this.kind[s] >= 0.5) this.waterTemp[s] = this.sstC;
        } else if (this.tool === "soil") {
          if (this.kind[s] < 0.5) this.soil[s] = this.soilBrush;
        } else if (this.tool === "veg") {
          if (this.kind[s] < 0.5) this.veg[s] = this.vegBrush;
        } else if (this.tool === "land") {
          this.kind[s] = 0;
          this.water[s] = 0;
        }
      }
    }
    this.draw();
  }

  private isCoverTool(tool: Tool): boolean {
    return (
      tool === "raise" ||
      tool === "lower" ||
      tool === "sea" ||
      tool === "lake" ||
      tool === "land" ||
      tool === "temp" ||
      tool === "soil" ||
      tool === "veg"
    );
  }

  /** keepTool leaves Nest selected when that button was the one just pressed. */
  private syncCoverLayer(keepTool = false): void {
    const layer = this.coverLayer;
    if (!keepTool) {
      if (layer === "terrain" && this.tool !== "raise" && this.tool !== "lower") this.tool = "raise";
      else if (layer === "water" && this.tool !== "sea" && this.tool !== "lake" && this.tool !== "land") {
        this.tool = "lake";
      } else if (layer === "temp") this.tool = "temp";
      else if (layer === "soil") this.tool = "soil";
      else if (layer === "veg") this.tool = "veg";
    }
    const buttons = this.root.querySelectorAll("#sf-surface-tools button");
    buttons.forEach((node) => {
      const b = node as HTMLButtonElement;
      const t = b.dataset.tool;
      const show =
        t === "nest" ||
        (layer === "terrain" && (t === "raise" || t === "lower")) ||
        (layer === "water" && (t === "land" || t === "lake" || t === "sea"));
      b.hidden = !show;
    });
    this.applySliderRange();
    for (const b of this.root.querySelectorAll(".front-tools button")) {
      const tool = (b as HTMLButtonElement).dataset.tool;
      b.classList.toggle("active", tool === this.tool);
    }
    this.canvas.classList.toggle("drawing", this.tool !== "select");
    this.draw();
  }

  private applySliderRange(): void {
    const input = this.sstInput;
    const label = this.root.querySelector("#sf-cover-label");
    if (this.coverLayer === "temp" || this.coverLayer === "water") {
      input.min = "5";
      input.max = "32";
      input.step = "1";
      input.value = String(Math.round(this.sstC));
      if (label) label.textContent = "Water temperature (°C)";
    } else if (this.coverLayer === "soil") {
      input.min = "0";
      input.max = "1";
      input.step = "0.05";
      input.value = this.soilBrush.toFixed(2);
      if (label) label.textContent = "Soil moisture";
    } else if (this.coverLayer === "veg") {
      input.min = "0";
      input.max = "1";
      input.step = "0.05";
      input.value = this.vegBrush.toFixed(2);
      if (label) label.textContent = "Vegetation";
    } else {
      input.min = "40";
      input.max = "200";
      input.step = "20";
      input.value = String(Math.round(this.raiseStep));
      if (label) label.textContent = "Raise per stroke (m)";
    }
    this.writeSliderLabel();
  }

  private writeSliderLabel(): void {
    const val = this.root.querySelector("#sf-sst-val");
    if (!val) return;
    const v = Number(this.sstInput.value);
    if (this.coverLayer === "soil" || this.coverLayer === "veg") val.textContent = v.toFixed(2);
    else val.textContent = String(Math.round(v));
  }

  private paintSurface(w: number, h: number): void {
    const n = SURFACE_N;
    const cw = w / n;
    const ch = h / n;
    const layer = this.coverLayer;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const s = i + n * j;
        const style = this.coverStyle(layer, s);
        if (!style) continue;
        this.ctx.fillStyle = style;
        const py = (1 - (j + 1) / n) * h;
        this.ctx.fillRect(i * cw, py, cw + 0.6, ch + 0.6);
      }
    }
    if (!this.nest) return;
    const x0 = Math.min(this.nest.x0, this.nest.x1) * w;
    const x1 = Math.max(this.nest.x0, this.nest.x1) * w;
    const yTop = (1 - Math.max(this.nest.y0, this.nest.y1)) * h;
    const yBot = (1 - Math.min(this.nest.y0, this.nest.y1)) * h;
    this.ctx.strokeStyle = "#f4e2a8";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x0, yTop, Math.max(2, x1 - x0), Math.max(2, yBot - yTop));
  }

  private coverStyle(layer: CoverLayer, s: number): string | null {
    const kind = this.kind[s];
    const elev = this.ceiling > 0 ? this.terrain[s] / this.ceiling : 0;
    if (layer === "temp") {
      if (kind < 0.5) return null;
      const t = Math.max(0, Math.min(1, (this.waterTemp[s] - 5) / 27));
      const r = Math.round(40 + t * 190);
      const b = Math.round(200 - t * 150);
      return `rgba(${r}, 90, ${b}, 0.85)`;
    }
    if (layer === "soil") {
      if (kind >= 0.5) return null;
      const m = Math.max(0, Math.min(1, this.soil[s]));
      if (m < 0.02) return null;
      const r = Math.round(150 - m * 110);
      const g = Math.round(100 - m * 20);
      const b = Math.round(52 + m * 120);
      return `rgba(${r}, ${g}, ${b}, 0.85)`;
    }
    if (layer === "veg") {
      if (kind >= 0.5) return null;
      const v = Math.max(0, Math.min(1, this.veg[s]));
      if (v < 0.02) return null;
      const r = Math.round(140 - v * 110);
      const g = Math.round(120 - v * 20);
      const b = Math.round(70 - v * 30);
      return `rgba(${r}, ${g}, ${b}, 0.85)`;
    }
    if (layer === "water") {
      if (kind >= 1.5) return "rgba(18, 78, 130, 0.82)";
      if (kind >= 0.5) return "rgba(120, 190, 210, 0.82)";
      return null;
    }
    if (kind >= 1.5) return `rgba(18, 78, 130, ${0.45 + this.water[s] * 0.4})`;
    if (kind >= 0.5) return "rgba(120, 190, 210, 0.75)";
    if (elev > 0.02) {
      const g = Math.round(90 + elev * 80);
      return `rgba(${g}, ${Math.round(g * 0.85)}, ${Math.round(70 + elev * 40)}, 0.85)`;
    }
    return null;
  }

  private paintTint(w: number, h: number): void {
    const n = 28;
    const cw = w / n;
    const ch = h / n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const xn = (i + 0.5) / n;
        const yn = 1 - (j + 0.5) / n;
        const m = this.previewMasses(xn, yn);
        if (m.cold > 0.2) {
          this.ctx.fillStyle = `rgba(80, 150, 220, ${0.14 * m.cold})`;
          this.ctx.fillRect(i * cw, j * ch, cw + 0.5, ch + 0.5);
        }
        if (m.dry > 0.2) {
          this.ctx.fillStyle = `rgba(210, 150, 70, ${0.16 * m.dry})`;
          this.ctx.fillRect(i * cw, j * ch, cw + 0.5, ch + 0.5);
        }
        if (m.low > 0.15) {
          this.ctx.fillStyle = `rgba(255, 80, 80, ${0.12 * m.low})`;
          this.ctx.fillRect(i * cw, j * ch, cw + 0.5, ch + 0.5);
        }
        if (m.high > 0.15) {
          this.ctx.fillStyle = `rgba(80, 160, 255, ${0.12 * m.high})`;
          this.ctx.fillRect(i * cw, j * ch, cw + 0.5, ch + 0.5);
        }
      }
    }
  }

  private paintMarine(w: number, h: number): void {
    if (!this.setup.marine) return;
    this.ctx.fillStyle = "rgba(40, 120, 170, 0.28)";
    this.ctx.beginPath();
    this.ctx.moveTo(0.7 * w, h);
    this.ctx.lineTo(w, h);
    this.ctx.lineTo(w, (1 - 0.3) * h);
    this.ctx.lineTo(0.8 * w, (1 - 0.2) * h);
    this.ctx.closePath();
    this.ctx.fill();
  }

  private paintFront(f: DrawnFront, w: number, h: number, draft: boolean): void {
    if (f.points.length < 1) return;
    const ctx = this.ctx;
    const color = KIND_COLOR[f.kind];
    ctx.save();
    ctx.globalAlpha = f.enabled ? 1 : 0.35;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = f.id === this.selectedId ? 3 : 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash(f.enabled ? [] : [5, 4]);
    ctx.beginPath();
    const p0 = this.toPx(f.points[0], w, h);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < f.points.length; i++) {
      const p = this.toPx(f.points[i], w, h);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (!draft && f.points.length >= 2) this.paintSymbols(f, w, h);
    ctx.restore();
  }

  private paintSymbols(f: DrawnFront, w: number, h: number): void {
    const ctx = this.ctx;
    const spacing = 0.055;
    let carry = spacing * 0.5;
    let barb = 0;
    for (let i = 0; i < f.points.length - 1; i++) {
      const a = f.points[i];
      const b = f.points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) continue;
      const tx = dx / len;
      const ty = dy / len;
      const rx = ty;
      const ry = -tx;
      let d = carry;
      while (d < len) {
        const x = a.x + tx * d;
        const y = a.y + ty * d;
        const style = this.symbolKind(f.kind, barb);
        this.paintBarb(style, x, y, tx, ty, rx, ry, w, h);
        barb += 1;
        d += spacing;
      }
      carry = d - len;
    }
  }

  private symbolKind(kind: FrontKind, index: number): FrontKind {
    if (kind !== "stationary") return kind;
    return index % 2 === 0 ? "cold" : "warm";
  }

  private paintBarb(
    kind: FrontKind,
    x: number,
    y: number,
    tx: number,
    ty: number,
    rx: number,
    ry: number,
    w: number,
    h: number,
  ): void {
    const ctx = this.ctx;
    const tip = this.toPx({ x: x + rx * 0.03, y: y + ry * 0.03 }, w, h);
    const left = this.toPx(
      { x: x - tx * 0.012 - rx * 0.004, y: y - ty * 0.012 - ry * 0.004 },
      w,
      h,
    );
    const right = this.toPx(
      { x: x + tx * 0.012 - rx * 0.004, y: y + ty * 0.012 - ry * 0.004 },
      w,
      h,
    );
    ctx.beginPath();
    if (kind === "warm") {
      ctx.moveTo(left.x, left.y);
      ctx.quadraticCurveTo(tip.x, tip.y, right.x, right.y);
      ctx.stroke();
      return;
    }
    if (kind === "dryline") {
      ctx.moveTo(left.x, left.y);
      ctx.quadraticCurveTo(tip.x, tip.y, right.x, right.y);
      ctx.stroke();
      return;
    }
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.closePath();
    ctx.fill();
  }

  private paintCenter(c: PressureCenter, w: number, h: number): void {
    const ctx = this.ctx;
    const p = this.toPx(c, w, h);
    ctx.save();
    ctx.globalAlpha = c.enabled ? 1 : 0.4;
    ctx.fillStyle = c.kind === "low" ? "#ff5d5d" : "#6eb6ff";
    ctx.font = "700 18px Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(c.kind === "low" ? "L" : "H", p.x, p.y);
    ctx.font = "11px Segoe UI, system-ui, sans-serif";
    ctx.fillText(String(c.hPa), p.x, p.y + 14);
    if (c.id === this.selectedId) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private paintCompass(w: number, h: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(232, 238, 248, 0.7)";
    ctx.font = "12px Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("N", w / 2, 6);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("E", w - 16, h / 2);
    ctx.textAlign = "right";
    ctx.fillText("W", 16, h / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("S", w / 2, h - 6);
  }
}
