import { es, Tdw, Zat } from "./creatorPhysics";
import type { CreatorLevel, Diagnostics, ParcelKey } from "./types";

const K = 273.15;
const Rd = 287.04;
const cp = 1005.7;
const Lv = 2.5e6;
const KAP = Rd / cp;

function moistDeriv(T: number, p: number): [number, number] {
  const e = es(T - K);
  const r = (0.622 * e) / (p - e);
  return [
    (Rd * T + Lv * r) / (p * (cp + (Lv * Lv * r * 0.622) / (Rd * T * T))),
    r,
  ];
}

export interface CreatorCss {
  grid: string;
  fg: string;
  muted: string;
  card: string;
}

export function readCreatorCss(
  el: HTMLElement = document.documentElement,
): CreatorCss {
  const s = getComputedStyle(el);
  const g = (n: string, fb: string) => s.getPropertyValue(n).trim() || fb;
  return {
    grid: g("--creator-grid", g("--border", "#2a323b")),
    fg: g("--creator-fg", g("--text", "#e6e9ed")),
    muted: g("--creator-muted", g("--muted", "#8793a2")),
    card: g("--creator-card", g("--bg-elevated", "#171c22")),
  };
}

export const ST_W = 620;
export const ST_H = 600;
const x0 = 46;
const x1 = ST_W - 14;
const y0 = 14;
const y1 = ST_H - 28;
const kx = (x1 - x0) / 85;
const sk = 0.55;

export const HODO_SIZE = 340;

function setup(
  c: HTMLCanvasElement,
  w: number,
  h: number,
): CanvasRenderingContext2D {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = Math.floor(w * dpr);
  c.height = Math.floor(h * dpr);
  c.style.width = "100%";
  c.style.height = "auto";
  const x = c.getContext("2d")!;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  return x;
}

export function Y(p: number): number {
  return y1 - (Math.log(1050 / p) / Math.log(10.5)) * (y1 - y0);
}

export function Pf(y: number): number {
  return 1050 / Math.exp(((y1 - y) / (y1 - y0)) * Math.log(10.5));
}

export function X(T: number, p: number): number {
  return x0 + (T + 35) * kx + (y1 - Y(p)) * sk;
}

export function Tp(px: number, p: number): number {
  return (px - x0 - (y1 - Y(p)) * sk) / kx - 35;
}

function path(
  x: CanvasRenderingContext2D,
  pts: [number, number][],
  col: string,
  w = 1,
  dash: number[] = [],
): void {
  x.beginPath();
  pts.forEach((q, i) => x[i ? "lineTo" : "moveTo"](X(q[0], q[1]), Y(q[1])));
  x.strokeStyle = col;
  x.lineWidth = w;
  x.setLineDash(dash);
  x.stroke();
}

const dot = (
  x: CanvasRenderingContext2D,
  px: number,
  py: number,
  c: string,
): void => {
  x.beginPath();
  x.arc(px, py, 3.5, 0, 7);
  x.fillStyle = c;
  x.fill();
};

export function drawSkewT(
  canvas: HTMLCanvasElement,
  L: CreatorLevel[],
  D: Diagnostics,
  sel: ParcelKey,
  css: CreatorCss,
): void {
  const x = setup(canvas, ST_W, ST_H);
  const gr = css.grid;
  const fg = css.fg;
  const mu = css.muted;
  x.font = "11px system-ui, sans-serif";
  x.save();
  x.beginPath();
  x.rect(x0, y0, x1 - x0, y1 - y0);
  x.clip();
  for (let T = -130; T <= 50; T += 10) {
    path(
      x,
      [
        [T, 1050],
        [T, 100],
      ],
      T === 0 ? "rgba(70,130,255,.8)" : gr,
      T === 0 ? 1.5 : 1,
    );
  }
  for (let p = 100; p <= 1000; p += 100) {
    x.beginPath();
    x.moveTo(x0, Y(p));
    x.lineTo(x1, Y(p));
    x.strokeStyle = gr;
    x.setLineDash([]);
    x.lineWidth = 1;
    x.stroke();
  }
  for (let t = 230; t <= 470; t += 10) {
    const q: [number, number][] = [];
    for (let p = 1050; p >= 100; p -= 25) {
      q.push([t * Math.pow(p / 1e3, KAP) - K, p]);
    }
    path(x, q, "rgba(210,130,50,.4)");
  }
  for (let T0 = -8; T0 <= 36; T0 += 4) {
    let T = T0 + K;
    let p = 1e3;
    const q: [number, number][] = [];
    while (p >= 100) {
      q.push([T - K, p]);
      const d1 = moistDeriv(T, p)[0];
      const d2 = moistDeriv(T - 5 * d1, p - 5)[0];
      T -= 10 * d2;
      p -= 10;
    }
    path(x, q, "rgba(60,170,90,.45)", 1, [5, 3]);
  }
  [1, 2, 4, 8, 12, 16, 20].forEach((w) => {
    const q: [number, number][] = [];
    for (let p = 1050; p >= 600; p -= 50) q.push([Tdw(p, w), p]);
    path(x, q, "rgba(90,160,90,.55)", 1, [2, 3]);
  });
  path(
    x,
    L.map((l) => [l.T, l.p]),
    "#e5383b",
    2.5,
  );
  path(
    x,
    L.map((l) => [l.Td, l.p]),
    "#2fa84f",
    2.5,
  );
  const pc = D.P[sel];
  path(
    x,
    pc.pts.map((q) => [q[1] - K, q[0]]),
    fg,
    1.5,
    [6, 4],
  );
  L.forEach((l) => {
    dot(x, X(l.T, l.p), Y(l.p), "#e5383b");
    dot(x, X(l.Td, l.p), Y(l.p), "#2fa84f");
  });
  x.restore();
  x.fillStyle = mu;
  x.strokeStyle = mu;
  x.setLineDash([]);
  x.lineWidth = 1;
  x.strokeRect(x0, y0, x1 - x0, y1 - y0);
  for (let p = 100; p <= 1000; p += 100) x.fillText(String(p), 6, Y(p) + 4);
  for (let T = -30; T <= 50; T += 10) {
    x.fillText(String(T), X(T, 1050) - 8, ST_H - 12);
  }
  x.fillStyle = fg;
  x.strokeStyle = fg;
  x.setLineDash([2, 3]);
  (
    [
      ["LCL", pc.pl],
      ["LFC", pc.lfc],
      ["EL", pc.el],
    ] as [string, number | null][]
  ).forEach(([n, p]) => {
    if (p == null) return;
    x.beginPath();
    x.moveTo(x1 - 90, Y(p));
    x.lineTo(x1, Y(p));
    x.stroke();
    x.fillText(
      `${sel} ${n} ${Math.round(Zat(L, p))} m`,
      x1 - 88,
      Y(p) - 3,
    );
  });
}

export function hodoPoint(
  l: CreatorLevel,
  hR: number,
  hc = HODO_SIZE / 2,
): [number, number] {
  const sc = (hc - 24) / hR;
  return [hc + (l.u ?? 0) * sc, hc - (l.v ?? 0) * sc];
}

export function drawHodograph(
  canvas: HTMLCanvasElement,
  L: CreatorLevel[],
  D: Diagnostics,
  hR: number,
  css: CreatorCss,
): void {
  const hs = HODO_SIZE;
  const hc = hs / 2;
  const x = setup(canvas, hs, hs);
  const gr = css.grid;
  const mu = css.muted;
  const sc = (hc - 24) / hR;
  x.font = "10px system-ui, sans-serif";
  x.fillStyle = mu;
  x.strokeStyle = gr;
  x.lineWidth = 1;
  for (let r = 10; r <= hR; r += 10) {
    x.beginPath();
    x.arc(hc, hc, r * sc, 0, 7);
    x.stroke();
    if (r % 20 === 0) x.fillText(String(r), hc + 3, hc - r * sc - 2);
  }
  x.beginPath();
  x.moveTo(8, hc);
  x.lineTo(hs - 8, hc);
  x.moveTo(hc, 8);
  x.lineTo(hc, hs - 8);
  x.stroke();
  const col = (z: number) =>
    z < 1e3
      ? "#e5383b"
      : z < 3e3
        ? "#2fa84f"
        : z < 6e3
          ? "#e0b000"
          : z < 9e3
            ? "#17a2b8"
            : "#7b6cff";
  const H1 = L.filter((l) => (l.z ?? 0) <= 12e3);
  for (let i = 1; i < H1.length; i++) {
    const a = hodoPoint(H1[i - 1], hR, hc);
    const b = hodoPoint(H1[i], hR, hc);
    x.beginPath();
    x.moveTo(a[0], a[1]);
    x.lineTo(b[0], b[1]);
    x.strokeStyle = col(((H1[i].z ?? 0) + (H1[i - 1].z ?? 0)) / 2);
    x.lineWidth = 3;
    x.stroke();
  }
  H1.forEach((l) => {
    const [px, py] = hodoPoint(l, hR, hc);
    x.beginPath();
    x.arc(px, py, 3.5, 0, 7);
    x.fillStyle = css.card;
    x.fill();
    x.strokeStyle = col(l.z ?? 0);
    x.lineWidth = 1.5;
    x.stroke();
  });
  (
    [
      [`RM${D.S ? " anti" : " cyc"}`, D.RM, "#e5383b"],
      [`LM${D.S ? " cyc" : " anti"}`, D.LM, "#4a7dff"],
      ["MW", D.m, mu],
    ] as [string, [number, number], string][]
  ).forEach(([n, v, c]) => {
    const px = hc + v[0] * sc;
    const py = hc - v[1] * sc;
    x.fillStyle = c;
    x.fillRect(px - 3, py - 3, 6, 6);
    x.fillText(n, px + 5, py - 4);
  });
}
