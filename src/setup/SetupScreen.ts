import { Grid3D, GridConfig, perfWarning } from "../sim/Grid3D";
import {
  BATCH_MEMORY_CAP_BYTES,
  estimateBatchBytes,
  estimateFrameCount,
} from "../sim/FrameStore";
import { BATCH_FIXED_DT } from "../sim/BatchRunner";
import { SoundingLevel } from "../sim/thermo";
import { SoundingCreator } from "../skewt/creator";
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

export class SetupScreen {
  readonly root: HTMLElement;
  private warnEl: HTMLElement;
  private onStart: (values: SetupValues) => void;
  private creator: SoundingCreator;
  private sounding: SoundingLevel[];
  private fronts: SynopticEditor;

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
                <p class="hint" id="sf-continental-hint">Derives nx/ny from extent ÷ resolution.</p>
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
                <p class="hint" id="sf-batch-hint">~120 frames · ~75 MB</p>
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
              <p class="hint" id="sf-domain-hint">Domain ~64×64×12 km</p>
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
          <h2>Sounding</h2>
          <p class="hint setup-sounding-desc">
            Drag T/Td and hodograph tips, pick a preset, or import before you run.
          </p>
          <div id="sf-creator-host"></div>
        </aside>
      </div>
    `;

    this.warnEl = this.root.querySelector("#sf-perf-warn") as HTMLElement;
    this.fronts = new SynopticEditor();
    this.root.querySelector(".setup-shell")!.append(this.fronts.root);

    this.creator = new SoundingCreator();
    this.sounding = this.creator.getLevels();
    this.creator.onChange = (levels) => {
      this.sounding = levels;
    };
    this.root.querySelector("#sf-creator-host")!.appendChild(this.creator.root);

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
      "sf-scale", "sf-extentx", "sf-extenty", "sf-dxkm", "sf-dykm",
    ]) {
      this.root.querySelector("#" + id)?.addEventListener("input", () => {
        if (id === "sf-ztop") {
          const v = (this.root.querySelector("#sf-ztop") as HTMLInputElement).value;
          (this.root.querySelector("#sf-ztop-val") as HTMLElement).textContent = v;
          this.creator.setZTop(Number(v));
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
        bind();
      });
    }

    this.root.querySelector("#sf-hydrostatic")?.addEventListener("change", () => {
      bind();
    });

    for (const radio of this.root.querySelectorAll('input[name="sf-runmode"]')) {
      radio.addEventListener("change", () => this.syncRunModeUi());
    }

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

    this.syncRunModeUi();
    this.syncScaleUi();
    this.updateWarn();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.creator.resize();
        this.fronts.resize();
      });
    });
  }

  show(): void {
    this.root.classList.add("active");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.creator.resize();
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
    this.sounding = this.creator.getLevels();
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
    const hydrostatic = (
      this.root.querySelector("#sf-hydrostatic") as HTMLInputElement
    ).checked;

    let nx = Number((this.root.querySelector("#sf-nx") as HTMLInputElement).value);
    let ny = Number((this.root.querySelector("#sf-ny") as HTMLInputElement).value);
    if (scale === "continental" || scale === "custom") {
      const maxCellsPerAxis = 2048;
      nx = Math.max(
        8,
        Math.min(
          maxCellsPerAxis,
          Math.ceil((extentXKm * 1000) / Math.max(0.1, dxKm * 1000)),
        ),
      );
      ny = Math.max(
        8,
        Math.min(
          maxCellsPerAxis,
          Math.ceil((extentYKm * 1000) / Math.max(0.1, dyKm * 1000)),
        ),
      );
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

  private syncScaleUi(): void {
    const scale = (this.root.querySelector(
      "#sf-scale",
    ) as HTMLSelectElement).value;
    const continental = scale === "continental" || scale === "custom";
    this.root
      .querySelector("#sf-continental-fields")
      ?.classList.toggle("hidden", !continental);
    const nxIn = this.root.querySelector("#sf-nx") as HTMLInputElement | null;
    const nyIn = this.root.querySelector("#sf-ny") as HTMLInputElement | null;
    if (scale === "continental") {
      (this.root.querySelector("#sf-extentx") as HTMLInputElement).value = "10000";
      (this.root.querySelector("#sf-extenty") as HTMLInputElement).value = "10000";
      (this.root.querySelector("#sf-dxkm") as HTMLInputElement).value = "20";
      (this.root.querySelector("#sf-dykm") as HTMLInputElement).value = "20";
      (this.root.querySelector("#sf-hydrostatic") as HTMLInputElement).checked =
        true;
      if (nxIn) nxIn.disabled = true;
      if (nyIn) nyIn.disabled = true;
    } else if (scale === "custom") {
      if (nxIn) nxIn.disabled = true;
      if (nyIn) nyIn.disabled = true;
    } else {
      if (nxIn) nxIn.disabled = false;
      if (nyIn) nyIn.disabled = false;
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
        `Domain ~${xKm}×${yKm}×${zKm} km · Δx≈${dx} m · Δy≈${dy} m · Δz≈${dz} m · ${grid.cellCount().toLocaleString()} cells`;
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
