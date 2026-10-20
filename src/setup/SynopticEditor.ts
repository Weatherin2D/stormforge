import {
  DrawnFront,
  FrontKind,
  MapPoint,
  PressureCenter,
  SynopticSetup,
  cloneSynoptic,
  defaultSynoptic,
  nearestOnPolyline,
  previewMasses,
} from "../sim/synoptic";

type Tool =
  | "select"
  | FrontKind
  | "low"
  | "high";

const KIND_LABEL: Record<FrontKind, string> = {
  cold: "Cold front",
  warm: "Warm front",
  stationary: "Stationary",
  dryline: "Dryline",
  outflow: "Outflow",
};

const KIND_COLOR: Record<FrontKind, string> = {
  cold: "#4db8ff",
  warm: "#ff5d5d",
  stationary: "#c084fc",
  dryline: "#e0a15a",
  outflow: "#d070e0",
};

/**
 * Setup map where fronts are drawn and toggled, and surface
 * highs and lows are placed. North is up.
 */
export class SynopticEditor {
  readonly root: HTMLElement;
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

  constructor() {
    this.root = document.createElement("aside");
    this.root.className = "setup-card setup-fronts";
    this.root.tabIndex = 0;
    this.root.innerHTML = `
      <h2>Fronts</h2>
      <p class="hint fronts-desc">
        Draw a front where it should sit. The air on the left of your stroke
        is the cold or dry side. Triangles point the way it will move.
      </p>
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
          Southeast marine layer
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
          Move speed
          <input id="sf-move-speed" type="range" min="0" max="0.3" step="0.01" value="0.08" />
          <span id="sf-move-speed-val">0.08</span>
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
    });

    this.marineInput.addEventListener("change", () => {
      this.setup.marine = this.marineInput.checked;
      this.draw();
    });
    this.synopticToggle.addEventListener("change", () => {
      this.setup.enabled = this.synopticToggle.checked;
      this.draw();
    });
    this.jetstreamToggle.addEventListener("change", () => {
      this.setup.jetstream = this.jetstreamToggle.checked;
      if (this.jetstreamRow) {
        this.jetstreamRow.style.display = this.jetstreamToggle.checked ? "flex" : "none";
      }
      this.draw();
    });
    this.moveToggle.addEventListener("change", () => {
      this.setup.move = this.moveToggle.checked;
      if (this.moveRow) this.moveRow.style.display = this.moveToggle.checked ? "flex" : "none";
      this.draw();
    });
    this.moveSpeed.addEventListener("input", () => {
      const v = Number(this.moveSpeed.value);
      this.setup.moveSpeed = v;
      if (this.moveSpeedVal) this.moveSpeedVal.textContent = v.toFixed(2);
      this.draw();
    });

    this.strengthInput.addEventListener("input", () => {
      const center = this.selectedCenter();
      if (!center) return;
      center.hPa = Number(this.strengthInput.value);
      this.strengthVal.textContent = `${center.hPa} hPa`;
      this.renderList();
      this.draw();
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
        this.moveSpeed.value = String(this.setup.moveSpeed ?? 0.08);
        if (this.moveSpeedVal) this.moveSpeedVal.textContent = (this.setup.moveSpeed ?? 0.08).toFixed(2);
      }
      this.syncSelectionUi();
      this.renderList();
      this.draw();
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
      this.moveSpeed.value = String(this.setup.moveSpeed ?? 0.08);
      if (this.moveSpeedVal) this.moveSpeedVal.textContent = (this.setup.moveSpeed ?? 0.08).toFixed(2);
    }
    if (this.marineInput) this.marineInput.checked = this.setup.marine !== false;
  }

  getSetup(): SynopticSetup {
    return cloneSynoptic(this.setup);
  }

  resize(): void {
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
      const hit = nearestOnPolyline(f.points, p.x, p.y);
      if (hit && hit.dist < bestD) {
        best = f;
        bestD = hit.dist;
      }
    }
    return best;
  }

  private onDown(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    this.root.focus();
    const p = this.norm(e);
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
    if (this.dragging) {
      const c = this.setup.centers.find((x) => x.id === this.dragging!.id);
      if (!c) return;
      c.x = Math.min(1, Math.max(0, p.x + this.dragging.dx));
      c.y = Math.min(1, Math.max(0, p.y + this.dragging.dy));
      this.draw();
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
  }

  private draw(): void {
    const cssW = Math.max(1, this.canvas.clientWidth);
    const cssH = Math.max(1, this.canvas.clientHeight);
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
    ctx.fillStyle = "#0c1424";
    ctx.fillRect(0, 0, cssW, cssH);
    this.paintTint(cssW, cssH);
    this.paintMarine(cssW, cssH);
    for (const f of this.setup.fronts) this.paintFront(f, cssW, cssH, false);
    if (this.draft && this.draft.length > 0 && this.tool !== "select" && this.tool !== "low" && this.tool !== "high") {
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

  private paintTint(w: number, h: number): void {
    const n = 28;
    const cw = w / n;
    const ch = h / n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const xn = (i + 0.5) / n;
        const yn = 1 - (j + 0.5) / n;
        const m = previewMasses(this.setup, xn, yn);
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
