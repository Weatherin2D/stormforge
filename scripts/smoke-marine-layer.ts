/**
 * Cool water + moist BL + gray longwave / K-profile should produce cloud
 * near the inversion without a marine-stratus seeder.
 */
import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { SURFACE_N } from "../src/sim/surface";
import { defaultSounding } from "../src/sim/thermo";

const g = new Grid3D({
  nx: 24,
  ny: 24,
  nz: 28,
  zTop: 4000,
  xExtent: 48000,
  yExtent: 48000,
});

// Entirely ocean surface, cool SST.
const water = new Float32Array(SURFACE_N * SURFACE_N);
const kind = new Float32Array(SURFACE_N * SURFACE_N);
const waterTemp = new Float32Array(SURFACE_N * SURFACE_N);
water.fill(1);
kind.fill(2);
waterTemp.fill(14);

const sounding = defaultSounding(4000, 28);
// Stable cool moist BL with an inversion.
for (const lvl of sounding) {
  if (lvl.z < 800) {
    lvl.T = 285 - 0.003 * lvl.z;
    lvl.Td = lvl.T - 1.5;
  } else if (lvl.z < 1200) {
    lvl.T = 286 + 0.01 * (lvl.z - 800);
    lvl.Td = 280;
  }
}

const s = new FluidSolver(g);
s.setRadiation({
  enabled: true,
  latitudeDeg: 35,
  month: 6,
  solarHour: 6,
  diurnalSpeed: 15,
});
s.rebuild(g, sounding, {
  bubbleStrength: 0,
  synoptic: {
    marine: true,
    latitudeDeg: 35,
    enabled: true,
    jetstream: false,
    fronts: [],
    centers: [],
  },
  surface: { water, kind, waterTemp, sstC: 14 },
});

for (let i = 0; i < 120; i++) s.step(30);

const f = s.fields;
let cloudNearInv = 0;
let cloudHigh = 0;
const kInv = Math.floor(1000 / g.dz);
for (let j = 0; j < g.ny; j++) {
  for (let i = 0; i < g.nx; i++) {
    for (let k = 0; k < g.nz; k++) {
      const qc = f.qc[g.idx(i, j, k)];
      if (k >= kInv - 2 && k <= kInv + 4) cloudNearInv = Math.max(cloudNearInv, qc);
      if (k > kInv + 8) cloudHigh = Math.max(cloudHigh, qc);
    }
  }
}
const st = s.cloudRainStats();
console.log(
  JSON.stringify(
    {
      cloudNearInv: +cloudNearInv.toFixed(6),
      cloudHigh: +cloudHigh.toFixed(6),
      cloudMax: +st.cloudMax.toFixed(6),
    },
    null,
    2,
  ),
);

if (cloudNearInv <= 1e-5 && st.cloudMax <= 1e-5) {
  console.error("FAIL: no marine-layer cloud near the inversion");
  process.exit(2);
}
console.log("OK");
