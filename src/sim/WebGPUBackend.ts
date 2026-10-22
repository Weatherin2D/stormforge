/**
 * WebGPU compute backend implementing `SimBackend`.
 *
 * Phase 2 scaffold: ports the Arakawa C-grid dynamical core (buoyancy, velocity
 * advection, pressure projection, scalar advection) to WGSL compute shaders.
 * Physics tendencies (radiation, microphysics, BL, synoptic) run on the CPU by
 * mirroring field state, keeping the `step(dt)` contract identical to the CPU
 * `FluidSolver`.
 *
 * Buffer layout mirrors the C-grid exactly (i fastest, cell-centred scalars,
 * u/v/w on faces) so face offsets translate one-to-one to WGSL.
 *
 * `step(dt)` is async (GPU dispatch + readback). It satisfies the
 * `SimBackend.step(dt): void` contract because callers may ignore the returned
 * promise; async callers can `await` it for synchronized readback.
 */

import { Grid3D } from "./Grid3D";
import type { SimBackend, SolverKind, HydrostaticMode } from "./SimBackend";
import {
  SimFields,
  createFields,
  InitOptions,
  initFromSounding,
  spawnInitBubble,
} from "./InitFromSounding";
import { SoundingLevel } from "./thermo";
import {
  RadiationOptions,
  DEFAULT_RADIATION,
  applySurfaceRadiation,
  SolarStatus,
  buildLandMask,
} from "./SurfaceRadiation";
import { exnerFromP, qsat, TFromTheta } from "./thermo";
import { stepMicrophysics } from "./Microphysics";
import {
  stepIceMicrophysics,
  stepCloudTopCooling,
  stepBLMixing,
  stepSynopticOmega,
  stepMarineStratus,
} from "./stepDynamics";
import { stepShallowCu } from "./shallowCu";
import { getActiveSynoptic, advanceSynoptic } from "./synoptic";
import { WebGPUDevice } from "./WebGPUDevice";
import type { LightningStrike } from "./FluidSolver";
import { volumeDisplaySize, copyFullVolumeToDisplay } from "./Grid3D";
import {
  MapProductId,
  packLightning,
  packMapProduct as packMapProductRGBA,
  reflectivityDbz,
} from "./mapProducts";

const TILE_X = 16;
const TILE_Y = 16;
const G = 9.81;

/** Uniform block: 16 f32s = 64 bytes (16-aligned). */
const UNIFORM_COUNT = 16;

// ── WGSL kernels ──────────────────────────────────────────────────────────

const paramsDecl = /* wgsl */ `
struct Params {
  nx: f32, ny: f32, nz: f32,
  dx: f32, dy: f32, dz: f32,
  invDx: f32, invDy: f32, invDz: f32,
  dt: f32, invDt: f32, g: f32,
  nxPlus1: f32, nyPlus1: f32, nzPlus1: f32,
  nxny: f32,
};

[[group(0), binding(0)]] var<uniform> par: Params;
`;

const buoyancyWgsl = /* wgsl */ `
${paramsDecl}
[[group(1), binding(0)]] var<storage, read> theta: array<f32>;
[[group(1), binding(1)]] var<storage, read> qv: array<f32>;
[[group(1), binding(2)]] var<storage, read> qc: array<f32>;
[[group(1), binding(3)]] var<storage, read> qr: array<f32>;
[[group(1), binding(4)]] var<storage, read> theta0: array<f32>;
[[group(1), binding(5)]] var<storage, read> qv0: array<f32>;
[[group(1), binding(6)]] var<storage, read_write> w: array<f32>;

[[stage(compute), workgroup_size(${TILE_X}, ${TILE_Y})]]
fn main([[builtin(global_invocation_id)]] id: vec3<u32>) {
  let i = i32(id.x);
  let j = i32(id.y);
  let nx = i32(par.nx);
  let ny = i32(par.ny);
  let nz = i32(par.nz);
  if (i >= nx || j >= ny) return;
  let dt = par.dt;
  let g = par.g;
  for (var k: i32 = 1; k < nz; k++) {
    let th0a = theta0[k - 1];
    let th0b = theta0[k];
    let qv0a = qv0[k - 1];
    let qv0b = qv0[k];
    let thv0 = 0.5 * (th0a * (1.0 + 0.608 * qv0a) + th0b * (1.0 + 0.608 * qv0b));
    let ida = i + nx * (j + ny * (k - 1));
    let idb = i + nx * (j + ny * k);
    let tha = theta[ida];
    let thb = theta[idb];
    let qva = qv[ida];
    let qvb = qv[idb];
    let thv = 0.5 * (tha * (1.0 + 0.608 * qva) + thb * (1.0 + 0.608 * qvb));
    let qcc = 0.5 * (qc[ida] + qc[idb]);
    let qrr = 0.5 * (qr[ida] + qr[idb]);
    let buoy = g * ((thv - thv0) / max(1.0, thv0) - qcc - 1.6 * qrr);
    let wid = i + nx * (j + ny * k);
    w[wid] = w[wid] + buoy * dt;
  }
}
`;

const advectUWgsl = /* wgsl */ `
${paramsDecl}
[[group(1), binding(0)]] var<storage, read> u: array<f32>;
[[group(1), binding(1)]] var<storage, read> v: array<f32>;
[[group(1), binding(2)]] var<storage, read> w: array<f32>;
[[group(1), binding(3)]] var<storage, read_write> uOut: array<f32>;

fn sampleU(arr: array<f32>, nxu: i32, ny: i32, nz: i32, x: f32, y: f32, z: f32) -> f32 {
  let xx = min(f32(nxu) - 1.001, max(0.0, x));
  let yy = min(f32(ny) - 1.001, max(0.0, y));
  let zz = min(f32(nz) - 1.001, max(0.0, z));
  let i0 = i32(xx);
  let j0 = i32(yy);
  let k0 = i32(zz);
  let i1 = min(nxu - 1, i0 + 1);
  let j1 = min(ny - 1, j0 + 1);
  let k1 = min(nz - 1, k0 + 1);
  let fx = xx - f32(i0);
  let fy = yy - f32(j0);
  let fz = zz - f32(k0);
  let c000 = arr[i0 + nxu * (j0 + ny * k0)];
  let c100 = arr[i1 + nxu * (j0 + ny * k0)];
  let c010 = arr[i0 + nxu * (j1 + ny * k0)];
  let c110 = arr[i1 + nxu * (j1 + ny * k0)];
  let c001 = arr[i0 + nxu * (j0 + ny * k1)];
  let c101 = arr[i1 + nxu * (j0 + ny * k1)];
  let c011 = arr[i0 + nxu * (j1 + ny * k1)];
  let c111 = arr[i1 + nxu * (j1 + ny * k1)];
  let c00 = c000 * (1.0 - fx) + c100 * fx;
  let c10 = c010 * (1.0 - fx) + c110 * fx;
  let c01 = c001 * (1.0 - fx) + c101 * fx;
  let c11 = c011 * (1.0 - fx) + c111 * fx;
  let c0 = c00 * (1.0 - fy) + c10 * fy;
  let c1 = c01 * (1.0 - fy) + c11 * fy;
  return c0 * (1.0 - fz) + c1 * fz;
}

[[stage(compute), workgroup_size(${TILE_X}, ${TILE_Y}, 1)]]
fn main([[builtin(global_invocation_id)]] id: vec3<u32>) {
  let i = i32(id.x);
  let j = i32(id.y);
  let k = i32(id.z);
  let nx = i32(par.nx);
  let ny = i32(par.ny);
  let nz = i32(par.nz);
  let nxu = i32(par.nxPlus1);
  if (i >= nxu || j >= ny || k >= nz) return;
  let id = i + nxu * (j + ny * k);
  let uc = u[id];
  let vc: f32;
  let wc: f32;
  if (i == 0) {
    vc = 0.5 * (v[0 + nx * (j + ny * k)] + v[0 + nx * (j + 1 + ny * k)]);
    wc = 0.5 * (w[0 + nx * (j + ny * k)] + w[0 + nx * (j + ny * (k + 1))]);
  } else if (i == nx) {
    vc = 0.5 * (v[(nx - 1) + nx * (j + ny * k)] + v[(nx - 1) + nx * (j + 1 + ny * k)]);
    wc = 0.5 * (w[(nx - 1) + nx * (j + ny * k)] + w[(nx - 1) + nx * (j + ny * (k + 1))]);
  } else {
    vc = 0.25 * (v[(i - 1) + nx * (j + ny * k)] + v[i + nx * (j + ny * k)] +
                 v[(i - 1) + nx * (j + 1 + ny * k)] + v[i + nx * (j + 1 + ny * k)]);
    wc = 0.25 * (w[(i - 1) + nx * (j + ny * k)] + w[i + nx * (j + ny * k)] +
                 w[(i - 1) + nx * (j + ny * (k + 1))] + w[i + nx * (j + ny * (k + 1))]);
  }
  let x = f32(i) - (uc * par.dt) / par.dx;
  let y = f32(j) - (vc * par.dt) / par.dy;
  let z = f32(k) - (wc * par.dt) / par.dz;
  if (x < 0.0 || x > f32(nx)) {
    uOut[id] = 0.0;
  } else {
    uOut[id] = sampleU(u, nxu, ny, nz, x, y, z);
  }
}
`;

const advectVWgsl = /* wgsl */ `
${paramsDecl}
[[group(1), binding(0)]] var<storage, read> u: array<f32>;
[[group(1), binding(1)]] var<storage, read> v: array<f32>;
[[group(1), binding(2)]] var<storage, read> w: array<f32>;
[[group(1), binding(3)]] var<storage, read_write> vOut: array<f32>;

fn sampleV(arr: array<f32>, nx: i32, nyv: i32, nz: i32, x: f32, y: f32, z: f32) -> f32 {
  let xx = min(f32(nx) - 1.001, max(0.0, x));
  let yy = min(f32(nyv) - 1.001, max(0.0, y));
  let zz = min(f32(nz) - 1.001, max(0.0, z));
  let i0 = i32(xx);
  let j0 = i32(yy);
  let k0 = i32(zz);
  let i1 = min(nx - 1, i0 + 1);
  let j1 = min(nyv - 1, j0 + 1);
  let k1 = min(nz - 1, k0 + 1);
  let fx = xx - f32(i0);
  let fy = yy - f32(j0);
  let fz = zz - f32(k0);
  let c000 = arr[i0 + nx * (j0 + nyv * k0)];
  let c100 = arr[i1 + nx * (j0 + nyv * k0)];
  let c010 = arr[i0 + nx * (j1 + nyv * k0)];
  let c110 = arr[i1 + nx * (j1 + nyv * k0)];
  let c001 = arr[i0 + nx * (j0 + nyv * k1)];
  let c101 = arr[i1 + nx * (j0 + nyv * k1)];
  let c011 = arr[i0 + nx * (j1 + nyv * k1)];
  let c111 = arr[i1 + nx * (j1 + nyv * k1)];
  let c00 = c000 * (1.0 - fx) + c100 * fx;
  let c10 = c010 * (1.0 - fx) + c110 * fx;
  let c01 = c001 * (1.0 - fx) + c101 * fx;
  let c11 = c011 * (1.0 - fx) + c111 * fx;
  let c0 = c00 * (1.0 - fy) + c10 * fy;
  let c1 = c01 * (1.0 - fy) + c11 * fy;
  return c0 * (1.0 - fz) + c1 * fz;
}

[[stage(compute), workgroup_size(${TILE_X}, ${TILE_Y}, 1)]]
fn main([[builtin(global_invocation_id)]] id: vec3<u32>) {
  let i = i32(id.x);
  let j = i32(id.y);
  let k = i32(id.z);
  let nx = i32(par.nx);
  let ny = i32(par.ny);
  let nz = i32(par.nz);
  let nyv = i32(par.nyPlus1);
  if (i >= nx || j >= nyv || k >= nz) return;
  let id = i + nx * (j + nyv * k);
  let vc = v[id];
  let uc: f32;
  let wc: f32;
  if (j == 0) {
    uc = 0.5 * (u[0 + i32(par.nxPlus1) * (0 + ny * k)] + u[1 + i32(par.nxPlus1) * (0 + ny * k)]);
    wc = 0.5 * (w[0 + nx * (0 + ny * k)] + w[0 + nx * (0 + ny * (k + 1))]);
  } else if (j == ny) {
    uc = 0.5 * (u[0 + i32(par.nxPlus1) * ((ny - 1) + ny * k)] + u[1 + i32(par.nxPlus1) * ((ny - 1) + ny * k)]);
    wc = 0.5 * (w[0 + nx * ((ny - 1) + ny * k)] + w[0 + nx * ((ny - 1) + ny * (k + 1))]);
  } else {
    uc = 0.25 * (u[0 + i32(par.nxPlus1) * ((j - 1) + ny * k)] + u[1 + i32(par.nxPlus1) * ((j - 1) + ny * k)] +
                 u[0 + i32(par.nxPlus1) * (j + ny * k)] + u[1 + i32(par.nxPlus1) * (j + ny * k)]);
    wc = 0.25 * (w[0 + nx * ((j - 1) + ny * k)] + w[0 + nx * (j + ny * k)] +
                 w[0 + nx * ((j - 1) + ny * (k + 1))] + w[0 + nx * (j + ny * (k + 1))]);
  }
  let x = f32(i) - (uc * par.dt) / par.dx;
  let y = f32(j) - (vc * par.dt) / par.dy;
  let z = f32(k) - (wc * par.dt) / par.dz;
  if (y < 0.0 || y > f32(ny)) {
    vOut[id] = 0.0;
  } else {
    vOut[id] = sampleV(v, nx, nyv, nz, x, y, z);
  }
}
`;

const advectWWgsl = /* wgsl */ `
${paramsDecl}
[[group(1), binding(0)]] var<storage, read> u: array<f32>;
[[group(1), binding(1)]] var<storage, read> v: array<f32>;
[[group(1), binding(2)]] var<storage, read> w: array<f32>;
[[group(1), binding(3)]] var<storage, read_write> wOut: array<f32>;

fn sampleW(arr: array<f32>, nx: i32, ny: i32, nzw: i32, x: f32, y: f32, z: f32) -> f32 {
  let xx = min(f32(nx) - 1.001, max(0.0, x));
  let yy = min(f32(ny) - 1.001, max(0.0, y));
  let zz = min(f32(nzw) - 1.001, max(0.0, z));
  let i0 = i32(xx);
  let j0 = i32(yy);
  let k0 = i32(zz);
  let i1 = min(nx - 1, i0 + 1);
  let j1 = min(ny - 1, j0 + 1);
  let k1 = min(nzw - 1, k0 + 1);
  let fx = xx - f32(i0);
  let fy = yy - f32(j0);
  let fz = zz - f32(k0);
  let c000 = arr[i0 + nx * (j0 + ny * k0)];
  let c100 = arr[i1 + nx * (j0 + ny * k0)];
  let c010 = arr[i0 + nx * (j1 + ny * k0)];
  let c110 = arr[i1 + nx * (j1 + ny * k0)];
  let c001 = arr[i0 + nx * (j0 + ny * k1)];
  let c101 = arr[i1 + nx * (j0 + ny * k1)];
  let c011 = arr[i0 + nx * (j1 + ny * k1)];
  let c111 = arr[i1 + nx * (j1 + ny * k1)];
  let c00 = c000 * (1.0 - fx) + c100 * fx;
  let c10 = c010 * (1.0 - fx) + c110 * fx;
  let c01 = c001 * (1.0 - fx) + c101 * fx;
  let c11 = c011 * (1.0 - fx) + c111 * fx;
  let c0 = c00 * (1.0 - fy) + c10 * fy;
  let c1 = c01 * (1.0 - fy) + c11 * fy;
  return c0 * (1.0 - fz) + c1 * fz;
}

[[stage(compute), workgroup_size(${TILE_X}, ${TILE_Y}, 1)]]
fn main([[builtin(global_invocation_id)]] id: vec3<u32>) {
  let i = i32(id.x);
  let j = i32(id.y);
  let k = i32(id.z);
  let nx = i32(par.nx);
  let ny = i32(par.ny);
  let nz = i32(par.nz);
  let nzw = i32(par.nzPlus1);
  if (i >= nx || j >= ny || k >= nzw) return;
  let id = i + nx * (j + ny * k);
  if (k == 0 || k == nz) {
    wOut[id] = 0.0;
    return;
  }
  let wc = w[id];
  let uc = 0.25 * (u[i + i32(par.nxPlus1) * (j + ny * (k - 1))] +
                   u[(i + 1) + i32(par.nxPlus1) * (j + ny * (k - 1))] +
                   u[i + i32(par.nxPlus1) * (j + ny * k)] +
                   u[(i + 1) + i32(par.nxPlus1) * (j + ny * k)]);
  let vc = 0.25 * (v[i + nx * (j + i32(par.nyPlus1) * (k - 1))] +
                   v[i + nx * (j + 1 + i32(par.nyPlus1) * (k - 1))] +
                   v[i + nx * (j + i32(par.nyPlus1) * k)] +
                   v[i + nx * (j + 1 + i32(par.nyPlus1) * k)]);
  let x = f32(i) - (uc * par.dt) / par.dx;
  let y = f32(j) - (vc * par.dt) / par.dy;
  let z = f32(k) - (wc * par.dt) / par.dz;
  if (x < 0.0 || x > f32(nx - 1) || y < 0.0 || y > f32(ny - 1)) {
    wOut[id] = 0.0;
  } else {
    wOut[id] = sampleW(w, nx, ny, nzw, x, y, z);
  }
}
`;

const fillDivWgsl = /* wgsl */ `
${paramsDecl}
[[group(1), binding(0)]] var<storage, read> u: array<f32>;
[[group(1), binding(1)]] var<storage, read> v: array<f32>;
[[group(1), binding(2)]] var<storage, read> w: array<f32>;
[[group(1), binding(3)]] var<storage, read> rho0: array<f32>;
[[group(1), binding(4)]] var<storage, read> rho0w: array<f32>;
[[group(1), binding(5)]] var<storage, read_write> div: array<f32>;

[[stage(compute), workgroup_size(${TILE_X}, ${TILE_Y}, 1)]]
fn main([[builtin(global_invocation_id)]] id: vec3<u32>) {
  let i = i32(id.x);
  let j = i32(id.y);
  let k = i32(id.z);
  let nx = i32(par.nx);
  let ny = i32(par.ny);
  let nz = i32(par.nz);
  if (i >= nx || j >= ny || k >= nz) return;
  let id = i + nx * (j + ny * k);
  let rho = rho0[k];
  let rhowB = rho0w[k];
  let rhowT = rho0w[k + 1];
  let invDx = par.invDx;
  let invDy = par.invDy;
  let invDz = par.invDz;
  let nu = i32(par.nxPlus1);
  let nv = i32(par.nyPlus1);
  let du = rho * (u[(i + 1) + nu * (j + ny * k)] - u[i + nu * (j + ny * k)]) * invDx;
  let dv = rho * (v[i + nx * (j + 1 + nv * k)] - v[i + nx * (j + nv * k)]) * invDy;
  let dw = (rhowT * w[i + nx * (j + ny * (k + 1))] - rhowB * w[i + nx * (j + ny * k)]) * invDz;
  let kin = du + dv + dw;
  div[id] = kin * par.invDt;
}
`;

const pressureJacobiWgsl = /* wgsl */ `
${paramsDecl}
[[group(1), binding(0)]] var<storage, read_write> p: array<f32>;
[[group(1), binding(1)]] var<storage, read> rhs: array<f32>;
[[group(1), binding(2)]] var<storage, read> rho0: array<f32>;
[[group(1), binding(3)]] var<storage, read> rho0w: array<f32>;
[[group(1), binding(4)]] var<storage, read_write> pNext: array<f32>;

[[stage(compute), workgroup_size(${TILE_X}, ${TILE_Y}, 1)]]
fn main([[builtin(global_invocation_id)]] id: vec3<u32>) {
  let i = i32(id.x);
  let j = i32(id.y);
  let k = i32(id.z);
  let nx = i32(par.nx);
  let ny = i32(par.ny);
  let nz = i32(par.nz);
  if (i >= nx || j >= ny || k >= nz) return;
  let id = i + nx * (j + ny * k);
  let rho = rho0[k];
  let rhowB = rho0w[k];
  let rhowT = rho0w[k + 1];
  let dx2 = par.dx * par.dx;
  let dy2 = par.dy * par.dy;
  let dz2 = par.dz * par.dz;
  let diag = (2.0 * rho) / dx2 + (2.0 * rho) / dy2 + rhowT / dz2 + rhowB / dz2;
  let invDiag = 1.0 / diag;
  let rhoDx = rho / dx2;
  let rhoDy = rho / dy2;
  let rT = rhowT / dz2;
  let rB = rhowB / dz2;
  let ip = min(i + 1, nx - 1);
  let im = max(i - 1, 0);
  let jp = min(j + 1, ny - 1);
  let jm = max(j - 1, 0);
  let kp = min(k + 1, nz - 1);
  let km = max(k - 1, 0);
  let sum =
    rhoDx * (p[id + 1] + p[id - 1]) +
    rhoDy * (p[i + nx * (jp + ny * k)] + p[i + nx * (jm + ny * k)]) +
    rT * p[i + nx * (j + ny * kp)] +
    rB * p[i + nx * (j + ny * km)];
  pNext[id] = (sum - rhs[id]) * invDiag;
}
`;

const correctVelWgsl = /* wgsl */ `
${paramsDecl}
[[group(1), binding(0)]] var<storage, read> p: array<f32>;
[[group(1), binding(1)]] var<storage, read> rho0: array<f32>;
[[group(1), binding(2)]] var<storage, read_write> u: array<f32>;
[[group(1), binding(3)]] var<storage, read_write> v: array<f32>;
[[group(1), binding(4)]] var<storage, read_write> w: array<f32>;

[[stage(compute), workgroup_size(${TILE_X}, ${TILE_Y}, 1)]]
fn main([[builtin(global_invocation_id)]] id: vec3<u32>) {
  let i = i32(id.x);
  let j = i32(id.y);
  let k = i32(id.z);
  let nx = i32(par.nx);
  let ny = i32(par.ny);
  let nz = i32(par.nz);
  if (i >= nx || j >= ny || k >= nz) return;
  let base = i + nx * (j + ny * k);
  let rho = rho0[k];
  let invDx = par.invDx;
  let invDy = par.invDy;
  let invDz = par.invDz;
  let dt = par.dt;
  let nu = i32(par.nxPlus1);
  let nv = i32(par.nyPlus1);
  if (i > 0 && i < nx) {
    let uid = i - 1 + nu * (j + ny * k);
    let grad = (p[base] - p[base - 1]) * invDx;
    u[uid] = u[uid] - grad * dt / rho;
  }
  if (j > 0 && j < ny) {
    let vid = i + nx * ((j - 1) + nv * k);
    let grad = (p[base] - p[base - nx]) * invDy;
    v[vid] = v[vid] - grad * dt / rho;
  }
  if (k > 0 && k < nz) {
    let wid = i + nx * (j + ny * (k - 1));
    let grad = (p[base] - p[base - nx * ny]) * invDz;
    w[wid] = w[wid] - grad * dt / rho;
  }
}
`;

const advectScalarsWgsl = /* wgsl */ `
${paramsDecl}
[[group(1), binding(0)]] var<storage, read> u: array<f32>;
[[group(1), binding(1)]] var<storage, read> v: array<f32>;
[[group(1), binding(2)]] var<storage, read> w: array<f32>;
[[group(1), binding(3)]] var<storage, read> theta: array<f32>;
[[group(1), binding(4)]] var<storage, read> qv: array<f32>;
[[group(1), binding(5)]] var<storage, read> qc: array<f32>;
[[group(1), binding(6)]] var<storage, read> qr: array<f32>;
[[group(1), binding(7)]] var<storage, read> theta0: array<f32>;
[[group(1), binding(8)]] var<storage, read> qv0: array<f32>;
[[group(1), binding(9)]] var<storage, read_write> thetaOut: array<f32>;
[[group(1), binding(10)]] var<storage, read_write> qvOut: array<f32>;
[[group(1), binding(11)]] var<storage, read_write> qcOut: array<f32>;
[[group(1), binding(12)]] var<storage, read_write> qrOut: array<f32>;

fn trilinear(arr: array<f32>, nx: i32, ny: i32, nz: i32, x: f32, y: f32, z: f32) -> f32 {
  let xx = min(f32(nx) - 1.001, max(0.0, x));
  let yy = min(f32(ny) - 1.001, max(0.0, y));
  let zz = min(f32(nz) - 1.001, max(0.0, z));
  let i0 = i32(xx);
  let j0 = i32(yy);
  let k0 = i32(zz);
  let i1 = min(nx - 1, i0 + 1);
  let j1 = min(ny - 1, j0 + 1);
  let k1 = min(nz - 1, k0 + 1);
  let fx = xx - f32(i0);
  let fy = yy - f32(j0);
  let fz = zz - f32(k0);
  let nxny = nx * ny;
  let row0 = j0 * nx;
  let row1 = j1 * nx;
  let k0b = k0 * nxny;
  let k1b = k1 * nxny;
  let c000 = arr[i0 + row0 + k0b];
  let c100 = arr[i1 + row0 + k0b];
  let c010 = arr[i0 + row1 + k0b];
  let c110 = arr[i1 + row1 + k0b];
  let c001 = arr[i0 + row0 + k1b];
  let c101 = arr[i1 + row0 + k1b];
  let c011 = arr[i0 + row1 + k1b];
  let c111 = arr[i1 + row1 + k1b];
  let c00 = c000 * (1.0 - fx) + c100 * fx;
  let c10 = c010 * (1.0 - fx) + c110 * fx;
  let c01 = c001 * (1.0 - fx) + c101 * fx;
  let c11 = c011 * (1.0 - fx) + c111 * fx;
  let c0 = c00 * (1.0 - fy) + c10 * fy;
  let c1 = c01 * (1.0 - fy) + c11 * fy;
  return c0 * (1.0 - fz) + c1 * fz;
}

[[stage(compute), workgroup_size(${TILE_X}, ${TILE_Y}, 1)]]
fn main([[builtin(global_invocation_id)]] id: vec3<u32>) {
  let i = i32(id.x);
  let j = i32(id.y);
  let k = i32(id.z);
  let nx = i32(par.nx);
  let ny = i32(par.ny);
  let nz = i32(par.nz);
  if (i >= nx || j >= ny || k >= nz) return;
  let id = i + nx * (j + ny * k);
  let nu = i32(par.nxPlus1);
  let nv = i32(par.nyPlus1);
  let uu = 0.5 * (u[i + nu * (j + ny * k)] + u[(i + 1) + nu * (j + ny * k)]);
  let vv = 0.5 * (v[i + nx * (j + nv * k)] + v[i + nx * (j + 1 + nv * k)]);
  let ww = 0.5 * (w[i + nx * (j + ny * k)] + w[i + nx * (j + ny * (k + 1))]);
  let x = f32(i) - uu * par.invDx;
  let y = f32(j) - vv * par.invDy;
  let z = f32(k) - ww * par.invDz;
  let xMax = f32(nx - 1);
  let yMax = f32(ny - 1);
  if (x < 0.0 || x > xMax || y < 0.0 || y > yMax) {
    thetaOut[id] = theta0[k];
    qvOut[id] = qv0[k];
    qcOut[id] = 0.0;
    qrOut[id] = 0.0;
   } else {
     thetaOut[id] = trilinear(theta, nx, ny, nz, x, y, z);
     qvOut[id] = trilinear(qv, nx, ny, nz, x, y, z);
     qcOut[id] = trilinear(qc, nx, ny, nz, x, y, z);
     qrOut[id] = trilinear(qr, nx, ny, nz, x, y, z);
   }
   // Cap per-step theta change to avoid localized transients.
   let _prev = theta[id];
   let _d = thetaOut[id] - _prev;
   if (_d > 3.0) { thetaOut[id] = _prev + 3.0; }
   else if (_d < -3.0) { thetaOut[id] = _prev - 3.0; }
}
`;

const copyWgsl = /* wgsl */ `
${paramsDecl}
[[group(1), binding(0)]] var<storage, read> src: array<f32>;
[[group(1), binding(1)]] var<storage, read_write> dst: array<f32>;

[[stage(compute), workgroup_size(64, 1, 1)]]
fn main([[builtin(global_invocation_id)]] id: vec3<u32>) {
  let idx = i32(id.x);
  let nx = i32(par.nx);
  let ny = i32(par.ny);
  let nz = i32(par.nz);
  let n = nx * ny * nz;
  if (idx >= n) return;
  dst[idx] = src[idx];
}
`;

// ── Backend ───────────────────────────────────────────────────────────────

interface KernelSpec {
  wgsl: string;
  entry: string;
  storage: { binding: number; readonly: boolean }[];
}

const KERNELS: Record<string, KernelSpec> = {
  buoyancy: { wgsl: buoyancyWgsl, entry: "main", storage: [
    { binding: 0, readonly: true }, { binding: 1, readonly: true }, { binding: 2, readonly: true },
    { binding: 3, readonly: true }, { binding: 4, readonly: true }, { binding: 5, readonly: true },
    { binding: 6, readonly: false },
  ]},
  advectU: { wgsl: advectUWgsl, entry: "main", storage: [
    { binding: 0, readonly: true }, { binding: 1, readonly: true }, { binding: 2, readonly: true }, { binding: 3, readonly: false },
  ]},
  advectV: { wgsl: advectVWgsl, entry: "main", storage: [
    { binding: 0, readonly: true }, { binding: 1, readonly: true }, { binding: 2, readonly: true }, { binding: 3, readonly: false },
  ]},
  advectW: { wgsl: advectWWgsl, entry: "main", storage: [
    { binding: 0, readonly: true }, { binding: 1, readonly: true }, { binding: 2, readonly: true }, { binding: 3, readonly: false },
  ]},
  fillDiv: { wgsl: fillDivWgsl, entry: "main", storage: [
    { binding: 0, readonly: true }, { binding: 1, readonly: true }, { binding: 2, readonly: true },
    { binding: 3, readonly: true }, { binding: 4, readonly: true }, { binding: 5, readonly: false },
  ]},
  jacobi: { wgsl: pressureJacobiWgsl, entry: "main", storage: [
    { binding: 0, readonly: false }, { binding: 1, readonly: true }, { binding: 2, readonly: true },
    { binding: 3, readonly: true }, { binding: 4, readonly: false },
  ]},
  correctVel: { wgsl: correctVelWgsl, entry: "main", storage: [
    { binding: 0, readonly: true }, { binding: 1, readonly: true }, { binding: 2, readonly: false }, { binding: 3, readonly: false }, { binding: 4, readonly: false },
  ]},
  advectScalars: { wgsl: advectScalarsWgsl, entry: "main", storage: [
    { binding: 0, readonly: true }, { binding: 1, readonly: true }, { binding: 2, readonly: true },
    { binding: 3, readonly: true }, { binding: 4, readonly: true }, { binding: 5, readonly: true }, { binding: 6, readonly: true },
    { binding: 7, readonly: true }, { binding: 8, readonly: true },
    { binding: 9, readonly: false }, { binding: 10, readonly: false }, { binding: 11, readonly: false }, { binding: 12, readonly: false },
  ]},
  copy: { wgsl: copyWgsl, entry: "main", storage: [
    { binding: 0, readonly: true }, { binding: 1, readonly: false },
  ]},
};

export class WebGPUBackend implements SimBackend {
  readonly kind: SolverKind = "gpu";
  grid: Grid3D;
  fields: SimFields;
  time = 0;
  stepCount = 0;
  clockPaused = false;
  radiation: RadiationOptions = { ...DEFAULT_RADIATION };
  vorticityStrength = 0;
  hydrostatic: HydrostaticMode = "auto";

  private device: WebGPUDevice | null = null;
  private b: {
    theta: GPUBuffer; qv: GPUBuffer; qc: GPUBuffer; qr: GPUBuffer; p: GPUBuffer;
    u: GPUBuffer; v: GPUBuffer; w: GPUBuffer;
    thetaNext: GPUBuffer; qvNext: GPUBuffer; qcNext: GPUBuffer; qrNext: GPUBuffer;
    uNext: GPUBuffer; vNext: GPUBuffer; wNext: GPUBuffer;
    div: GPUBuffer; pNext: GPUBuffer;
    theta0: GPUBuffer; qv0: GPUBuffer; p0: GPUBuffer; rho0: GPUBuffer; rho0w: GPUBuffer;
    u0: GPUBuffer; v0: GPUBuffer;
    uniforms: GPUBuffer; readback: GPUBuffer;
  } | null = null;
  private pipe: Map<string, GPUComputePipeline> = new Map();
  private storLayout: Map<string, GPUBindGroupLayout> = new Map();
  private unifLayout: GPUBindGroupLayout | null = null;
  private unifBG: GPUBindGroup | null = null;
  private ready = false;
  private initError: string | null = null;
  private readyResolve!: () => void;
  private readonly readyPromise: Promise<void>;

  constructor() {
    this.grid = { nx: 8, ny: 8, nz: 8, zTop: 2000, xExtent: 8000, yExtent: 8000, xyExtent: 8000, dx: 1000, dy: 1000, dz: 250, n: 512, nu: 576, nv: 576, nw: 576 } as unknown as Grid3D;
    this.fields = createFields(this.grid);
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
    void this.init();
  }

  get available(): boolean { return this.ready && this.device !== null; }
  get initFailure(): string | null { return this.initError; }

  /** Resolves once WebGPU device init completes (success or failure). */
  async whenReady(): Promise<void> {
    await this.readyPromise;
  }

  private async init(): Promise<void> {
    const dev = await WebGPUDevice.request();
    if (!dev) { this.initError = "WebGPU not available"; this.ready = false; this.readyResolve(); return; }
    this.device = dev;
    this.ready = true;
    this.readyResolve();
  }

  private dev(): WebGPUDevice {
    if (!this.device) throw new Error("WebGPU device not ready");
    return this.device;
  }

  private n(): number { return this.grid.n; }
  private byteLen(count: number): number { return count * 4; }

  private allocBuffers(g: Grid3D) {
    const d = this.dev();
    const maxBuf = Math.min(d.limits.maxBufferSize, d.limits.maxStorageBufferBindingSize);
    const mk = (count: number, label: string): GPUBuffer | null => {
      const bytes = this.byteLen(count);
      if (bytes > maxBuf) {
        this.initError = `${label} buffer ${bytes} bytes exceeds device limit ${maxBuf} bytes — grid too large for WebGPU backend`;
        return null;
      }
      return d.createBuffer(bytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC);
    };
    const totalReadback = 5 * g.n + g.nu + g.nv + g.nw;
    const readback = d.createReadbackBuffer(this.byteLen(totalReadback));
    if (this.byteLen(totalReadback) > maxBuf) {
      this.initError = `Readback buffer ${this.byteLen(totalReadback)} bytes exceeds device limit ${maxBuf} bytes — grid too large for WebGPU backend`;
      return null;
    }
    const theta = mk(g.n, "theta");
    if (!theta) return null;
    return {
      theta, qv: mk(g.n, "qv")!, qc: mk(g.n, "qc")!, qr: mk(g.n, "qr")!, p: mk(g.n, "p")!,
      u: mk(g.nu, "u")!, v: mk(g.nv, "v")!, w: mk(g.nw, "w")!,
      thetaNext: mk(g.n, "thetaNext")!, qvNext: mk(g.n, "qvNext")!, qcNext: mk(g.n, "qcNext")!, qrNext: mk(g.n, "qrNext")!,
      uNext: mk(g.nu, "uNext")!, vNext: mk(g.nv, "vNext")!, wNext: mk(g.nw, "wNext")!,
      div: mk(g.n, "div")!, pNext: mk(g.n, "pNext")!,
      theta0: mk(g.nz, "theta0")!, qv0: mk(g.nz, "qv0")!, p0: mk(g.nz, "p0")!, rho0: mk(g.nz, "rho0")!, rho0w: mk(g.nz + 1, "rho0w")!,
      u0: mk(g.nz, "u0")!, v0: mk(g.nz, "v0")!,
      uniforms: d.createBuffer(this.byteLen(UNIFORM_COUNT), GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST),
      readback,
    };
  }

  private writeBuffer(buf: GPUBuffer, data: Float32Array): void {
    this.dev().queue.writeBuffer(buf, 0, data.buffer, data.byteOffset, data.byteLength);
  }

  private uploadFields(fields: SimFields, g: Grid3D, b: NonNullable<typeof this.b>): void {
    this.writeBuffer(b.theta, fields.theta);
    this.writeBuffer(b.qv, fields.qv);
    this.writeBuffer(b.qc, fields.qc);
    this.writeBuffer(b.qr, fields.qr);
    this.writeBuffer(b.p, fields.p);
    this.writeBuffer(b.u, fields.u);
    this.writeBuffer(b.v, fields.v);
    this.writeBuffer(b.w, fields.w);
    this.writeBuffer(b.thetaNext, fields.theta);
    this.writeBuffer(b.qvNext, fields.qv);
    this.writeBuffer(b.qcNext, fields.qc);
    this.writeBuffer(b.qrNext, fields.qr);
    this.writeBuffer(b.uNext, fields.u);
    this.writeBuffer(b.vNext, fields.v);
    this.writeBuffer(b.wNext, fields.w);
    this.writeBuffer(b.theta0, fields.theta0);
    this.writeBuffer(b.qv0, fields.qv0);
    this.writeBuffer(b.p0, fields.p0);
    this.writeBuffer(b.rho0, fields.rho0);
    this.writeBuffer(b.rho0w, fields.rho0w);
    this.writeBuffer(b.u0, fields.u0);
    this.writeBuffer(b.v0, fields.v0);
  }

  private setUniforms(g: Grid3D, dt: number): void {
    const u = new Float32Array(UNIFORM_COUNT);
    u[0] = g.nx; u[1] = g.ny; u[2] = g.nz;
    u[3] = g.dx; u[4] = g.dy; u[5] = g.dz;
    u[6] = 1 / g.dx; u[7] = 1 / g.dy; u[8] = 1 / g.dz;
    u[9] = dt; u[10] = 1 / Math.max(1e-6, dt); u[11] = G;
    u[12] = g.nx + 1; u[13] = g.ny + 1; u[14] = g.nz + 1;
    u[15] = g.nx * g.ny;
    this.dev().queue.writeBuffer(this.b!.uniforms, 0, u.buffer, u.byteOffset, u.byteLength);
  }

  private buildPipelines(g: Grid3D): void {
    const d = this.dev();
    this.unifLayout = d.device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }],
    });
    for (const [key, spec] of Object.entries(KERNELS)) {
      const storageEntries = spec.storage.map((s, idx) => ({
        binding: idx,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: (s.readonly ? "read-only-storage" : "storage") as GPUBufferBindingType,
        },
      }));
      const layout = d.device.createBindGroupLayout({ entries: storageEntries });
      this.storLayout.set(key, layout);
      const pipelineLayout = d.device.createPipelineLayout({ bindGroupLayouts: [this.unifLayout!, layout] });
      const module = d.device.createShaderModule({ code: spec.wgsl });
      this.pipe.set(key, d.device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: spec.entry } }));
    }
  }

  private bindGroup(storageBuffers: GPUBuffer[], layout: GPUBindGroupLayout): GPUBindGroup {
    const d = this.dev();
    const entries = storageBuffers.map((buf, i) => ({
      binding: i,
      resource: { buffer: buf },
    }));
    return d.device.createBindGroup({ layout, entries });
  }

  rebuild(grid: Grid3D, sounding: SoundingLevel[], opts: InitOptions): void {
    this.grid = grid;
    this.fields = createFields(grid);
    this.time = 0;
    this.stepCount = 0;
    initFromSounding(grid, sounding, this.fields, opts);
    const b = this.allocBuffers(grid);
    if (!b) {
      this.ready = false;
      return;
    }
    this.b = b;
    this.uploadFields(this.fields, grid, this.b);
    this.buildPipelines(grid);
    const d = this.dev();
    // Uniform bind group (shared)
    this.unifBG = d.device.createBindGroup({
      layout: this.unifLayout!,
      entries: [{ binding: 0, resource: { buffer: b.uniforms, offset: 0, size: this.byteLen(UNIFORM_COUNT) } }],
    });
  }

  reset(sounding: SoundingLevel[], opts: InitOptions): void {
    this.time = 0;
    this.stepCount = 0;
    initFromSounding(this.grid, sounding, this.fields, opts);
    this.uploadFields(this.fields, this.grid, this.b!);
  }

  setRadiation(partial: Partial<RadiationOptions>): void {
    this.radiation = { ...this.radiation, ...partial };
    if (this.radiation.month < 1) this.radiation.month = 1;
    if (this.radiation.month > 12) this.radiation.month = 12;
    this.radiation.latitudeDeg = Math.max(-90, Math.min(90, this.radiation.latitudeDeg));
    this.radiation.solarHour = ((this.radiation.solarHour % 24) + 24) % 24;
  }
  setSolarHour(hour: number): void {
    this.radiation.solarHour = ((hour % 24) + 24) % 24;
  }
  getSolarStatus(): SolarStatus {
    return { cosZ: 0, isDay: true, sunFrac: 0, clock: "12:00", label: "day" };
  }

  /** Submit GPU dynamical-core work and read fields back into CPU mirrors. */
  async step(dt: number): Promise<void> {
    if (!this.b || !this.pipe) return;
    const g = this.grid;
    const b = this.b;
    const d = this.dev();
    this.setUniforms(g, dt);

    const enc = d.device.createCommandEncoder();
    const pass = enc.beginComputePass();

    const dispatch = (key: string, nxg: number, nyg: number, nzg: number, bg1: GPUBindGroup) => {
      const pipeline = this.pipe!.get(key)!;
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, this.unifBG!);
      pass.setBindGroup(1, bg1);
      const gx = Math.max(1, Math.ceil(nxg / TILE_X));
      const gy = Math.max(1, Math.ceil(nyg / TILE_Y));
      const gz = Math.max(1, nzg);
      pass.dispatchWorkgroups(gx, gy, gz);
    };

    const makeBG = (key: string, bufs: GPUBuffer[]): GPUBindGroup =>
      this.bindGroup(bufs, this.storLayout.get(key)!);

    const isHydrostatic =
      this.hydrostatic === "on" ||
      (this.hydrostatic === "auto" && Math.min(g.dx, g.dy) > 5000);
    // 1) Buoyancy: w += buoy*dt (w in place) — skipped in hydrostatic balance
    if (!isHydrostatic) {
      dispatch("buoyancy", g.nx, g.ny, 1, makeBG("buoyancy", [b.theta, b.qv, b.qc, b.qr, b.theta0, b.qv0, b.w]));
    }

    // 2) Advect velocity into Next buffers
    dispatch("advectU", g.nx + 1, g.ny, g.nz, makeBG("advectU", [b.u, b.v, b.w, b.uNext]));
    dispatch("advectV", g.nx, g.ny + 1, g.nz, makeBG("advectV", [b.u, b.v, b.w, b.vNext]));
    dispatch("advectW", g.nx, g.ny, g.nz + 1, makeBG("advectW", [b.u, b.v, b.w, b.wNext]));

    // 3) Copy Next -> current (u, v, w)
    dispatch("copy", g.nu, 1, 1, makeBG("copy", [b.uNext, b.u]));
    dispatch("copy", g.nv, 1, 1, makeBG("copy", [b.vNext, b.v]));
    dispatch("copy", g.nw, 1, 1, makeBG("copy", [b.wNext, b.w]));

    // 4) Fill divergence
    dispatch("fillDiv", g.nx, g.ny, g.nz, makeBG("fillDiv", [b.u, b.v, b.w, b.rho0, b.rho0w, b.div]));

    // 5) Jacobi pressure iterations (ping-pong p/pNext), rhs = div
    let pSrc = b.p; let pDst = b.pNext;
    for (let it = 0; it < 32; it++) {
      dispatch("jacobi", g.nx, g.ny, g.nz, makeBG("jacobi", [pSrc, b.div, b.rho0, b.rho0w, pDst]));
      const tmp = pSrc; pSrc = pDst; pDst = tmp;
    }
    // Ensure final pressure is in b.p
    if (pSrc !== b.p) {
      dispatch("copy", g.n, 1, 1, makeBG("copy", [pSrc, b.p]));
    }

    // 6) Correct velocity
    dispatch("correctVel", g.nx, g.ny, g.nz, makeBG("correctVel", [b.p, b.rho0, b.u, b.v, b.w]));

    // Set lids (w = 0 at k=0 and k=nz) — done on CPU mirror after readback

    // 7) Advect scalars into Next
    dispatch("advectScalars", g.nx, g.ny, g.nz, makeBG("advectScalars", [
      b.u, b.v, b.w, b.theta, b.qv, b.qc, b.qr, b.theta0, b.qv0,
      b.thetaNext, b.qvNext, b.qcNext, b.qrNext,
    ]));

    // 8) Copy Next -> current scalars
    dispatch("copy", g.n, 1, 1, makeBG("copy", [b.thetaNext, b.theta]));
    dispatch("copy", g.n, 1, 1, makeBG("copy", [b.qvNext, b.qv]));
    dispatch("copy", g.n, 1, 1, makeBG("copy", [b.qcNext, b.qc]));
    dispatch("copy", g.n, 1, 1, makeBG("copy", [b.qrNext, b.qr]));

    pass.end();
    d.queue.submit([enc.finish()]);
    await d.queue.onSubmittedWorkDone();

    // Read back all fields into CPU mirrors
    await this.readbackFields();

    // Apply CPU physics tendencies on the mirrored state
    this.applyPhysicsTendencies(dt);

    // Upload physics-modified state back to GPU for the next step
    this.uploadFields(this.fields, g, b);

    this.time += dt;
    this.stepCount++;
  }

  private async readbackFields(): Promise<void> {
    if (!this.b) return;
    const b = this.b;
    const d = this.dev();
    const g = this.grid;
    const n = g.n;
    const total = 5 * n + g.nu + g.nv + g.nw;
    const enc = d.device.createCommandEncoder();
    let offset = 0;
    const copy = (buf: GPUBuffer, count: number) => {
      enc.copyBufferToBuffer(buf, 0, b.readback, offset, this.byteLen(count));
      offset += count;
    };
    copy(b.theta, n); copy(b.qv, n); copy(b.qc, n); copy(b.qr, n); copy(b.p, n);
    copy(b.u, g.nu); copy(b.v, g.nv); copy(b.w, g.nw);
    d.queue.submit([enc.finish()]);
    await d.queue.onSubmittedWorkDone();
    await b.readback.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(b.readback.getMappedRange() as ArrayBuffer);
    let off = 0;
    const set = (dst: Float32Array, count: number) => { dst.set(data.subarray(off, off + count)); off += count; };
    set(this.fields.theta, n); set(this.fields.qv, n); set(this.fields.qc, n); set(this.fields.qr, n); set(this.fields.p, n);
    set(this.fields.u, g.nu); set(this.fields.v, g.nv); set(this.fields.w, g.nw);
    // Enforce impermeable lids
    for (let j = 0; j < g.ny; j++) {
      for (let i = 0; i < g.nx; i++) {
        this.fields.w[g.wIdx(i, j, 0)] = 0;
        this.fields.w[g.wIdx(i, j, g.nz)] = 0;
      }
    }
    b.readback.unmap();
  }

  private applyPhysicsTendencies(dt: number): void {
    const g = this.grid;
    const f = this.fields;
    const landMask = buildLandMask(g.nx, g.ny, getActiveSynoptic().marine);
    const exner = new Float32Array(g.nz);
    for (let k = 0; k < g.nz; k++) exner[k] = exnerFromP(f.p0[k]);
    const qrScratch = new Float32Array(g.n);
    const iceScratch = new Float32Array(g.n);

    applySurfaceRadiation(g, f, dt, this.radiation, landMask);
    stepShallowCu(g, f, dt, landMask, new Float32Array(g.nx * g.ny), exner, this.radiation);
    stepMicrophysics(g, f, dt, qrScratch, exner);
    stepIceMicrophysics(g, f, dt, exner, iceScratch);
    stepCloudTopCooling(g, f, dt, exner);
    stepBLMixing(g, f, dt, exner);
    stepSynopticOmega(g, f, dt);
    stepMarineStratus(g, f, dt, exner, landMask);
    advanceSynoptic(dt);
  }

  respawnBubble(opts?: Partial<InitOptions>): void {
    const strength = opts?.bubbleStrength ?? 3;
    const merged: InitOptions = { bubbleStrength: strength, synoptic: undefined };
    spawnInitBubble(this.grid, this.fields, merged);
  }

  packVolumeRGBA(out: Uint8Array): void {
    const f = this.fields;
    const { nx, ny, nz, n } = this.grid;
    const exner = new Float32Array(nz);
    for (let k = 0; k < nz; k++) exner[k] = exnerFromP(f.p0[k]);
    const cloudUnit = 0.002;
    const rainUnit = 0.0015;
    const byte = (q: number, unit: number): number => {
      if (q <= 0) return 0;
      const v = (q / unit) * 255;
      return v >= 255 ? 255 : v | 0;
    };
    const write = (id: number, k: number, o: number): void => {
      const tC = f.theta[id] * exner[k] - 273.15;
      const iceFrac = tC >= 0 ? 0 : tC <= -20 ? 1 : -tC / 20;
      const qc = f.qc[id];
      const liq = byte(qc * (1 - iceFrac), cloudUnit);
      const ice = byte(qc * iceFrac, cloudUnit);
      const rain = byte(f.qr[id], rainUnit);
      out[o] = liq;
      out[o + 1] = ice;
      out[o + 2] = rain;
      const m = liq > ice ? liq : ice;
      out[o + 3] = m > rain ? m : rain;
    };
    const d = volumeDisplaySize(nx, ny, nz);
    const need = d.nx * d.ny * d.nz * 4;
    if (out.length >= n * 4) {
      for (let k = 0; k < nz; k++) {
        for (let j = 0; j < ny; j++) {
          const row = k + nz * (ny - 1 - j);
          for (let i = 0; i < nx; i++) {
            write(i + nx * (j + ny * k), k, (i + nx * row) * 4);
          }
        }
      }
      return;
    }
    for (let k = 0; k < d.nz; k++) {
      const ks = Math.min(nz - 1, k * d.sz);
      for (let j = 0; j < d.ny; j++) {
        const js = Math.min(ny - 1, j * d.sy);
        const row = k + d.nz * (d.ny - 1 - j);
        for (let i = 0; i < d.nx; i++) {
          const is = Math.min(nx - 1, i * d.sx);
          write(is + nx * (js + ny * ks), ks, (i + d.nx * row) * 4);
        }
      }
    }
  }

  packMapProduct(id: MapProductId, out: Uint8Array): void {
    const need = this.grid.nx * this.grid.ny * 4;
    if (out.length < need) return;
    if (id === "ltg") {
      packLightning(this.grid, this.flashField(), out);
      return;
    }
    packMapProductRGBA(id, this.grid, this.fields, out);
  }

  private flashField(): Float32Array {
    // Lightning proxy: max column rain as a flash-rate proxy.
    const { nx, ny, nz } = this.grid;
    const flash = new Float32Array(nx * ny);
    const nxny = nx * ny;
    const f = this.fields;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let best = 0;
        for (let k = 0; k < nz; k++) {
          best = Math.max(best, f.qr[i + nx * (j + ny * k)]);
        }
        flash[i + j * nx] = best;
      }
    }
    return flash;
  }

  cloudRainStats(): { cloudMax: number; rainMax: number; cloudMass: number } {
    const f = this.fields;
    let cloudMax = 0; let rainMax = 0; let cloudMass = 0;
    for (let i = 0; i < f.qc.length; i++) {
      if (f.qc[i] > cloudMax) cloudMax = f.qc[i];
      if (f.qr[i] > rainMax) rainMax = f.qr[i];
      cloudMass += f.qc[i] + f.qr[i];
    }
    return { cloudMax, rainMax, cloudMass };
  }
  rollLightning(_dt: number): LightningStrike[] {
    return [];
  }
}
