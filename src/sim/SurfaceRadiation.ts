import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import { TFromTheta, qsat } from "./thermo";
import { getAdvanced } from "./AdvancedSettings";

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

/** Optional terrain / cover used to shape the surface energy balance. */
export interface SurfaceRadContext {
  /** Column terrain height (m), length nx·ny. */
  height?: Float32Array | null;
  /** First open level index per column. */
  openK?: Uint16Array | null;
  soil?: Float32Array | null;
  veg?: Float32Array | null;
  /** 0 land, 1 lake, 2 ocean. */
  kind?: Float32Array | null;
  dx?: number;
  dy?: number;
}

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
  water?: ArrayLike<number> | null,
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
      const painted = water && water.length === nx * ny ? water[row + i] : -1;
      if (painted >= 0) {
        const wet = painted < 0 ? 0 : painted > 1 ? 1 : painted;
        mask[row + i] = land * (1 - wet) + 0.08 * wet;
        continue;
      }
      if (!marine) {
        mask[row + i] = land;
        continue;
      }
      const xn = i / xDen;
      const sea =
        Math.min(1, Math.max(0, (xn - 0.7) / 0.1)) *
        Math.min(1, Math.max(0, (0.3 - yn) / 0.1));
      mask[row + i] = land * (1 - sea) + 0.08 * sea;
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
 * Near-surface shortwave heating + IR cooling with a simple surface energy
 * balance: slope/aspect insolation, land/water contrast, and soil/veg Bowen
 * partitioning into sensible vs latent. Heat starts at each column's open
 * terrain level so buried cells under hills stay inert.
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
  ctx?: SurfaceRadContext | null,
): void {
  if (!opts.enabled || dt <= 0) return;

  const { nx, ny, nz, dx, dy } = grid;
  const adv = getAdvanced();
  const cosZ = cosZenith(opts.latitudeDeg, opts.month, opts.solarHour);
  const sunFlat = Math.max(0, cosZ);
  // Soft optical path: low sun still heats, but less than Lambert flat.
  const airMass = sunFlat / (sunFlat + Math.max(0.02, adv.airMassSoft));
  const sun = sunDirection(opts.latitudeDeg, opts.month, opts.solarHour);

  const pace = Math.max(1, opts.diurnalSpeed) * Math.max(0.2, adv.radiationPace);
  // Peak SW ~3.6 K per solar-hour at overhead sun on dry land.
  const swPeakKs = ((3.6 * pace) / 3600) * adv.swHeating;
  // IR always on; night net cool ~1.6 K per solar-hour over land.
  const night = sunFlat < 0.05 ? adv.nightCoolBoost : 1;
  const lwLandKs = ((1.6 * pace) / 3600) * adv.lwLandCooling * night;
  const lwWaterKs = ((0.55 * pace) / 3600) * adv.lwWaterCooling * night;

  const useMask = landMask !== undefined && landMask.length >= nx * ny;
  const height = ctx?.height && ctx.height.length >= nx * ny ? ctx.height : null;
  const openK = ctx?.openK && ctx.openK.length >= nx * ny ? ctx.openK : null;
  const soil = ctx?.soil && ctx.soil.length >= nx * ny ? ctx.soil : null;
  const veg = ctx?.veg && ctx.veg.length >= nx * ny ? ctx.veg : null;
  const kind = ctx?.kind && ctx.kind.length >= nx * ny ? ctx.kind : null;
  const ddx = ctx?.dx ?? dx;
  const ddy = ctx?.dy ?? dy;

  const kSpan = Math.min(nz - 1, 6);

  for (let j = 0; j < ny; j++) {
    const row = j * nx;
    for (let i = 0; i < nx; i++) {
      const s = row + i;
      const k0 = openK ? Math.min(nz - 1, openK[s] | 0) : 0;
      const land = useMask ? landMask![s] : 1;
      const isWater = kind ? kind[s] >= 0.5 : land < 0.2;
      const soilM = soil && !isWater ? Math.min(1, Math.max(0, soil[s])) : 0;
      const vegM = veg && !isWater ? Math.min(1, Math.max(0, veg[s])) : 0;

      // Slope / aspect: sun · terrain normal (Y-up). Flat → sun.y ≈ cosZ.
      let slopeSun = sunFlat;
      if (height && sunFlat > 0.01) {
        const h = (ii: number, jj: number) =>
          height[
            Math.max(0, Math.min(nx - 1, ii)) +
              nx * Math.max(0, Math.min(ny - 1, jj))
          ];
        const dhdx = (h(i + 1, j) - h(i - 1, j)) / (2 * Math.max(1, ddx));
        const dhdy = (h(i, j + 1) - h(i, j - 1)) / (2 * Math.max(1, ddy));
        // Outward normal of z = h(x,z_north): n ~ (-dhdx, 1, dhdy) in (+X,+Y,−Z) with j north.
        const nx_ = -dhdx;
        const ny_ = 1;
        const nz_ = dhdy;
        const nlen = Math.hypot(nx_, ny_, nz_) || 1;
        const aspect = Math.max(
          0,
          (sun.x * nx_ + sun.y * ny_ + sun.z * nz_) / nlen,
        );
        slopeSun =
          sunFlat * (1 - Math.min(1, adv.slopeAspectGain)) +
          aspect * Math.min(1, adv.slopeAspectGain);
      }

      // Bowen-like split: moist / vegetated land evaporates → less sensible heat.
      const evaporative = Math.min(
        0.95,
        (isWater
          ? 0.85
          : Math.min(0.9, 0.15 + 0.55 * soilM + 0.35 * vegM)) *
          (isWater ? adv.evaporativeWater : adv.evaporativeLand),
      );
      const sensibleFrac = 1 - evaporative;
      const albedo = isWater
        ? adv.waterAlbedo
        : adv.landAlbedo + 0.1 * vegM;
      const swAbs =
        swPeakKs * slopeSun * airMass * (1 - albedo) * (isWater ? 0.35 : land);

      const Tsurf = TFromTheta(
        fields.theta[grid.idx(i, j, k0)],
        fields.p0[k0],
      );
      const lwRate = isWater ? lwWaterKs : lwLandKs;
      const lw =
        lwRate *
        (0.8 + 0.2 * Math.max(0, (Tsurf - 273) / 40)) *
        (isWater ? 1 : Math.max(0.35, land));

      const sensKs = swAbs * sensibleFrac - lw;
      // Latent: raise qv toward a land/water target instead of dumping into θ.
      const latFrac = swAbs * evaporative;
      const depthSpan = Math.max(
        2,
        Math.round(kSpan * Math.max(0.4, adv.heatDepth)),
      );

      for (let dk = 0; dk < depthSpan; dk++) {
        const k = k0 + dk;
        if (k >= nz) break;
        const wgt = Math.exp(-dk / (1.35 * Math.max(0.5, adv.heatDepth)));
        if (wgt < 0.07) continue;
        const id = grid.idx(i, j, k);
        const th0 = fields.theta0[k];
        const p0 = fields.p0[k];
        const next = fields.theta[id] + sensKs * wgt * dt;
        fields.theta[id] = Math.max(th0 - 10, Math.min(th0 + 12, next));

        if (latFrac > 1e-8 && dk < 3) {
          const tNow = TFromTheta(fields.theta[id], p0);
          const qTarget =
            qsat(tNow, p0) * (isWater ? 0.98 : 0.75 + 0.2 * soilM);
          const moistRate = ((latFrac * 0.35) / 3600) * wgt * dt;
          // Convert a soft “evaporative heating share” into a qv nudge.
          const add = (qTarget - fields.qv[id]) * Math.min(0.08, moistRate * 40);
          if (add > 0) fields.qv[id] += add;
        }
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
