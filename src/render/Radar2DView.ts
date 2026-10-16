import {
  MAP_PRODUCTS,
  MapProductId,
  MapProductMeta,
} from "../sim/mapProducts";
import {
  SurfaceWindSample,
  windSpeedScale,
} from "../sim/surfaceWinds";

/**
 * Flat top-down map display for reflectivity / Doppler / CAPE / Tsfc.
 */
export class Radar2DView {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private titleEl: HTMLElement;
  private unitsEl: HTMLElement;
  private legendBar: HTMLElement;
  private legendTicks: HTMLElement;
  private tabsEl: HTMLElement;
  private image: ImageData | null = null;
  private nx = 0;
  private ny = 0;
  private product: MapProductId = "refl";
  private onProductChange: ((id: MapProductId) => void) | null = null;
  private ro: ResizeObserver | null = null;
  /** When true, only reflectivity is available (batch review recordings). */
  private recordedOnly = false;
  private windsVisible = false;
  private windSamples: SurfaceWindSample[] = [];
  private lightning: { i: number; j: number; alpha: number }[] = [];
  private blitCanvas: HTMLCanvasElement | null = null;
  private blitCtx: CanvasRenderingContext2D | null = null;

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "radar2d-panel hidden";
    this.root.innerHTML = `
      <div class="radar2d-frame">
        <div class="map2d-tabs" id="map2d-tabs">
          <button type="button" data-product="refl" class="active">Reflectivity</button>
          <button type="button" data-product="doppler">Doppler</button>
          <button type="button" data-product="cape">CAPE</button>
          <button type="button" data-product="cin">CIN</button>
          <button type="button" data-product="tsfc">Surface T</button>
          <button type="button" data-product="td">Dewpoint</button>
          <button type="button" data-product="wspd">Wind</button>
          <button type="button" data-product="psfc">Pressure</button>
          <button type="button" data-product="ltg">Lightning</button>
        </div>
        <div class="radar2d-canvas-wrap">
          <canvas id="radar2d-canvas"></canvas>
          <div class="map2d-compass" aria-hidden="true">
            <span class="n">N</span>
            <span class="e">E</span>
            <span class="s">S</span>
            <span class="w">W</span>
          </div>
        </div>
        <div class="radar2d-meta">
          <span class="radar2d-title">Column-max reflectivity</span>
          <span class="radar2d-units">dBZ</span>
        </div>
        <div class="radar2d-legend">
          <div class="radar-legend-bar"></div>
          <div class="radar-legend-ticks"><span>5</span><span>30</span><span>50</span><span>70</span></div>
        </div>
      </div>
    `;
    host.appendChild(this.root);
    this.canvas = this.root.querySelector("canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d", { alpha: false })!;
    this.ctx.imageSmoothingEnabled = false;
    this.titleEl = this.root.querySelector(".radar2d-title") as HTMLElement;
    this.unitsEl = this.root.querySelector(".radar2d-units") as HTMLElement;
    this.legendBar = this.root.querySelector(
      ".radar-legend-bar",
    ) as HTMLElement;
    this.legendTicks = this.root.querySelector(
      ".radar-legend-ticks",
    ) as HTMLElement;
    this.tabsEl = this.root.querySelector("#map2d-tabs") as HTMLElement;

    this.tabsEl.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest(
        "button[data-product]",
      ) as HTMLButtonElement | null;
      if (!btn || btn.disabled) return;
      const id = btn.dataset.product as MapProductId;
      this.setProduct(id);
      this.onProductChange?.(id);
    });

    this.applyMeta(MAP_PRODUCTS.refl);

    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.root);
  }

  setOnProductChange(cb: (id: MapProductId) => void): void {
    this.onProductChange = cb;
  }

  setProduct(id: MapProductId): void {
    const next = this.recordedOnly && id !== "refl" ? "refl" : id;
    this.product = next;
    this.applyMeta(MAP_PRODUCTS[next]);
    for (const btn of this.tabsEl.querySelectorAll("button")) {
      btn.classList.toggle(
        "active",
        btn.getAttribute("data-product") === next,
      );
    }
  }

  getProduct(): MapProductId {
    return this.product;
  }

  /** Batch review: lock Maps 2D to recorded reflectivity only. */
  setRecordedOnly(on: boolean): void {
    this.recordedOnly = on;
    for (const btn of this.tabsEl.querySelectorAll("button")) {
      const id = btn.getAttribute("data-product");
      const allowed = !on || id === "refl";
      (btn as HTMLButtonElement).disabled = !allowed;
      btn.title = allowed
        ? ""
        : "Not recorded in batch review (reflectivity only)";
    }
    if (on) this.setProduct("refl");
  }

  private applyMeta(meta: MapProductMeta): void {
    this.titleEl.textContent = meta.title;
    this.unitsEl.textContent = meta.units;
    this.legendBar.style.background = meta.legendCss;
    this.legendTicks.innerHTML = meta.ticks
      .map((t) => `<span>${t}</span>`)
      .join("");
  }

  setVisible(on: boolean): void {
    this.root.classList.toggle("hidden", !on);
    if (on) this.layout();
  }

  setWindsVisible(on: boolean): void {
    this.windsVisible = on;
    this.draw();
  }

  /** Overlay surface wind arrows (north-up, same as mapPix). */
  updateWinds(samples: SurfaceWindSample[]): void {
    this.windSamples = samples;
    this.draw();
  }

  setGrid(nx: number, ny: number): void {
    this.nx = Math.max(1, nx);
    this.ny = Math.max(1, ny);
    this.image = new ImageData(this.nx, this.ny);
    this.windSamples = [];
    this.layout();
  }

  /** Pack callback fills RGBA nx*ny; then we blit scaled. */
  update(pack: (out: Uint8Array) => void): void {
    if (!this.image || this.nx < 1) return;
    pack(this.image.data as unknown as Uint8Array);
    this.draw();
  }

  private layout(): void {
    if (this.root.classList.contains("hidden")) return;
    const frame = this.root.querySelector(".radar2d-frame") as HTMLElement;
    const w = Math.max(1, frame.clientWidth);
    const h = Math.max(1, frame.clientHeight - 96);
    if (this.nx < 1 || this.ny < 1) return;

    const aspect = this.nx / this.ny;
    let cw = w;
    let ch = w / aspect;
    if (ch > h) {
      ch = h;
      cw = h * aspect;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.style.width = `${cw}px`;
    this.canvas.style.height = `${ch}px`;
    this.canvas.width = Math.max(1, Math.floor(cw * dpr));
    this.canvas.height = Math.max(1, Math.floor(ch * dpr));
    this.ctx.imageSmoothingEnabled = false;
    this.draw();
  }

  private blitTarget(): CanvasRenderingContext2D {
    if (
      !this.blitCanvas ||
      !this.blitCtx ||
      this.blitCanvas.width !== this.nx ||
      this.blitCanvas.height !== this.ny
    ) {
      this.blitCanvas = document.createElement("canvas");
      this.blitCanvas.width = this.nx;
      this.blitCanvas.height = this.ny;
      this.blitCtx = this.blitCanvas.getContext("2d");
    }
    return this.blitCtx!;
  }

  private draw(): void {
    if (!this.image) return;
    const tctx = this.blitTarget();
    tctx.putImageData(this.image, 0, 0);

    this.ctx.fillStyle = "#0a101c";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(
      this.blitCanvas!,
      0,
      0,
      this.nx,
      this.ny,
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );

    if (this.windsVisible && this.windSamples.length > 0) {
      this.drawWindArrows();
    }
    if (this.lightning.length > 0) this.drawLightning();
  }

  /** Small bolt icons for live flashes. North is up, same as the map. */
  setLightning(marks: { i: number; j: number; alpha: number }[]): void {
    this.lightning = marks;
    if (!this.root.classList.contains("hidden")) this.draw();
  }

  private drawLightning(): void {
    const { nx, ny } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;
    for (const m of this.lightning) {
      const cx = ((m.i + 0.5) / nx) * w;
      const cy = ((ny - 1 - m.j + 0.5) / ny) * h;
      const s = Math.max(7, Math.min(w, h) / ny * 0.55);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s / 10, s / 10);
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(-4.2, -1.2);
      ctx.lineTo(0.6, -1.6);
      ctx.lineTo(-1.4, 9);
      ctx.lineTo(4.4, 0.4);
      ctx.lineTo(-0.4, 0.8);
      ctx.closePath();
      ctx.fillStyle = `rgba(255, 236, 160, ${Math.max(0, Math.min(1, m.alpha))})`;
      ctx.strokeStyle = `rgba(40, 30, 8, ${Math.max(0, Math.min(1, m.alpha)) * 0.85})`;
      ctx.lineWidth = 1.2;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawWindArrows(): void {
    const { nx, ny } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const spdScale = windSpeedScale(this.windSamples);
    const cell = Math.min(w / nx, h / ny);
    const maxLen = cell * 2.2;

    this.ctx.save();
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.strokeStyle = "rgba(255, 224, 138, 0.92)";
    this.ctx.fillStyle = "rgba(255, 224, 138, 0.92)";

    for (const s of this.windSamples) {
      // North-up: row 0 = j = ny-1
      const cx = ((s.i + 0.5) / nx) * w;
      const cy = ((ny - 1 - s.j + 0.5) / ny) * h;
      const len =
        maxLen * (0.3 + 0.7 * Math.min(1, s.spd / Math.max(1e-3, spdScale)));
      const ang = Math.atan2(-s.v, s.u); // +u east (+x), +v north (−y)
      const x2 = cx + Math.cos(ang) * len;
      const y2 = cy + Math.sin(ang) * len;
      const head = Math.max(4, len * 0.38);
      const ah = ang + Math.PI;

      this.ctx.lineWidth = Math.max(1.25, cell * 0.12);
      this.ctx.beginPath();
      this.ctx.moveTo(cx, cy);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.moveTo(x2, y2);
      this.ctx.lineTo(
        x2 + Math.cos(ah + 0.4) * head,
        y2 + Math.sin(ah + 0.4) * head,
      );
      this.ctx.lineTo(
        x2 + Math.cos(ah - 0.4) * head,
        y2 + Math.sin(ah - 0.4) * head,
      );
      this.ctx.closePath();
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  dispose(): void {
    this.ro?.disconnect();
    this.ro = null;
    this.root.remove();
  }
}
