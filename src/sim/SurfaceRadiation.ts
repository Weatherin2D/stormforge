import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import { TFromTheta } from "./thermo";

export interface RadiationOptions {
  enabled: boolean;
  /** Degrees north positive. */
  latitudeDeg: number;
  /** Calendar month 1–12. */
  month: number;
  /** Local solar hour [0, 24). */
  solarHour: number;
  /**
   * How many solar seconds advance per physics second.
   * Radiation tendencies scale with this so day/night stays visible
   * when the clock is compressed.
   */
  diurnalSpeed: number;
}

export const DEFAULT_RADIATION: RadiationOptions = {
  enabled: true,
  latitudeDeg: 35,
  month: 6,
  solarHour: 12,
  diurnalSpeed: 15,
};

const DEG2RAD = Math.PI / 180;

/** Mid-month solar declination (radians), Cooper approx. */
export function solarDeclination(month: number): number {
  const m = Math.min(12, Math.max(1, Math.round(month)));
  // Day of year at mid-month
  const dayOfYear = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][
    m - 1
  ];
  return (
    23.45 *
    DEG2RAD *
    Math.sin(((284 + dayOfYear) / 365) * 2 * Math.PI)
  );
}

/**
 * Unit sun direction in the sim world.
 * +X east, +Y up, −Z north. y < 0 means the sun is below the horizon.
 */
export function sunDirection(
  latDeg: number,
  month: number,
  hourLocal: number,
): { x: number; y: number; z: number } {
  const phi = latDeg * DEG2RAD;
  const delta = solarDeclination(month);
  const hour = ((hourLocal % 24) + 24) % 24;
  const h = (hour - 12) * 15 * DEG2RAD;
  const sinAlt = Math.max(
    -1,
    Math.min(
      1,
      Math.sin(phi) * Math.sin(delta) +
        Math.cos(phi) * Math.cos(delta) * Math.cos(h),
    ),
  );
  const cosAlt = Math.sqrt(Math.max(0, 1 - sinAlt * sinAlt));
  const denom = Math.max(0.08, cosAlt);
  const sinAz = (-Math.sin(h) * Math.cos(delta)) / denom;
  const cosAz =
    (Math.sin(delta) * Math.cos(phi) -
      Math.cos(delta) * Math.sin(phi) * Math.cos(h)) /
    denom;
  const east = cosAlt * sinAz;
  const north = cosAlt * cosAz;
  const len = Math.hypot(east, sinAlt, north) || 1;
  return { x: east / len, y: sinAlt / len, z: -north / len };
}

/** Cosine of solar zenith angle; negative means sun below horizon. */
export function cosZenith(
  latDeg: number,
  month: number,
  hourLocal: number,
): number {
  const phi = latDeg * DEG2RAD;
  const delta = solarDeclination(month);
  // Hour angle: 0 at solar noon, ±15° per hour
  const hour = ((hourLocal % 24) + 24) % 24;
  const h = (hour - 12) * 15 * DEG2RAD;
  return (
    Math.sin(phi) * Math.sin(delta) +
    Math.cos(phi) * Math.cos(delta) * Math.cos(h)
  );
}

function hash2(i: number, j: number): number {
  let n = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const v00 = hash2(x0, y0);
  const v10 = hash2(x0 + 1, y0);
  const v01 = hash2(x0, y0 + 1);
  const v11 = hash2(x0 + 1, y0 + 1);
  const a = v00 + (v10 - v00) * sx;
  const b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sy;
}

/**
 * Smooth land-heating weights, mean near 1, about 0.55–1.45.
 * With `marine`, the southeast corner is water so a coastal boundary can form.
 * Fixed hash so a run keeps the same patches.
 */
export function buildLandMask(
  nx: number,
  ny: number,
  marine = true,
): Float32Array {
  const mask = new Float32Array(nx * ny);
  const scale = Math.max(4, Math.round(Math.min(nx, ny) / 8));
  const xDen = Math.max(1, nx - 1);
  const yDen = Math.max(1, ny - 1);
  for (let j = 0; j < ny; j++) {
    const row = j * nx;
    const y = j / scale;
    const yn = j / yDen;
    for (let i = 0; i < nx; i++) {
      const land = 0.55 + valueNoise(i / scale, y) * 0.9;
      if (!marine) {
        mask[row + i] = land;
        continue;
      }
      const xn = i / xDen;
      const water =
        Math.min(1, Math.max(0, (xn - 0.7) / 0.1)) *
        Math.min(1, Math.max(0, (0.3 - yn) / 0.1));
      mask[row + i] = land * (1 - water) + 0.08 * water;
    }
  }
  return mask;
}

export function formatSolarClock(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export interface SolarStatus {
  cosZ: number;
  isDay: boolean;
  sunFrac: number;
  clock: string;
  label: string;
}

export function solarStatus(opts: RadiationOptions): SolarStatus {
  const cosZ = cosZenith(opts.latitudeDeg, opts.month, opts.solarHour);
  const sunFrac = Math.max(0, cosZ);
  const isDay = sunFrac > 0.02;
  return {
    cosZ,
    isDay,
    sunFrac,
    clock: formatSolarClock(opts.solarHour),
    label: isDay ? "day" : "night",
  };
}

/**
 * Near-surface shortwave heating + IR cooling.
 * Updates potential temperature on the lowest few levels.
 *
 * Tendencies are scaled by diurnalSpeed so a compressed sandbox day still
 * produces several K of surface warming / night cooling.
 */
export function applySurfaceRadiation(
  grid: Grid3D,
  fields: SimFields,
  dt: number,
  opts: RadiationOptions,
  landMask?: Float32Array,
): void {
  if (!opts.enabled || dt <= 0) return;

  const { nx, ny, nz } = grid;
  const cosZ = cosZenith(opts.latitudeDeg, opts.month, opts.solarHour);
  const sun = Math.max(0, cosZ);

  // Pace with the compressed clock (min 1× so paused-clock noon still heats)
  const pace = Math.max(1, opts.diurnalSpeed);

  // Peak SW ~3.2 K per solar-hour at overhead sun → visible over a short day
  const swHeatKs = ((3.2 * pace) / 3600) * sun;
  // IR always on; night net cool ~1.4 K per solar-hour near ground
  const lwBaseKs = (1.4 * pace) / 3600;

  // Lowest ~4 levels, weight by level index (works for coarse or fine Δz)
  const kMax = Math.min(nz - 1, 4);

  const useMask = landMask !== undefined && landMask.length >= nx * ny;

  for (let k = 0; k < kMax; k++) {
    const wgt = Math.exp(-k / 1.15);
    if (wgt < 0.08) continue;

    const th0 = fields.theta0[k];
    const p0 = fields.p0[k];

    for (let j = 0; j < ny; j++) {
      const row = j * nx;
      for (let i = 0; i < nx; i++) {
        const id = grid.idx(i, j, k);
        const th = fields.theta[id];
        const T = TFromTheta(th, p0);
        const lw =
          lwBaseKs * (0.85 + 0.15 * Math.max(0, (T - 275) / 40));
        const land = useMask ? landMask![row + i] : 1;
        // Day: land-weighted SW − LW; night: −LW (no land contrast)
        const dTh = (swHeatKs * land - lw) * wgt * dt;
        const next = th + dTh;
        const floor = th0 - 9;
        const ceil = th0 + 11;
        fields.theta[id] = Math.max(floor, Math.min(ceil, next));
      }
    }
  }
}

/** Advance local solar hour from physics dt and diurnal speed. */
export function advanceSolarHour(
  hour: number,
  physicsDt: number,
  diurnalSpeed: number,
): number {
  const dh = (physicsDt * diurnalSpeed) / 3600;
  return ((hour + dh) % 24 + 24) % 24;
}
