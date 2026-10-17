import * as THREE from 'three';

/**
 * Atmosphere colours for the cloud march and the sky.
 *
 * A transmittance and single-scatter table (sun elevation × view elevation) is
 * baked once. computeSkyLighting samples it and still returns four colours:
 *   sun, sky, ground, haze.
 * The cloud shader only sees those four uniforms.
 */

const BETA_RAYLEIGH = [5.8e-6, 13.5e-6, 33.1e-6]; // 1/m at sea level, for R, G, B
const BETA_MIE = 21e-6; // 1/m, wavelength-independent haze
const H_RAYLEIGH = 8000; // m
const H_MIE = 1200; // m

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface SkyLighting {
  sun: THREE.Vector3;
  sky: THREE.Vector3;
  ground: THREE.Vector3;
  haze: THREE.Vector3;
}

/**
 * Transmittance and single-scatter sky from a small table baked once.
 * Axes are sun elevation and view elevation. Rayleigh plus Mie, integrated
 * through a spherical shell (the cheap form of Hillaire 2020). The cloud
 * march still only sees the four colours from computeSkyLighting.
 */

const R_EARTH = 6_371_000;
const R_ATMO = R_EARTH + 80_000;
const SUN_N = 48;
const VIEW_N = 24;
const SUN_MIN = -6;
const SUN_MAX = 90;
const VIEW_MIN = 0;
const VIEW_MAX = 90;
const DEG = Math.PI / 180;

interface ScatterSample {
  t: [number, number, number];
  L: [number, number, number];
}

let scatterTable: ScatterSample[] | null = null;

function rayFar(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, radius: number): number {
  const b = ox * dx + oy * dy + oz * dz;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const h = b * b - c;
  if (h < 0) return 0;
  return Math.max(0, -b + Math.sqrt(h));
}

function opticalDepth(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, length: number): [number, number, number] {
  const steps = 6;
  const ds = length / steps;
  const od: [number, number, number] = [0, 0, 0];
  if (length <= 1) return od;
  for (let s = 0; s < steps; s++) {
    const dist = (s + 0.5) * ds;
    const h = Math.max(0, Math.hypot(ox + dx * dist, oy + dy * dist, oz + dz * dist) - R_EARTH);
    const rhoR = Math.exp(-h / H_RAYLEIGH);
    const rhoM = Math.exp(-h / H_MIE);
    od[0] += (BETA_RAYLEIGH[0] * rhoR + BETA_MIE * rhoM) * ds;
    od[1] += (BETA_RAYLEIGH[1] * rhoR + BETA_MIE * rhoM) * ds;
    od[2] += (BETA_RAYLEIGH[2] * rhoR + BETA_MIE * rhoM) * ds;
  }
  return od;
}

function integrate(sunDeg: number, viewDeg: number): ScatterSample {
  const sunY = Math.sin(sunDeg * DEG);
  const sunZ = Math.cos(sunDeg * DEG);
  const viewY = Math.sin(Math.max(viewDeg, 0.4) * DEG);
  const viewZ = Math.cos(Math.max(viewDeg, 0.4) * DEG);
  const camY = R_EARTH + 200;
  const length = rayFar(0, camY, 0, 0, viewY, viewZ, R_ATMO);
  const steps = 10;
  const ds = Math.max(length, 1) / steps;
  const trans: [number, number, number] = [1, 1, 1];
  const light: [number, number, number] = [0, 0, 0];
  const cosPhase = viewY * sunY + viewZ * sunZ;
  const phase = 0.75 * (1 + cosPhase * cosPhase);
  for (let s = 0; s < steps; s++) {
    const dist = (s + 0.5) * ds;
    const py = camY + viewY * dist;
    const pz = viewZ * dist;
    const h = Math.max(0, Math.hypot(0, py, pz) - R_EARTH);
    const rhoR = Math.exp(-h / H_RAYLEIGH);
    const rhoM = Math.exp(-h / H_MIE);
    const tSun = rayFar(0, py, pz, 0, sunY, sunZ, R_ATMO);
    const odSun = opticalDepth(0, py, pz, 0, sunY, sunZ, tSun);
    for (let c = 0; c < 3; c++) {
      const ext = (BETA_RAYLEIGH[c] * rhoR + BETA_MIE * rhoM) * ds;
      const scatter = (BETA_RAYLEIGH[c] * rhoR + BETA_MIE * rhoM * 0.8) * ds;
      light[c] += trans[c] * scatter * Math.exp(-odSun[c]) * phase;
      trans[c] *= Math.exp(-ext);
    }
  }
  return { t: trans, L: light };
}

function bakeScatter(): ScatterSample[] {
  const table: ScatterSample[] = new Array(SUN_N * VIEW_N);
  for (let s = 0; s < SUN_N; s++) {
    const sun = SUN_MIN + (s / (SUN_N - 1)) * (SUN_MAX - SUN_MIN);
    for (let v = 0; v < VIEW_N; v++) {
      const view = VIEW_MIN + (v / (VIEW_N - 1)) * (VIEW_MAX - VIEW_MIN);
      table[s * VIEW_N + v] = integrate(sun, view);
    }
  }
  const ref = lookupScatter(45, 55, table);
  const scale = 0.55 / Math.max(ref.L[2], 1e-8);
  for (const sample of table) {
    sample.L[0] *= scale;
    sample.L[1] *= scale;
    sample.L[2] *= scale;
  }
  return table;
}

function lookupScatter(sunDeg: number, viewDeg: number, table: ScatterSample[]): ScatterSample {
  const su = Math.min(SUN_N - 1, Math.max(0, ((sunDeg - SUN_MIN) / (SUN_MAX - SUN_MIN)) * (SUN_N - 1)));
  const vu = Math.min(VIEW_N - 1, Math.max(0, ((viewDeg - VIEW_MIN) / (VIEW_MAX - VIEW_MIN)) * (VIEW_N - 1)));
  const s0 = Math.floor(su);
  const v0 = Math.floor(vu);
  const s1 = Math.min(SUN_N - 1, s0 + 1);
  const v1 = Math.min(VIEW_N - 1, v0 + 1);
  const st = su - s0;
  const vt = vu - v0;
  const a = table[s0 * VIEW_N + v0];
  const b = table[s1 * VIEW_N + v0];
  const c = table[s0 * VIEW_N + v1];
  const d = table[s1 * VIEW_N + v1];
  const mix = (channel: "t" | "L", i: number) => {
    const ab = a[channel][i] + (b[channel][i] - a[channel][i]) * st;
    const cd = c[channel][i] + (d[channel][i] - c[channel][i]) * st;
    return ab + (cd - ab) * vt;
  };
  return {
    t: [mix("t", 0), mix("t", 1), mix("t", 2)],
    L: [mix("L", 0), mix("L", 1), mix("L", 2)],
  };
}

function scatterAt(sunDeg: number, viewDeg: number): ScatterSample {
  if (!scatterTable) scatterTable = bakeScatter();
  return lookupScatter(sunDeg, viewDeg, scatterTable);
}

export function computeSkyLighting(
  elevationDeg: number,
  groundAlbedo: [number, number, number] = [0.2, 0.26, 0.1],
): SkyLighting {
  const towardSun = scatterAt(elevationDeg, Math.max(elevationDeg, 0.4));
  const overhead = scatterAt(90, 90);
  const sun = new THREE.Vector3(
    towardSun.t[0] / Math.max(overhead.t[0], 1e-4),
    towardSun.t[1] / Math.max(overhead.t[1], 1e-4),
    towardSun.t[2] / Math.max(overhead.t[2], 1e-4),
  );
  sun.multiplyScalar(smoothstep(-4, 6, elevationDeg));

  const up = scatterAt(elevationDeg, 55);
  const horiz = scatterAt(elevationDeg, 2);
  const day = smoothstep(-6, 12, elevationDeg);
  const skyFloor = new THREE.Vector3(0.02, 0.025, 0.06);
  const hazeFloor = new THREE.Vector3(0.03, 0.032, 0.05);
  const sky = new THREE.Vector3(up.L[0], up.L[1], up.L[2]).lerp(skyFloor, 1 - day);
  const haze = new THREE.Vector3(horiz.L[0], horiz.L[1], horiz.L[2]).lerp(hazeFloor, 1 - day);

  const sinEl = Math.max(0, Math.sin((elevationDeg * Math.PI) / 180));
  const irradiance = sun.clone().multiplyScalar(sinEl).add(sky);
  const ground = new THREE.Vector3(
    groundAlbedo[0] * irradiance.x,
    groundAlbedo[1] * irradiance.y,
    groundAlbedo[2] * irradiance.z,
  );

  return { sun, sky, ground, haze };
}
