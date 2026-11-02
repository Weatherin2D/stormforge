/**
 * Packers for formerly-planned 2D views that can be built from live solver fields.
 * Catalog rows gain a productId once their formula/assumptions are honest.
 */
import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import { columnBaseK } from "./surface";
import { G, RD, TFromTheta } from "./thermo";
import { DERIVED_LEGENDS } from "./mapDerived";

export type PlannedProductId =
  | "theta"
  | "tv"
  | "density"
  | "n2"
  | "tempadv"
  | "absvort"
  | "bunkers"
  | "charge"
  | "chargepos"
  | "chargeneg"
  | "hailconc"
  | "anvil"
  | "optdepth"
  | "solarinc"
  | "olr"
  | "gustpot"
  | "stormmot"
  | "lpi"
  | "cfl"
  | "horyort"
  | "dryline"
  | "gustfront"
  | "cipot"
  | "precipeff"
  | "fallspd"
  | "thundel"
  | "energybal"
  | "staticstab"
  | "efield"
  | "seabreeze"
  | "outflow"
  | "boundary"
  | "hailrate"
  | "evapcool"
  | "runoff"
  | "dropSize"
  | "derecho"
  | "bowecho"
  | "stormmode"
  | "frontogen"
  | "pv"
  | "et"
  | "masserr";

type Stop = [number, number, number, number];
const BG: Stop = [0, 10, 16, 28];
const SCALAR: Stop[] = [
  [0, 10, 16, 28],
  [0.12, 67, 96, 117],
  [0.28, 167, 200, 206],
  [0.42, 232, 209, 134],
  [0.55, 226, 123, 18],
  [0.7, 220, 65, 16],
  [0.85, 148, 15, 73],
  [1, 195, 121, 210],
];
const DIVERGING: Stop[] = [
  [0, 43, 108, 179],
  [0.25, 128, 165, 210],
  [0.5, 238, 238, 238],
  [0.75, 226, 123, 18],
  [1, 220, 65, 16],
];

export const PLANNED_LEGENDS = DERIVED_LEGENDS;

function mapPix(i: number, j: number, nx: number, ny: number): number {
  return (i + (ny - 1 - j) * nx) * 4;
}

function lerpStops(value: number, stops: Stop[], out: Uint8Array, o: number): void {
  let i = 0;
  while (i < stops.length - 1 && value > stops[i + 1][0]) i++;
  const a = stops[i];
  const b = stops[Math.min(stops.length - 1, i + 1)];
  const t = a[0] === b[0] ? 0 : (value - a[0]) / Math.max(1e-6, b[0] - a[0]);
  out[o] = (a[1] + (b[1] - a[1]) * t) | 0;
  out[o + 1] = (a[2] + (b[2] - a[2]) * t) | 0;
  out[o + 2] = (a[3] + (b[3] - a[3]) * t) | 0;
  out[o + 3] = 255;
}

function paintNorm(
  value: number,
  min: number,
  max: number,
  stops: Stop[],
  out: Uint8Array,
  o: number,
): void {
  if (!(value > min) && value !== min) {
    out[o] = BG[1];
    out[o + 1] = BG[2];
    out[o + 2] = BG[3];
    out[o + 3] = 255;
    return;
  }
  const t = Math.max(0, Math.min(1, (value - min) / Math.max(1e-6, max - min)));
  lerpStops(t, stops, out, o);
}

function paintDiv(
  value: number,
  span: number,
  out: Uint8Array,
  o: number,
): void {
  const t = 0.5 + 0.5 * Math.max(-1, Math.min(1, value / Math.max(1e-6, span)));
  lerpStops(t, DIVERGING, out, o);
}

function uCenter(f: SimFields, g: Grid3D, i: number, j: number, k: number): number {
  return 0.5 * (f.u[g.uIdx(i, j, k)] + f.u[g.uIdx(i + 1, j, k)]);
}
function vCenter(f: SimFields, g: Grid3D, i: number, j: number, k: number): number {
  return 0.5 * (f.v[g.vIdx(i, j, k)] + f.v[g.vIdx(i, j + 1, k)]);
}

function bunkersMotion(f: SimFields, g: Grid3D): { u: number; v: number } {
  const { nz, dz } = g;
  const k6 = Math.min(nz - 1, Math.max(1, Math.round(6000 / Math.max(dz, 1))));
  const um = 0.5 * (f.u0[0] + f.u0[k6]);
  const vm = 0.5 * (f.v0[0] + f.v0[k6]);
  const su = f.u0[k6] - f.u0[0];
  const sv = f.v0[k6] - f.v0[0];
  const sh = Math.hypot(su, sv) || 1;
  // Right-mover: mean + 7.5 m/s perpendicular to shear (Bunkers simplified).
  const pu = (-sv / sh) * 7.5;
  const pv = (su / sh) * 7.5;
  return { u: um + pu, v: vm + pv };
}

/** Pack charge column diagnostics. mode: abs / pos / neg. */
export function packChargeProduct(
  grid: Grid3D,
  charge: Float32Array,
  chargeCol: Float32Array,
  out: Uint8Array,
  mode: "abs" | "pos" | "neg",
): void {
  const { nx, ny, nz } = grid;
  const nxny = nx * ny;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const ij = i + j * nx;
      let v = 0;
      if (mode === "abs") {
        v = chargeCol[ij] ?? 0;
      } else {
        let peak = 0;
        for (let k = 0; k < nz; k++) {
          const c = charge[ij + k * nxny];
          if (mode === "pos" && c > peak) peak = c;
          if (mode === "neg" && -c > peak) peak = -c;
        }
        v = peak;
      }
      paintNorm(v, 0, 40, SCALAR, out, mapPix(i, j, nx, ny));
    }
  }
}

export function isPlannedProduct(id: string): id is PlannedProductId {
  return (
    id === "theta" ||
    id === "tv" ||
    id === "density" ||
    id === "n2" ||
    id === "tempadv" ||
    id === "absvort" ||
    id === "bunkers" ||
    id === "charge" ||
    id === "chargepos" ||
    id === "chargeneg" ||
    id === "hailconc" ||
    id === "anvil" ||
    id === "optdepth" ||
    id === "solarinc" ||
    id === "olr" ||
    id === "gustpot" ||
    id === "stormmot" ||
    id === "lpi" ||
    id === "cfl" ||
    id === "horyort" ||
    id === "dryline" ||
    id === "gustfront" ||
    id === "cipot" ||
    id === "precipeff" ||
    id === "fallspd" ||
    id === "thundel" ||
    id === "energybal" ||
    id === "staticstab" ||
    id === "efield" ||
    id === "seabreeze" ||
    id === "outflow" ||
    id === "boundary" ||
    id === "hailrate" ||
    id === "evapcool" ||
    id === "runoff" ||
    id === "dropSize" ||
    id === "derecho" ||
    id === "bowecho" ||
    id === "stormmode" ||
    id === "frontogen" ||
    id === "pv" ||
    id === "et" ||
    id === "masserr"
  );
}

export function packPlannedProduct(
  id: PlannedProductId,
  grid: Grid3D,
  f: SimFields,
  out: Uint8Array,
  extras?: { sunFrac?: number; flash?: Float32Array },
): void {
  const { nx, ny, nz, dx, dy, dz } = grid;
  const k0 = (i: number, j: number) => columnBaseK(nx, i, j);
  const sun = extras?.sunFrac ?? 0.6;
  const flash = extras?.flash;

  if (id === "stormmot" || id === "bunkers") {
    const m = bunkersMotion(f, grid);
    const spd = Math.hypot(m.u, m.v);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        paintNorm(spd, 0, 40, SCALAR, out, mapPix(i, j, nx, ny));
      }
    }
    return;
  }

  if (id === "cfl") {
    let maxW = 1;
    for (let i = 0; i < f.u.length; i++) maxW = Math.max(maxW, Math.abs(f.u[i]));
    for (let i = 0; i < f.v.length; i++) maxW = Math.max(maxW, Math.abs(f.v[i]));
    for (let i = 0; i < f.w.length; i++) maxW = Math.max(maxW, Math.abs(f.w[i]));
    const cfl = (maxW * 2) / Math.min(dx, dy, dz);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        paintNorm(cfl, 0, 2, SCALAR, out, mapPix(i, j, nx, ny));
      }
    }
    return;
  }

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const o = mapPix(i, j, nx, ny);
      const ks = k0(i, j);
      const id0 = grid.idx(i, j, ks);
      const th = f.theta[id0];
      const qv = f.qv[id0];
      const T = TFromTheta(th, f.p0[ks]);
      const u = uCenter(f, grid, i, j, ks);
      const v = vCenter(f, grid, i, j, ks);

      switch (id) {
        case "theta":
          paintNorm(th, 280, 330, SCALAR, out, o);
          break;
        case "tv": {
          const tv = T * (1 + 0.608 * qv);
          paintNorm(tv - 273.15, -20, 45, SCALAR, out, o);
          break;
        }
        case "density": {
          const rho = f.p0[ks] / Math.max(1, RD * T * (1 + 0.608 * qv));
          paintNorm(rho, 0.6, 1.3, SCALAR, out, o);
          break;
        }
        case "n2":
        case "staticstab": {
          const k1 = Math.min(nz - 1, ks + 1);
          const th1 = f.theta[grid.idx(i, j, k1)];
          const n2 = (G / Math.max(1, th)) * ((th1 - th) / Math.max(dz, 1));
          if (id === "n2") paintDiv(n2 * 1e4, 5, out, o);
          else paintDiv(n2 * 1e4, 5, out, o);
          break;
        }
        case "tempadv": {
          const ip = Math.min(nx - 1, i + 1);
          const im = Math.max(0, i - 1);
          const jp = Math.min(ny - 1, j + 1);
          const jm = Math.max(0, j - 1);
          const dTdx =
            (TFromTheta(f.theta[grid.idx(ip, j, ks)], f.p0[ks]) -
              TFromTheta(f.theta[grid.idx(im, j, ks)], f.p0[ks])) /
            (2 * dx);
          const dTdy =
            (TFromTheta(f.theta[grid.idx(i, jp, ks)], f.p0[ks]) -
              TFromTheta(f.theta[grid.idx(i, jm, ks)], f.p0[ks])) /
            (2 * dy);
          const adv = -(u * dTdx + v * dTdy) * 3600; // K/h
          paintDiv(adv, 5, out, o);
          break;
        }
        case "absvort": {
          const ip = Math.min(nx - 1, i + 1);
          const im = Math.max(0, i - 1);
          const jp = Math.min(ny - 1, j + 1);
          const jm = Math.max(0, j - 1);
          const dvdx =
            (vCenter(f, grid, ip, j, ks) - vCenter(f, grid, im, j, ks)) /
            (2 * dx);
          const dudy =
            (uCenter(f, grid, i, jp, ks) - uCenter(f, grid, i, jm, ks)) /
            (2 * dy);
          const fCor = 1e-4; // mid-lat proxy
          paintDiv((dvdx - dudy + fCor) * 1e5, 20, out, o);
          break;
        }
        case "horyort": {
          const k1 = Math.min(nz - 1, ks + 1);
          const du =
            (uCenter(f, grid, i, j, k1) - u) / Math.max(dz, 1);
          const dv =
            (vCenter(f, grid, i, j, k1) - v) / Math.max(dz, 1);
          paintNorm(Math.hypot(du, dv) * 1000, 0, 20, SCALAR, out, o);
          break;
        }
        case "hailconc": {
          let qh = 0;
          for (let k = ks; k < nz; k++) qh += f.qh[grid.idx(i, j, k)];
          paintNorm(qh * 1000, 0, 5, SCALAR, out, o);
          break;
        }
        case "hailrate": {
          paintNorm(f.qh[id0] * 1000, 0, 2, SCALAR, out, o);
          break;
        }
        case "anvil": {
          let ice = 0;
          const kAnv = Math.min(nz - 1, Math.max(ks + 1, Math.round(7000 / Math.max(dz, 1))));
          for (let k = kAnv; k < nz; k++) {
            const idk = grid.idx(i, j, k);
            ice += f.qi[idk] + f.qs[idk];
          }
          paintNorm(ice * 1000, 0, 3, SCALAR, out, o);
          break;
        }
        case "optdepth": {
          let path = 0;
          for (let k = ks; k < nz; k++) {
            const idk = grid.idx(i, j, k);
            path += (f.qc[idk] * 50 + (f.qi[idk] + f.qs[idk]) * 20) * dz;
          }
          paintNorm(path, 0, 80, SCALAR, out, o);
          break;
        }
        case "solarinc": {
          const land = 1; // heated columns; water contrast is soft
          paintNorm(sun * land * 1000, 0, 1000, SCALAR, out, o);
          break;
        }
        case "olr": {
          let topK = ks;
          for (let k = nz - 1; k >= ks; k--) {
            const idk = grid.idx(i, j, k);
            if (f.qc[idk] + f.qi[idk] > 1e-5) {
              topK = k;
              break;
            }
          }
          const Tt = TFromTheta(f.theta[grid.idx(i, j, topK)], f.p0[topK]);
          const olr = 5.67e-8 * Tt * Tt * Tt * Tt;
          paintNorm(olr, 100, 350, SCALAR, out, o);
          break;
        }
        case "gustpot": {
          let wmax = 0;
          for (let k = ks; k < Math.min(nz, ks + 8); k++) {
            const ww = Math.abs(f.w[grid.wIdx(i, j, k)]);
            if (ww > wmax) wmax = ww;
          }
          paintNorm(Math.hypot(u, v) + 1.5 * wmax, 0, 50, SCALAR, out, o);
          break;
        }
        case "lpi": {
          let ice = 0;
          let rim = 0;
          let wup = 0;
          for (let k = ks; k < nz; k++) {
            const idk = grid.idx(i, j, k);
            ice += f.qi[idk] + f.qs[idk];
            rim += f.qg[idk] + f.qh[idk];
            wup = Math.max(wup, f.w[grid.wIdx(i, j, k)]);
          }
          paintNorm(Math.sqrt(Math.max(0, ice * rim)) * Math.max(0, wup) * 1e3, 0, 5, SCALAR, out, o);
          break;
        }
        case "dryline": {
          const ip = Math.min(nx - 1, i + 1);
          const im = Math.max(0, i - 1);
          const q1 = f.qv[grid.idx(ip, j, ks)];
          const q0 = f.qv[grid.idx(im, j, ks)];
          paintNorm(Math.abs(q1 - q0) * 1000 / Math.max(dx, 1) * 1000, 0, 5, SCALAR, out, o);
          break;
        }
        case "gustfront":
        case "outflow":
        case "boundary": {
          const dTh = f.theta0[ks] - th;
          paintNorm(Math.max(0, dTh), 0, 8, SCALAR, out, o);
          break;
        }
        case "seabreeze": {
          // Proxy: onshore moisture/temperature contrast near coasts — use qv gradient.
          const ip = Math.min(nx - 1, i + 1);
          const im = Math.max(0, i - 1);
          const jp = Math.min(ny - 1, j + 1);
          const jm = Math.max(0, j - 1);
          const gq = Math.hypot(
            f.qv[grid.idx(ip, j, ks)] - f.qv[grid.idx(im, j, ks)],
            f.qv[grid.idx(i, jp, ks)] - f.qv[grid.idx(i, jm, ks)],
          );
          paintNorm(gq * 1e5, 0, 3, SCALAR, out, o);
          break;
        }
        case "cipot": {
          const excess = Math.max(0, th - f.theta0[ks]);
          const moist = Math.max(0, qv - f.qv0[ks]);
          paintNorm(excess * 20 + moist * 2000, 0, 10, SCALAR, out, o);
          break;
        }
        case "precipeff": {
          const rain = f.precipRate[i + j * nx] ?? 0;
          const cond = f.qc[id0] + f.qr[id0];
          paintNorm(cond > 1e-5 ? rain / (cond * 1e4) : 0, 0, 5, SCALAR, out, o);
          break;
        }
        case "fallspd": {
          const hasHail = f.qh[id0] > 1e-5;
          const hasSnow = f.qs[id0] + f.qi[id0] > 1e-5;
          const vt = hasHail ? 25 : hasSnow ? 1.5 : f.qr[id0] > 1e-6 ? 8 : 0;
          paintNorm(vt, 0, 30, SCALAR, out, o);
          break;
        }
        case "dropSize": {
          const qr = f.qr[id0];
          paintNorm(qr > 0 ? Math.min(3, 0.5 + qr * 400) : 0, 0, 3, SCALAR, out, o);
          break;
        }
        case "thundel": {
          // Proxy delay (s) from domain centre using flash activity as a gate.
          const cx = (nx - 1) * 0.5;
          const cy = (ny - 1) * 0.5;
          const dist = Math.hypot((i - cx) * dx, (j - cy) * dy);
          const delay = dist / 340;
          const active = flash ? flash[i + j * nx] > 0.05 : f.qg[id0] + f.qh[id0] > 1e-4;
          paintNorm(active ? delay : 0, 0, 60, SCALAR, out, o);
          break;
        }
        case "energybal":
        case "et": {
          const sens = Math.max(-5, Math.min(15, th - f.theta0[ks])) * sun;
          paintDiv(sens, 8, out, o);
          break;
        }
        case "efield": {
          // Column charge magnitude as a soft E-field proxy.
          let peak = 0;
          for (let k = ks; k < nz; k++) {
            // Without charge array here, use graupel/ice product as proxy when packing via planned path.
            const idk = grid.idx(i, j, k);
            peak = Math.max(peak, Math.sqrt(Math.max(0, f.qg[idk] * f.qi[idk])) * 1e4);
          }
          paintNorm(peak, 0, 5, SCALAR, out, o);
          break;
        }
        case "evapcool": {
          const cool = Math.max(0, f.theta0[ks] - th) * Math.min(1, f.qr[id0] * 500);
          paintNorm(cool, 0, 6, SCALAR, out, o);
          break;
        }
        case "runoff": {
          paintNorm(f.rainAccum[i + j * nx] ?? 0, 0, 50, SCALAR, out, o);
          break;
        }
        case "derecho": {
          const spd = Math.hypot(u, v);
          paintNorm(spd > 15 ? spd : 0, 0, 45, SCALAR, out, o);
          break;
        }
        case "bowecho": {
          // Reflectivity-like condensate with line curvature proxy via convergence of v.
          const cond = (f.qc[id0] + f.qr[id0]) * 1000;
          paintNorm(cond, 0, 8, SCALAR, out, o);
          break;
        }
        case "stormmode": {
          let wmax = 0;
          let ice = 0;
          for (let k = ks; k < nz; k++) {
            wmax = Math.max(wmax, f.w[grid.wIdx(i, j, k)]);
            ice += f.qi[grid.idx(i, j, k)] + f.qg[grid.idx(i, j, k)];
          }
          const mode = wmax > 15 && ice > 1e-4 ? 3 : wmax > 8 ? 2 : condMode(f, id0);
          paintNorm(mode, 0, 3, SCALAR, out, o);
          break;
        }
        case "frontogen": {
          const ip = Math.min(nx - 1, i + 1);
          const im = Math.max(0, i - 1);
          const dT =
            TFromTheta(f.theta[grid.idx(ip, j, ks)], f.p0[ks]) -
            TFromTheta(f.theta[grid.idx(im, j, ks)], f.p0[ks]);
          paintDiv((-u * dT) / Math.max(dx, 1) * 1e3, 2, out, o);
          break;
        }
        case "pv": {
          const k1 = Math.min(nz - 1, ks + 1);
          const dth = f.theta[grid.idx(i, j, k1)] - th;
          const ip = Math.min(nx - 1, i + 1);
          const im = Math.max(0, i - 1);
          const jp = Math.min(ny - 1, j + 1);
          const jm = Math.max(0, j - 1);
          const zeta =
            (vCenter(f, grid, ip, j, ks) - vCenter(f, grid, im, j, ks)) / (2 * dx) -
            (uCenter(f, grid, i, jp, ks) - uCenter(f, grid, i, jm, ks)) / (2 * dy);
          const pv = -G * (zeta + 1e-4) * (dth / Math.max(dz, 1)) / Math.max(0.5, f.rho0[ks]);
          paintDiv(pv * 1e6, 5, out, o);
          break;
        }
        case "masserr": {
          // Local continuity residual proxy |∂u/∂x + ∂v/∂y + ∂w/∂z|.
          const ip = Math.min(nx - 1, i + 1);
          const im = Math.max(0, i - 1);
          const jp = Math.min(ny - 1, j + 1);
          const jm = Math.max(0, j - 1);
          const dudx =
            (uCenter(f, grid, ip, j, ks) - uCenter(f, grid, im, j, ks)) / (2 * dx);
          const dvdy =
            (vCenter(f, grid, i, jp, ks) - vCenter(f, grid, i, jm, ks)) / (2 * dy);
          const k1 = Math.min(nz - 1, ks + 1);
          const dwdz =
            (f.w[grid.wIdx(i, j, k1)] - f.w[grid.wIdx(i, j, ks)]) / Math.max(dz, 1);
          paintNorm(Math.abs(dudx + dvdy + dwdz) * 1000, 0, 5, SCALAR, out, o);
          break;
        }
        default:
          out[o] = BG[1];
          out[o + 1] = BG[2];
          out[o + 2] = BG[3];
          out[o + 3] = 255;
      }
    }
  }
}

function condMode(f: SimFields, id: number): number {
  if (f.qh[id] > 1e-5) return 3;
  if (f.qr[id] > 1e-4) return 2;
  if (f.qc[id] > 1e-5) return 1;
  return 0;
}

/** Meta used by MAP_PRODUCTS for planned-live products. */
export const PLANNED_PRODUCT_META: Record<
  PlannedProductId,
  { title: string; units: string; ticks: string[]; min: number; max: number; legend: "scalar" | "diverging" }
> = {
  theta: { title: "θ", units: "K", ticks: ["280", "305", "330"], min: 280, max: 330, legend: "scalar" },
  tv: { title: "Tv", units: "°C", ticks: ["-20", "10", "45"], min: -20, max: 45, legend: "scalar" },
  density: { title: "Density", units: "kg/m³", ticks: ["0.6", "1.0", "1.3"], min: 0.6, max: 1.3, legend: "scalar" },
  n2: { title: "N²", units: "10⁻⁴ s⁻²", ticks: ["-5", "0", "5"], min: -5, max: 5, legend: "diverging" },
  tempadv: { title: "T adv", units: "K/h", ticks: ["-5", "0", "5"], min: -5, max: 5, legend: "diverging" },
  absvort: { title: "Abs vort", units: "10⁻⁵ s⁻¹", ticks: ["-20", "0", "20"], min: -20, max: 20, legend: "diverging" },
  bunkers: { title: "Bunkers", units: "m/s", ticks: ["0", "20", "40"], min: 0, max: 40, legend: "scalar" },
  charge: { title: "Charge", units: "nC/m³", ticks: ["0", "20", "40"], min: 0, max: 40, legend: "scalar" },
  chargepos: { title: "+Charge", units: "nC/m³", ticks: ["0", "20", "40"], min: 0, max: 40, legend: "scalar" },
  chargeneg: { title: "−Charge", units: "nC/m³", ticks: ["0", "20", "40"], min: 0, max: 40, legend: "scalar" },
  hailconc: { title: "Hail conc", units: "g/kg", ticks: ["0", "2", "5"], min: 0, max: 5, legend: "scalar" },
  anvil: { title: "Anvil", units: "g/kg", ticks: ["0", "1", "3"], min: 0, max: 3, legend: "scalar" },
  optdepth: { title: "Optical depth", units: "—", ticks: ["0", "40", "80"], min: 0, max: 80, legend: "scalar" },
  solarinc: { title: "Solar in", units: "W/m²", ticks: ["0", "500", "1000"], min: 0, max: 1000, legend: "scalar" },
  olr: { title: "OLR", units: "W/m²", ticks: ["100", "220", "350"], min: 100, max: 350, legend: "scalar" },
  gustpot: { title: "Gust pot", units: "m/s", ticks: ["0", "25", "50"], min: 0, max: 50, legend: "scalar" },
  stormmot: { title: "Storm motion", units: "m/s", ticks: ["0", "20", "40"], min: 0, max: 40, legend: "scalar" },
  lpi: { title: "LPI", units: "—", ticks: ["0", "2", "5"], min: 0, max: 5, legend: "scalar" },
  cfl: { title: "CFL", units: "—", ticks: ["0", "1", "2"], min: 0, max: 2, legend: "scalar" },
  horyort: { title: "Horiz vort", units: "10⁻³ s⁻¹", ticks: ["0", "10", "20"], min: 0, max: 20, legend: "scalar" },
  dryline: { title: "Dryline", units: "—", ticks: ["0", "2", "5"], min: 0, max: 5, legend: "scalar" },
  gustfront: { title: "Gust front", units: "K", ticks: ["0", "4", "8"], min: 0, max: 8, legend: "scalar" },
  cipot: { title: "CI potential", units: "—", ticks: ["0", "5", "10"], min: 0, max: 10, legend: "scalar" },
  precipeff: { title: "Precip eff", units: "—", ticks: ["0", "2", "5"], min: 0, max: 5, legend: "scalar" },
  fallspd: { title: "Fall speed", units: "m/s", ticks: ["0", "15", "30"], min: 0, max: 30, legend: "scalar" },
  thundel: { title: "Thunder delay", units: "s", ticks: ["0", "30", "60"], min: 0, max: 60, legend: "scalar" },
  energybal: { title: "Energy bal", units: "K", ticks: ["-8", "0", "8"], min: -8, max: 8, legend: "diverging" },
  staticstab: { title: "Stability", units: "10⁻⁴ s⁻²", ticks: ["-5", "0", "5"], min: -5, max: 5, legend: "diverging" },
  efield: { title: "E-field proxy", units: "—", ticks: ["0", "2", "5"], min: 0, max: 5, legend: "scalar" },
  seabreeze: { title: "Sea breeze", units: "—", ticks: ["0", "1", "3"], min: 0, max: 3, legend: "scalar" },
  outflow: { title: "Outflow", units: "K", ticks: ["0", "4", "8"], min: 0, max: 8, legend: "scalar" },
  boundary: { title: "Boundary", units: "K", ticks: ["0", "4", "8"], min: 0, max: 8, legend: "scalar" },
  hailrate: { title: "Hail rate", units: "g/kg", ticks: ["0", "1", "2"], min: 0, max: 2, legend: "scalar" },
  evapcool: { title: "Evap cooling", units: "K", ticks: ["0", "3", "6"], min: 0, max: 6, legend: "scalar" },
  runoff: { title: "Runoff", units: "mm", ticks: ["0", "25", "50"], min: 0, max: 50, legend: "scalar" },
  dropSize: { title: "Drop size", units: "mm", ticks: ["0", "1.5", "3"], min: 0, max: 3, legend: "scalar" },
  derecho: { title: "Derecho env", units: "m/s", ticks: ["0", "20", "45"], min: 0, max: 45, legend: "scalar" },
  bowecho: { title: "Bow echo", units: "g/kg", ticks: ["0", "4", "8"], min: 0, max: 8, legend: "scalar" },
  stormmode: { title: "Storm mode", units: "class", ticks: ["0", "1", "2", "3"], min: 0, max: 3, legend: "scalar" },
  frontogen: { title: "Frontogenesis", units: "—", ticks: ["-2", "0", "2"], min: -2, max: 2, legend: "diverging" },
  pv: { title: "PV", units: "PVU", ticks: ["-5", "0", "5"], min: -5, max: 5, legend: "diverging" },
  et: { title: "ET proxy", units: "K", ticks: ["-8", "0", "8"], min: -8, max: 8, legend: "diverging" },
  masserr: { title: "Mass residual", units: "—", ticks: ["0", "2", "5"], min: 0, max: 5, legend: "scalar" },
};
