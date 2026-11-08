import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver, stableOuterDt } from "../src/sim/FluidSolver";
import { defaultSounding } from "../src/sim/thermo";
import { resetAdvanced } from "../src/sim/AdvancedSettings";
import { defaultSynoptic } from "../src/sim/synoptic";
import { integrateCapeCin } from "../src/sim/cape";
import { TFromTheta, dewpointFromE } from "../src/sim/thermo";

resetAdvanced();
const g = new Grid3D({ nx: 64, ny: 64, nz: 32, zTop: 12000, xExtent: 64000, yExtent: 64000 });
const s = new FluidSolver(g);
s.rebuild(g, defaultSounding(12000, 30), { bubbleStrength: 3, synoptic: defaultSynoptic() });
const dt = stableOuterDt(g.dx, g.dy, g.dz, false);
for (let i = 0; i < 30; i++) s.step(dt);

const f = s.fields;
const z = new Float32Array(g.nz);
const p = new Float32Array(g.nz);
const T = new Float32Array(g.nz);
const Td = new Float32Array(g.nz);
const cape = new Float32Array(g.nx * g.ny);
const fog = new Float32Array(g.nx * g.ny); // low-level qc
const rhSfc = new Float32Array(g.nx * g.ny);

let checker = 0;
let fogCape = 0;
let fogCols = 0;
let capeCols = 0;
let maxCape = 0;
let stripeScore = 0;

for (let j = 0; j < g.ny; j++) {
  for (let i = 0; i < g.nx; i++) {
    const ij = i + j * g.nx;
    let qcLow = 0;
    for (let k = 0; k < Math.min(6, g.nz); k++) {
      qcLow += f.qc[g.idx(i, j, k)];
    }
    fog[ij] = qcLow;
    for (let k = 0; k < g.nz; k++) {
      const id = g.idx(i, j, k);
      z[k] = (k + 0.5) * g.dz;
      p[k] = f.p0[k];
      T[k] = TFromTheta(f.theta[id], f.p0[k]);
      const qv = Math.max(0, f.qv[id]);
      const e = (qv * f.p0[k]) / (0.622 + qv);
      Td[k] = dewpointFromE(Math.max(1, e)) + 273.15;
    }
    const ix = integrateCapeCin(z, p, T, Td, g.nz, g.zTop);
    cape[ij] = ix.cape;
    if (ix.cape > maxCape) maxCape = ix.cape;
    if (qcLow > 5e-4) {
      fogCols++;
      if (ix.cape > 500) fogCape++;
    }
    if (ix.cape > 500) capeCols++;
  }
}

// Checkerboard: |cape[i,j] - cape[i+1,j]| large and alternating
for (let j = 1; j < g.ny - 1; j++) {
  for (let i = 1; i < g.nx - 1; i++) {
    const c = cape[i + j * g.nx];
    const e = cape[i + 1 + j * g.nx];
    const n = cape[i + (j + 1) * g.nx];
    const d1 = Math.abs(c - e);
    const d2 = Math.abs(c - n);
    if (d1 > 400 && d2 > 400) {
      // neighbors of neighbor should be similar to c for checkerboard
      const ee = cape[i + 1 + (j + 1) * g.nx];
      if (Math.abs(c - ee) < 200 && Math.abs(e - n) < 200) checker++;
    }
    // diagonal stripe score: strong gradient along one diagonal
    const ne = cape[i + 1 + (j + 1) * g.nx];
    const nw = cape[i - 1 + (j + 1) * g.nx];
    if (Math.abs(c - ne) > 500 && Math.abs(c - nw) < 150) stripeScore++;
  }
}

// theta checkerboard near surface
let thCheck = 0;
for (let j = 1; j < g.ny - 1; j++) {
  for (let i = 1; i < g.nx - 1; i++) {
    const a = f.theta[g.idx(i, j, 2)];
    const b = f.theta[g.idx(i + 1, j, 2)];
    const c = f.theta[g.idx(i, j + 1, 2)];
    const d = f.theta[g.idx(i + 1, j + 1, 2)];
    if (Math.abs(a - b) > 0.8 && Math.abs(a - c) > 0.8 && Math.abs(a - d) < 0.4) thCheck++;
  }
}

let qcMax = 0, qcSfcMax = 0;
for (let k = 0; k < g.nz; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
  const qc = f.qc[g.idx(i, j, k)];
  if (qc > qcMax) qcMax = qc;
  if (k < 3 && qc > qcSfcMax) qcSfcMax = qc;
}

console.log(JSON.stringify({
  maxCape: +maxCape.toFixed(0),
  capeCols, fogCols, fogCape,
  fogCapeFrac: fogCols ? +(fogCape / fogCols).toFixed(3) : 0,
  checker, stripeScore, thCheck,
  qcMax: +qcMax.toFixed(5),
  qcSfcMax: +qcSfcMax.toFixed(5),
  cloudRain: s.cloudRainStats(),
}, null, 2));
