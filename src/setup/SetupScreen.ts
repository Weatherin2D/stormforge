import {
  Grid3D,
  gridFromExtentAndResolution,
  perfWarning,
} from "../sim/Grid3D";
import {
  BATCH_MEMORY_CAP_BYTES,
  estimateBatchBytes,
  estimateFrameCount,
} from "../sim/FrameStore";
import { BATCH_FIXED_DT } from "../sim/BatchRunner";
import { SoundingLevel } from "../sim/thermo";
import { SoundingCreator } from "../skewt/creator";
import { SynopticEditor } from "./SynopticEditor";
import { TerrainEditor } from "./TerrainEditor";
import { SynopticSetup } from "../sim/synoptic";
import type { NestRect } from "../sim/surface";

export type RunMode = "live" | "batch";
export type SimScale = "sandbox" | "mesoscale" | "continental" | "custom";

/** Preset physical domain sizes (km). Resolution (nx/ny) stays independent. */
const SCALE_PRESETS: Record<
  Exclude<SimScale, "custom">,
  { extentKm: number; hydrostatic: boolean }
> = {
  sandbox: { extentKm: 64, hydrostatic: false },
  mesoscale: { extentKm: 200, hydrostatic: false },
  continental: { extentKm: 10000, hydrostatic: true },
};

/** Log-mapped extent slider: 0…1000 → 16…20000 km (fine control near sandbox sizes). */
const EXTENT_KM_MIN = 16;
const EXTENT_KM_MAX = 20000;
const EXTENT_SLIDER_MAX = 1000;
const EXTENT_LOG_SPAN = Math.log(EXTENT_KM_MAX / EXTENT_KM_MIN);

function extentKmFromSlider(t: number): number {
  const u = Math.min(EXTENT_SLIDER_MAX, Math.max(0, t)) / EXTENT_SLIDER_MAX;
  const km = EXTENT_KM_MIN * Math.exp(EXTENT_LOG_SPAN * u);
  if (km >= 1000) return Math.round(km / 50) * 50;
  if (km >= 200) return Math.round(km / 10) * 10;
  return Math.round(km);
}

function sliderFromExtentKm(km: number): number {
  const clipped = Math.min(EXTENT_KM_MAX, Math.max(EXTENT_KM_MIN, km));
  return Math.round(
    (Math.log(clipped / EXTENT_KM_MIN) / EXTENT_LOG_SPAN) * EXTENT_SLIDER_MAX,
  );
}

export interface SetupValues {
  name: string;
  nx: number;
  ny: number;
  nz: number;
  zTop: number;
  bubbleStrength: number;
  /** Degrees north positive. */
  latitudeDeg: number;
  /** Calendar month 1–12. */
  month: number;
  /** Local solar start hour 0–24. */
  startHour: number;
  runMode: RunMode;
  /** Batch: total sim seconds to integrate. */
  durationSec: number;
  /** Batch: save a frame every N sim seconds. */
  outputIntervalSec: number;
  /** Initial sounding for the run (live or batch). */
  sounding: SoundingLevel[];
  /** Fronts, highs, and lows drawn on the setup map. */
  synoptic: SynopticSetup;
  /** Preset domain scale label (sandbox / mesoscale / continental / custom). */
  scale?: SimScale;
  /** Physical extent X (km) — source of truth for horizontal scale. */
  extentXKm?: number;
  /** Physical extent Y (km). */
  extentYKm?: number;
  /** Derived cell size X (km) = extentX / nx (kept for compatibility). */
  dxKm?: number;
  /** Derived cell size Y (km) = extentY / ny. */
  dyKm?: number;
  /** Use hydrostatic balance (recommended when Δx > ~5 km). */
  hydrostatic?: boolean;
  /** Painted height, metres, 128×128. Absent on older saves. */
  terrain?: number[];
  /** Painted sea mask, 0–1, 128×128. */
  water?: number[];
  /** 0 land, 1 lake, 2 ocean. Absent on older saves. */
  kind?: number[];
  /** Painted water temperature, °C, one value per editor cell. */
  waterTemp?: number[];
  /** Soil moisture, 0–1, land only. */
  soil?: number[];
  /** Vegetation, 0 bare to 1 forest, land only. */
  veg?: number[];
  /** Fallback water temperature (°C) when a save has no per-cell field. */
  sstC?: number;
  /** One refinement rectangle in normalized parent coordinates. */
  nest?: NestRect | null;
}

export class SetupScreen {
  readonly root: HTMLElement;
  private warnEl: HTMLElement;
  private onStart: (values: SetupValues) => void;
  private creator: SoundingCreator;
  private sounding: SoundingLevel[];
  private fronts: SynopticEditor;
  private terrain: TerrainEditor;

  constructor(onStart: (values: SetupValues) => void) {
    this.onStart = onStart;
    this.root = document.createElement("div");
    this.root.id = "setup-screen";
    this.root.className = "screen active";
    this.root.innerHTML = `
      <div class="setup-shell">
        <div class="setup-card setup-main">
          <div class="brand-block">
            <h1>Stormforge</h1>
            <p class="tagline">3D clouds &amp; rain sandbox — sounding-driven convection</p>
          </div>
          <div class="fields">
            <div class="setup-group">
              <p class="setup-group-title">Run</p>
              <label>
                Run name
                <input id="sf-name" type="text" value="Stormforge Run" maxlength="64" />
              </label>
              <fieldset class="run-mode-fieldset">
                <legend>Mode</legend>
                <label class="run-mode-option">
                  <input type="radio" name="sf-runmode" value="live" checked />
                  <span>
                    <strong>Live sandbox</strong>
                    <span class="hint">Physics runs while you watch</span>
                  </span>
                </label>
                <label class="run-mode-option">
                  <input type="radio" name="sf-runmode" value="batch" />
                  <span>
                    <strong>Batch then review</strong>
                    <span class="hint">Integrate, then scrub the recording</span>
                  </span>
                </label>
              </fieldset>
            </div>

            <div class="setup-group">
              <p class="setup-group-title">Domain</p>
              <div class="field-row">
                <label>
                  Scale preset
                  <select id="sf-scale">
                    <option value="sandbox">Sandbox (64 km)</option>
                    <option value="mesoscale">Mesoscale (200 km)</option>
                    <option value="continental">Continental (10,000 km)</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
              </div>
              <label>
                Domain size X (km)
                <input id="sf-extentx" type="range" min="0" max="1000" step="1" value="194" />
                <span class="hint"><span id="sf-extentx-val">64</span> km east–west</span>
              </label>
              <label>
                Domain size Y (km)
                <input id="sf-extenty" type="range" min="0" max="1000" step="1" value="194" />
                <span class="hint"><span id="sf-extenty-val">64</span> km south–north</span>
              </label>
              <label class="check-inline">
                <input id="sf-lock-square" type="checkbox" checked />
                Lock square domain (X = Y)
              </label>
              <p class="hint" id="sf-scale-hint">Scale sets physical size. Resolution below sets how many cells fill it.</p>

              <div id="sf-batch-fields" class="batch-fields hidden">
                <div class="field-row">
                  <label>
                    Duration (sim s)
                    <input id="sf-duration" type="number" min="30" max="7200" step="30" value="300" />
                  </label>
                  <label>
                    Output every (s)
                    <input id="sf-outint" type="number" min="1" max="120" step="1" value="5" />
                  </label>
                  <label>
                    Step dt (s)
                    <input id="sf-batchdt" type="number" min="0.5" max="10" step="0.5" value="${BATCH_FIXED_DT}" disabled />
                  </label>
                </div>
                <p class="hint" id="sf-batch-hint">~120 frames · ~75 MB</p>
              </div>

              <div class="field-row">
                <label>
                  Resolution X
                  <input id="sf-nx" type="number" min="16" max="512" step="8" value="64" />
                </label>
                <label>
                  Resolution Y
                  <input id="sf-ny" type="number" min="16" max="512" step="8" value="64" />
                </label>
                <label>
                  Resolution Z
                  <input id="sf-nz" type="number" min="16" max="96" step="4" value="40" />
                </label>
              </div>
              <p class="hint" id="sf-domain-hint">Domain ~64×64×12 km · Δx≈1 km</p>
              <label>
                Domain altitude (m)
                <input id="sf-ztop" type="range" min="5000" max="24000" step="500" value="12000" />
                <span class="hint"><span id="sf-ztop-val">12000</span> m</span>
              </label>
              <label>
                Warm bubble (K)
                <input id="sf-bubble" type="range" min="0" max="8" step="0.25" value="3" />
                <span class="hint"><span id="sf-bubble-val">3.0</span> K at center</span>
              </label>
              <label class="check-inline">
                <input id="sf-hydrostatic" type="checkbox" />
                Hydrostatic balance (recommended when Δx &gt; 5 km)
              </label>
            </div>

            <div class="setup-group">
              <p class="setup-group-title">Sun</p>
              <div class="field-row">
                <label>
                  Latitude
                  <input id="sf-lat" type="range" min="-60" max="60" step="1" value="35" />
                  <span class="hint"><span id="sf-lat-val">35</span>°</span>
                </label>
                <label>
                  Month
                  <input id="sf-month" type="range" min="1" max="12" step="1" value="6" />
                  <span class="hint"><span id="sf-month-val">Jun</span></span>
                </label>
                <label>
                  Start hour
                  <input id="sf-hour" type="range" min="0" max="23.75" step="0.25" value="12" />
                  <span class="hint"><span id="sf-hour-val">12:00</span></span>
                </label>
              </div>
              <p class="hint sun-hint">Sun heats the near-surface by day; IR cools at night.</p>
            </div>
          </div>
          <div id="sf-perf-warn" class="perf-warn"></div>
          <div class="setup-actions">
            <button class="primary" id="sf-start">Start simulation</button>
            <span class="hint" id="sf-start-hint">Edit the sounding, then start</span>
          </div>
        </div>

        <aside class="setup-card setup-sounding">
          <div class="setup-jump" role="navigation" aria-label="Setup sections">
            <button type="button" data-jump="sf-sec-sounding">Sounding</button>
            <button type="button" data-jump="sf-sec-fronts">Fronts</button>
            <button type="button" data-jump="sf-sec-land">Land &amp; water</button>
          </div>
          <section id="sf-sec-sounding">
            <h2>Sounding</h2>
            <p class="hint setup-sounding-desc">
              Drag the red temperature and green dewpoint, or the hodograph tips. Pick a preset or import a sounding.
            </p>
            <div id="sf-creator-host"></div>
          </section>
          <section id="sf-sec-fronts" class="fronts-embedded-host">
            <h2>Fronts</h2>
          </section>
          <section id="sf-sec-land" class="terrain-host"></section>
        </aside>
      </div>
    `;

    this.warnEl = this.root.querySelector("#sf-perf-warn") as HTMLElement;
    this.fronts = new SynopticEditor({ embedded: true });
    this.terrain = new TerrainEditor();
    this.root.querySelector("#sf-sec-fronts")!.append(this.fronts.root);
    this.root.querySelector("#sf-sec-land")!.append(this.terrain.root);
    this.root.querySelector(".setup-jump")!.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button[data-jump]") as HTMLButtonElement | null;
      if (!btn?.dataset.jump) return;
      const card = this.root.querySelector(".setup-sounding") as HTMLElement | null;
      const target = this.root.querySelector("#" + btn.dataset.jump) as HTMLElement | null;
      const jump = this.root.querySelector(".setup-jump") as HTMLElement | null;
      if (!card || !target) return;
      card.scrollTo({
        top: Math.max(0, target.offsetTop - (jump?.offsetHeight ?? 0) - 10),
        behavior: "smooth",
      });
    });
    this.fronts.onMarine = (on) => {
      if (on) this.terrain.paintSoutheast();
      else this.terrain.clearWater();
    };
    this.terrain.onMarine = (on) => this.fronts.setMarine(on);

    this.creator = new SoundingCreator();
    this.sounding = this.creator.getLevels();
    this.creator.onChange = (levels) => {
      this.sounding = levels;
    };
    this.root.querySelector("#sf-creator-host")!.appendChild(this.creator.root);
    this.fronts.resize();
    this.terrain.resize();
    this.terrain.setTerrainCeiling(12000);

    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const fmtHour = (h: number) => {
      const hh = Math.floor(h);
      const mm = Math.round((h - hh) * 60);
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    };

    const bind = () => this.updateWarn();
    for (const id of [
      "sf-nx", "sf-ny", "sf-nz", "sf-ztop", "sf-bubble",
      "sf-lat", "sf-month", "sf-hour", "sf-duration", "sf-outint",
      "sf-scale", "sf-extentx", "sf-extenty",
    ]) {
      this.root.querySelector("#" + id)?.addEventListener("input", () => {
        if (id === "sf-ztop") {
          const v = (this.root.querySelector("#sf-ztop") as HTMLInputElement).value;
          (this.root.querySelector("#sf-ztop-val") as HTMLElement).textContent = v;
          this.creator.setZTop(Number(v));
          this.terrain.setTerrainCeiling(Number(v));
        }
        if (id === "sf-bubble") {
          const v = Number(
            (this.root.querySelector("#sf-bubble") as HTMLInputElement).value,
          );
          (this.root.querySelector("#sf-bubble-val") as HTMLElement).textContent =
            v.toFixed(1);
        }
        if (id === "sf-lat") {
          const v = (this.root.querySelector("#sf-lat") as HTMLInputElement).value;
          (this.root.querySelector("#sf-lat-val") as HTMLElement).textContent = v;
        }
        if (id === "sf-month") {
          const v = Number(
            (this.root.querySelector("#sf-month") as HTMLInputElement).value,
          );
          (this.root.querySelector("#sf-month-val") as HTMLElement).textContent =
            monthNames[v - 1] ?? String(v);
        }
        if (id === "sf-hour") {
          const v = Number(
            (this.root.querySelector("#sf-hour") as HTMLInputElement).value,
          );
          (this.root.querySelector("#sf-hour-val") as HTMLElement).textContent =
            fmtHour(v);
        }
        if (id === "sf-scale") this.syncScaleUi();
        if (id === "sf-extentx" || id === "sf-extenty") {
          const lock = (
            this.root.querySelector("#sf-lock-square") as HTMLInputElement
          ).checked;
          if (lock) {
            const src = this.root.querySelector(
              "#" + id,
            ) as HTMLInputElement;
            const other = this.root.querySelector(
              id === "sf-extentx" ? "#sf-extenty" : "#sf-extentx",
            ) as HTMLInputElement;
            other.value = src.value;
          }
          this.syncExtentLabels();
          this.markScaleCustom();
          this.suggestHydrostatic();
        }
        bind();
      });
    }

    this.root.querySelector("#sf-lock-square")?.addEventListener("change", () => {
      const lock = (
        this.root.querySelector("#sf-lock-square") as HTMLInputElement
      ).checked;
      if (lock) {
        const x = (this.root.querySelector("#sf-extentx") as HTMLInputElement)
          .value;
        (this.root.querySelector("#sf-extenty") as HTMLInputElement).value = x;
        this.syncExtentLabels();
        bind();
      }
    });

    this.root.querySelector("#sf-hydrostatic")?.addEventListener("change", () => {
      (
        this.root.querySelector("#sf-hydrostatic") as HTMLInputElement
      ).dataset.userTouched = "1";
      bind();
    });

    for (const radio of this.root.querySelectorAll('input[name="sf-runmode"]')) {
      radio.addEventListener("change", () => this.syncRunModeUi());
    }

    this.root.querySelector("#sf-start")?.addEventListener("click", () => {
      const values = this.readValues();
      const grid = this.gridFromValues(values);
      const stateBytes = grid.estimateBytes() * 4;
      const maxStateBytes = 2 * 1024 * 1024 * 1024;
      if (stateBytes > maxStateBytes) {
        this.warnEl.textContent =
          `Estimated state ~${(stateBytes / (1024 * 1024 * 1024)).toFixed(1)} GB exceeds the 2 GB soft cap. Lower resolution, shrink the extent, or enable tiled/WebGPU execution.`;
        this.warnEl.classList.add("visible");
        return;
      }
      if (values.runMode === "batch") {
        const frames = estimateFrameCount(
          values.durationSec,
          values.outputIntervalSec,
        );
        const bytes = estimateBatchBytes(
          values.nx,
          values.ny,
          values.nz,
          frames,
        );
        if (bytes > BATCH_MEMORY_CAP_BYTES) {
          this.warnEl.textContent =
            `Batch strip ~${(bytes / (1024 * 1024)).toFixed(0)} MB exceeds the ${(BATCH_MEMORY_CAP_BYTES / (1024 * 1024)).toFixed(0)} MB cap. Increase “Output every”, shorten duration, or lower resolution.`;
          this.warnEl.classList.add("visible");
          return;
        }
      }
      this.onStart(values);
    });

    this.syncRunModeUi();
    this.syncScaleUi();
    this.syncExtentLabels();
    this.updateWarn();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.creator.resize();
        this.fronts.resize();
        this.terrain.resize();
      });
    });
  }

  show(): void {
    this.root.classList.add("active");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.creator.resize();
        this.fronts.resize();
        this.terrain.resize();
      });
    });
  }

  hide(): void {
    this.root.classList.remove("active");
  }

  readValues(): SetupValues {
    const modeRadio = this.root.querySelector(
      'input[name="sf-runmode"]:checked',
    ) as HTMLInputElement | null;
    const runMode = (modeRadio?.value === "batch" ? "batch" : "live") as RunMode;
    this.sounding = this.creator.getLevels();
    const scaleRaw = (this.root.querySelector(
      "#sf-scale",
    ) as HTMLSelectElement).value;
    const scale = (
      scaleRaw === "mesoscale" ||
      scaleRaw === "continental" ||
      scaleRaw === "custom"
        ? scaleRaw
        : "sandbox"
    ) as SimScale;
    const extentXKm = this.readExtentKm("sf-extentx");
    const extentYKm = this.readExtentKm("sf-extenty");
    const nx = Math.max(
      8,
      Math.min(
        512,
        Number((this.root.querySelector("#sf-nx") as HTMLInputElement).value),
      ),
    );
    const ny = Math.max(
      8,
      Math.min(
        512,
        Number((this.root.querySelector("#sf-ny") as HTMLInputElement).value),
      ),
    );
    const dxKm = extentXKm / nx;
    const dyKm = extentYKm / ny;
    const hydrostatic = (
      this.root.querySelector("#sf-hydrostatic") as HTMLInputElement
    ).checked;

    return {
      name:
        (this.root.querySelector("#sf-name") as HTMLInputElement).value.trim() ||
        "Stormforge Run",
      nx,
      ny,
      nz: Number((this.root.querySelector("#sf-nz") as HTMLInputElement).value),
      zTop: Number(
        (this.root.querySelector("#sf-ztop") as HTMLInputElement).value,
      ),
      bubbleStrength: Number(
        (this.root.querySelector("#sf-bubble") as HTMLInputElement).value,
      ),
      latitudeDeg: Number(
        (this.root.querySelector("#sf-lat") as HTMLInputElement).value,
      ),
      month: Number(
        (this.root.querySelector("#sf-month") as HTMLInputElement).value,
      ),
      startHour: Number(
        (this.root.querySelector("#sf-hour") as HTMLInputElement).value,
      ),
      runMode,
      durationSec: Number(
        (this.root.querySelector("#sf-duration") as HTMLInputElement).value,
      ),
      outputIntervalSec: Number(
        (this.root.querySelector("#sf-outint") as HTMLInputElement).value,
      ),
      sounding: this.sounding.map((l) => ({ ...l })),
      synoptic: this.readSynoptic(),
      scale,
      extentXKm,
      extentYKm,
      dxKm,
      dyKm,
      hydrostatic,
      ...this.terrain.exportSurface(),
    };
  }

  private gridFromValues(v: SetupValues): Grid3D {
    return gridFromExtentAndResolution(
      v.nx,
      v.ny,
      v.nz,
      v.zTop,
      (v.extentXKm ?? 64) * 1000,
      (v.extentYKm ?? 64) * 1000,
    );
  }

  private readSynoptic(): SynopticSetup {
    const synoptic = this.fronts.getSetup();
    synoptic.latitudeDeg = Number(
      (this.root.querySelector("#sf-lat") as HTMLInputElement).value,
    );
    return synoptic;
  }

  private syncRunModeUi(): void {
    const values = this.readValues();
    const batch = values.runMode === "batch";
    this.root
      .querySelector("#sf-batch-fields")
      ?.classList.toggle("hidden", !batch);
    const startBtn = this.root.querySelector(
      "#sf-start",
    ) as HTMLButtonElement | null;
    const hint = this.root.querySelector("#sf-start-hint") as HTMLElement | null;
    if (startBtn) {
      startBtn.textContent = batch ? "Run & review" : "Start simulation";
    }
    if (hint) {
      hint.textContent = batch
        ? "Uses the sounding beside this panel, then records for review"
        : "Uses the sounding beside this panel — you can keep editing after start";
    }
    this.updateWarn();
  }

  private readExtentKm(id: string): number {
    const el = this.root.querySelector("#" + id) as HTMLInputElement;
    return extentKmFromSlider(Number(el.value));
  }

  private writeExtentKm(id: string, km: number): void {
    const el = this.root.querySelector("#" + id) as HTMLInputElement;
    el.value = String(sliderFromExtentKm(km));
    const labelId = id === "sf-extentx" ? "#sf-extentx-val" : "#sf-extenty-val";
    (this.root.querySelector(labelId) as HTMLElement).textContent = String(
      extentKmFromSlider(Number(el.value)),
    );
  }

  private syncExtentLabels(): void {
    (this.root.querySelector("#sf-extentx-val") as HTMLElement).textContent =
      String(this.readExtentKm("sf-extentx"));
    (this.root.querySelector("#sf-extenty-val") as HTMLElement).textContent =
      String(this.readExtentKm("sf-extenty"));
  }

  private syncScaleUi(): void {
    const scale = (this.root.querySelector(
      "#sf-scale",
    ) as HTMLSelectElement).value as SimScale;
    const preset = scale !== "custom" ? SCALE_PRESETS[scale] : null;
    if (preset) {
      this.writeExtentKm("sf-extentx", preset.extentKm);
      this.writeExtentKm("sf-extenty", preset.extentKm);
      (this.root.querySelector("#sf-lock-square") as HTMLInputElement).checked =
        true;
      const hydro = this.root.querySelector(
        "#sf-hydrostatic",
      ) as HTMLInputElement;
      hydro.checked = preset.hydrostatic;
      delete hydro.dataset.userTouched;
    }
    this.suggestHydrostatic();
    this.updateWarn();
  }

  /** When the user drags extent away from a preset, flip the select to Custom. */
  private markScaleCustom(): void {
    const sel = this.root.querySelector("#sf-scale") as HTMLSelectElement;
    const scale = sel.value as SimScale;
    if (scale === "custom") return;
    const preset = SCALE_PRESETS[scale];
    const x = this.readExtentKm("sf-extentx");
    const y = this.readExtentKm("sf-extenty");
    if (x !== preset.extentKm || y !== preset.extentKm) sel.value = "custom";
  }

  private suggestHydrostatic(): void {
    const v = this.readValues();
    const dxKm = (v.extentXKm ?? 64) / v.nx;
    const dyKm = (v.extentYKm ?? 64) / v.ny;
    const box = this.root.querySelector(
      "#sf-hydrostatic",
    ) as HTMLInputElement | null;
    if (!box || box.dataset.userTouched === "1") return;
    box.checked = Math.max(dxKm, dyKm) > 5;
  }

  private updateWarn(): void {
    const v = this.readValues();
    const grid = this.gridFromValues(v);
    const hint = this.root.querySelector("#sf-domain-hint") as HTMLElement | null;
    if (hint) {
      const xKm = (grid.xExtent / 1000).toFixed(0);
      const yKm = (grid.yExtent / 1000).toFixed(0);
      const zKm = (grid.zTop / 1000).toFixed(1);
      const dx = grid.dx >= 1000
        ? `${(grid.dx / 1000).toFixed(grid.dx >= 10000 ? 0 : 1)} km`
        : `${Math.round(grid.dx)} m`;
      const dy = grid.dy >= 1000
        ? `${(grid.dy / 1000).toFixed(grid.dy >= 10000 ? 0 : 1)} km`
        : `${Math.round(grid.dy)} m`;
      const dz = Math.round(grid.dz);
      hint.textContent =
        `Domain ${xKm}×${yKm}×${zKm} km · Δx≈${dx} · Δy≈${dy} · Δz≈${dz} m · ${grid.cellCount().toLocaleString()} cells`;
    }

    const batchHint = this.root.querySelector(
      "#sf-batch-hint",
    ) as HTMLElement | null;
    if (batchHint && v.runMode === "batch") {
      const frames = estimateFrameCount(v.durationSec, v.outputIntervalSec);
      const bytes = estimateBatchBytes(v.nx, v.ny, v.nz, frames);
      const mb = bytes / (1024 * 1024);
      batchHint.textContent =
        `~${frames} frames · ~${mb.toFixed(0)} MB · dt=${BATCH_FIXED_DT}s`;
    }

    const msgs: string[] = [];
    const perf = perfWarning(grid);
    if (perf) msgs.push(perf);

    const stateBytes = grid.estimateBytes() * 4;
    const stateGB = stateBytes / (1024 * 1024 * 1024);
    const maxStateGB = 2;
    if (stateGB > maxStateGB) {
      msgs.push(
        `Estimated state ~${stateGB.toFixed(1)} GB exceeds the ${maxStateGB} GB soft cap — lower resolution, shrink the extent, or enable tiled/WebGPU execution.`,
      );
    } else if (stateGB > maxStateGB * 0.6) {
      msgs.push(
        `Estimated state ~${stateGB.toFixed(1)} GB — large run, expect slower startup and higher memory use.`,
      );
    }

    if (v.runMode === "batch") {
      const frames = estimateFrameCount(v.durationSec, v.outputIntervalSec);
      const bytes = estimateBatchBytes(v.nx, v.ny, v.nz, frames);
      if (bytes > BATCH_MEMORY_CAP_BYTES) {
        msgs.push(
          `Batch strip ~${(bytes / (1024 * 1024)).toFixed(0)} MB exceeds the ${(BATCH_MEMORY_CAP_BYTES / (1024 * 1024)).toFixed(0)} MB cap. Increase “Output every”, shorten duration, or lower resolution.`,
        );
      } else if (bytes > BATCH_MEMORY_CAP_BYTES * 0.6) {
        msgs.push(
          `Batch strip ~${(bytes / (1024 * 1024)).toFixed(0)} MB is large — consider a longer output interval.`,
        );
      }
    }

    if (msgs.length) {
      this.warnEl.textContent = msgs.join(" ");
      this.warnEl.classList.add("visible");
    } else {
      this.warnEl.textContent = "";
      this.warnEl.classList.remove("visible");
    }
  }
}
