import * as THREE from "three";

/** 3D overlay field modes (MeteoLAB-style). */
export type OverlayField =
  | "off"
  | "updraft"
  | "theta"
  | "moisture"
  | "vorticity"
  | "coldpool";

export interface FieldInfo {
  title: string;
  units: string;
  min: number;
  max: number;
  diverging: boolean;
  threshold: number;
  stops: string[];
}

const DIVERGING = [
  "#24476b",
  "#4d86b3",
  "#a9c9df",
  "#f1efe9",
  "#eab58f",
  "#cf6d49",
  "#8f2a1f",
];

export const FIELD_INFO: Record<Exclude<OverlayField, "off">, FieldInfo> = {
  updraft: {
    title: "Vertical velocity",
    units: "m/s",
    min: -15,
    max: 15,
    diverging: true,
    threshold: 0.25,
    stops: DIVERGING,
  },
  theta: {
    title: "Temperature departure",
    units: "K",
    min: -4,
    max: 4,
    diverging: true,
    threshold: 0.3,
    stops: DIVERGING,
  },
  moisture: {
    title: "Relative humidity",
    units: "%",
    min: 0,
    max: 100,
    diverging: false,
    threshold: 0.85,
    stops: ["#7a5a33", "#b89a63", "#e3dcc0", "#9ccbbd", "#4b9aa3", "#1f5d78"],
  },
  vorticity: {
    title: "Vertical vorticity",
    units: "10⁻³ s⁻¹",
    min: -4,
    max: 4,
    diverging: true,
    threshold: 0.3,
    stops: DIVERGING,
  },
  coldpool: {
    title: "Cold pool (θ deficit)",
    units: "K",
    min: 0,
    max: 8,
    diverging: false,
    threshold: 0.15,
    stops: ["#f1efe9", "#b9d7e6", "#6ea6cc", "#3769a0", "#1d3565"],
  },
};

export const OVERLAY_FIELDS: OverlayField[] = [
  "off",
  "updraft",
  "theta",
  "moisture",
  "vorticity",
  "coldpool",
];

/** Rain-total colour steps: [upper limit mm, rgb]. */
export const SWATH_COLORS: [number, [number, number, number]][] = [
  [1, [150, 200, 240]],
  [5, [60, 150, 225]],
  [10, [60, 185, 90]],
  [25, [240, 215, 60]],
  [50, [240, 130, 40]],
  [Infinity, [210, 45, 45]],
];

export function colormapTexture(stops: string[]): THREE.DataTexture {
  const data = new Uint8Array(256 * 4);
  const rgb = stops.map((s) =>
    [1, 3, 5].map((k) => parseInt(s.slice(k, k + 2), 16)),
  );
  for (let i = 0; i < 256; i++) {
    const f = (i / 255) * (rgb.length - 1);
    const k = Math.min(rgb.length - 2, Math.floor(f));
    const t = f - k;
    for (let c = 0; c < 3; c++) {
      data[i * 4 + c] = rgb[k][c] + (rgb[k + 1][c] - rgb[k][c]) * t;
    }
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, 256, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
