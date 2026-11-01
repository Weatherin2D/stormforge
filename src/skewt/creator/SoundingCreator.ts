import {
  Dat,
  Tat,
  calcDiagnostics,
  dirOf,
  f,
  lerp,
  Zat,
} from "./creatorPhysics";
import {
  drawHodograph,
  drawSkewT,
  HODO_SIZE,
  hodoPoint,
  Pf,
  readCreatorCss,
  ST_H,
  ST_W,
  Tp,
  X,
  Y,
} from "./creatorDraw";
import {
  exportCreator,
  parseAnySounding,
  stormforgeExport,
} from "./creatorIO";
import {
  flipHemisphere,
  loadPreset,
  PRESET_OPTIONS,
} from "./creatorPresets";
import {
  fromSoundingLevels,
  toSoundingLevels,
} from "./soundingBridge";
import type {
  CreatorLevel,
  Diagnostics,
  Hemisphere,
  ParcelKey,
} from "./types";
import type { SoundingLevel } from "../../sim/thermo";

type DragState =
  | { c: "st"; i: number; k: "T" | "Td" }
  | { c: "ho"; i: number }
  | null;

const HAZARD_COLORS: Record<string, string> = {
  "PDS TOR": "#9c1a6e",
  TOR: "#d62828",
  "MRGL TOR": "#d9480f",
  SVR: "#a16f00",
  "MRGL SVR": "#3f7d2a",
  "FLASH FLOOD": "#1c7ed6",
  "EXCESSIVE HEAT": "#c2410c",
  BLIZZARD: "#4263eb",
  "ANTI TOR": "#7048e8",
  "MRGL ANTI TOR": "#9775fa",
  NONE: "#677382",
};

export type ExportFormat = "stormforge" | "CM1" | "CSV" | "SHARPpy";

export class SoundingCreator {
  readonly root: HTMLElement;
  onChange: ((levels: SoundingLevel[]) => void) | null = null;

  private levels: CreatorLevel[] = [];
  private diagnostics: Diagnostics | null = null;
  private parcel: ParcelKey = "ML";
  private hemi: Hemisphere = "N";
  private hR = 60;
  private dirty = false;
  private drag: DragState = null;
  private zTop = 12000;
  private compact: boolean;
  private disposed = false;

  private stCanvas!: HTMLCanvasElement;
  private hoCanvas!: HTMLCanvasElement;
  private tableBody!: HTMLElement;
  private hazardEl!: HTMLElement;
  private paramsEl!: HTMLElement;
  private ioText!: HTMLTextAreaElement;
  private fmtSelect!: HTMLSelectElement;
  private preSelect!: HTMLSelectElement;
  private hemSelect!: HTMLSelectElement;
  private parSelect!: HTMLSelectElement;
  private msgEl!: HTMLElement;

  private readonly onPointerUp = () => {
    if (this.drag) {
      this.drag = null;
      this.update();
    }
  };

  constructor(opts?: { compact?: boolean }) {
    this.compact = !!opts?.compact;
    this.root = document.createElement("div");
    this.root.className = "sc-root" + (this.compact ? " sc-compact" : "");
    this.root.innerHTML = this.buildMarkup();
    this.bindElements();
    this.bindEvents();
    this.levels = loadPreset("0", this.hemi);
    this.update(false, true);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
  }

  getLevels(): SoundingLevel[] {
    return toSoundingLevels(this.levels);
  }

  setLevels(levels: SoundingLevel[]): void {
    this.levels = fromSoundingLevels(levels);
    this.dirty = true;
    this.update(false, true);
  }

  setZTop(zTop: number): void {
    this.zTop = zTop;
    // Creator is pressure-based; zTop is stored for callers that care.
    void this.zTop;
  }

  resetDefault(): void {
    this.preSelect.value = "0";
    this.levels = loadPreset("0", this.hemi);
    this.dirty = false;
    this.update(false, true);
    this.emit();
  }

  resize(): void {
    if (this.disposed) return;
    this.redraw();
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.root.remove();
  }

  exportText(format: ExportFormat = "stormforge"): string {
    if (format === "stormforge") return stormforgeExport(this.getLevels());
    return exportCreator(this.levels, format);
  }

  importText(text: string): { ok: boolean; message: string } {
    try {
      this.levels = parseAnySounding(text);
      this.dirty = true;
      this.update();
      this.emit();
      return {
        ok: true,
        message: `Imported ${this.levels.length} levels.`,
      };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Import failed.",
      };
    }
  }

  private buildMarkup(): string {
    const presets = PRESET_OPTIONS.map(
      (o) => `<option value="${o.value}">${o.label}</option>`,
    ).join("");
    return `
      <div class="sc-bar">
        <label>Preset
          <select id="sc-pre">${presets}</select>
        </label>
        <label>Hemisphere
          <select id="sc-hem">
            <option value="N">Northern</option>
            <option value="S">Southern</option>
          </select>
        </label>
        <button type="button" id="sc-mir" title="Mirror wind directions">Flip hemisphere winds</button>
        <label>Parcel
          <select id="sc-par">
            <option value="SB">SB</option>
            <option value="ML" selected>ML</option>
            <option value="MU">MU</option>
          </select>
        </label>
      </div>
      <p class="sc-hint">Drag red (T) and green (Td) dots · drag hodograph tips · double-click Skew-T to add a level · edit the table. Heights are AGL.</p>
      <div class="sc-main">
        <div class="sc-card sc-skewt-wrap">
          <canvas id="sc-st"></canvas>
        </div>
        <div class="sc-side">
          <div class="sc-card">
            <canvas id="sc-ho"></canvas>
            <p class="sc-hint sc-hodo-legend">Height colours: 0–1 km red, 1–3 green, 3–6 yellow, 6–9 cyan, 9–12 violet. RM/LM are Bunkers storm motions; MW is 0–6 km mean wind.</p>
          </div>
          <div class="sc-card sc-hz" id="sc-hz"></div>
          <div class="sc-card sc-params" id="sc-pm"></div>
        </div>
      </div>
      <div class="sc-card sc-table-card">
        <div class="sc-table-scroll">
          <table>
            <thead>
              <tr><th>z m</th><th>p hPa</th><th>T °C</th><th>Td °C</th><th>Dir °</th><th>Spd kt</th><th></th></tr>
            </thead>
            <tbody id="sc-tb"></tbody>
          </table>
        </div>
      </div>
      <div class="sc-card sc-io">
        <div class="sc-row">
          <label>Export format
            <select id="sc-fmt">
              <option value="stormforge">Stormforge CSV</option>
              <option value="CM1">CM1 / WRF input_sounding</option>
              <option value="CSV">CSV</option>
              <option value="SHARPpy">SHARPpy</option>
            </select>
          </label>
          <button type="button" id="sc-ex">Export</button>
          <button type="button" id="sc-cp">Copy</button>
        </div>
        <textarea id="sc-io" spellcheck="false" placeholder="Export fills this box. Paste CM1, CSV, SHARPpy, or Stormforge CSV and press Import."></textarea>
        <div class="sc-row">
          <button type="button" id="sc-im" class="primary">Import</button>
          <label class="file-btn">Open file
            <input id="sc-fl" type="file" accept="*/*" hidden />
          </label>
          <span class="sc-hint" id="sc-msg"></span>
        </div>
      </div>
    `;
  }

  private bindElements(): void {
    const q = <T extends HTMLElement>(id: string) =>
      this.root.querySelector(id) as T;
    this.stCanvas = q("#sc-st");
    this.hoCanvas = q("#sc-ho");
    this.tableBody = q("#sc-tb");
    this.hazardEl = q("#sc-hz");
    this.paramsEl = q("#sc-pm");
    this.ioText = q("#sc-io");
    this.fmtSelect = q("#sc-fmt");
    this.preSelect = q("#sc-pre");
    this.hemSelect = q("#sc-hem");
    this.parSelect = q("#sc-par");
    this.msgEl = q("#sc-msg");
  }

  private bindEvents(): void {
    this.preSelect.addEventListener("change", () => this.loadSelectedPreset());
    this.hemSelect.addEventListener("change", () => {
      this.hemi = this.hemSelect.value as Hemisphere;
      if (this.dirty) this.update(false, true);
      else this.loadSelectedPreset();
    });
    this.root.querySelector("#sc-mir")!.addEventListener("click", () => {
      flipHemisphere(this.levels);
      this.update();
      this.emit();
    });
    this.parSelect.addEventListener("change", () => {
      this.parcel = this.parSelect.value as ParcelKey;
      this.update(true, true);
    });

    this.stCanvas.addEventListener("pointerdown", (e) => this.onStDown(e));
    this.stCanvas.addEventListener("pointermove", (e) => this.onStMove(e));
    this.stCanvas.addEventListener("dblclick", (e) =>
      this.onStDbl(e as unknown as PointerEvent),
    );
    this.hoCanvas.addEventListener("pointerdown", (e) => this.onHoDown(e));
    this.hoCanvas.addEventListener("pointermove", (e) => this.onHoMove(e));

    this.tableBody.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement;
      const i = Number(t.dataset.i);
      const k = t.dataset.k as keyof CreatorLevel | undefined;
      if (!k || Number.isNaN(i)) return;
      const v = parseFloat(t.value);
      if (Number.isNaN(v)) {
        this.renderTable();
        return;
      }
      if (k === "p" || k === "T" || k === "Td" || k === "d" || k === "s") {
        this.levels[i][k] = v;
      }
      this.levels[i].Td = Math.min(this.levels[i].Td, this.levels[i].T);
      this.update();
      this.emit();
    });
    this.tableBody.addEventListener("click", (e) => {
      const btn = e.target as HTMLElement;
      if (btn.dataset.x == null) return;
      const i = Number(btn.dataset.x);
      if (this.levels.length > 3) {
        this.levels.splice(i, 1);
        this.update();
        this.emit();
      }
    });

    this.root.querySelector("#sc-ex")!.addEventListener("click", () => {
      const fmt = this.fmtSelect.value as ExportFormat;
      this.ioText.value = this.exportText(fmt);
    });
    this.root.querySelector("#sc-cp")!.addEventListener("click", () => {
      this.ioText.select();
      try {
        void navigator.clipboard.writeText(this.ioText.value);
      } catch {
        try {
          document.execCommand("copy");
        } catch {
          /* ignore */
        }
      }
    });
    this.root.querySelector("#sc-im")!.addEventListener("click", () => {
      const res = this.importText(this.ioText.value);
      this.msgEl.textContent = res.message;
      this.msgEl.style.color = res.ok ? "var(--ok)" : "var(--danger)";
    });
    const file = this.root.querySelector("#sc-fl") as HTMLInputElement;
    file.addEventListener("change", () => {
      const f0 = file.files?.[0];
      if (!f0) return;
      const reader = new FileReader();
      reader.onload = () => {
        this.ioText.value = String(reader.result ?? "");
        const res = this.importText(this.ioText.value);
        this.msgEl.textContent = res.message;
        this.msgEl.style.color = res.ok ? "var(--ok)" : "var(--danger)";
        file.value = "";
      };
      reader.readAsText(f0);
    });
  }

  private loadSelectedPreset(): void {
    this.levels = loadPreset(this.preSelect.value, this.hemi);
    this.dirty = false;
    this.update(false, true);
    this.emit();
  }

  private emit(): void {
    this.onChange?.(this.getLevels());
  }

  private update(skipTable = false, preset = false): void {
    if (!preset) this.dirty = true;
    this.diagnostics = calcDiagnostics(this.levels, this.hemi);
    if (!this.drag) {
      const speeds = this.levels
        .filter((l) => (l.z ?? 0) <= 12e3)
        .map((l) => l.s);
      this.hR = Math.max(40, Math.ceil(Math.max(0, ...speeds) / 20) * 20);
    }
    this.redraw();
    this.renderHazard();
    this.renderParams();
    if (!skipTable) this.renderTable();
  }

  private redraw(): void {
    if (!this.diagnostics) return;
    const css = readCreatorCss(this.root);
    drawSkewT(
      this.stCanvas,
      this.levels,
      this.diagnostics,
      this.parcel,
      css,
    );
    drawHodograph(
      this.hoCanvas,
      this.levels,
      this.diagnostics,
      this.hR,
      css,
    );
  }

  private renderHazard(): void {
    const D = this.diagnostics!;
    const o = D.hz;
    const p = o[0] ?? {
      label: "NONE",
      detail: "No convective, flood, heat or blizzard criteria met.",
    };
    const color = HAZARD_COLORS[p.label] ?? HAZARD_COLORS.NONE;
    const also =
      o.length > 1
        ? `<p class="sc-also">Also flagged: ${o
            .slice(1)
            .map(
              (x) =>
                `<b style="background:${HAZARD_COLORS[x.label] ?? color}">${x.label}</b> ${x.detail}`,
            )
            .join(" ")}</p>`
        : "";
    this.hazardEl.innerHTML = `
      <h2>Possible hazard type</h2>
      <b style="background:${color}">${p.label}</b>
      <p>${p.detail}</p>
      ${also}
      <small>Rule-based estimate in the style of SHARPpy. Not a forecast.</small>
    `;
  }

  private renderParams(): void {
    const D = this.diagnostics!;
    const L = this.levels;
    const pr: ParcelKey[] = ["SB", "ML", "MU"];
    const cc = (
      text: string,
      v: number | null,
      th: number[],
      rev = false,
    ): string => {
      if (v == null || Number.isNaN(v)) return "—";
      const c = th.filter((x) => v >= x).length;
      const tier = rev ? 7 - c : c;
      return `<span class="sc-t sc-t${Math.max(0, Math.min(7, tier))}">${text}</span>`;
    };
    const Zp = (p: number | null) =>
      p == null ? "—" : f(Zat(L, p));
    const ds = (v: [number, number]) =>
      `${f(dirOf(v[0], v[1]))}° / ${f(Math.hypot(v[0], v[1]))} kt`;
    const h = (a: string, cells: string[]) =>
      `<tr><th>${a}</th>${cells.map((x) => `<td>${x}</td>`).join("")}</tr>`;

    const rows = [
      [
        "LI (ML, 500 hPa) °C",
        cc(f(D.li, 1), D.li == null ? null : -D.li, [0, 2, 4, 6, 8, 10, 12]),
      ],
      ["PWAT mm", cc(f(D.pw, 1), D.pw, [20, 30, 40, 50, 60, 70, 80])],
      [
        "0 °C / −20 °C level m",
        cc(f(D.z0), D.z0, [2e3, 2500, 3e3, 3500, 4e3, 4500, 5e3], true) +
          " / " +
          cc(f(D.z20), D.z20, [5e3, 5500, 6e3, 6500, 7e3, 7500, 8e3], true),
      ],
      [
        "Lapse rate 0–3 / 3–6 km °C/km",
        cc(f(D.l03, 1), D.l03, [5, 6, 6.5, 7, 7.5, 8, 8.5]) +
          " / " +
          cc(f(D.l36, 1), D.l36, [5, 5.5, 6, 6.5, 7, 7.5, 8.5]),
      ],
      [
        "Bulk shear 0–1 / 0–3 / 0–6 km kt",
        D.sh
          .map((x, i) =>
            cc(
              f(x),
              x,
              [
                [5, 10, 15, 20, 25, 30, 35],
                [10, 20, 30, 40, 50, 60, 70],
                [20, 30, 40, 50, 60, 70, 80],
              ][i],
            ),
          )
          .join(" / "),
      ],
      [
        "SRH 0–1 / 0–3 km, cyclonic m²/s²",
        cc(f(D.s1), D.s1, [25, 50, 100, 150, 200, 300, 400]) +
          " / " +
          cc(f(D.s3), D.s3, [50, 100, 150, 250, 350, 450, 550]),
      ],
      [
        "STP (fixed layer), cyclonic / anticyclonic",
        cc(f(D.stp, 1), D.stp, [0.1, 0.5, 1, 2, 4, 6, 8]) +
          " / " +
          cc(f(D.stpA, 1), D.stpA, [0.1, 0.5, 1, 2, 4, 6, 8]),
      ],
      [
        "SCP (fixed layer), cyclonic / anticyclonic",
        cc(f(D.scp, 1), D.scp, [0.5, 1, 2, 4, 8, 12, 16]) +
          " / " +
          cc(f(D.scpA, 1), D.scpA, [0.5, 1, 2, 4, 8, 12, 16]),
      ],
      [`Bunkers cyclonic (${D.S ? "LM" : "RM"})`, ds(D.cyc)],
      [`Bunkers anticyclonic (${D.S ? "RM" : "LM"})`, ds(D.ant)],
      ["Mean wind 0–6 km", ds(D.m)],
    ];

    this.paramsEl.innerHTML = `
      <table class="sc-param-table">
        <thead><tr><th>Parcel</th>${pr.map((k) => `<th>${k}</th>`).join("")}</tr></thead>
        <tbody>
          ${h(
            "CAPE J/kg",
            pr.map((k) =>
              cc(f(D.P[k].cape), D.P[k].cape, [
                100, 500, 1e3, 2e3, 3e3, 4e3, 5e3,
              ]),
            ),
          )}
          ${h(
            "CIN J/kg",
            pr.map((k) =>
              cc(f(D.P[k].cin), -D.P[k].cin, [
                10, 25, 50, 100, 150, 200, 300,
              ]),
            ),
          )}
          ${h(
            "LCL m",
            pr.map((k) =>
              cc(
                Zp(D.P[k].pl),
                Zat(L, D.P[k].pl),
                [250, 500, 750, 1e3, 1500, 2e3, 3e3],
                true,
              ),
            ),
          )}
          ${h(
            "LFC m",
            pr.map((k) =>
              D.P[k].lfc == null
                ? "—"
                : cc(
                    Zp(D.P[k].lfc),
                    Zat(L, D.P[k].lfc!),
                    [500, 1e3, 1500, 2e3, 2500, 3e3, 4e3],
                    true,
                  ),
            ),
          )}
          ${h(
            "EL m",
            pr.map((k) =>
              D.P[k].el == null
                ? "—"
                : cc(
                    Zp(D.P[k].el),
                    Zat(L, D.P[k].el!),
                    [6e3, 8e3, 1e4, 12e3, 14e3, 16e3, 18e3],
                  ),
            ),
          )}
          ${rows.map(([a, b]) => `<tr><th>${a}</th><td colspan="3">${b}</td></tr>`).join("")}
        </tbody>
      </table>
    `;
  }

  private renderTable(): void {
    this.tableBody.innerHTML = this.levels
      .map(
        (l, i) => `
      <tr>
        <td>${Math.round(l.z ?? 0)}</td>
        ${(["p", "T", "Td", "d", "s"] as const)
          .map(
            (k) =>
              `<td><input data-i="${i}" data-k="${k}" value="${+(+l[k]).toFixed(1)}" inputmode="decimal" /></td>`,
          )
          .join("")}
        <td><button type="button" data-x="${i}" title="Delete level">×</button></td>
      </tr>`,
      )
      .join("");
  }

  private pos(
    e: PointerEvent,
    c: HTMLCanvasElement,
    w: number,
    h: number,
  ): [number, number] {
    const r = c.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * w) / r.width,
      ((e.clientY - r.top) * h) / r.height,
    ];
  }

  private onStDown(e: PointerEvent): void {
    const [px, py] = this.pos(e, this.stCanvas, ST_W, ST_H);
    let b = 15;
    let bi: [number, "T" | "Td"] | null = null;
    this.levels.forEach((l, i) => {
      ([["T", l.T], ["Td", l.Td]] as ["T" | "Td", number][]).forEach(
        ([k, v]) => {
          const d = Math.hypot(X(v, l.p) - px, Y(l.p) - py);
          if (d < b) {
            b = d;
            bi = [i, k];
          }
        },
      );
    });
    if (bi) {
      this.drag = { c: "st", i: bi[0], k: bi[1] };
      this.stCanvas.setPointerCapture(e.pointerId);
    }
  }

  private onStMove(e: PointerEvent): void {
    if (!this.drag || this.drag.c !== "st") return;
    const l = this.levels[this.drag.i];
    const T =
      Math.round(Tp(this.pos(e, this.stCanvas, ST_W, ST_H)[0], l.p) * 10) / 10;
    if (this.drag.k === "T") {
      l.T = T;
      l.Td = Math.min(l.Td, T);
    } else {
      l.Td = Math.min(T, l.T);
    }
    this.update(true);
    this.emit();
  }

  private onStDbl(e: PointerEvent): void {
    const p = Math.round(Pf(this.pos(e, this.stCanvas, ST_W, ST_H)[1]));
    if (p >= this.levels[0].p || p <= this.levels[this.levels.length - 1].p)
      return;
    const np = (l: CreatorLevel) => -Math.log(l.p);
    const u = lerp(this.levels, np, (l) => l.u ?? 0, -Math.log(p));
    const v = lerp(this.levels, np, (l) => l.v ?? 0, -Math.log(p));
    this.levels.push({
      p,
      T: +Tat(this.levels, p).toFixed(1),
      Td: +Dat(this.levels, p).toFixed(1),
      d: Math.round(dirOf(u, v)),
      s: Math.round(Math.hypot(u, v)),
    });
    this.update();
    this.emit();
  }

  private onHoDown(e: PointerEvent): void {
    const [px, py] = this.pos(e, this.hoCanvas, HODO_SIZE, HODO_SIZE);
    let b = 15;
    let bi: number | null = null;
    this.levels.forEach((l, i) => {
      if ((l.z ?? 0) > 12e3) return;
      const q = hodoPoint(l, this.hR);
      const d = Math.hypot(q[0] - px, q[1] - py);
      if (d < b) {
        b = d;
        bi = i;
      }
    });
    if (bi != null) {
      this.drag = { c: "ho", i: bi };
      this.hoCanvas.setPointerCapture(e.pointerId);
    }
  }

  private onHoMove(e: PointerEvent): void {
    if (!this.drag || this.drag.c !== "ho") return;
    const [px, py] = this.pos(e, this.hoCanvas, HODO_SIZE, HODO_SIZE);
    const hc = HODO_SIZE / 2;
    const sc = (hc - 28) / this.hR;
    const u = (px - hc) / sc;
    const v = (hc - py) / sc;
    const l = this.levels[this.drag.i];
    l.s = Math.round(Math.hypot(u, v) * 10) / 10;
    l.d = Math.round(dirOf(u, v) * 10) / 10;
    this.update(true);
    this.emit();
  }
}
