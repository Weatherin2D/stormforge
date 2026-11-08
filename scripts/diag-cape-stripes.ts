import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver, stableOuterDt } from "../src/sim/FluidSolver";
import { defaultSounding, TFromTheta, dewpointFromE, esatFast, mixingRatio } from "../src/sim/thermo";
import { resetAdvanced } from "../src/sim/AdvancedSettings";
import { defaultSynoptic } from "../src/sim/synoptic";
import { integrateCapeCin } from "../src/sim/cape";
import { packMapProduct } from "../src/sim/mapProducts";

resetAdvanced();
const g = new Grid3D({ nx: 64, ny: 64, nz: 36, zTop: 14000, xExtent: 96000, yExtent: 96000 });
const s = new FluidSolver(g);
s.rebuild(g, defaultSounding(14000, 36), { bubbleStrength: 0, synoptic: defaultSynoptic() });
const dt = stableOuterDt(g.dx, g.dy, g.dz, false);
for (let i = 0; i < 50; i++) s.step(dt);

const f = s.fields;
const z = new Float32Array(g.nz);
const p = new Float32Array(g.nz);
const T = new Float32Array(g.nz);
const Td = new Float32Array(g.nz);
const cape = new Float32Array(g.nx * g.ny);
const cin = new Float32Array(g.nx * g.ny);
const sfcRH = new Float32Array(g.nx * g.ny);
const qcSfc = new Float32Array(g.nx * g.ny);

for (let j = 0; j < g.ny; j++) {
  for (let i = 0; i < g.nx; i++) {
    const ij = i + j * g.nx;
    for (let k = 0; k < g.nz; k++) {
      const id = g.idx(i, j, k);
      z[k] = (k + 0.5) * g.dz;
      p[k] = f.p0[k];
      T[k] = TFromTheta(f.theta[id], f.p0[k]);
      const qv = Math.max(0, f.qv[id]);
      const e = (qv * f.p0[k]) / (0.622 + qv);
      Td[k] = Math.min(T[k], dewpointFromE(Math.max(1, e)) + 273.15);
    }
    const ix = integrateCapeCin(z, p, T, Td, g.nz, g.zTop, false);
    cape[ij] = ix.cape;
    cin[ij] = ix.cin;
    const qs = mixingRatio(esatFast(T[0]), p[0]);
    sfcRH[ij] = f.qv[g.idx(i,j,0)] / Math.max(qs, 1e-8);
    qcSfc[ij] = f.qc[g.idx(i,j,0)] + f.qc[g.idx(i,j,1)] + f.qc[g.idx(i,j,2)];
  }
}

// Find warm-sector rows and measure alternating CAPE
let altPairs = 0, altSum = 0, samples = 0;
for (let j = 0; j < g.ny; j++) {
  for (let i = 0; i < g.nx - 1; i++) {
    const a = cape[i + j * g.nx];
    const b = cape[i + 1 + j * g.nx];
    const d = Math.abs(a - b);
    if (d > 300) {
      altPairs++;
      altSum += d;
    }
    samples++;
  }
}

// CAPE where foggy (RH>0.97 or qc>1e-4 near sfc)
let fogN=0, fogHighCape=0, fogMeanCape=0, fogMeanCin=0;
let clearN=0, clearMeanCape=0;
for (let ij = 0; ij < cape.length; ij++) {
  const foggy = sfcRH[ij] > 0.97 || qcSfc[ij] > 1e-4;
  if (foggy) {
    fogN++; fogMeanCape += cape[ij]; fogMeanCin += cin[ij];
    if (cape[ij] > 500) fogHighCape++;
  } else {
    clearN++; clearMeanCape += cape[ij];
  }
}

// Pack CAPE product and look for stripe contrast in RGBA brightness
const rgba = new Uint8Array(g.nx * g.ny * 4);
packMapProduct("cape", g, f, rgba);
let brightFlip = 0;
for (let j = 0; j < g.ny; j++) {
  for (let i = 0; i < g.nx - 1; i++) {
    const o = (i + j * g.nx) * 4;
    const o2 = (i + 1 + j * g.nx) * 4;
    const y1 = 0.3*rgba[o]+0.6*rgba[o+1]+0.1*rgba[o+2];
    const y2 = 0.3*rgba[o2]+0.6*rgba[o2+1]+0.1*rgba[o2+2];
    if (Math.abs(y1 - y2) > 40) brightFlip++;
  }
}

console.log(JSON.stringify({
  altFrac: +(altPairs/samples).toFixed(3),
  altMeanD: altPairs ? +(altSum/altPairs).toFixed(0) : 0,
  fogN, fogHighCape, fogHighFrac: fogN?+(fogHighCape/fogN).toFixed(3):0,
  fogMeanCape: fogN?+(fogMeanCape/fogN).toFixed(0):0,
  fogMeanCin: fogN?+(fogMeanCin/fogN).toFixed(0):0,
  clearMeanCape: clearN?+(clearMeanCape/clearN).toFixed(0):0,
  brightFlip, brightFlipFrac: +(brightFlip/samples).toFixed(3),
  maxCape: +Math.max(...cape).toFixed(0),
  maxQcSfc: +Math.max(...qcSfc).toFixed(5),
}, null, 2));
