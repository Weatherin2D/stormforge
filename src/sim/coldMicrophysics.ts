/**
 * Cold microphysics: cloud ice, snow, graupel and hail.
 *
 * Ported from the MeteoLAB three-ice scheme (Lin, Farley & Orville 1983,
 * with Cooper 1986 nucleation, Koenig 1971 crystal growth, Hallett &
 * Mossop 1974 rime splintering and Bigg 1953 raindrop freezing), rewritten
 * for Stormforge's SI grid and field layout.
 *
 * Ordering mirrors MeteoLAB:
 *   warm rain → freeze rain → ice nucleation/deposition → snow →
 *   graupel → hail → secondary ice → mixed saturation adjustment.
 *
 * `qc` stays cloud *liquid*; `qi`, `qs`, `qg`, `qh` are the cold species and
 * `ni` carries the cloud-ice crystal number (per kg of air).
 */

import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import { CP, LV, RV, esatFast, mixingRatio } from "./thermo";

export const LF = 3.34e5;
export const LS = LV + LF;
const T0 = 273.15;
const T_HOMOGENEOUS = 235.15;
const CW = 4187;

const NUCLEATION_START = -5;
const MAX_NUCLEATED = 250e3;
const CRYSTAL_MASS = 1e-12;
const MAX_CRYSTAL_MASS = 9.4e-10;
const RHO_I = 900;
const DROPLET_MASS = (Math.PI / 6) * 1000 * 20e-6 ** 3;

/** Rime splinters per kg of rimed water (Hallett & Mossop). */
const SPLINTERS = 3.5e8;
function splintering(tc: number): number {
  return tc >= -3 || tc <= -8 ? 0 : tc > -5 ? (-3 - tc) / 2 : (tc + 8) / 3;
}

const KA = 2.43e-2;
const PSI = 2.26e-5;
const NU = 1.51e-5;
const SC = 0.6;

export const N0S = 3e6;
export const RHO_S = 100;
const C_S = 152.93 * 0.01 ** 0.75;
const D_S = 0.25;
const GAMMA_3D = 2.5493;
const GAMMA_4D = 8.285;
const GAMMA_5D2 = 1.8712;
const ICE_AUTOCONVERSION_THRESHOLD = 0.001;

export const N0G = 4e4;
export const RHO_G = 400;
const CD = 0.6;
export const N0R = 8e6;
export const RHO_W = 1000;
const BIGG_B = 100;
const BIGG_A = 0.66;
const GAMMA_45 = 11.6317;
const GAMMA_35 = 3.3234;
const GAMMA_275 = 1.6084;
const SNOW_TO_GRAUPEL_THRESHOLD = 6e-4;

export const N0H = 4e4;
export const RHO_H = 900;
const CI = 2106;
const HAIL_CONVERSION_TIME = 60;
const HAIL_SAMPLE_VOLUME = 10;

/** Saturation mixing ratio over ice. `tc` in °C, `p` in Pa. */
export function qsatIce(tc: number, p: number): number {
  if (tc >= 0) return qsatLiquid(tc, p);
  const es = 611.21 * Math.exp((22.587 * tc) / (tc + 273.86));
  return Math.min(0.045, Math.max(0, (0.622 * es) / Math.max(1000, p - es)));
}

function qsatLiquid(tc: number, p: number): number {
  return mixingRatio(esatFast(tc + T0), p);
}

/** Crystals per m³ from Cooper (1986), capped at 250 L⁻¹. */
export function cooperCrystals(tc: number): number {
  return tc >= NUCLEATION_START
    ? 0
    : Math.min(MAX_NUCLEATED, 5 * Math.exp(0.304 * -tc));
}

/** Mean cloud-ice crystal diameter, m (solid spheres). */
export function crystalSize(qi: number, n: number, rho: number): number {
  return Math.cbrt((6 * rho * qi) / (Math.PI * RHO_I * n));
}

const KOENIG_A1 = [
  0.7939e-7, 0.7841e-6, 0.3369e-5, 0.4336e-5, 0.5285e-5, 0.3728e-5,
  0.1852e-5, 0.2991e-6, 0.4248e-6, 0.7434e-6, 0.1812e-5, 0.4394e-5,
  0.9145e-5, 0.1725e-4, 0.3348e-4, 0.1725e-4, 0.9175e-5, 0.4412e-5,
  0.2252e-5, 0.9115e-6, 0.4876e-6, 0.3473e-6, 0.4758e-6, 0.6306e-6,
  0.8573e-6, 0.7868e-6, 0.7192e-6, 0.6513e-6, 0.5956e-6, 0.5333e-6,
  0.4834e-6,
];
const KOENIG_A2 = [
  0.4006, 0.4831, 0.532, 0.5307, 0.5319, 0.5249, 0.4888, 0.3894, 0.4047,
  0.4318, 0.4771, 0.5183, 0.5463, 0.5651, 0.5813, 0.5655, 0.5478, 0.5203,
  0.4906, 0.4447, 0.4126, 0.396, 0.4149, 0.432, 0.4506, 0.4483, 0.446,
  0.4433, 0.4413, 0.4382, 0.4361,
];

/** Growth of one crystal at water saturation, kg/s (Koenig 1971). */
export function koenigGrowth(tc: number, m: number): number {
  const x = Math.min(31, Math.max(1, -tc)) - 1;
  const k = Math.min(29, Math.floor(x));
  const f = x - k;
  const g = m * 1000;
  return (
    1e-3 *
    ((1 - f) * KOENIG_A1[k] * g ** KOENIG_A2[k] +
      f * KOENIG_A1[k + 1] * g ** KOENIG_A2[k + 1])
  );
}

function snowSlope(snow: number, rho: number): number {
  return (Math.PI * RHO_S * N0S / (rho * snow)) ** 0.25;
}

/** Mass-weighted snow fall speed, m/s. */
export function snowFallSpeed(
  snow: number,
  rho: number,
  rhoGround: number,
): number {
  if (!(snow > 1e-9)) return 0;
  return (
    (C_S * GAMMA_4D) / 6 *
    snowSlope(snow, rho) ** -D_S *
    Math.sqrt(rhoGround / rho)
  );
}

function graupelSlope(graupel: number, rho: number): number {
  return (Math.PI * RHO_G * N0G / (rho * graupel)) ** 0.25;
}

function fallCoefficient(rho: number, rhoX: number): number {
  return Math.sqrt((4 * 9.81 * rhoX) / (3 * CD * rho));
}

export function graupelFallSpeed(graupel: number, rho: number): number {
  if (!(graupel > 1e-9)) return 0;
  return (
    (fallCoefficient(rho, RHO_G) * GAMMA_45) / 6 *
    graupelSlope(graupel, rho) ** -0.5
  );
}

const hailSlope = (hail: number, rho: number): number =>
  (Math.PI * RHO_H * N0H / (rho * hail)) ** 0.25;

export function hailFallSpeed(hail: number, rho: number): number {
  if (!(hail > 1e-9)) return 0;
  return (
    (fallCoefficient(rho, RHO_H) * GAMMA_45) / 6 *
    hailSlope(hail, rho) ** -0.5
  );
}

/** Diameter of the largest hailstone, m. */
export function hailMaxDiameter(hail: number, rho: number): number {
  if (!(hail > 1e-9)) return 0;
  const lambda = hailSlope(hail, rho);
  return Math.max(0, Math.log((N0H * HAIL_SAMPLE_VOLUME) / lambda) / lambda);
}

/** Total hail number concentration, m⁻³. */
export function hailConcentration(hail: number, rho: number): number {
  if (!(hail > 1e-9)) return 0;
  return N0H / hailSlope(hail, rho);
}

/**
 * Rain below −38 °C freezes at once into graupel (homogeneous freezing).
 * Warmer rain freezes through Bigg's law in `graupelProcesses`.
 */
function freezeRain(
  theta: Float32Array,
  rain: Float32Array,
  graupel: Float32Array,
  i: number,
  exner: number,
): void {
  const r = rain[i];
  if (r <= 0 || theta[i] * exner >= T_HOMOGENEOUS) return;
  rain[i] = 0;
  graupel[i] += r;
  theta[i] += (LF / (CP * exner)) * r;
}

function settleCrystals(
  ice: Float32Array,
  number: Float32Array,
  i: number,
): void {
  const qi = ice[i];
  number[i] =
    qi > 1e-12
      ? Math.min(qi / CRYSTAL_MASS, Math.max(qi / MAX_CRYSTAL_MASS, number[i]))
      : 0;
}

/**
 * Cloud ice between 0 and −38 °C: nucleation, deposition/sublimation at the
 * droplets' expense, and conversion of the largest crystals to snow.
 */
function iceProcesses(
  theta: Float32Array,
  qv: Float32Array,
  ice: Float32Array,
  snow: Float32Array,
  number: Float32Array,
  i: number,
  exner: number,
  p: number,
  rho: number,
  dt: number,
): void {
  const tk = theta[i] * exner;
  const tc = tk - T0;
  if (tc >= 0 || tk < T_HOMOGENEOUS) return;
  const qsi = qsatIce(tc, p);
  const limit =
    (qv[i] - qsi) / (1 + (LS * LS * qsi) / (CP * RV * tk * tk));
  const heat = LS / (CP * exner);
  const lacking = cooperCrystals(tc) / rho - number[i];
  let change = 0;

  if (limit > 0 && lacking > 0) {
    change = Math.min(limit, lacking * CRYSTAL_MASS);
    number[i] += change / CRYSTAL_MASS;
  }

  const qi = ice[i] + change;
  const n = number[i];
  if (qi > 1e-12 && n > 0) {
    if (qv[i] > qsi) {
      const denom = Math.max(1e-8, qsatLiquid(tc, p) - qsi);
      const grow =
        n * koenigGrowth(tc, qi / n) * ((qv[i] - qsi) / denom) * dt;
      change += Math.max(0, Math.min(grow, limit - change));
    } else {
      const a = (LS * LS) / (KA * RV * tk * tk);
      const b = 1 / (rho * qsi * PSI);
      const lost = Math.min(
        qi,
        ((n * 2 * Math.PI * crystalSize(qi, n * rho, rho) * (1 - qv[i] / qsi)) /
          (a + b)) *
          dt,
      );
      change -= lost;
      number[i] *= 1 - lost / qi;
    }
  }

  ice[i] = Math.max(0, ice[i] + change);
  qv[i] = Math.max(0, qv[i] - change);
  theta[i] += heat * change;

  const excess = ice[i] - number[i] * MAX_CRYSTAL_MASS;
  if (excess > 0) {
    ice[i] -= excess;
    snow[i] += excess;
  }
}

/**
 * Snow: aggregation of cloud ice, riming of cloud water, deposition and
 * sublimation, and melting into rain above 0 °C.
 */
function snowProcesses(
  theta: Float32Array,
  qv: Float32Array,
  cloud: Float32Array,
  ice: Float32Array,
  snow: Float32Array,
  rain: Float32Array,
  i: number,
  exner: number,
  p: number,
  rho: number,
  rhoGround: number,
  dt: number,
): number {
  const tk = theta[i] * exner;
  const tc = tk - T0;
  if (tc < 0 && ice[i] > 0) {
    const auto =
      1e-3 *
      Math.exp(0.025 * tc) *
      Math.max(0, ice[i] - ICE_AUTOCONVERSION_THRESHOLD);
    const moved = Math.min(ice[i], auto * dt);
    ice[i] -= moved;
    snow[i] += moved;
  }
  if (snow[i] <= 1e-9) return 0;

  const lambda = snowSlope(snow[i], rho);
  const fall = Math.sqrt(rhoGround / rho);
  const sweep =
    ((Math.PI * N0S * C_S * GAMMA_3D) / (4 * lambda ** (3 + D_S))) * fall;
  const vent =
    N0S *
    (0.78 / (lambda * lambda) +
      ((0.31 * SC ** (1 / 3) * GAMMA_5D2 * Math.sqrt(C_S) * fall ** 0.5) /
        Math.sqrt(NU)) *
        lambda ** (-(D_S + 5) / 2));
  let cooling = 0;

  if (tc < 0) {
    const saci = Math.min(
      ice[i],
      sweep * Math.exp(0.025 * tc) * ice[i] * dt,
    );
    ice[i] -= saci;
    snow[i] += saci;
    const sacw = Math.min(cloud[i], sweep * cloud[i] * dt);
    cloud[i] -= sacw;
    snow[i] += sacw;
    theta[i] += (LF / (CP * exner)) * sacw;

    const qsi = qsatIce(tc, p);
    const a = (LS * LS) / (KA * RV * tk * tk);
    const b = 1 / (rho * qsi * PSI);
    const rate = (2 * Math.PI * (qv[i] / qsi - 1) * vent) / (rho * (a + b));
    const dep =
      rate > 0
        ? Math.min(
            rate * dt,
            (qv[i] - qsi) / (1 + (LS * LS * qsi) / (CP * RV * tk * tk)),
          )
        : -Math.min(snow[i], -rate * dt);
    snow[i] = Math.max(0, snow[i] + dep);
    qv[i] = Math.max(0, qv[i] - dep);
    theta[i] += (LS / (CP * exner)) * dep;
    if (dep < 0) cooling -= (LS / (CP * exner)) * dep;
  } else {
    const sacw = Math.min(cloud[i], sweep * cloud[i] * dt);
    cloud[i] -= sacw;
    rain[i] += sacw;
    const rate =
      (2 * Math.PI * KA * tc * vent) / (rho * LF) +
      ((CW * tc) / LF) * sweep * cloud[i];
    const melt = Math.min(snow[i], rate * dt, (CP * tc) / LF);
    snow[i] -= melt;
    rain[i] += melt;
    theta[i] -= (LF / (CP * exner)) * melt;
    cooling += (LF / (CP * exner)) * melt;
  }
  return cooling;
}

/** Graupel: rain freezing, riming, collection and melting. */
function graupelProcesses(
  theta: Float32Array,
  qv: Float32Array,
  cloud: Float32Array,
  ice: Float32Array,
  snow: Float32Array,
  rain: Float32Array,
  graupel: Float32Array,
  i: number,
  exner: number,
  p: number,
  rho: number,
  dt: number,
): number {
  const tk = theta[i] * exner;
  const tc = tk - T0;
  const heat = 1 / (CP * exner);
  let cooling = 0;

  if (tc < 0) {
    if (rain[i] > 1e-9) {
      const lambdaR = (Math.PI * RHO_W * N0R / (rho * rain[i])) ** 0.25;
      const rate =
        ((20 * Math.PI * Math.PI * BIGG_B * N0R * RHO_W) / rho) *
        ((Math.exp(-BIGG_A * tc) - 1) / lambdaR ** 7);
      const frozen = Math.min(rain[i], Math.max(0, rate) * dt);
      rain[i] -= frozen;
      graupel[i] += frozen;
      theta[i] += LF * heat * frozen;
    }
    const auto = Math.min(
      snow[i],
      1e-3 *
        Math.exp(0.09 * tc) *
        Math.max(0, snow[i] - SNOW_TO_GRAUPEL_THRESHOLD) *
        dt,
    );
    snow[i] -= auto;
    graupel[i] += auto;
  }
  const qg = graupel[i];
  if (qg <= 1e-9) return 0;

  const lambda = graupelSlope(qg, rho);
  const a = fallCoefficient(rho, RHO_G);
  const sweep = ((Math.PI * N0G * a * GAMMA_35) / (4 * lambda ** 3.5));
  const vent =
    N0G *
    (0.78 / (lambda * lambda) +
      ((0.31 * SC ** (1 / 3) * GAMMA_275 * Math.sqrt(a / NU)) /
        lambda ** 2.75));

  if (tc < 0) {
    const gacw = Math.min(cloud[i], sweep * cloud[i] * dt);
    const gacr = Math.min(rain[i], sweep * rain[i] * dt);
    const gaci = Math.min(ice[i], sweep * 0.1 * ice[i] * dt);
    const gacs = Math.min(
      snow[i],
      sweep * Math.exp(0.09 * tc) * snow[i] * dt,
    );
    cloud[i] -= gacw;
    rain[i] -= gacr;
    ice[i] -= gaci;
    snow[i] -= gacs;
    graupel[i] += gacw + gacr + gaci + gacs;
    theta[i] += LF * heat * (gacw + gacr);

    const qsi = qsatIce(tc, p);
    if (qv[i] < qsi) {
      const aa = (LS * LS) / (KA * RV * tk * tk);
      const b = 1 / (rho * qsi * PSI);
      const sub = Math.min(
        graupel[i],
        ((2 * Math.PI * (1 - qv[i] / qsi) * vent) / (rho * (aa + b))) * dt,
        (qsi - qv[i]) / (1 + (LS * LS * qsi) / (CP * RV * tk * tk)),
      );
      graupel[i] -= sub;
      qv[i] += sub;
      theta[i] -= LS * heat * sub;
      cooling += LS * heat * sub;
    }
  } else {
    const gacw = Math.min(cloud[i], sweep * cloud[i] * dt);
    cloud[i] -= gacw;
    rain[i] += gacw;
    const rate =
      (2 * Math.PI * KA * tc * vent) / (rho * LF) +
      ((CW * tc) / LF) * sweep * (cloud[i] + rain[i]);
    const melt = Math.min(graupel[i], rate * dt, (CP * tc) / LF);
    graupel[i] -= melt;
    rain[i] += melt;
    theta[i] -= LF * heat * melt;
    cooling += LF * heat * melt;
  }
  return cooling;
}

/** Sweep-out kernel and ventilated diffusion factor for a rimer class. */
function rimerKernels(
  q: number,
  rho: number,
  n0: number,
  rhoX: number,
): { lambda: number; a: number; sweep: number; vent: number } {
  const lambda = (Math.PI * rhoX * n0 / (rho * q)) ** 0.25;
  const a = fallCoefficient(rho, rhoX);
  const sweep = ((Math.PI * n0 * a * GAMMA_35) / (4 * lambda ** 3.5));
  const vent =
    n0 *
    (0.78 / (lambda * lambda) +
      ((0.31 * SC ** (1 / 3) * GAMMA_275 * Math.sqrt(a / NU)) /
        lambda ** 2.75));
  return { lambda, a, sweep, vent };
}

function wetGrowing(
  q: number,
  n0: number,
  rhoX: number,
  tc: number,
  qv: number,
  p: number,
  rho: number,
  cloud: number,
  rain: number,
  ice: number,
  snow: number,
): boolean {
  if (tc >= 0 || q <= 1e-9) return false;
  const { sweep, vent } = rimerKernels(q, rho, n0, rhoX);
  const heat = KA * -tc + LV * PSI * rho * (qsatLiquid(0, p) - qv);
  const freezeCapacity = Math.max(
    0,
    (2 * Math.PI * vent * heat) / (rho * (LF + CW * tc)),
  );
  const iceRate = sweep * (ice + snow);
  const capacity =
    freezeCapacity +
    iceRate * (1 - (CI * tc) / (LF + CW * tc));
  const collected =
    sweep * (cloud + rain + 0.1 * ice + Math.exp(0.09 * tc) * snow);
  return collected > capacity;
}

/** Hail: wet-growth conversion from graupel and its own growth/melting. */
function hailProcesses(
  theta: Float32Array,
  qv: Float32Array,
  cloud: Float32Array,
  ice: Float32Array,
  snow: Float32Array,
  rain: Float32Array,
  graupel: Float32Array,
  hail: Float32Array,
  i: number,
  exner: number,
  p: number,
  rho: number,
  dt: number,
): number {
  const tk = theta[i] * exner;
  const tc = tk - T0;
  const heat = 1 / (CP * exner);
  let cooling = 0;

  if (
    wetGrowing(
      graupel[i],
      N0G,
      RHO_G,
      tc,
      qv[i],
      p,
      rho,
      cloud[i],
      rain[i],
      ice[i],
      snow[i],
    )
  ) {
    const turned = graupel[i] * (1 - Math.exp(-dt / HAIL_CONVERSION_TIME));
    graupel[i] -= turned;
    hail[i] += turned;
  }
  const qh = hail[i];
  if (qh <= 1e-9) return 0;

  const { sweep, vent } = rimerKernels(qh, rho, N0H, RHO_H);

  if (tc < 0) {
    const hacw = Math.min(cloud[i], sweep * cloud[i] * dt);
    const hacr = Math.min(rain[i], sweep * rain[i] * dt);
    const liquid = hacw + hacr;
    let haci = Math.min(ice[i], sweep * 0.1 * ice[i] * dt);
    let hacs = Math.min(
      snow[i],
      sweep * Math.exp(0.09 * tc) * snow[i] * dt,
    );
    const heatCapacity = KA * -tc + LV * PSI * rho * (qsatLiquid(0, p) - qv[i]);
    const freezeCapacity = Math.max(
      0,
      (2 * Math.PI * vent * heatCapacity) / (rho * (LF + CW * tc)),
    );
    const iceRate = sweep * (ice[i] + snow[i]);
    const wet =
      (freezeCapacity +
        iceRate * (1 - (CI * tc) / (LF + CW * tc))) *
      dt;
    let frozen = liquid;
    if (liquid + haci + hacs > wet) {
      haci = Math.min(ice[i], sweep * ice[i] * dt);
      hacs = Math.min(snow[i], sweep * snow[i] * dt);
      frozen = Math.min(liquid, Math.max(0, wet - haci - hacs));
    }
    cloud[i] -= hacw;
    rain[i] += liquid - frozen - hacr;
    ice[i] -= haci;
    snow[i] -= hacs;
    hail[i] += frozen + haci + hacs;
    theta[i] += LF * heat * frozen;

    const qsi = qsatIce(tc, p);
    if (qv[i] < qsi) {
      const aa = (LS * LS) / (KA * RV * tk * tk);
      const b = 1 / (rho * qsi * PSI);
      const sub = Math.min(
        hail[i],
        ((2 * Math.PI * (1 - qv[i] / qsi) * vent) / (rho * (aa + b))) * dt,
        (qsi - qv[i]) / (1 + (LS * LS * qsi) / (CP * RV * tk * tk)),
      );
      hail[i] -= sub;
      qv[i] += sub;
      theta[i] -= LS * heat * sub;
      cooling += LS * heat * sub;
    }
  } else {
    const hacw = Math.min(cloud[i], sweep * cloud[i] * dt);
    cloud[i] -= hacw;
    rain[i] += hacw;
    const rate =
      (2 * Math.PI * KA * tc * vent) / (rho * LF) +
      ((CW * tc) / LF) * sweep * (cloud[i] + rain[i]);
    const melt = Math.min(hail[i], rate * dt, (CP * tc) / LF);
    hail[i] -= melt;
    rain[i] += melt;
    theta[i] -= LF * heat * melt;
    cooling += LF * heat * melt;
  }
  return cooling;
}

/**
 * Saturation adjustment for the mixed phase. Above 0 °C cloud ice melts
 * into cloud water; below −38 °C droplets freeze at once and vapour is held
 * at ice saturation. Between the two, the warm scheme keeps the vapour at
 * water saturation and the ice processes exchange vapour with the crystals.
 */
function saturationAdjustMixed(
  theta: Float32Array,
  qv: Float32Array,
  cloud: Float32Array,
  ice: Float32Array,
  number: Float32Array,
  i: number,
  exner: number,
  p: number,
): void {
  const heat = LF / (CP * exner);
  const tk = theta[i] * exner;
  if (tk >= T_HOMOGENEOUS) {
    if (ice[i] > 0 && tk > T0) {
      const melt = Math.min(ice[i], ((tk - T0) * CP) / LF);
      number[i] *= 1 - melt / ice[i];
      ice[i] -= melt;
      cloud[i] += melt;
      theta[i] -= heat * melt;
    }
    return;
  }
  if (cloud[i] > 0) {
    number[i] += cloud[i] / DROPLET_MASS;
    ice[i] += cloud[i];
    theta[i] += heat * cloud[i];
    cloud[i] = 0;
  }
  for (let pass = 0; pass < 2; pass++) {
    const t = theta[i] * exner;
    const qsi = qsatIce(t - T0, p);
    let d = (qv[i] - qsi) / (1 + (LS * LS * qsi) / (CP * RV * t * t));
    if (d < 0) d = Math.max(d, -ice[i]);
    if (d === 0) break;
    qv[i] -= d;
    ice[i] += d;
    theta[i] += (LS / (CP * exner)) * d;
  }
}

/** Fall speed of a cloud-ice crystal, m/s (small, so a constant is enough). */
const ICE_FALL_SPEED = 0.15;

/**
 * Move one species down one substep. Returns nothing; surface loss goes to
 * `accum` in mm liquid equivalent.
 */
function sediment(
  grid: Grid3D,
  f: SimFields,
  field: Float32Array,
  scratch: Float32Array,
  dt: number,
  accum: Float32Array | null,
  speed: (value: number, rho: number) => number,
): void {
  const { nx, ny, nz, dz } = grid;
  const nxny = nx * ny;
  scratch.fill(0);
  for (let k = 0; k < nz; k++) {
    const rho = f.rho0[k];
    const kBase = k * nxny;
    for (let j = 0; j < ny; j++) {
      const jBase = kBase + j * nx;
      for (let i = 0; i < nx; i++) {
        const id = jBase + i;
        const remain = field[id];
        if (remain <= 0) continue;
        const cells = Math.min(2, (speed(remain, rho) * dt) / Math.max(dz, 1));
        if (cells <= 0) {
          scratch[id] += remain;
          continue;
        }
        const kDest = k - cells;
        if (kDest <= 0) {
          if (accum) {
            const mm = remain * rho * dz;
            const ij = i + j * nx;
            accum[ij] += mm;
            if (dt > 0) f.precipRate[ij] += (mm / dt) * 3600;
          }
          continue;
        }
        const k0 = Math.floor(kDest);
        const k1 = Math.min(nz - 1, k0 + 1);
        const fz = kDest - k0;
        const ij = i + j * nx;
        scratch[ij + k0 * nxny] += remain * (1 - fz);
        if (k1 !== k0) scratch[ij + k1 * nxny] += remain * fz;
      }
    }
  }
  field.set(scratch);
}

/** Extra crystals made by rime splintering and shattering raindrops. */
function secondaryIce(
  f: SimFields,
  i: number,
  tc: number,
  cloudFrozen: number,
  rainBefore: number,
  rainFrozen: number,
  rho: number,
): void {
  const fragmentsPerKg =
    rainBefore > 1e-12
      ? (2.5e13 * 7) /
        (((Math.PI * RHO_W * N0R) / (rho * rainBefore)) ** 0.25 *
          1000 *
          Math.PI /
          6)
      : 0;
  const splinters =
    splintering(tc) * SPLINTERS * Math.max(0, cloudFrozen) +
    fragmentsPerKg * rainFrozen;
  if (!(splinters > 0)) return;
  const mass = splinters * CRYSTAL_MASS;
  const fromG = Math.min(f.qg[i], mass);
  const fromS = Math.min(f.qs[i], mass - fromG);
  f.qg[i] -= fromG;
  f.qs[i] -= fromS;
  f.qi[i] += fromG + fromS;
  f.ni[i] += (fromG + fromS) / CRYSTAL_MASS;
}

/**
 * One cold-microphysics substep on the whole grid.
 *
 * `scratch` must be at least nx·ny·nz and is used for sedimentation.
 */
export function stepColdMicrophysics(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  exner: Float32Array,
  scratch: Float32Array,
): void {
  const { nx, ny, nz } = grid;
  const nxny = nx * ny;
  const rhoGround = f.rho0[0];

  for (let k = 0; k < nz; k++) {
    const p = f.p0[k];
    const ex = exner[k];
    const rho = f.rho0[k];
    const kBase = k * nxny;
    for (let j = 0; j < ny; j++) {
      const jBase = kBase + j * nx;
      for (let i = 0; i < nx; i++) {
        const id = jBase + i;

        freezeRain(f.theta, f.qr, f.qg, id, ex);
        settleCrystals(f.qi, f.ni, id);

        const cloudBefore = f.qc[id];
        iceProcesses(
          f.theta,
          f.qv,
          f.qi,
          f.qs,
          f.ni,
          id,
          ex,
          p,
          rho,
          dt,
        );
        const iceBefore = f.qi[id];
        snowProcesses(
          f.theta,
          f.qv,
          f.qc,
          f.qi,
          f.qs,
          f.qr,
          id,
          ex,
          p,
          rho,
          rhoGround,
          dt,
        );
        const rainBefore = f.qr[id];
        graupelProcesses(
          f.theta,
          f.qv,
          f.qc,
          f.qi,
          f.qs,
          f.qr,
          f.qg,
          id,
          ex,
          p,
          rho,
          dt,
        );
        const rainFrozen =
          f.theta[id] * ex < T0 ? Math.max(0, rainBefore - f.qr[id]) : 0;
        hailProcesses(
          f.theta,
          f.qv,
          f.qc,
          f.qi,
          f.qs,
          f.qr,
          f.qg,
          f.qh,
          id,
          ex,
          p,
          rho,
          dt,
        );
        if (iceBefore > 0) f.ni[id] *= f.qi[id] / iceBefore;
        secondaryIce(
          f,
          id,
          f.theta[id] * ex - T0,
          Math.max(0, cloudBefore - f.qc[id]),
          rainBefore,
          rainFrozen,
          rho,
        );
        saturationAdjustMixed(
          f.theta,
          f.qv,
          f.qc,
          f.qi,
          f.ni,
          id,
          ex,
          p,
        );
        settleCrystals(f.qi, f.ni, id);

        // Guard against negative values from round-off.
        if (f.qv[id] < 0) f.qv[id] = 0;
        if (f.qc[id] < 0) f.qc[id] = 0;
        if (f.qr[id] < 0) f.qr[id] = 0;
        if (f.qi[id] < 0) f.qi[id] = 0;
        if (f.qs[id] < 0) f.qs[id] = 0;
        if (f.qg[id] < 0) f.qg[id] = 0;
        if (f.qh[id] < 0) f.qh[id] = 0;
      }
    }
  }

  // Sedimentation: ice crystals are slow, snow about 1 m/s, graupel ~8 m/s,
  // hail ~12 m/s. Surface loss becomes accumulation.
  sediment(grid, f, f.qi, scratch, dt, null, () => ICE_FALL_SPEED);
  sediment(grid, f, f.qs, scratch, dt, f.snowAccum, (q, rho) =>
    snowFallSpeed(q, rho, rhoGround),
  );
  sediment(grid, f, f.qg, scratch, dt, f.snowAccum, (q, rho) =>
    graupelFallSpeed(q, rho),
  );
  sediment(grid, f, f.qh, scratch, dt, f.snowAccum, (q, rho) =>
    hailFallSpeed(q, rho),
  );
}
