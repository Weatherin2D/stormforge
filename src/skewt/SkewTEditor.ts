import {
  SoundingLevel,
  TFromTheta,
  defaultSounding,
  dewpointFromE,
  eFromDewpointC,
  esat,
  pressureAtZ,
  spdDirFromUv,
} from "../sim/thermo";
import { computeThermoIndices } from "../sim/cape";
import { parseSoundingText } from "../sim/soundingImport";

export type EditMode = "T" | "Td";

/**
 * Interactive Skew-T / log-P editor (T/Td).
 * Isotherms skew ~45°; vertical axis is logarithmic pressure.
 */
export class SkewTEditor {
  private levels: SoundingLevel[];
  private mode: EditMode = "T";
  private dragging = false;
  private zTop: number;
  private metricsEl: HTMLElement | null = null;
  onChange: ((levels: SoundingLevel[]) => void) | null = null;

  /** Display temperature range at the surface (°C) — refit to sounding. */
  private tMinC = -40;
  private tMaxC = 40;
  /**
   * Skew: isotherms shift right with height (fraction of plot width at top).
   * Kept moderate so the profile stays large in the frame.
   */
  private readonly skew = 0.55;

  constructor(
    private canvas: HTMLCanvasElement,
    zTop = 12000,
  ) {
    this.zTop = zTop;
    this.levels = defaultSounding(zTop, 41);
    this.refitView();
    this.resize();
    this.draw();

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerUp);
  }

  setMetricsElement(el: HTMLElement | null): void {
    this.metricsEl = el;
    this.refreshMetrics();
  }

  setZTop(zTop: number): void {
    this.zTop = zTop;
    const oldTop = this.levels[this.levels.length - 1]?.z || zTop;
    for (const lvl of this.levels) {
      lvl.z = (lvl.z / Math.max(oldTop, 1)) * zTop;
      lvl.p = pressureAtZ(lvl.z, zTop);
    }
    this.refitView();
    this.draw();
  }

  setMode(mode: EditMode): void {
    this.mode = mode;
    this.draw();
  }

  getLevels(): SoundingLevel[] {
    return this.levels.map((l) => ({ ...l }));
  }

  setLevels(levels: SoundingLevel[]): void {
    this.levels = levels.map((l) => ({ ...l })).sort((a, b) => a.z - b.z);
    this.refitView();
    this.draw();
    this.onChange?.(this.getLevels());
  }

  resetDefault(): void {
    this.levels = defaultSounding(this.zTop, 41);
    this.refitView();
    this.draw();
    this.onChange?.(this.getLevels());
  }

  /** Zoom the T/p frame around the current sounding so it fills the plot. */
  private refitView(): void {
    if (!this.levels.length) {
      this.tMinC = -40;
      this.tMaxC = 40;
      return;
    }
    let tLo = Infinity;
    let tHi = -Infinity;
    for (const l of this.levels) {
      tLo = Math.min(tLo, l.T - 273.15, l.Td - 273.15);
      tHi = Math.max(tHi, l.T - 273.15, l.Td - 273.15);
    }
    if (!Number.isFinite(tLo) || !Number.isFinite(tHi)) {
      this.tMinC = -40;
      this.tMaxC = 40;
      return;
    }
    tLo -= 6;
    tHi += 8;
    const minSpan = 45;
    if (tHi - tLo < minSpan) {
      const mid = 0.5 * (tLo + tHi);
      tLo = mid - minSpan * 0.5;
      tHi = mid + minSpan * 0.5;
    }
    this.tMinC = Math.max(-55, tLo);
    this.tMaxC = Math.min(48, tHi);
    if (this.tMaxC - this.tMinC < minSpan) {
      this.tMaxC = Math.min(48, this.tMinC + minSpan);
      this.tMinC = this.tMaxC - minSpan;
    }
  }

  exportText(): string {
    const lines = ["alt_m,p_hPa,t_C,td_C,u,v"];
    for (const l of this.levels) {
      lines.push(
        [
          l.z.toFixed(1),
          (l.p / 100).toFixed(2),
          (l.T - 273.15).toFixed(2),
          (l.Td - 273.15).toFixed(2),
          l.u.toFixed(2),
          l.v.toFixed(2),
        ].join(","),
      );
    }
    return lines.join("\n");
  }

  importText(text: string): { ok: boolean; message: string } {
    const res = parseSoundingText(text, this.zTop);
    if (!res.ok) return { ok: false, message: res.message };
    this.setLevels(res.levels);
    return { ok: true, message: res.message };
  }

  resize(): void {
    if (this.canvas.classList.contains("hidden")) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.draw();
  }

  private layout() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const padL = 28 * dpr;
    const padR = 4 * dpr;
    const padT = 18 * dpr;
    const padB = 24 * dpr;
    const windW = Math.max(48 * dpr, w * 0.16);
    const thermoR = w - windW;
    const plotW = Math.max(40, thermoR - padL - padR);
    const plotH = Math.max(40, h - padT - padB);
    return { dpr, w, h, padL, padR, padT, padB, windW, thermoR, plotW, plotH };
  }

  private pBot(): number {
    const sfc = this.levels[0]?.p ?? pressureAtZ(0, this.zTop);
    return sfc * 1.02;
  }

  private pTop(): number {
    const top =
      this.levels[this.levels.length - 1]?.p ?? pressureAtZ(this.zTop, this.zTop);
    // Tight to sounding top — only a little headroom
    return Math.max(top * 0.94, this.pBot() * 0.08);
  }

  /** 0 at surface (high p), 1 at top (low p). */
  private pNorm(p: number): number {
    const pb = this.pBot();
    const pt = this.pTop();
    const lnB = Math.log(pb);
    const lnT = Math.log(pt);
    const ln = Math.log(Math.max(pt, Math.min(pb, p)));
    return (lnB - ln) / Math.max(1e-6, lnB - lnT);
  }

  private pToY(p: number): number {
    const { padT, plotH } = this.layout();
    return padT + (1 - this.pNorm(p)) * plotH;
  }

  private yToP(y: number): number {
    const { padT, plotH } = this.layout();
    const f = 1 - (y - padT) / Math.max(1, plotH); // 0 sfc → 1 top
    const pb = this.pBot();
    const pt = this.pTop();
    const ln = Math.log(pb) - f * (Math.log(pb) - Math.log(pt));
    return Math.exp(ln);
  }

  /**
   * Skew-T x: surface T spans nearly the full plot width; height adds a rightward skew.
   */
  private tpToX(T: number, p: number): number {
    const { padL, plotW } = this.layout();
    const tC = T - 273.15;
    const tNorm = (tC - this.tMinC) / Math.max(1e-3, this.tMaxC - this.tMinC);
    return padL + tNorm * plotW + this.skew * this.pNorm(p) * plotW;
  }

  private xToT(x: number, p: number): number {
    const { padL, plotW } = this.layout();
    const tNorm =
      (x - padL - this.skew * this.pNorm(p) * plotW) / Math.max(1, plotW);
    const tC = this.tMinC + tNorm * (this.tMaxC - this.tMinC);
    return tC + 273.15;
  }

  private draw = (): void => {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const { dpr, w, h, padL, padT, padB, thermoR, plotH } = this.layout();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0a101c";
    ctx.fillRect(0, 0, w, h);

    this.drawBackground(ctx);

    ctx.fillStyle = "rgba(20, 32, 52, 0.9)";
    ctx.fillRect(thermoR, 0, w - thermoR, h);
    ctx.strokeStyle = "#2a3a55";
    ctx.beginPath();
    ctx.moveTo(thermoR, 0);
    ctx.lineTo(thermoR, h);
    ctx.stroke();

    ctx.fillStyle = "#7a8aa3";
    ctx.font = `${10 * dpr}px sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText("Skew-T / log-P", padL, 14 * dpr);
    ctx.fillText(this.mode === "T" ? "editing T" : "editing Td", padL, 26 * dpr);
    ctx.fillText("Wind", thermoR + 8, 14 * dpr);
    ctx.fillText("(Hodograph)", thermoR + 8, 26 * dpr);

    // Bottom isotherm labels
    ctx.fillStyle = "#c4a070";
    ctx.font = `${9 * dpr}px sans-serif`;
    ctx.textAlign = "center";
    const ySfc = this.pToY(this.pBot());
    const t0 = Math.ceil(this.tMinC / 10) * 10;
    for (let tC = t0; tC <= this.tMaxC; tC += 10) {
      const x = this.tpToX(tC + 273.15, this.pBot());
      if (x < padL || x > thermoR - 4) continue;
      ctx.fillText(`${tC}`, x, Math.min(h - 4, ySfc + 14 * dpr));
    }
    ctx.textAlign = "left";
    ctx.fillStyle = "#8a7a60";
    ctx.fillText("°C", padL, h - 6 * dpr);

    this.strokeProfile(ctx, (l) => l.Td, "#3ecf8e", 2 * dpr);
    this.strokeProfile(ctx, (l) => l.T, "#ff8b5c", 2.5 * dpr);
    this.drawWindBarbs(ctx);
    this.refreshMetrics();

    void padT;
    void padB;
    void plotH;
  };

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    const { dpr, padL, padT, plotH, thermoR } = this.layout();
    const pb = this.pBot();
    const pt = this.pTop();

    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT, thermoR - padL, plotH);
    ctx.clip();

    // Isobars (horizontal)
    const isobarsHpa = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100];
    ctx.strokeStyle = "#1a283c";
    ctx.lineWidth = 1 * dpr;
    ctx.font = `${9 * dpr}px sans-serif`;
    ctx.fillStyle = "#5a6a82";
    ctx.textAlign = "left";
    for (const hpa of isobarsHpa) {
      const p = hpa * 100;
      if (p > pb || p < pt) continue;
      const y = this.pToY(p);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(thermoR, y);
      ctx.stroke();
      if (hpa >= 150) {
        ctx.fillText(`${hpa}`, padL + 2, y - 3 * dpr);
      }
    }

    // Mixing-ratio lines (g/kg) — dashed green
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.strokeStyle = "rgba(40, 140, 70, 0.45)";
    ctx.lineWidth = 1 * dpr;
    for (const wGkg of [0.4, 1, 2, 3, 5, 8, 12, 16, 20]) {
      this.traceBackground(ctx, (p) => {
        const tC = this.tempFromMixingRatioGkg(wGkg, p / 100);
        return tC + 273.15;
      });
    }
    ctx.setLineDash([]);

    // Dry adiabats (θ K) — warm red
    ctx.strokeStyle = "rgba(200, 70, 55, 0.35)";
    ctx.lineWidth = 1 * dpr;
    for (let theta = 240; theta <= 380; theta += 10) {
      this.traceBackground(ctx, (p) => TFromTheta(theta, p));
    }

    // Moist adiabats (approximate pseudoadiabats from surface θe-ish starts)
    ctx.setLineDash([5 * dpr, 4 * dpr]);
    ctx.strokeStyle = "rgba(50, 180, 90, 0.4)";
    for (const tSfcC of [32, 24, 16, 8, 0, -8]) {
      this.traceMoistAdiabat(ctx, tSfcC);
    }
    ctx.setLineDash([]);

    // Isotherms (skewed) — orange
    ctx.strokeStyle = "rgba(255, 150, 60, 0.5)";
    ctx.lineWidth = 1 * dpr;
    const tIso0 = Math.floor(this.tMinC / 10) * 10;
    for (let tC = tIso0; tC <= this.tMaxC + 20; tC += 10) {
      this.traceBackground(ctx, () => tC + 273.15);
    }
    // 0 °C emphasis
    ctx.strokeStyle = "rgba(255, 160, 70, 0.9)";
    ctx.lineWidth = 1.5 * dpr;
    this.traceBackground(ctx, () => 273.15);
    ctx.restore();
  }

  private traceBackground(
    ctx: CanvasRenderingContext2D,
    tAtP: (p: number) => number,
  ): void {
    const { padL, thermoR } = this.layout();
    const pb = this.pBot();
    const pt = this.pTop();
    const steps = 48;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const ln = Math.log(pb) - f * (Math.log(pb) - Math.log(pt));
      const p = Math.exp(ln);
      const T = tAtP(p);
      if (!Number.isFinite(T)) continue;
      const x = this.tpToX(T, p);
      const y = this.pToY(p);
      if (x < padL - 20 || x > thermoR + 20) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    if (started) ctx.stroke();
  }

  /** Simple saturated adiabat: dry to LCL then moist lapse. */
  private traceMoistAdiabat(ctx: CanvasRenderingContext2D, tSfcC: number): void {
    const { padL, thermoR } = this.layout();
    const pb = this.pBot();
    const pt = this.pTop();
    const w0 = this.mixingRatioFromDewpoint(tSfcC, pb / 100); // kg/kg
    let T = tSfcC + 273.15;
    let saturated = false;
    const steps = 56;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const ln = Math.log(pb) - f * (Math.log(pb) - Math.log(pt));
      const p = Math.exp(ln);
      if (i > 0) {
        const prevLn = Math.log(pb) - ((i - 1) / steps) * (Math.log(pb) - Math.log(pt));
        const pPrev = Math.exp(prevLn);
        // Approximate dz from hydrostatic: dz ≈ -Rd T dlnp / g
        const dlnp = Math.log(p) - Math.log(pPrev);
        const dz = (-287.05 * T * dlnp) / 9.81;
        if (!saturated) {
          T -= 0.0098 * dz; // dry adiabatic
          const td = this.dewpointFromMixingRatio(w0, p / 100) + 273.15;
          if (T <= td) {
            saturated = true;
            T = td;
          }
        } else {
          T -= this.moistLapseKperM(T, p) * dz;
        }
      }
      const x = this.tpToX(T, p);
      const y = this.pToY(p);
      if (x < padL - 30 || x > thermoR + 30) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    if (started) ctx.stroke();
  }

  private moistLapseKperM(T: number, p: number): number {
    // Approximate saturated adiabatic lapse rate (K/m)
    const r = Math.max(1e-6, (0.622 * esat(T)) / Math.max(p - esat(T), 1));
    const num = 9.81 * (1 + (2.5e6 * r) / (287.05 * T));
    const den =
      1004 +
      (2.5e6 * 2.5e6 * r * 0.622) / (287.05 * T * T);
    return num / den;
  }

  private mixingRatioFromDewpoint(tdC: number, hpa: number): number {
    const e = eFromDewpointC(tdC);
    const p = hpa * 100;
    return (0.622 * e) / Math.max(p - e, 1);
  }

  private dewpointFromMixingRatio(w: number, hpa: number): number {
    const p = hpa * 100;
    const e = (w * p) / (0.622 + w);
    return dewpointFromE(Math.max(1, e));
  }

  private tempFromMixingRatioGkg(wGkg: number, hpa: number): number {
    // Solve T such that qs(T,p) = w
    const target = wGkg / 1000;
    let lo = -80;
    let hi = 40;
    for (let n = 0; n < 24; n++) {
      const mid = 0.5 * (lo + hi);
      const w = this.mixingRatioFromDewpoint(mid, hpa);
      if (w > target) hi = mid;
      else lo = mid;
    }
    return 0.5 * (lo + hi);
  }

  private refreshMetrics(): void {
    if (!this.metricsEl) return;
    const idx = computeThermoIndices(this.levels, this.zTop);
    const capeClass =
      idx.cape >= 2000 ? "hot" : idx.cape >= 1000 ? "warm" : "ok";
    const cinClass = idx.cin >= 50 ? "warn" : "ok";
    this.metricsEl.innerHTML = `
      <div class="metric"><span class="k">T</span><span class="v">${idx.tSfcC.toFixed(1)}°C</span></div>
      <div class="metric"><span class="k">Td</span><span class="v">${idx.tdSfcC.toFixed(1)}°C</span></div>
      <div class="metric"><span class="k">CAPE</span><span class="v ${capeClass}">${Math.round(idx.cape)}</span><span class="u">J/kg</span></div>
      <div class="metric"><span class="k">CINH</span><span class="v ${cinClass}">${Math.round(idx.cin)}</span><span class="u">J/kg</span></div>
      <div class="metric"><span class="k">LCL</span><span class="v">${(idx.lclM / 1000).toFixed(2)}</span><span class="u">km</span></div>
    `;
  }

  private strokeProfile(
    ctx: CanvasRenderingContext2D,
    pick: (l: SoundingLevel) => number,
    color: string,
    width: number,
  ): void {
    const { padL, thermoR } = this.layout();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    let started = false;
    for (const l of this.levels) {
      const x = this.tpToX(pick(l), l.p);
      const y = this.pToY(l.p);
      if (x < padL - 40 || x > thermoR + 40) continue;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    if (started) ctx.stroke();
  }

  private drawWindBarbs(ctx: CanvasRenderingContext2D): void {
    const { dpr, w, thermoR } = this.layout();
    const cx = (thermoR + w - 10) / 2;
    const step = Math.max(1, Math.floor(this.levels.length / 16));

    for (let i = 0; i < this.levels.length; i += step) {
      const l = this.levels[i];
      const { spd, dir } = spdDirFromUv(l.u, l.v);
      const y = this.pToY(l.p);
      this.drawBarb(ctx, cx, y, spd, dir, dpr);
    }

    const mid = this.levels[Math.floor(this.levels.length / 4)];
    if (mid) {
      const { spd, dir } = spdDirFromUv(mid.u, mid.v);
      ctx.fillStyle = "#9aabc4";
      ctx.font = `${10 * dpr}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(
        `${spd.toFixed(0)} m/s  ${dir.toFixed(0)}°`,
        thermoR + 4,
        this.canvas.height - 8,
      );
    }
  }

  private drawBarb(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    spd: number,
    dirDeg: number,
    dpr: number,
  ): void {
    const len = 14 * dpr;
    const rad = (dirDeg * Math.PI) / 180;
    const dx = Math.sin(rad) * len;
    const dy = -Math.cos(rad) * len;

    ctx.strokeStyle = "#c5d4ea";
    ctx.fillStyle = "#c5d4ea";
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();

    const ticks = Math.min(8, Math.round(spd / 5));
    for (let t = 0; t < ticks; t++) {
      const along = 0.35 + t * 0.12;
      const bx = x + dx * along;
      const by = y + dy * along;
      const px = -dy * 0.35;
      const py = dx * 0.35;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + px, by + py);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(x, y, 1.6 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  private nearestIndexByP(p: number): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.levels.length; i++) {
      const d = Math.abs(Math.log(this.levels[i].p) - Math.log(p));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.canvas.setPointerCapture(e.pointerId);
    this.applyPointer(e);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.applyPointer(e);
  };

  private onPointerUp = (): void => {
    this.dragging = false;
  };

  private applyPointer(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / Math.max(1, rect.width);
    const x = (e.clientX - rect.left) * dpr;
    const y = (e.clientY - rect.top) * dpr;
    const { thermoR } = this.layout();
    if (x > thermoR) return;

    const p = this.yToP(y);
    const i = this.nearestIndexByP(p);
    const T = this.xToT(x, this.levels[i].p);

    if (this.mode === "T") {
      this.levels[i].T = Math.max(180, Math.min(320, T));
      if (this.levels[i].Td > this.levels[i].T) {
        this.levels[i].Td = this.levels[i].T;
      }
    } else {
      this.levels[i].Td = Math.max(180, Math.min(this.levels[i].T, T));
    }
    for (const j of [i - 1, i + 1]) {
      if (j < 0 || j >= this.levels.length) continue;
      if (this.mode === "T") {
        this.levels[j].T = this.levels[j].T * 0.7 + this.levels[i].T * 0.3;
      } else {
        this.levels[j].Td = this.levels[j].Td * 0.7 + this.levels[i].Td * 0.3;
      }
    }
    this.draw();
    this.onChange?.(this.getLevels());
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointerleave", this.onPointerUp);
  }
}
