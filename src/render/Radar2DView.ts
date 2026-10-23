import {
  MAP_PRODUCTS,
  MapProductId,
  MapProductMeta,
  paintLegend,
} from "../sim/mapProducts";
import {
  CatalogView,
  VIEW_LEVEL_LABELS,
  VIEW_PROVENANCE_LABELS,
  catalogStats,
  liveViewsByProduct,
  searchCatalog,
} from "../sim/viewCatalog";
import { upsampleRgba } from "./upsampleRgba";
import {
  SurfaceWindSample,
  windSpeedScale,
} from "../sim/surfaceWinds";
import { DrawnFront, FRONT_COLORS } from "../sim/synoptic";
import type { LightningKind } from "../sim/FluidSolver";

/**
 * Flat top-down map display for reflectivity / Doppler / diagnostics.
 */
export class Radar2DView {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private titleEl: HTMLElement;
  private unitsEl: HTMLElement;
  private provenanceEl: HTMLElement;
  private legendBar: HTMLElement;
  private legendTicks: HTMLElement;
  private tabsEl: HTMLElement;
  private pinnedEl: HTMLElement;
  private searchInput: HTMLInputElement;
  private searchResultsEl: HTMLElement;
  private searchDetailEl: HTMLElement | null = null;
  private aboutEl: HTMLElement;
  private aboutBodyEl: HTMLElement;
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
  /** Fronts drawn on the map (normalized 0..1 map coordinates). */
  private fronts: DrawnFront[] = [];
  private lightning: { i: number; j: number; alpha: number; kind: LightningKind }[] = [];
  private blitCanvas: HTMLCanvasElement | null = null;
  private blitCtx: CanvasRenderingContext2D | null = null;
  private upImage: ImageData | null = null;
  /** Display samples per grid cell. 1 keeps the view pixelated. */
  private detail = 2;
  private onDetailChange: ((scale: number) => void) | null = null;
  private detailVal: HTMLElement | null = null;
  private pinned: Set<MapProductId> = new Set();
  /** Live catalog entry for each implemented product, used for provenance. */
  private readonly liveViews = liveViewsByProduct();
  private searchHits: CatalogView[] = [];
  private searchActive = -1;
  private onDocPointerDown: ((e: PointerEvent) => void) | null = null;

  private static readonly PIN_KEY = "stormforge.map2d.pins.v2";
  /** Older pin stores are discarded so the view starts with no stars. */
  private static readonly LEGACY_PIN_KEYS = ["stormforge.map2d.pins.v1"];

  private static readonly PRODUCT_ORDER: MapProductId[] = [
    "refl",
    "refl1k",
    "echotop",
    "vil",
    "precip",
    "paccum",
    "preciptype",
    "graupel",
    "snowice",
    "hailsize",
    "doppler",
    "ltg",
    "cape",
    "cin",
    "cape03",
    "lcl",
    "lfc",
    "el",
    "frz",
    "pwat",
    "tsfc",
    "td",
    "rh",
    "thetae",
    "t500",
    "t700",
    "t850",
    "t925",
    "td500",
    "td700",
    "td850",
    "td925",
    "psfc",
    "mslp",
    "wspd",
    "wdir",
    "w850",
    "w3k",
    "wmax",
    "shear01",
    "shear03",
    "shear06",
    "conv",
    "div",
    "vort",
    "mconv",
    "uh25",
    "cfr",
    "clwc",
    "lwp",
    "ctop",
    "cbase",
    "vis",
    "ir",
    "mlcape",
    "mucape",
    "li",
    "showalter",
    "kindex",
    "totaltotals",
    "lapse700500",
    "lapse03",
    "wbz",
    "convtemp",
    "dcape",
    "capeshear",
    "dptdep",
    "qsfc",
    "mixratio",
    "mflux",
    "dryint",
    "blrh",
    "wetbulb",
    "evappot",
    "cice",
    "iwp",
    "cttemp",
    "cdepth",
    "overshoot",
    "ctdiv",
    "downdraft",
    "w925",
    "w700",
    "w500",
    "w300",
    "w200",
    "omega",
    "shear08",
    "srh01",
    "srh03",
    "srw",
    "brn",
    "llj",
    "ulj",
    "ucomp",
    "vcomp",
    "virga",
    "vildensity",
    "hydrometeor",
    "rainrate",
    "snowrate",
    "z500",
    "thickness",
    "tropopause",
    "vortadv",
    "coldpool",
    "pgrad",
    "tgrad",
    "tdgrad",
  ];

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "radar2d-panel hidden";
    this.root.innerHTML = `
      <div class="radar2d-frame">
        <div class="map2d-search">
          <input id="map2d-search" type="search" placeholder="Search views…" autocomplete="off" spellcheck="false" aria-label="Search 2D views" aria-controls="map2d-search-results" aria-expanded="false" />
          <div class="map2d-results hidden" id="map2d-search-results" role="listbox" aria-label="2D view catalog"></div>
        </div>
        <div class="map2d-pinned" id="map2d-pinned" style="display:none"></div>
        <div class="map2d-tabs" id="map2d-tabs"></div>
        <details class="map2d-about" id="map2d-about">
          <summary>About this view</summary>
          <div class="map2d-about-body" id="map2d-about-body"></div>
        </details>
        <label class="map2d-detail">
          View detail
          <input id="map2d-detail" type="range" min="1" max="4" step="1" value="2" />
          <span id="map2d-detail-val">2×</span>
        </label>
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
          <span class="map2d-meta-right">
            <span class="map2d-provenance" id="map2d-provenance"></span>
            <span class="radar2d-units">dBZ</span>
          </span>
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
    this.provenanceEl = this.root.querySelector(
      "#map2d-provenance",
    ) as HTMLElement;
    this.legendBar = this.root.querySelector(
      ".radar-legend-bar",
    ) as HTMLElement;
    this.legendTicks = this.root.querySelector(
      ".radar-legend-ticks",
    ) as HTMLElement;
    this.tabsEl = this.root.querySelector("#map2d-tabs") as HTMLElement;
    this.pinnedEl = this.root.querySelector("#map2d-pinned") as HTMLElement;
    this.searchInput = this.root.querySelector("#map2d-search") as HTMLInputElement;
    this.searchResultsEl = this.root.querySelector(
      "#map2d-search-results",
    ) as HTMLElement;
    this.aboutEl = this.root.querySelector("#map2d-about") as HTMLElement;
    this.aboutBodyEl = this.root.querySelector(
      "#map2d-about-body",
    ) as HTMLElement;
    this.loadPins();
    this.buildTabs();

    const stats = catalogStats();
    this.searchInput.placeholder =
      `Search ${stats.total} views — ${stats.live} live, ${stats.planned} planned…`;

    this.searchInput.addEventListener("focus", () => this.openSearch());
    this.searchInput.addEventListener("input", () => {
      this.openSearch();
      this.renderSearch();
    });
    this.searchInput.addEventListener("keydown", (e) =>
      this.onSearchKeyDown(e),
    );
    this.searchResultsEl.addEventListener("click", (e) =>
      this.onSearchClick(e),
    );
    this.searchResultsEl.addEventListener("pointerover", (e) => {
      const row = (e.target as HTMLElement).closest(
        ".map2d-result",
      ) as HTMLElement | null;
      if (!row) return;
      const idx = Number(row.dataset.index);
      if (!Number.isFinite(idx) || idx === this.searchActive) return;
      this.setSearchActive(idx, false);
    });

    this.onDocPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (this.searchInput.contains(t) || this.searchResultsEl.contains(t)) {
        return;
      }
      this.closeSearch();
    };
    document.addEventListener("pointerdown", this.onDocPointerDown);

    this.tabsEl.addEventListener("click", (e) => {
      const pin = (e.target as HTMLElement).closest(".map2d-pin") as HTMLElement | null;
      if (pin) {
        const btn = pin.closest("button[data-product]") as HTMLButtonElement | null;
        if (!btn) return;
        const id = btn.dataset.product as MapProductId;
        this.togglePin(id);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const btn = (e.target as HTMLElement).closest(
        "button[data-product]",
      ) as HTMLButtonElement | null;
      if (!btn || btn.disabled) return;
      const id = btn.dataset.product as MapProductId;
      this.setProduct(id);
      this.onProductChange?.(id);
    });

    this.pinnedEl.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest(
        ".map2d-pinned-btn",
      ) as HTMLButtonElement | null;
      if (!btn) return;
      const id = btn.dataset.product as MapProductId;
      if (!id) return;
      this.setProduct(id);
      this.onProductChange?.(id);
    });

    this.applyMeta(MAP_PRODUCTS.refl);

    this.detailVal = this.root.querySelector("#map2d-detail-val");
    const detailInput = this.root.querySelector(
      "#map2d-detail",
    ) as HTMLInputElement;
    detailInput.addEventListener("input", () => {
      const next = Math.max(1, Math.min(4, Number(detailInput.value) || 1));
      this.detail = next;
      if (this.detailVal) this.detailVal.textContent = `${next}×`;
      this.layout();
      this.onDetailChange?.(next);
    });

    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.root);
  }

  setOnProductChange(cb: (id: MapProductId) => void): void {
    this.onProductChange = cb;
  }

  setOnDetailChange(cb: (scale: number) => void): void {
    this.onDetailChange = cb;
  }

  getDetail(): number {
    return this.detail;
  }

  private openSearch(): void {
    this.renderSearch();
    this.searchResultsEl.classList.remove("hidden");
    this.searchInput.setAttribute("aria-expanded", "true");
  }

  private closeSearch(): void {
    this.searchResultsEl.classList.add("hidden");
    this.searchInput.setAttribute("aria-expanded", "false");
    this.searchActive = -1;
    this.searchDetailEl = null;
  }

  private renderSearch(): void {
    if (!this.searchResultsEl) return;
    this.searchHits = searchCatalog(this.searchInput.value);
    const stats = catalogStats();
    const q = this.searchInput.value.trim();
    this.searchResultsEl.innerHTML = "";

    const head = document.createElement("div");
    head.className = "map2d-search-head";
    head.textContent = q
      ? `${this.searchHits.length} match${this.searchHits.length === 1 ? "" : "es"} for “${q}” · ${stats.live} live / ${stats.planned} planned in the catalog`
      : `Showing ${this.searchHits.length} of ${stats.total} views · ${stats.live} live, ${stats.planned} planned — type to narrow`;
    this.searchResultsEl.appendChild(head);

    const list = document.createElement("div");
    list.className = "map2d-result-list";
    if (this.searchHits.length === 0) {
      const empty = document.createElement("div");
      empty.className = "map2d-search-empty";
      empty.textContent =
        "No catalog view matches. Try CAPE, shear, cloud base, reflectivity, satellite, or vorticity.";
      list.appendChild(empty);
    } else {
      this.searchHits.forEach((view, index) => {
        list.appendChild(this.buildSearchRow(view, index));
      });
    }
    this.searchResultsEl.appendChild(list);

    const detail = document.createElement("div");
    detail.className = "map2d-search-detail";
    this.searchDetailEl = detail;
    this.searchResultsEl.appendChild(detail);
    this.searchActive = -1;
    if (this.searchHits.length > 0) this.setSearchActive(0, false);
  }

  private buildSearchRow(view: CatalogView, index: number): HTMLElement {
    const row = document.createElement("div");
    row.className = "map2d-result";
    row.dataset.index = String(index);
    row.dataset.viewId = view.id;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", "false");
    const blocked =
      !!view.productId && this.recordedOnly && view.productId !== "refl";
    if (blocked) row.classList.add("blocked");

    const top = document.createElement("div");
    top.className = "map2d-result-top";
    const label = document.createElement("span");
    label.className = "map2d-result-label";
    label.textContent = view.label;
    top.appendChild(label);

    const actions = document.createElement("span");
    actions.className = "map2d-result-actions";
    if (view.productId) {
      const isPinned = this.pinned.has(view.productId);
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "map2d-result-pin";
      pin.dataset.pinProduct = view.productId;
      pin.title = isPinned ? "Unpin from top bar" : "Pin to top bar";
      pin.setAttribute(
        "aria-label",
        `${isPinned ? "Unpin" : "Pin"} ${view.label} ${isPinned ? "from" : "to"} the top bar`,
      );
      pin.setAttribute("aria-pressed", String(isPinned));
      pin.textContent = isPinned ? "★" : "☆";
      if (blocked) {
        pin.disabled = true;
        pin.title = "Only reflectivity is recorded in batch review";
      }
      actions.appendChild(pin);
    }
    top.appendChild(actions);
    row.appendChild(top);

    const badges = document.createElement("span");
    badges.className = "map2d-result-badges";
    badges.appendChild(
      this.badge(
        VIEW_PROVENANCE_LABELS[view.provenance],
        `prov-${view.provenance}`,
      ),
    );
    badges.appendChild(this.badge(view.level, "level"));
    badges.appendChild(this.badge(view.units, "units"));
    if (blocked) badges.appendChild(this.badge("Reflectivity only", "blocked"));
    else if (view.productId) badges.appendChild(this.badge("Live", "live"));
    else badges.appendChild(this.badge("Planned", "planned"));
    row.appendChild(badges);

    if (blocked) {
      row.title = "Batch review recordings contain reflectivity only.";
    } else if (!view.productId) {
      row.title =
        "Catalogued but not plotted until its inputs and formula are implemented and tested.";
    }
    return row;
  }

  private badge(text: string, cls: string): HTMLElement {
    const el = document.createElement("span");
    el.className = `map2d-badge ${cls}`;
    el.textContent = text;
    return el;
  }

  private setSearchActive(index: number, scroll: boolean): void {
    this.searchActive = index;
    for (const row of this.searchResultsEl.querySelectorAll(".map2d-result")) {
      const el = row as HTMLElement;
      const on = Number(el.dataset.index) === index;
      el.classList.toggle("active", on);
      el.setAttribute("aria-selected", String(on));
      if (on && scroll) el.scrollIntoView({ block: "nearest" });
    }
    const view = this.searchHits[index];
    if (view && this.searchDetailEl) {
      this.renderViewDetail(view, this.searchDetailEl);
    }
  }

  private renderViewDetail(view: CatalogView, host: HTMLElement): void {
    host.innerHTML = "";

    const title = document.createElement("div");
    title.className = "map2d-detail-title";
    title.textContent = view.label;
    host.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "map2d-detail-meta";
    meta.textContent =
      `${VIEW_PROVENANCE_LABELS[view.provenance]} · ` +
      `${VIEW_LEVEL_LABELS[view.levelKind]} · ${view.level} · ${view.units}`;
    host.appendChild(meta);

    const status = document.createElement("div");
    status.className = "map2d-detail-status";
    if (view.productId) {
      status.classList.add("live");
      status.textContent = `Live map product: ${MAP_PRODUCTS[view.productId].title}.`;
    } else {
      status.classList.add("planned");
      status.textContent =
        "Planned — not plotted. It stays searchable until its inputs, formula and assumptions are implemented and tested.";
    }
    host.appendChild(status);

    this.appendDetailLine(
      host,
      "Definition",
      view.definition ?? "No definition recorded.",
    );
    this.appendDetailLine(
      host,
      "Formula",
      view.formula ??
        (view.provenance === "derived"
          ? "Not implemented — no formula is evaluated for this view."
          : "Not applicable."),
    );
    if (view.parcelType) {
      this.appendDetailLine(host, "Parcel", view.parcelType);
    }
    this.appendDetailLine(
      host,
      "Assumptions",
      view.assumptions ?? "None documented.",
    );
    this.appendDetailLine(
      host,
      "Layer",
      `${view.level} (${VIEW_LEVEL_LABELS[view.levelKind]})`,
    );
  }

  private appendDetailLine(
    host: HTMLElement,
    key: string,
    value: string,
  ): void {
    const line = document.createElement("div");
    line.className = "map2d-detail-line";
    const k = document.createElement("span");
    k.className = "map2d-detail-key";
    k.textContent = key;
    const v = document.createElement("span");
    v.className = "map2d-detail-value";
    v.textContent = value;
    line.append(k, v);
    host.appendChild(line);
  }

  private onSearchKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      this.closeSearch();
      this.searchInput.blur();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (this.searchResultsEl.classList.contains("hidden")) this.openSearch();
      if (this.searchHits.length === 0) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next =
        this.searchActive < 0
          ? 0
          : (this.searchActive + step + this.searchHits.length) %
            this.searchHits.length;
      this.setSearchActive(next, true);
      return;
    }
    if (e.key !== "Enter") return;
    const view = this.searchHits[this.searchActive];
    if (!view) return;
    e.preventDefault();
    if (!view.productId) return;
    if (this.recordedOnly && view.productId !== "refl") return;
    this.chooseProduct(view.productId);
  }

  private onSearchClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const pin = target.closest(".map2d-result-pin") as HTMLButtonElement | null;
    if (pin) {
      e.preventDefault();
      e.stopPropagation();
      const id = pin.dataset.pinProduct as MapProductId | undefined;
      if (id) this.togglePin(id);
      return;
    }
    const row = target.closest(".map2d-result") as HTMLElement | null;
    if (!row) return;
    const index = Number(row.dataset.index);
    if (!Number.isFinite(index)) return;
    const view = this.searchHits[index];
    if (!view) return;
    if (!view.productId) {
      this.setSearchActive(index, true);
      return;
    }
    if (this.recordedOnly && view.productId !== "refl") return;
    this.chooseProduct(view.productId);
  }

  private chooseProduct(id: MapProductId): void {
    this.setProduct(id);
    this.onProductChange?.(id);
    this.searchInput.value = "";
    this.closeSearch();
    this.searchInput.blur();
  }

  private buildTabs(): void {
    this.tabsEl.innerHTML = "";
    for (const id of Radar2DView.PRODUCT_ORDER) {
      const meta = (MAP_PRODUCTS as Record<string, MapProductMeta>)[id];
      if (!meta) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.product = id;
      btn.innerHTML = `<span>${meta.title}</span><span class="map2d-pin" title="Pin to top bar" aria-label="Pin ${meta.title} to top bar">☆</span>`;
      this.tabsEl.appendChild(btn);
    }
    this.refreshPins();
  }

  private loadPins(): void {
    try {
      if (typeof localStorage === "undefined") return;
      for (const key of Radar2DView.LEGACY_PIN_KEYS) {
        localStorage.removeItem(key);
      }
      const raw = localStorage.getItem(Radar2DView.PIN_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      for (const value of parsed) {
        if (typeof value !== "string") continue;
        const id = value as MapProductId;
        if (MAP_PRODUCTS[id]) this.pinned.add(id);
      }
    } catch {
      /* Storage may be unavailable (private mode / tests); pins stay ephemeral. */
    }
  }

  private savePins(): void {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(
        Radar2DView.PIN_KEY,
        JSON.stringify(Array.from(this.pinned)),
      );
    } catch {
      /* Ignore quota/security errors. */
    }
  }

  private togglePin(id: MapProductId): void {
    if (!MAP_PRODUCTS[id]) return;
    if (this.recordedOnly && id !== "refl") return;
    if (this.pinned.has(id)) this.pinned.delete(id);
    else this.pinned.add(id);
    this.savePins();
    this.refreshPins();
    this.refreshSearchPin(id);
  }

  private refreshTabPins(): void {
    for (const btn of this.tabsEl.querySelectorAll("button[data-product]")) {
      const id = btn.getAttribute("data-product") as MapProductId;
      const isPinned = this.pinned.has(id);
      btn.classList.toggle("pinned", isPinned);
      const star = btn.querySelector(".map2d-pin");
      if (star) {
        star.textContent = isPinned ? "★" : "☆";
        star.setAttribute("aria-pressed", String(isPinned));
      }
    }
  }

  private refreshSearchPin(id: MapProductId): void {
    const isPinned = this.pinned.has(id);
    this.searchResultsEl
      .querySelectorAll(`.map2d-result-pin[data-pin-product="${id}"]`)
      .forEach((el) => {
        el.classList.toggle("pinned", isPinned);
        el.setAttribute("aria-pressed", String(isPinned));
        el.textContent = isPinned ? "★" : "☆";
      });
  }

  private refreshPins(): void {
    this.pinnedEl.innerHTML = "";
    for (const id of this.pinned) {
      const mp = MAP_PRODUCTS[id as MapProductId];
      if (!mp) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "map2d-pinned-btn";
      btn.dataset.product = id;
      btn.textContent = mp.title;
      btn.title = `Show ${mp.title}`;
      btn.classList.toggle("active", id === this.product);
      this.pinnedEl.appendChild(btn);
    }
    this.refreshTabPins();
    this.pinnedEl.style.display = this.pinned.size ? "flex" : "none";
    this.applyRecordedOnly();
  }

  setProduct(id: MapProductId): void {
    const next = this.recordedOnly && id !== "refl" ? "refl" : id;
    if (!MAP_PRODUCTS[next]) return;
    this.product = next;
    this.applyMeta(MAP_PRODUCTS[next]);
    for (const el of this.tabsEl.querySelectorAll("button[data-product]")) {
      el.classList.toggle(
        "active",
        el.getAttribute("data-product") === next,
      );
    }
    for (const el of this.pinnedEl.querySelectorAll(".map2d-pinned-btn")) {
      el.classList.toggle(
        "active",
        el.getAttribute("data-product") === next,
      );
    }
  }

  getProduct(): MapProductId {
    return this.product;
  }

  /** Batch review: lock Maps 2D to recorded reflectivity only. */
  setRecordedOnly(on: boolean): void {
    this.recordedOnly = on;
    this.applyRecordedOnly();
    if (!this.searchResultsEl.classList.contains("hidden")) this.renderSearch();
    if (on) this.setProduct("refl");
  }

  private applyRecordedOnly(): void {
    for (const btn of this.tabsEl.querySelectorAll("button[data-product]")) {
      const id = btn.getAttribute("data-product");
      const allowed = !this.recordedOnly || id === "refl";
      (btn as HTMLButtonElement).disabled = !allowed;
      (btn as HTMLButtonElement).title = allowed
        ? ""
        : "Not recorded in batch review (reflectivity only)";
    }
    for (const btn of this.pinnedEl.querySelectorAll(".map2d-pinned-btn")) {
      const id = btn.getAttribute("data-product");
      const allowed = !this.recordedOnly || id === "refl";
      (btn as HTMLButtonElement).disabled = !allowed;
      (btn as HTMLButtonElement).title = allowed
        ? `Show ${btn.textContent ?? ""}`
        : "Not recorded in batch review (reflectivity only)";
    }
  }

  private applyMeta(meta: MapProductMeta): void {
    this.titleEl.textContent = meta.title;
    this.unitsEl.textContent = meta.units;
    paintLegend(this.legendBar, this.legendTicks, meta);

    const view = this.liveViews.get(meta.id);
    this.provenanceEl.textContent = view
      ? `${VIEW_PROVENANCE_LABELS[view.provenance]} · ${VIEW_LEVEL_LABELS[view.levelKind]}`
      : "";
    this.provenanceEl.title = view?.level ? `Layer: ${view.level}` : "";

    const summary = this.aboutEl.querySelector("summary") as HTMLElement;
    if (view) {
      summary.textContent =
        `About this view — ${VIEW_PROVENANCE_LABELS[view.provenance]} · ` +
        `${view.units} · ${view.level}`;
      this.renderViewDetail(view, this.aboutBodyEl);
    } else {
      summary.textContent = "About this view";
      this.aboutBodyEl.innerHTML = "";
      this.appendDetailLine(
        this.aboutBodyEl,
        "Status",
        "No catalog entry is registered for this map product.",
      );
    }
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

  /** Show the drawn fronts on the map so the pattern is visible while running. */
  setFronts(fronts: DrawnFront[]): void {
    this.fronts = fronts.filter((f) => f.enabled && f.points.length >= 2);
    if (!this.root.classList.contains("hidden")) this.draw();
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
    const wrap = this.root.querySelector(".radar2d-canvas-wrap") as HTMLElement;
    const w = Math.max(1, wrap.clientWidth);
    const h = Math.max(1, wrap.clientHeight);
    if (h < 40) return;
    if (this.nx < 1 || this.ny < 1) return;

    // The map is always presented as a square, matching the radar-style view.
    const size = Math.max(1, Math.min(w, h));
    const cw = size;
    const ch = size;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.style.width = `${cw}px`;
    this.canvas.style.height = `${ch}px`;
    this.canvas.width = Math.max(1, Math.floor(cw * dpr));
    this.canvas.height = Math.max(1, Math.floor(ch * dpr));
    this.canvas.style.imageRendering = this.detail <= 1 ? "pixelated" : "auto";
    const compass = this.root.querySelector(".map2d-compass") as HTMLElement | null;
    if (compass) {
      compass.style.width = `${cw}px`;
      compass.style.height = `${ch}px`;
    }
    this.draw();
  }

  private blitTarget(w: number, h: number): CanvasRenderingContext2D {
    if (
      !this.blitCanvas ||
      !this.blitCtx ||
      this.blitCanvas.width !== w ||
      this.blitCanvas.height !== h
    ) {
      this.blitCanvas = document.createElement("canvas");
      this.blitCanvas.width = w;
      this.blitCanvas.height = h;
      this.blitCtx = this.blitCanvas.getContext("2d");
    }
    return this.blitCtx!;
  }

  private draw(): void {
    if (!this.image) return;
    const f = this.detail;
    const tw = this.nx * f;
    const th = this.ny * f;
    const tctx = this.blitTarget(tw, th);
    if (f <= 1) {
      tctx.putImageData(this.image, 0, 0);
    } else {
      if (!this.upImage || this.upImage.width !== tw || this.upImage.height !== th) {
        this.upImage = new ImageData(tw, th);
      }
      upsampleRgba(this.image.data, this.nx, this.ny, f, this.upImage.data);
      tctx.putImageData(this.upImage, 0, 0);
    }

    this.ctx.fillStyle = "#0a101c";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.imageSmoothingEnabled = f > 1;
    this.ctx.drawImage(
      this.blitCanvas!,
      0,
      0,
      tw,
      th,
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );

    if (this.windsVisible && this.windSamples.length > 0) {
      this.drawWindArrows();
    }
    if (this.fronts.length > 0) this.drawFronts();
    if (this.lightning.length > 0) this.drawLightning();
    this.drawOverlay();
  }

  /** Front lines from the front editor, drawn on top of the map. */
  private drawFronts(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;
    const scale = Math.min(w, h);
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const front of this.fronts) {
      const color = FRONT_COLORS[front.kind] ?? "#ffffff";
      ctx.strokeStyle = "rgba(6, 12, 22, 0.85)";
      ctx.lineWidth = Math.max(3, scale * 0.006);
      this.strokeFront(front, w, h);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, scale * 0.0035);
      this.strokeFront(front, w, h);
    }
    ctx.restore();
  }

  private strokeFront(front: DrawnFront, w: number, h: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    front.points.forEach((p, i) => {
      const x = p.x * w;
      const y = (1 - p.y) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  /** Small bolt icons for live flashes. North is up, same as the map. */
  setLightning(marks: { i: number; j: number; alpha: number; kind: LightningKind }[]): void {
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
      const a = Math.max(0, Math.min(1, m.alpha));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s / 10, s / 10);
      if (m.kind === "sprite") {
        ctx.beginPath();
        ctx.moveTo(0, 8);
        ctx.lineTo(0, -2);
        ctx.moveTo(-3.5, -6);
        ctx.lineTo(0, -2);
        ctx.lineTo(3.5, -7);
        ctx.strokeStyle = `rgba(255, 72, 96, ${a})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (m.kind === "ic") {
        // In-cloud flash: a small pale-blue spark, no ground contact.
        ctx.beginPath();
        for (let n = 0; n < 8; n++) {
          const r = n % 2 === 0 ? 8 : 3.2;
          const a2 = (n / 8) * Math.PI * 2 - Math.PI / 2;
          const x = Math.cos(a2) * r;
          const y = Math.sin(a2) * r;
          if (n === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(212, 236, 255, ${a * 0.9})`;
        ctx.strokeStyle = `rgba(60, 96, 140, ${a * 0.8})`;
        ctx.lineWidth = 1.1;
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(-4.2, -1.2);
        ctx.lineTo(0.6, -1.6);
        ctx.lineTo(-1.4, 9);
        ctx.lineTo(4.4, 0.4);
        ctx.lineTo(-0.4, 0.8);
        ctx.closePath();
        ctx.fillStyle = `rgba(255, 236, 160, ${a})`;
        ctx.strokeStyle = `rgba(40, 30, 8, ${a * 0.85})`;
        ctx.lineWidth = 1.2;
        ctx.fill();
        ctx.stroke();
      }
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

  /** Basemap-style overlay: grid + scale bar (MeteoLAB-inspired). */
  private drawOverlay(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    const step = Math.max(24, Math.floor(Math.min(w, h) / 8));
    for (let x = step; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = step; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // scale bar
    const barLen = Math.max(40, Math.floor(w * 0.18));
    const bx = 14;
    const by = h - 18;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + barLen, by);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.font = "10px sans-serif";
    ctx.fillText(`${Math.round(barLen)} px`, bx, by - 4);
    ctx.restore();
  }

  dispose(): void {
    this.ro?.disconnect();
    this.ro = null;
    if (this.onDocPointerDown) {
      document.removeEventListener("pointerdown", this.onDocPointerDown);
      this.onDocPointerDown = null;
    }
    this.root.remove();
  }
}
