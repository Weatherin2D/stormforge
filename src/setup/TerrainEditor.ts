/**
 * Land and water map. Separate from the fronts map: one canvas, one brush,
 * a layer for what the brush changes, and a brush-size slider.
 */
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

type Tool = "raise" | "lower" | "sea" | "lake" | "land" | "temp" | "soil" | "veg" | "nest";
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

interface MapPoint {
  x: number;
  y: number;
}

export class TerrainEditor {
  readonly root: HTMLElement;
  /** Southeast-sea checkbox on the fronts map follows this. */
  onMarine: ((on: boolean) => void) | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
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
  /** Brush radius in editor cells. */
  private brush = 8;
  private coverLayer: CoverLayer = "terrain";
  private tool: Tool = "raise";
  private nest: NestRect | null = null;
  private ceiling = 4800;
  private painting = false;
  private nestDrag: MapPoint | null = null;
  private hover: MapPoint | null = null;
  private valueInput: HTMLInputElement;
  private brushInput: HTMLInputElement;
  private refineInput: HTMLSelectElement;
  private layerInput: HTMLSelectElement;

  constructor() {
    this.root = document.createElement("section");
    this.root.className = "terrain-editor";
    this.root.innerHTML = `
      <h2>Land &amp; water</h2>
      <p class="hint">Pick a layer, then drag on this map. Vegetation becomes trees once the run starts. Fronts stay on the map above.</p>
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
        <button type="button" data-tool="raise" class="active">Raise</button>
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
        Brush size
        <input id="sf-brush" type="range" min="2" max="28" step="1" value="8" />
        <span id="sf-brush-val">8</span>
      </label>
      <label class="surface-field">
        Nest refinement
        <select id="sf-nest-refine">
          <option value="2" selected>2×</option>
          <option value="3">3×</option>
        </select>
      </label>
      </div>
      <canvas id="sf-terrain-canvas"></canvas>
    `;
    this.canvas = this.root.querySelector("#sf-terrain-canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.valueInput = this.root.querySelector("#sf-sst") as HTMLInputElement;
    this.brushInput = this.root.querySelector("#sf-brush") as HTMLInputElement;
    this.refineInput = this.root.querySelector("#sf-nest-refine") as HTMLSelectElement;
    this.layerInput = this.root.querySelector("#sf-cover-layer") as HTMLSelectElement;
    this.waterTemp.fill(this.sstC);
    this.syncCoverLayer();

    this.layerInput.addEventListener("change", () => {
      this.coverLayer = this.layerInput.value as CoverLayer;
      this.syncCoverLayer();
    });
    this.root.querySelector("#sf-surface-tools")!.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button[data-tool]") as HTMLButtonElement | null;
      if (!btn) return;
      this.tool = btn.dataset.tool as Tool;
      this.painting = false;
      this.nestDrag = null;
      if (this.tool === "raise" || this.tool === "lower") this.coverLayer = "terrain";
      else if (this.tool === "sea" || this.tool === "lake" || this.tool === "land") this.coverLayer = "water";
      if (this.tool !== "nest") this.layerInput.value = this.coverLayer;
      this.syncCoverLayer(this.tool === "nest");
    });
    this.root.querySelector("#sf-surface-presets")!.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button[data-preset]") as HTMLButtonElement | null;
      if (!btn) return;
      this.applyPreset(btn.dataset.preset || "flat");
    });
    this.valueInput.addEventListener("input", () => {
      const v = Number(this.valueInput.value);
      if (this.coverLayer === "temp" || this.coverLayer === "water") this.sstC = v;
      else if (this.coverLayer === "soil") this.soilBrush = v;
      else if (this.coverLayer === "veg") this.vegBrush = v;
      else this.raiseStep = v;
      this.writeValueLabel();
    });
    this.brushInput.addEventListener("input", () => {
      this.brush = Math.max(1, Math.round(Number(this.brushInput.value)));
      const val = this.root.querySelector("#sf-brush-val");
      if (val) val.textContent = String(this.brush);
      this.draw();
    });
    this.refineInput.addEventListener("change", () => {
      if (!this.nest) return;
      this.nest.refinement = Number(this.refineInput.value) >= 3 ? 3 : 2;
      this.draw();
    });
    this.canvas.addEventListener("pointerdown", (e) => this.onDown(e));
    this.canvas.addEventListener("pointermove", (e) => this.onMove(e));
    this.canvas.addEventListener("pointerup", (e) => this.onUp(e));
    this.canvas.addEventListener("pointerleave", () => {
      this.hover = null;
      if (!this.painting && !this.nestDrag) this.draw();
    });
  }

  resize(): void {
    this.draw();
  }

  setTerrainCeiling(zTop: number): void {
    this.ceiling = crestCap(zTop);
    for (let i = 0; i < this.terrain.length; i++) {
      if (this.kind[i] >= 1.5 || (this.kind[i] < 0.5 && this.water[i] > 0.5)) this.terrain[i] = 0;
      else if (this.terrain[i] > this.ceiling) this.terrain[i] = this.ceiling;
    }
    this.draw();
  }

  /** Paint the southeast ocean when the fronts checkbox is turned on. */
  paintSoutheast(): void {
    this.applyPreset("sea");
  }

  /** Clear lakes and ocean when that checkbox is turned off. */
  clearWater(): void {
    zeroField(this.water);
    zeroField(this.kind);
    this.draw();
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
      b.classList.toggle("active", t === this.tool);
    });
    this.applySliderRange();
    this.draw();
  }

  private applySliderRange(): void {
    const input = this.valueInput;
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
    this.writeValueLabel();
  }

  private writeValueLabel(): void {
    const val = this.root.querySelector("#sf-sst-val");
    if (!val) return;
    const v = Number(this.valueInput.value);
    if (this.coverLayer === "soil" || this.coverLayer === "veg") val.textContent = v.toFixed(2);
    else val.textContent = String(Math.round(v));
  }

  private applyPreset(kind: string): void {
    if (kind === "flat") {
      zeroField(this.terrain);
      this.clearCover();
      this.nest = null;
      this.onMarine?.(false);
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
      this.onMarine?.(true);
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

  private norm(e: PointerEvent): MapPoint {
    const r = this.canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / Math.max(1, r.width);
    const y = 1 - (e.clientY - r.top) / Math.max(1, r.height);
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
  }

  private onDown(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.norm(e);
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
    this.painting = true;
    this.stamp(p);
  }

  private onMove(e: PointerEvent): void {
    const p = this.norm(e);
    this.hover = p;
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
    this.draw();
  }

  private onUp(e: PointerEvent): void {
    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
    this.painting = false;
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
    }
  }

  private stamp(p: MapPoint): void {
    const n = SURFACE_N;
    const radius = this.brush;
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
        const fall = 0.5 + 0.5 * Math.cos((Math.PI * d) / Math.max(1, radius));
        if (this.tool === "raise") {
          this.kind[s] = 0;
          this.water[s] = 0;
          this.terrain[s] = Math.min(this.ceiling, this.terrain[s] + this.raiseStep * fall);
        } else if (this.tool === "lower") {
          this.terrain[s] = Math.max(0, this.terrain[s] - this.raiseStep * fall);
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

  private draw(): void {
    const parentW = Math.max(1, this.canvas.parentElement?.clientWidth || 640);
    const css = Math.round(Math.min(parentW, 720));
    this.canvas.style.width = `${css}px`;
    this.canvas.style.height = `${css}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(css * dpr);
    const h = w;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, css, css);
    ctx.fillStyle =
      getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#0a0f16";
    ctx.fillRect(0, 0, css, css);
    this.paintCells(css, css);
    this.paintNest(css, css);
    this.paintBrush(css, css);
    this.paintCompass(css, css);
  }

  private paintCells(w: number, h: number): void {
    const n = SURFACE_N;
    const cw = w / n;
    const ch = h / n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const style = this.coverStyle(i + n * j);
        if (!style) continue;
        this.ctx.fillStyle = style;
        const py = (1 - (j + 1) / n) * h;
        this.ctx.fillRect(i * cw, py, cw + 0.6, ch + 0.6);
      }
    }
  }

  private coverStyle(s: number): string | null {
    const layer = this.coverLayer;
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

  private paintNest(w: number, h: number): void {
    if (!this.nest) return;
    const x0 = Math.min(this.nest.x0, this.nest.x1) * w;
    const x1 = Math.max(this.nest.x0, this.nest.x1) * w;
    const yTop = (1 - Math.max(this.nest.y0, this.nest.y1)) * h;
    const yBot = (1 - Math.min(this.nest.y0, this.nest.y1)) * h;
    this.ctx.strokeStyle = "#f4e2a8";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x0, yTop, Math.max(2, x1 - x0), Math.max(2, yBot - yTop));
  }

  private paintBrush(w: number, h: number): void {
    if (!this.hover || this.tool === "nest") return;
    const r = (this.brush / SURFACE_N) * w;
    this.ctx.beginPath();
    this.ctx.arc(this.hover.x * w, (1 - this.hover.y) * h, Math.max(2, r), 0, Math.PI * 2);
    this.ctx.strokeStyle = "rgba(244, 226, 168, 0.9)";
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();
  }

  private paintCompass(w: number, h: number): void {
    this.ctx.fillStyle = "rgba(180, 196, 214, 0.8)";
    this.ctx.font = "12px sans-serif";
    this.ctx.fillText("N", w * 0.5 - 4, 16);
    this.ctx.fillText("S", w * 0.5 - 4, h - 8);
    this.ctx.fillText("W", 8, h * 0.5);
    this.ctx.fillText("E", w - 16, h * 0.5);
  }
}
