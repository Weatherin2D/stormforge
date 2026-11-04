/**
 * Short Weisman–Klemp-like environment: updraft, surface cold pool, and rain.
 */
import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { SoundingLevel, pressureAtZ, thetaFromT } from "../src/sim/thermo";

function weismanKlemp(zTop: number, n = 40): SoundingLevel[] {
  const levels: SoundingLevel[] = [];
  for (let i = 0; i < n; i++) {
    const z = (i / (n - 1)) * zTop;
    const p = pressureAtZ(z, zTop, 300);
    // Warm moist BL, steep mid-level lapse, veering shear.
    let T = 300 - 0.009 * z;
    if (z > 12000) T = 218;
    let TdC = 22 - 0.004 * z;
    if (z > 1500) TdC = 12 - 0.006 * (z - 1500);
    if (z > 5000) TdC = -10 - 0.004 * (z - 5000);
    const u = Math.min(35, 0.0045 * z); // ~0–35 m/s shear
    const v = z < 2000 ? 0.002 * z : 4;
    levels.push({ z, p, T, Td: TdC + 273.15, u, v });
    void thetaFromT;
  }
  return levels;
}

const g = new Grid3D({
  nx: 40,
  ny: 40,
  nz: 32,
  zTop: 16000,
  xExtent: 40000,
  yExtent: 40000,
});
const s = new FluidSolver(g);
s.rebuild(g, weismanKlemp(16000, 40), {
  bubbleStrength: 4,
  bubbleRadiusFrac: 0.12,
  synoptic: {
    marine: false,
    latitudeDeg: 35,
    enabled: false,
    jetstream: false,
    fronts: [],
    centers: [],
  },
});

for (let i = 0; i < 180; i++) s.step(2);

const f = s.fields;
let wMax = 0;
let cold = 0;
for (let k = 1; k < g.nz; k++) {
  for (let j = 0; j < g.ny; j++) {
    for (let i = 0; i < g.nx; i++) {
      const w = f.w[g.wIdx(i, j, k)];
      if (w > wMax) wMax = w;
    }
  }
}
for (let j = 0; j < g.ny; j++) {
  for (let i = 0; i < g.nx; i++) {
    const dth = f.theta[g.idx(i, j, 0)] - f.theta0[0];
    if (dth < cold) cold = dth;
  }
}
const st = s.cloudRainStats();
console.log(
  JSON.stringify(
    {
      wMax: +wMax.toFixed(2),
      coldPoolK: +cold.toFixed(2),
      cloudMax: +st.cloudMax.toFixed(5),
      rainMax: +st.rainMax.toFixed(5),
    },
    null,
    2,
  ),
);

if (wMax < 2) {
  console.error("FAIL: no strong updraft");
  process.exit(2);
}
if (cold > -0.5) {
  console.error("FAIL: no surface cold pool");
  process.exit(3);
}
if (st.rainMax <= 0 && st.cloudMax <= 0) {
  console.error("FAIL: no cloud/rain");
  process.exit(4);
}
console.log("OK");
