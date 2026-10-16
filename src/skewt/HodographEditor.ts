import {
  SoundingLevel,
  defaultSounding,
  interpolateProfile,
  spdDirFromUv,
  uvFromSpdDir,
} from "../sim/thermo";

interface Handle {
  z: number;
  u: number;
  v: number;
  label: string;
}

/**
 * Easy hodograph: a few large height handles + live speed/direction readout.
 * Edits write back onto the full sounding by vertical interpolation.
 */
export class HodographEditor {
  private levels: SoundingLevel[];
  private handles: Handle[] = [];
  private dragging = false;
  private dragIndex = -1;
  private hoverIndex = -1;
  private selectedIndex = 0;
  private maxSpd = 40;
  onChange: ((levels: SoundingLevel[]) => void) | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private zTop = 12000,
  ) {
    this.levels = defaultSounding(zTop, 41);
    this.rebuildHandlesFromLevels();
    this.resize();
    this.draw();

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  setZTop(zTop: number): void {
    this.zTop = zTop;
    this.rebuildHandlesFromLevels();
    this.draw();
  }

  getLevels(): SoundingLevel[] {
    return this.levels.map((l) => ({ ...l }));
  }

  setLevels(levels: SoundingLevel[]): void {
    this.levels = levels.map((l) => ({ ...l })).sort((a, b) => a.z - b.z);
    this.rebuildHandlesFromLevels();
    this.draw();
    this.onChange?.(this.getLevels());
  }

  resetDefault(): void {
    this.levels = defaultSounding(this.zTop, 41);
    this.rebuildHandlesFromLevels();
    this.draw();
    this.onChange?.(this.getLevels());
  }

  resize(): void {
    // Hidden canvases report 0×0 — skip so we don't bake a blank buffer
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

  private handleHeights(): { z: number; label: string }[] {
    const top = this.zTop;
    const candidates = [
      { z: 0, label: "Sfc" },
      { z: 1000, label: "1 km" },
      { z: 2000, label: "2 km" },
      { z: 3000, label: "3 km" },
      { z: 5000, label: "5 km" },
      { z: 7000, label: "7 km" },
      { z: Math.min(10000, top * 0.85), label: "10 km" },
      { z: top, label: "Top" },
    ];
    // Drop duplicates / above top
    const out: { z: number; label: string }[] = [];
    for (const c of candidates) {
      if (c.z > top + 1) continue;
      if (out.length && Math.abs(out[out.length - 1].z - c.z) < 200) {
        out[out.length - 1] = { z: Math.min(c.z, top), label: c.label };
        continue;
      }
      out.push({ z: Math.min(c.z, top), label: c.label });
    }
    return out;
  }

  private rebuildHandlesFromLevels(): void {
    this.handles = this.handleHeights().map(({ z, label }) => {
      const lvl = interpolateProfile(this.levels, z);
      return { z, u: lvl.u, v: lvl.v, label };
    });
    this.autoscale();
    this.selectedIndex = Math.min(
      this.selectedIndex,
      Math.max(0, this.handles.length - 1),
    );
  }

  /** Write handle winds onto every sounding level (interp in z). */
  private applyHandlesToLevels(): void {
    if (this.handles.length === 0) return;
    for (const lvl of this.levels) {
      const z = lvl.z;
      if (z <= this.handles[0].z) {
        lvl.u = this.handles[0].u;
        lvl.v = this.handles[0].v;
        continue;
      }
      const last = this.handles[this.handles.length - 1];
      if (z >= last.z) {
        lvl.u = last.u;
        lvl.v = last.v;
        continue;
      }
      let i = 0;
      while (i < this.handles.length - 1 && this.handles[i + 1].z < z) i++;
      const a = this.handles[i];
      const b = this.handles[i + 1];
      const t = (z - a.z) / Math.max(1e-6, b.z - a.z);
      lvl.u = a.u + (b.u - a.u) * t;
      lvl.v = a.v + (b.v - a.v) * t;
    }
  }

  private autoscale(): void {
    let m = 25;
    for (const h of this.handles) {
      m = Math.max(m, Math.hypot(h.u, h.v) * 1.35);
    }
    this.maxSpd = Math.min(60, Math.max(25, Math.ceil(m / 5) * 5));
  }

  private layout() {
    const dpr = window.devicePixelRatio || 1;
    const listW = 72 * dpr;
    const footerH = 52 * dpr;
    const cx = listW + (this.canvas.width - listW) * 0.5;
    const cy = (this.canvas.height - footerH) * 0.52;
    const r = Math.min(this.canvas.width - listW, this.canvas.height - footerH) * 0.36;
    return { listW, footerH, cx, cy, r, dpr };
  }

  private uvToXY(u: number, v: number): { x: number; y: number } {
    const { cx, cy, r } = this.layout();
    return {
      x: cx + (u / this.maxSpd) * r,
      y: cy - (v / this.maxSpd) * r,
    };
  }

  private xyToUV(x: number, y: number): { u: number; v: number } {
    const { cx, cy, r } = this.layout();
    let u = ((x - cx) / r) * this.maxSpd;
    let v = ((cy - y) / r) * this.maxSpd;
    // Snap speed to 1 m/s for easier control
    const { spd, dir } = spdDirFromUv(u, v);
    const snapped = Math.round(spd);
    const uv = uvFromSpdDir(Math.min(this.maxSpd, snapped), dir);
    return uv;
  }

  private heightColor(z: number): string {
    const t = Math.max(0, Math.min(1, z / Math.max(this.zTop, 1)));
    const r = Math.floor(255 * (1 - t) + 90 * t);
    const g = Math.floor(150 + 30 * Math.sin(t * Math.PI));
    const b = Math.floor(90 * (1 - t) + 255 * t);
    return `rgb(${r},${g},${b})`;
  }

  private draw = (): void => {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w < 2 || h < 2) return;
    const { listW, footerH, cx, cy, r, dpr } = this.layout();
    if (!(r > 1)) return;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0a101c";
    ctx.fillRect(0, 0, w, h);

    // Height list (left)
    ctx.fillStyle = "#121a2b";
    ctx.fillRect(0, 0, listW, h - footerH);
    ctx.fillStyle = "#7a8aa3";
    ctx.font = `${10 * dpr}px sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText("Height", 8 * dpr, 16 * dpr);

    const rowH = ((h - footerH - 28 * dpr) / Math.max(1, this.handles.length));
    this.handles.forEach((handle, i) => {
      const y0 = 24 * dpr + i * rowH;
      const active = i === this.selectedIndex || i === this.hoverIndex;
      if (active) {
        ctx.fillStyle = i === this.selectedIndex ? "rgba(77,184,255,0.22)" : "rgba(77,184,255,0.10)";
        ctx.fillRect(0, y0, listW, rowH);
      }
      ctx.fillStyle = this.heightColor(handle.z);
      ctx.beginPath();
      ctx.arc(12 * dpr, y0 + rowH * 0.5, 4 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e8eef8";
      ctx.font = `${11 * dpr}px sans-serif`;
      ctx.fillText(handle.label, 22 * dpr, y0 + rowH * 0.5 + 4 * dpr);
    });

    // Plot background
    ctx.fillStyle = "#0d1524";
    ctx.fillRect(listW, 0, w - listW, h - footerH);

    // Speed rings
    ctx.textAlign = "center";
    for (let spd = 10; spd <= this.maxSpd; spd += 10) {
      const rr = (spd / this.maxSpd) * r;
      ctx.strokeStyle = spd % 20 === 0 ? "#2a3a55" : "#1c2a40";
      ctx.lineWidth = spd % 20 === 0 ? 1.5 * dpr : 1 * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#6a7a93";
      ctx.font = `${9 * dpr}px sans-serif`;
      ctx.fillText(`${spd}`, cx, cy - rr + 11 * dpr);
    }

    // Cross + cardinals
    ctx.strokeStyle = "#3a4a65";
    ctx.lineWidth = 1.25 * dpr;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();

    ctx.fillStyle = "#c5d4ea";
    ctx.font = `bold ${12 * dpr}px sans-serif`;
    ctx.fillText("N", cx, cy - r - 8 * dpr);
    ctx.fillText("S", cx, cy + r + 14 * dpr);
    ctx.fillText("W", cx - r - 12 * dpr, cy + 4 * dpr);
    ctx.fillText("E", cx + r + 12 * dpr, cy + 4 * dpr);

    // Trace
    if (this.handles.length) {
      ctx.lineWidth = 2.5 * dpr;
      ctx.strokeStyle = "#4db8ff";
      ctx.beginPath();
      this.handles.forEach((handle, i) => {
        const p = this.uvToXY(handle.u, handle.v);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();

      this.handles.forEach((handle, i) => {
        const p = this.uvToXY(handle.u, handle.v);
        const selected = i === this.selectedIndex;
        const hover = i === this.hoverIndex;
        const radius = (selected ? 9 : hover ? 8 : 6.5) * dpr;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius + 3 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = selected ? "rgba(77,184,255,0.35)" : "transparent";
        ctx.fill();
        ctx.fillStyle = this.heightColor(handle.z);
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = selected ? "#ffffff" : "#0a101c";
        ctx.lineWidth = selected ? 2 * dpr : 1.25 * dpr;
        ctx.stroke();
      });
    }

    // Footer readout
    ctx.fillStyle = "#121a2b";
    ctx.fillRect(0, h - footerH, w, footerH);
    ctx.strokeStyle = "#2a3a55";
    ctx.beginPath();
    ctx.moveTo(0, h - footerH);
    ctx.lineTo(w, h - footerH);
    ctx.stroke();

    const sel = this.handles[this.selectedIndex] ?? this.handles[0];
    if (sel) {
      const { spd, dir } = spdDirFromUv(sel.u, sel.v);
      const km = (sel.z / 1000).toFixed(sel.z < 1000 ? 2 : 1);
      ctx.fillStyle = "#e8eef8";
      ctx.font = `bold ${13 * dpr}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(
        `${sel.label}  ·  ${km} km  ·  ${spd.toFixed(0)} m/s from ${dir.toFixed(0)}°`,
        10 * dpr,
        h - footerH * 0.55,
      );
      ctx.fillStyle = "#9aabc4";
      ctx.font = `${10 * dpr}px sans-serif`;
      ctx.fillText(
        "Click height → drag tip  ·  scroll = speed  ·  Apply when done",
        10 * dpr,
        h - footerH * 0.22,
      );
    }
  };

  /** Nearest tip within hit radius, or -1 if none. */
  private nearestHandle(x: number, y: number, maxDistPx = 22): number {
    const dpr = window.devicePixelRatio || 1;
    const maxD2 = (maxDistPx * dpr) ** 2;
    let best = -1;
    let bestD = maxD2;
    for (let i = 0; i < this.handles.length; i++) {
      const p = this.uvToXY(this.handles[i].u, this.handles[i].v);
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private hitListIndex(y: number): number {
    const { listW, footerH, dpr } = this.layout();
    void listW;
    const rowH =
      (this.canvas.height - footerH - 28 * dpr) /
      Math.max(1, this.handles.length);
    const i = Math.floor((y - 24 * dpr) / rowH);
    if (i < 0 || i >= this.handles.length) return -1;
    return i;
  }

  private pointerXY(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / Math.max(1, rect.width);
    return {
      x: (e.clientX - rect.left) * dpr,
      y: (e.clientY - rect.top) * dpr,
    };
  }

  private onPointerDown = (e: PointerEvent): void => {
    const { x, y } = this.pointerXY(e);
    const { listW, footerH } = this.layout();

    if (y > this.canvas.height - footerH) return;

    if (x < listW) {
      const i = this.hitListIndex(y);
      if (i >= 0) {
        this.selectedIndex = i;
        this.draw();
      }
      return;
    }

    // Only drag a tip that was actually clicked (selected tip gets a slightly larger hit)
    const nearest = this.nearestHandle(x, y, 20);
    const selHit = this.nearestHandle(x, y, 28);
    const hit =
      selHit === this.selectedIndex
        ? this.selectedIndex
        : nearest;
    if (hit < 0) return;

    this.dragIndex = hit;
    this.selectedIndex = hit;
    this.dragging = true;
    this.canvas.setPointerCapture(e.pointerId);
    this.applyDrag(x, y);
  };

  private onPointerMove = (e: PointerEvent): void => {
    const { x, y } = this.pointerXY(e);
    const { listW, footerH } = this.layout();

    if (this.dragging) {
      this.applyDrag(x, y);
      return;
    }

    let hover = -1;
    if (y < this.canvas.height - footerH) {
      if (x < listW) hover = this.hitListIndex(y);
      else hover = this.nearestHandle(x, y);
    }
    if (hover !== this.hoverIndex) {
      this.hoverIndex = hover;
      this.canvas.style.cursor = hover >= 0 ? "grab" : "default";
      this.draw();
    }
  };

  private onPointerUp = (): void => {
    this.dragging = false;
    this.dragIndex = -1;
    this.canvas.style.cursor = this.hoverIndex >= 0 ? "grab" : "default";
  };

  private onPointerLeave = (): void => {
    this.dragging = false;
    this.dragIndex = -1;
    this.hoverIndex = -1;
    this.canvas.style.cursor = "default";
    this.draw();
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const i = this.selectedIndex;
    const h = this.handles[i];
    if (!h) return;
    const { spd, dir } = spdDirFromUv(h.u, h.v);
    const next = Math.max(0, Math.min(this.maxSpd, spd - Math.sign(e.deltaY)));
    const uv = uvFromSpdDir(next, dir || 270);
    h.u = uv.u;
    h.v = uv.v;
    this.autoscale();
    this.applyHandlesToLevels();
    this.draw();
    this.onChange?.(this.getLevels());
  };

  private applyDrag(x: number, y: number): void {
    const i = this.dragIndex >= 0 ? this.dragIndex : this.selectedIndex;
    const uv = this.xyToUV(x, y);
    this.handles[i].u = uv.u;
    this.handles[i].v = uv.v;
    this.selectedIndex = i;
    this.autoscale();
    this.applyHandlesToLevels();
    this.draw();
    this.onChange?.(this.getLevels());
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }
}
