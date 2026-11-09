/**
 * GPU-resident warm saturation + Kessler and display pack / stats kernels.
 * Used by WebGPUBackend so dynamical buffers stay on device across steps.
 */

export const warmSatWgsl = /* wgsl */ `
struct Params {
  nx: f32, ny: f32, nz: f32,
  dx: f32, dy: f32, dz: f32,
  invDx: f32, invDy: f32, invDz: f32,
  dt: f32, invDt: f32, g: f32,
  nxPlus1: f32, nyPlus1: f32, nzPlus1: f32,
  nxny: f32,
};
[[group(0), binding(0)]] var<uniform> par: Params;
[[group(1), binding(0)]] var<storage, read> p0: array<f32>;
[[group(1), binding(1)]] var<storage, read> exner: array<f32>;
[[group(1), binding(2)]] var<storage, read_write> theta: array<f32>;
[[group(1), binding(3)]] var<storage, read_write> qv: array<f32>;
[[group(1), binding(4)]] var<storage, read_write> qc: array<f32>;

fn esat(T: f32) -> f32 {
  let Tc = T - 273.15;
  return 611.2 * exp(17.67 * Tc / (Tc + 243.5));
}
fn mixr(e: f32, p: f32) -> f32 {
  return 0.622 * e / max(1.0, p - e);
}

[[stage(compute), workgroup_size(16, 16)]]
fn main([[builtin(global_invocation_id)]] id: vec3<u32>) {
  let i = i32(id.x);
  let j = i32(id.y);
  let nx = i32(par.nx);
  let ny = i32(par.ny);
  let nz = i32(par.nz);
  if (i >= nx || j >= ny) { return; }
  let LV = 2.5e6;
  let CP = 1004.0;
  for (var k: i32 = 0; k < nz; k = k + 1) {
    let idc = i + nx * (j + ny * k);
    var th = theta[idc];
    var q = max(0.0, qv[idc]);
    var c = max(0.0, qc[idc]);
    let p = p0[k];
    let ex = exner[k];
    let T = th * ex;
    let qs = max(1e-6, mixr(esat(T), p));
    let excess = q - qs;
    if (excess > 0.0) {
      let dqs_dT = (qs * LV) / (461.5 * max(T, 1.0) * max(T, 1.0));
      let dT_dq = (LV / CP) * (th / max(T, 1.0)) * ex;
      let denom = max(0.2, 1.0 + dqs_dT * dT_dq);
      let cond = excess / denom;
      q = q - cond;
      c = c + cond;
      th = th + (LV / CP) * cond * (th / max(T, 1.0));
    } else if (c > 0.0) {
      let evap = min(c, -excess);
      q = q + evap;
      c = c - evap;
      th = th - (LV / CP) * evap * (th / max(T, 1.0));
    }
    theta[idc] = th;
    qv[idc] = max(0.0, q);
    qc[idc] = max(0.0, c);
  }
}
`;

export const warmKesslerWgsl = /* wgsl */ `
struct Params {
  nx: f32, ny: f32, nz: f32,
  dx: f32, dy: f32, dz: f32,
  invDx: f32, invDy: f32, invDz: f32,
  dt: f32, invDt: f32, g: f32,
  nxPlus1: f32, nyPlus1: f32, nzPlus1: f32,
  nxny: f32,
};
[[group(0), binding(0)]] var<uniform> par: Params;
[[group(1), binding(0)]] var<storage, read> p0: array<f32>;
[[group(1), binding(1)]] var<storage, read> exner: array<f32>;
[[group(1), binding(2)]] var<storage, read> rho0: array<f32>;
[[group(1), binding(3)]] var<storage, read_write> theta: array<f32>;
[[group(1), binding(4)]] var<storage, read_write> qv: array<f32>;
[[group(1), binding(5)]] var<storage, read_write> qc: array<f32>;
[[group(1), binding(6)]] var<storage, read_write> qr: array<f32>;

fn esat(T: f32) -> f32 {
  let Tc = T - 273.15;
  return 611.2 * exp(17.67 * Tc / (Tc + 243.5));
}
fn mixr(e: f32, p: f32) -> f32 {
  return 0.622 * e / max(1.0, p - e);
}

[[stage(compute), workgroup_size(16, 16)]]
fn main([[builtin(global_invocation_id)]] id: vec3<u32>) {
  let i = i32(id.x);
  let j = i32(id.y);
  let nx = i32(par.nx);
  let ny = i32(par.ny);
  let nz = i32(par.nz);
  if (i >= nx || j >= ny) { return; }
  let dt = par.dt;
  let autoc = 0.001;
  let qcrit = 0.0005;
  let accr = 1.15;
  let evapRain = 0.028;
  let LV = 2.5e6;
  let CP = 1004.0;
  for (var k: i32 = 0; k < nz; k = k + 1) {
    let idc = i + nx * (j + ny * k);
    var q = max(0.0, qv[idc]);
    var c = max(0.0, qc[idc]);
    var r = max(0.0, qr[idc]);
    var th = theta[idc];
    if (c < 1e-10 && r < 1e-10) { continue; }
    let p = p0[k];
    let ex = exner[k];
    let T = th * ex;
    let qs = max(1e-6, mixr(esat(T), p));
    if (c > qcrit) {
      let auto = min(c - qcrit * 0.5, autoc * dt * (c - qcrit));
      if (auto > 0.0) {
        c = c - auto;
        r = r + auto;
      }
    }
    if (c > 0.0 && r > 0.0) {
      let ac = min(c, accr * c * r * dt);
      c = c - ac;
      r = r + ac;
    }
    if (r > 0.0 && q < qs) {
      let ev = min(r, evapRain * (qs - q) * dt);
      r = r - ev;
      q = q + ev;
      th = th - (LV / CP) * ev * (th / max(T, 1.0));
    }
    // Simple sedimentation: rain falls one cell when vt*dt > 0.5 dz
    let rho = rho0[k];
    let bulk = max(1e-6, rho * r);
    let vt = min(12.0, 14.0 * pow(bulk / 1e-3, 0.125));
    if (k > 0 && r > 1e-9 && vt * dt > 0.25 * par.dz) {
      let flux = min(r, r * vt * dt / max(par.dz, 1.0));
      r = r - flux;
      let below = i + nx * (j + ny * (k - 1));
      qr[below] = qr[below] + flux;
    }
    qv[idc] = max(0.0, q);
    qc[idc] = max(0.0, c);
    qr[idc] = max(0.0, r);
    theta[idc] = th;
  }
}
`;

/** Display pack: max-pool hydrometeors into ≤160×160×72 RGBA (as packed u32). */
export const packVolumeWgsl = /* wgsl */ `
struct PackParams {
  nx: f32, ny: f32, nz: f32,
  dnx: f32, dny: f32, dnz: f32,
  sx: f32, sy: f32, sz: f32,
  _pad0: f32, _pad1: f32, _pad2: f32,
  _pad3: f32, _pad4: f32, _pad5: f32, _pad6: f32,
};
[[group(0), binding(0)]] var<uniform> par: PackParams;
[[group(1), binding(0)]] var<storage, read> qc: array<f32>;
[[group(1), binding(1)]] var<storage, read> qr: array<f32>;
[[group(1), binding(2)]] var<storage, read> qi: array<f32>;
[[group(1), binding(3)]] var<storage, read> qs: array<f32>;
[[group(1), binding(4)]] var<storage, read> qg: array<f32>;
[[group(1), binding(5)]] var<storage, read> qh: array<f32>;
[[group(1), binding(6)]] var<storage, read_write> outPack: array<u32>;

fn cloudOp(c: f32) -> f32 {
  if (c > 3e-5) { return 1.0 - exp(-(c - 3e-5) / 4e-4); }
  return 0.0;
}
fn byte01(v: f32) -> u32 {
  if (v <= 0.0) { return 0u; }
  let x = v * 255.0;
  if (x >= 255.0) { return 255u; }
  return u32(x);
}
fn rainByte(qr: f32) -> u32 {
  if (qr <= 0.0) { return 0u; }
  let x = pow(qr / 0.0015, 0.65) * 255.0;
  if (x >= 255.0) { return 255u; }
  return u32(x);
}
fn hailByte(qh: f32) -> u32 {
  if (qh <= 1e-7) { return 0u; }
  let x = pow(qh / 0.0008, 0.65) * 255.0;
  if (x >= 255.0) { return 255u; }
  return u32(x);
}

[[stage(compute), workgroup_size(4, 4, 4)]]
fn main([[builtin(global_invocation_id)]] id: vec3<u32>) {
  let di = i32(id.x);
  let dj = i32(id.y);
  let dk = i32(id.z);
  let dnx = i32(par.dnx);
  let dny = i32(par.dny);
  let dnz = i32(par.dnz);
  if (di >= dnx || dj >= dny || dk >= dnz) { return; }
  let nx = i32(par.nx);
  let ny = i32(par.ny);
  let nz = i32(par.nz);
  let sx = i32(par.sx);
  let sy = i32(par.sy);
  let sz = i32(par.sz);
  let i0 = min(nx - 1, di * sx);
  let i1 = min(nx, i0 + sx);
  let j0 = min(ny - 1, dj * sy);
  let j1 = min(ny, j0 + sy);
  let k0 = min(nz - 1, dk * sz);
  let k1 = min(nz, k0 + sz);
  var bestQc = 0.0;
  var bestCold = 0.0;
  var bestQr = 0.0;
  var bestQh = 0.0;
  for (var kk = k0; kk < k1; kk = kk + 1) {
    for (var jj = j0; jj < j1; jj = jj + 1) {
      let base = nx * (jj + ny * kk);
      for (var ii = i0; ii < i1; ii = ii + 1) {
        let cid = ii + base;
        let liq = cloudOp(qc[cid]);
        if (liq > bestQc) { bestQc = liq; }
        let ice = cloudOp(0.25 * qi[cid]);
        var snow = 0.0;
        if (qs[cid] > 1e-8) { snow = min(1.0, pow(qs[cid] / 0.00015, 0.55)); }
        let graupel = cloudOp(0.2 * qg[cid]);
        let cold = min(1.0, ice + snow * 0.85 + graupel);
        if (cold > bestCold) { bestCold = cold; }
        if (qr[cid] > bestQr) { bestQr = qr[cid]; }
        if (qh[cid] > bestQh) { bestQh = qh[cid]; }
      }
    }
  }
  let row = dk + dnz * (dny - 1 - dj);
  let o = di + dnx * row;
  let r = byte01(bestQc);
  let g = byte01(bestCold);
  let b = rainByte(bestQr);
  let a = hailByte(bestQh);
  outPack[o] = r | (g << 8u) | (b << 16u) | (a << 24u);
}
`;

/** Column-wise cloud/rain maxima + mass into a small buffer (nx*ny of vec4). */
export const columnStatsWgsl = /* wgsl */ `
struct Params {
  nx: f32, ny: f32, nz: f32,
  dx: f32, dy: f32, dz: f32,
  invDx: f32, invDy: f32, invDz: f32,
  dt: f32, invDt: f32, g: f32,
  nxPlus1: f32, nyPlus1: f32, nzPlus1: f32,
  nxny: f32,
};
[[group(0), binding(0)]] var<uniform> par: Params;
[[group(1), binding(0)]] var<storage, read> qc: array<f32>;
[[group(1), binding(1)]] var<storage, read> qr: array<f32>;
[[group(1), binding(2)]] var<storage, read> qi: array<f32>;
[[group(1), binding(3)]] var<storage, read> qs: array<f32>;
[[group(1), binding(4)]] var<storage, read> qg: array<f32>;
[[group(1), binding(5)]] var<storage, read> qh: array<f32>;
[[group(1), binding(6)]] var<storage, read_write> colOut: array<vec4<f32>>;

[[stage(compute), workgroup_size(16, 16)]]
fn main([[builtin(global_invocation_id)]] id: vec3<u32>) {
  let i = i32(id.x);
  let j = i32(id.y);
  let nx = i32(par.nx);
  let ny = i32(par.ny);
  let nz = i32(par.nz);
  if (i >= nx || j >= ny) { return; }
  var cloudMax = 0.0;
  var rainMax = 0.0;
  var mass = 0.0;
  for (var k: i32 = 0; k < nz; k = k + 1) {
    let cid = i + nx * (j + ny * k);
    let cold = qi[cid] + qs[cid] + qg[cid] + qh[cid];
    let cloud = qc[cid] + cold;
    if (cloud > cloudMax) { cloudMax = cloud; }
    if (qr[cid] > rainMax) { rainMax = qr[cid]; }
    mass = mass + cloud + qr[cid];
  }
  colOut[i + j * nx] = vec4<f32>(cloudMax, rainMax, mass, 0.0);
}
`;
