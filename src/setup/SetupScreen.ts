import { Grid3D, GridConfig, perfWarning } from "../sim/Grid3D";
import {
  BATCH_MEMORY_CAP_BYTES,
  estimateBatchBytes,
  estimateFrameCount,
} from "../sim/FrameStore";
import { BATCH_FIXED_DT } from "../sim/BatchRunner";
import { defaultSounding, SoundingLevel } from "../sim/thermo";
import { SkewTEditor } from "../skewt/SkewTEditor";
import { HodographEditor } from "../skewt/HodographEditor";
import { SynopticEditor } from "./SynopticEditor";
import { SynopticSetup } from "../sim/synoptic";

export type RunMode = "live" | "batch";
export type SimScale = "sandbox" | "continental" | "custom";

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
  /** Preset domain scale. "continental" derives nx/ny from extent + resolution. */
  scale?: SimScale;
  /** Physical extent X (km) — source of truth when scale is continental/custom. */
  extentXKm?: number;
  /** Physical extent Y (km). */
  extentYKm?: number;
  /** Target cell size X (km). */
  dxKm?: number;
  /** Target cell size Y (km). */
  dyKm?: number;
  /** Use hydrostatic balance (recommended for continental dx > ~5 km). */
  hydrostatic?: boolean;
}

type SetupPanelView = "skewt" | "hodograph";

export class SetupScreen {
  readonly root: HTMLElement;
  private warnEl: HTMLElement;
  private onStart: (values: SetupValues) => void;
  private skewt: SkewTEditor | null = null;
  private hodo: HodographEditor | null = null;
  private panelView: SetupPanelView = "skewt";
  private sounding: SoundingLevel[] = defaultSounding(12000, 41);
  private fronts: SynopticEditor;

  constructor(onStart: (values: SetupValues) => void) {
    this.onStart = onStart;
    this.root = document.createElement("div");
    this.root.id = "setup-screen";
    this.root.className = "screen active";
    this.root.innerHTML = `
      <div class="setup-shell">
        <div class="setup-card setup-main">
          <h1>Stormforge</h1>
          <p class="tagline">3D clouds &amp; rain sandbox — CM1-inspired, sounding-driven</p>
          <div class="fields">
            <label>
              Run name
              <input id="sf-name" type="text" value="Stormforge Run" maxlength="64" />
            </label>

            <fieldset class="run-mode-fieldset">
              <legend>Run mode</legend>
              <label class="run-mode-option">
                <input type="radio" name="sf-runmode" value="live" checked />
                <span>
                  <strong>Live sandbox</strong>
                  <span class="hint">Interactive — physics runs in real time while you watch</span>
                </span>
              </label>
              <label class="run-mode-option">
                <input type="radio" name="sf-runmode" value="batch" />
                <span>
                  <strong>Batch then review</strong>
                  <span class="hint">CM1-style — integrate a fixed length, then scrub the recording</span>
                </span>
              </label>
            </fieldset>

            <div class="field-row">
              <label>
                Scale
                <select id="sf-scale">
                  <option value="sandbox">Sandbox</option>
                  <option value="continental">Continental (10,000 km)</option>
                  <option value="custom">Custom extent + resolution</option>
                </select>
              </label>
            </div>
            <div id="sf-continental-fields" class="continental-fields hidden">
              <div class="field-row">
                <label>
                  Extent X (km)
                  <input id="sf-extentx" type="number" min="100" max="50000" step="100" value="10000" />
                </label>
                <label>
                  Extent Y (km)
                  <input id="sf-extenty" type="number" min="100" max="50000" step="100" value="10000" />
                </label>
                <label>
                  Resolution X (km)
                  <input id="sf-dxkm" type="number" min="0.1" max="200" step="0.1" value="20" />
                </label>
                <label>
                  Resolution Y (km)
                  <input id="sf-dykm" type="number" min="0.1" max="200" step="0.1" value="20" />
                </label>
              </div>
              <label>
                Hydrostatic balance (recommended for dx &gt; 5 km)
                <input id="sf-hydrostatic" type="checkbox" />
              </label>
              <p class="hint" id="sf-continental-hint">Derives nx/ny from extent ÷ resolution. Continental grids need the WebGPU backend or tiled execution — a memory guard blocks runs that exceed the device cap.</p>
            </div>

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
              <p class="hint" id="sf-batch-hint">~120 frames · ~75 MB — review clouds + reflectivity after the run</p>
            </div>

            <div class="field-row">
              <label>
                Resolution X
                <input id="sf-nx" type="number" min="16" max="256" step="8" value="64" />
              </label>
              <label>
                Resolution Y
                <input id="sf-ny" type="number" min="16" max="256" step="8" value="64" />
              </label>
              <label>
                Resolution Z
                <input id="sf-nz" type="number" min="16" max="96" step="4" value="40" />
              </label>
            </div>
            <p class="hint" id="sf-domain-hint">Domain ~64×64×12 km · Δx/Δy ≈ 1000 m · Δz ≈ 300 m</p>
            <label>
              Domain altitude (m)
              <input id="sf-ztop" type="range" min="5000" max="24000" step="500" value="12000" />
              <span class="hint"><span id="sf-ztop-val">12000</span> m &nbsp;·&nbsp; higher Z = finer vertical detail</span>
            </label>
            <label>
              Warm bubble (K)
              <input id="sf-bubble" type="range" min="0" max="8" step="0.25" value="3" />
              <span class="hint"><span id="sf-bubble-val">3.0</span> K at center — fires convection (CM1-style)</span>
            </label>
            <div class="field-row">
              <label>
                Latitude
                <input id="sf-lat" type="range" min="-60" max="60" step="1" value="35" />
                <span class="hint"><span id="sf-lat-val">35</span>° — sun strength</span>
              </label>
              <label>
                Month
                <input id="sf-month" type="range" min="1" max="12" step="1" value="6" />
                <span class="hint"><span id="sf-month-val">Jun</span> — season</span>
              </label>
              <label>
                Start hour
                <input id="sf-hour" type="range" min="0" max="23.75" step="0.25" value="12" />
                <span class="hint"><span id="sf-hour-val">12:00</span> local solar</span>
              </label>
            </div>
            <p class="hint sun-hint">Sun heats the near-surface by day; IR cools at night. Month + latitude set solar strength.</p>
          </div>
          <div id="sf-perf-warn" class="perf-warn"></div>
          <div class="setup-actions">
            <button class="primary" id="sf-start">Start simulation</button>
            <span class="hint" id="sf-start-hint">Edit or import a sounding on the right, then start</span>
          </div>
        </div>

        <aside class="setup-card setup-sounding">
          <h2>Sounding</h2>
          <p class="hint setup-sounding-desc" id="sf-sounding-desc">
            Orange = T, green = Td. Import a file or draw before you run — used for live and batch.
          </p>
          <div class="panel-toggle">
            <button type="button" id="sf-view-skewt" class="active">Skew-T</button>
            <button type="button" id="sf-view-hodo">Hodograph</button>
          </div>
          <div class="mode-tabs" id="sf-mode-tabs">
            <button type="button" id="sf-mode-t" class="active">T</button>
            <button type="button" id="sf-mode-td">Td</button>
          </div>
          <canvas id="sf-skewt-canvas"></canvas>
          <div id="sf-skewt-metrics" class="skewt-metrics"></div>
          <canvas id="sf-hodo-canvas" class="hidden"></canvas>
          <div class="panel-actions setup-sounding-actions">
            <button type="button" id="sf-btn-default">Default</button>
            <button type="button" id="sf-btn-import">Import</button>
          </div>
          <div id="sf-import-box">
            <textarea id="sf-import-text" placeholder="Paste SHARPpy %RAW%, Extra CSV, SPC/UWYO, CM1 input_sounding, or Stormforge CSV…"></textarea>
            <div class="import-row">
              <button type="button" id="sf-btn-import-go" class="primary">Load sounding</button>
              <label class="file-btn">
                Open file
                <input id="sf-import-file" type="file" accept="*/*" hidden />
              </label>
            </div>
            <span class="hint" id="sf-import-msg">Formats: SHARPpy · Extra · SPC · CM1 · Stormforge</span>
          </div>
        </aside>
      </div>
    `;

    this.warnEl = this.root.querySelector("#sf-perf-warn") as HTMLElement;
    this.fronts = new SynopticEditor();
    this.root.querySelector(".setup-shell")!.append(this.fronts.root);

    const monthNames = [
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
    const fmtHour = (h: number) => {
      const hh = Math.floor(h);
      const mm = Math.round((h - hh) * 60);
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    };

    const bind = () => this.updateWarn();
    for (const id of [
      "sf-nx",
      "sf-ny",
      "sf-nz",
      "sf-ztop",
      "sf-bubble",
      "sf-lat",
      "sf-month",
      "sf-hour",
      "sf-duration",
      "sf-outint",
      "sf-scale",
      "sf-extentx",
      "sf-extenty",
      "sf-dxkm",
      "sf-dykm",
    ]) {
      this.root.querySelector("#" + id)?.addEventListener("input", () => {
        if (id === "sf-ztop") {
          const v = (this.root.querySelector("#sf-ztop") as HTMLInputElement)
            .value;
          (this.root.querySelector("#sf-ztop-val") as HTMLElement).textContent =
            v;
          this.applyZTop(Number(v));
        }
        if (id === "sf-bubble") {
          const v = Number(
            (this.root.querySelector("#sf-bubble") as HTMLInputElement).value,
          );
          (
            this.root.querySelector("#sf-bubble-val") as HTMLElement
          ).textContent = v.toFixed(1);
        }
        if (id === "sf-lat") {
          const v = (this.root.querySelector("#sf-lat") as HTMLInputElement)
            .value;
          (this.root.querySelector("#sf-lat-val") as HTMLElement).textContent =
            v;
        }
        if (id === "sf-month") {
          const v = Number(
            (this.root.querySelector("#sf-month") as HTMLInputElement).value,
          );
          (
            this.root.querySelector("#sf-month-val") as HTMLElement
          ).textContent = monthNames[v - 1] ?? String(v);
        }
        if (id === "sf-hour") {
          const v = Number(
            (this.root.querySelector("#sf-hour") as HTMLInputElement).value,
          );
          (
            this.root.querySelector("#sf-hour-val") as HTMLElement
          ).textContent = fmtHour(v);
        }
        if (id === "sf-scale") {
          this.syncScaleUi();
        }
        bind();
      });
    }

    this.root.querySelector("#sf-hydrostatic")?.addEventListener("change", () => {
      bind();
    });

    for (const radio of this.root.querySelectorAll(
      'input[name="sf-runmode"]',
    )) {
      radio.addEventListener("change", () => this.syncRunModeUi());
    }

    this.root.querySelector("#sf-view-skewt")?.addEventListener("click", () => {
      this.setPanelView("skewt");
    });
    this.root.querySelector("#sf-view-hodo")?.addEventListener("click", () => {
      this.setPanelView("hodograph");
    });
    this.root.querySelector("#sf-mode-t")?.addEventListener("click", () => {
      this.skewt?.setMode("T");
      this.root.querySelector("#sf-mode-t")?.classList.add("active");
      this.root.querySelector("#sf-mode-td")?.classList.remove("active");
    });
    this.root.querySelector("#sf-mode-td")?.addEventListener("click", () => {
      this.skewt?.setMode("Td");
      this.root.querySelector("#sf-mode-td")?.classList.add("active");
      this.root.querySelector("#sf-mode-t")?.classList.remove("active");
    });

    this.root.querySelector("#sf-btn-default")?.addEventListener("click", () => {
      this.skewt?.resetDefault();
      if (this.skewt) {
        this.sounding = this.skewt.getLevels();
        this.hodo?.setLevels(this.sounding);
      }
    });

    const importBox = this.root.querySelector("#sf-import-box") as HTMLElement;
    this.root.querySelector("#sf-btn-import")?.addEventListener("click", () => {
      importBox.classList.toggle("visible");
      if (importBox.classList.contains("visible")) {
        (
          this.root.querySelector("#sf-import-text") as HTMLTextAreaElement
        )?.focus();
      }
    });

    const applyImported = (text: string) => {
      const msg = this.root.querySelector("#sf-import-msg") as HTMLElement;
      if (!text.trim()) {
        msg.textContent = "Paste sounding text or open a file first.";
        msg.style.color = "var(--danger)";
        return;
      }
      if (!this.skewt) {
        msg.textContent = "Sounding editor not ready.";
        msg.style.color = "var(--danger)";
        return;
      }
      this.setPanelView("skewt");
      const res = this.skewt.importText(text);
      msg.textContent = res.message;
      msg.style.color = res.ok ? "var(--ok)" : "var(--danger)";
      if (res.ok) {
        this.sounding = this.skewt.getLevels();
        this.hodo?.setLevels(this.sounding);
      }
    };

    this.root
      .querySelector("#sf-btn-import-go")
      ?.addEventListener("click", () => {
        applyImported(
          (this.root.querySelector("#sf-import-text") as HTMLTextAreaElement)
            .value,
        );
      });

    const fileInput = this.root.querySelector(
      "#sf-import-file",
    ) as HTMLInputElement;
    fileInput?.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "");
        (
          this.root.querySelector("#sf-import-text") as HTMLTextAreaElement
        ).value = text;
        applyImported(text);
        fileInput.value = "";
      };
      reader.readAsText(file);
    });

    this.root.querySelector("#sf-start")?.addEventListener("click", () => {
      const values = this.readValues();
      const grid = new Grid3D({
        nx: values.nx,
        ny: values.ny,
        nz: values.nz,
        zTop: values.zTop,
      });
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

    this.mountEditors();
    this.syncRunModeUi();
    this.syncScaleUi();
    this.updateWarn();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.resizeEditors();
        this.fronts.resize();
      });
    });
  }

  show(): void {
    this.root.classList.add("active");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.resizeEditors();
        this.fronts.resize();
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
    this.syncSoundingFromEditors();
    const scale = (this.root.querySelector(
      "#sf-scale",
    ) as HTMLSelectElement).value as SimScale;
    const extentXKm = Number(
      (this.root.querySelector("#sf-extentx") as HTMLInputElement).value,
    );
    const extentYKm = Number(
      (this.root.querySelector("#sf-extenty") as HTMLInputElement).value,
    );
    const dxKm = Number(
      (this.root.querySelector("#sf-dxkm") as HTMLInputElement).value,
    );
    const dyKm = Number(
      (this.root.querySelector("#sf-dykm") as HTMLInputElement).value,
    );
    const hydrostatic = (this.root.querySelector(
      "#sf-hydrostatic",
    ) as HTMLInputElement).checked;

    let nx = Number((this.root.querySelector("#sf-nx") as HTMLInputElement).value);
    let ny = Number((this.root.querySelector("#sf-ny") as HTMLInputElement).value);
    if (scale === "continental" || scale === "custom") {
      // Derive cell count from physical extent ÷ resolution, clamped to a
      // device-safe maximum so a continental preset cannot silently allocate
      // tens of gigabytes.
      const maxCellsPerAxis = 2048;
      const nxDerived = Math.max(
        8,
        Math.min(
          maxCellsPerAxis,
          Math.ceil((extentXKm * 1000) / Math.max(0.1, dxKm * 1000)),
        ),
      );
      const nyDerived = Math.max(
        8,
        Math.min(
          maxCellsPerAxis,
          Math.ceil((extentYKm * 1000) / Math.max(0.1, dyKm * 1000)),
        ),
      );
      nx = nxDerived;
      ny = nyDerived;
    }

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
    };
  }

  private readSynoptic(): SynopticSetup {
    const synoptic = this.fronts.getSetup();
    synoptic.latitudeDeg = Number(
      (this.root.querySelector("#sf-lat") as HTMLInputElement).value,
    );
    return synoptic;
  }

  private mountEditors(): void {
    const skewtCanvas = this.root.querySelector(
      "#sf-skewt-canvas",
    ) as HTMLCanvasElement;
    const hodoCanvas = this.root.querySelector(
      "#sf-hodo-canvas",
    ) as HTMLCanvasElement;
    const zTop = Number(
      (this.root.querySelector("#sf-ztop") as HTMLInputElement).value,
    );
    this.sounding = defaultSounding(zTop, 41);
    this.skewt = new SkewTEditor(skewtCanvas, zTop);
    this.hodo = new HodographEditor(hodoCanvas, zTop);
    const metrics = this.root.querySelector(
      "#sf-skewt-metrics",
    ) as HTMLElement;
    this.skewt.setMetricsElement(metrics);
    this.skewt.setLevels(this.sounding);
    this.hodo.setLevels(this.sounding);
    this.skewt.onChange = (levels) => {
      this.sounding = levels;
    };
    this.hodo.onChange = (levels) => {
      this.sounding = levels;
    };
    this.setPanelView("skewt");
  }

  private syncSoundingFromEditors(): void {
    if (this.panelView === "hodograph" && this.hodo) {
      this.sounding = this.hodo.getLevels();
      this.skewt?.setLevels(this.sounding);
    } else if (this.skewt) {
      this.sounding = this.skewt.getLevels();
      this.hodo?.setLevels(this.sounding);
    }
  }

  private applyZTop(zTop: number): void {
    this.skewt?.setZTop(zTop);
    if (this.skewt) {
      this.sounding = this.skewt.getLevels();
      this.hodo?.setZTop(zTop);
      this.hodo?.setLevels(this.sounding);
    } else {
      this.hodo?.setZTop(zTop);
    }
  }

  private setPanelView(view: SetupPanelView): void {
    this.syncSoundingFromEditors();
    this.panelView = view;
    const skewtCanvas = this.root.querySelector(
      "#sf-skewt-canvas",
    ) as HTMLCanvasElement;
    const hodoCanvas = this.root.querySelector(
      "#sf-hodo-canvas",
    ) as HTMLCanvasElement;
    const metrics = this.root.querySelector(
      "#sf-skewt-metrics",
    ) as HTMLElement;
    const modeTabs = this.root.querySelector("#sf-mode-tabs") as HTMLElement;
    const desc = this.root.querySelector(
      "#sf-sounding-desc",
    ) as HTMLElement | null;

    this.root
      .querySelector("#sf-view-skewt")
      ?.classList.toggle("active", view === "skewt");
    this.root
      .querySelector("#sf-view-hodo")
      ?.classList.toggle("active", view === "hodograph");

    if (view === "skewt") {
      skewtCanvas.classList.remove("hidden");
      metrics.classList.remove("hidden");
      hodoCanvas.classList.add("hidden");
      modeTabs.classList.remove("hidden");
      if (desc) {
        desc.textContent =
          "Orange = T, green = Td. Import a file or draw before you run — used for live and batch.";
      }
      requestAnimationFrame(() => this.skewt?.resize());
    } else {
      skewtCanvas.classList.add("hidden");
      metrics.classList.add("hidden");
      hodoCanvas.classList.remove("hidden");
      modeTabs.classList.add("hidden");
      if (desc) {
        desc.textContent =
          "Drag tips to set wind (north-up). Apply is automatic when you start the run.";
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this.hodo?.resize());
      });
    }
  }

  private resizeEditors(): void {
    if (this.panelView === "hodograph") this.hodo?.resize();
    else this.skewt?.resize();
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
        ? "Uses the sounding on the right, then records for review"
        : "Uses the sounding on the right — you can keep editing after start";
    }
    this.updateWarn();
  }

  private syncScaleUi(): void {
    const scale = (this.root.querySelector(
      "#sf-scale",
    ) as HTMLSelectElement).value;
    const continental = scale === "continental" || scale === "custom";
    this.root
      .querySelector("#sf-continental-fields")
      ?.classList.toggle("hidden", !continental);
    const resLabel = this.root.querySelector(
      'label[for="sf-nx"]',
    ) as HTMLLabelElement | null;
    const nxIn = this.root.querySelector("#sf-nx") as HTMLInputElement | null;
    const nyIn = this.root.querySelector("#sf-ny") as HTMLInputElement | null;
    if (scale === "continental") {
      (this.root.querySelector("#sf-extentx") as HTMLInputElement).value =
        "10000";
      (this.root.querySelector("#sf-extenty") as HTMLInputElement).value =
        "10000";
      (this.root.querySelector("#sf-dxkm") as HTMLInputElement).value = "20";
      (this.root.querySelector("#sf-dykm") as HTMLInputElement).value = "20";
      (this.root.querySelector("#sf-hydrostatic") as HTMLInputElement).checked =
        true;
      if (nxIn) nxIn.disabled = true;
      if (nyIn) nyIn.disabled = true;
      if (resLabel) resLabel.classList.add("derived");
    } else if (scale === "custom") {
      if (nxIn) nxIn.disabled = true;
      if (nyIn) nyIn.disabled = true;
      if (resLabel) resLabel.classList.add("derived");
    } else {
      if (nxIn) nxIn.disabled = false;
      if (nyIn) nyIn.disabled = false;
      if (resLabel) resLabel.classList.remove("derived");
    }
    this.updateWarn();
  }

  private updateWarn(): void {
    const v = this.readValues();
    const cfg: GridConfig = {
      nx: v.nx,
      ny: v.ny,
      nz: v.nz,
      zTop: v.zTop,
    };
    const grid = new Grid3D(cfg);
    const hint = this.root.querySelector("#sf-domain-hint") as HTMLElement | null;
    if (hint) {
      const xKm = (grid.xExtent / 1000).toFixed(0);
      const yKm = (grid.yExtent / 1000).toFixed(0);
      const zKm = (grid.zTop / 1000).toFixed(1);
      const dx = Math.round(grid.dx);
      const dy = Math.round(grid.dy);
      const dz = Math.round(grid.dz);
      hint.textContent =
        `Domain ~${xKm}×${yKm}×${zKm} km · Δx≈${dx} m · Δy≈${dy} m · Δz≈${dz} m · ${grid.cellCount().toLocaleString()} cells (higher X/Y = larger + finer)`;
    }

    const batchHint = this.root.querySelector(
      "#sf-batch-hint",
    ) as HTMLElement | null;
    if (batchHint && v.runMode === "batch") {
      const frames = estimateFrameCount(v.durationSec, v.outputIntervalSec);
      const bytes = estimateBatchBytes(v.nx, v.ny, v.nz, frames);
      const mb = bytes / (1024 * 1024);
      batchHint.textContent =
        `~${frames} frames · ~${mb.toFixed(0)} MB · dt=${BATCH_FIXED_DT}s — review clouds + reflectivity after the run`;
    }

    const msgs: string[] = [];
    const perf = perfWarning(grid);
    if (perf) msgs.push(perf);

    // Device-aware state memory estimate. Grid3D.estimateBytes() covers the
    // main fields; a run also needs scratch + (GPU) double/triple buffers, so
    // apply a conservative ~4× multiplier and warn above a soft cap.
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
