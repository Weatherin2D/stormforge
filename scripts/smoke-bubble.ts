/**
 * Moist warm-bubble conservation: total water and a moist static energy
 * proxy must not drift by more than ~1% over the rise.
 */
import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { CP, G, LV, defaultSounding } from "../src/sim/thermo";

const g = new Grid3D({
  nx: 32,
  ny: 32,
  nz: 32,
  zTop: 10000,
  xExtent: 20000,
  yExtent: 20000,
});
const s = new FluidSolver(g);
s.rebuild(g, defaultSounding(10000, 30), {
  bubbleStrength: 5,
  bubbleRadiusFrac: 0.2,
  synoptic: {
    marine: false,
    latitudeDeg: 35,
    enabled: false,
    jetstream: false,
    fronts: [],
    centers: [],
  },
});

function totals() {
  const f = s.fields;
  let water = 0;
  let mse = 0;
  let mass = 0;
  for (let k = 0; k < g.nz; k++) {
    const rho = f.rho0[k];
    const z = (k + 0.5) * g.dz;
    const vol = g.dx * g.dy * g.dz;
    for (let j = 0; j < g.ny; j++) {
      for (let i = 0; i < g.nx; i++) {
        const id = g.idx(i, j, k);
        const q =
          f.qv[id] + f.qc[id] + f.qr[id] + f.qi[id] + f.qs[id] + f.qg[id] + f.qh[id];
        water += rho * q * vol;
        mse += rho * (CP * f.theta[id] + LV * f.qv[id] + G * z) * vol;
        mass += rho * vol;
      }
    }
  }
  return { water, mse, mass };
}

const t0 = totals();
for (let i = 0; i < 120; i++) s.step(2);
const t1 = totals();
const st = s.cloudRainStats();

const dWater = Math.abs(t1.water - t0.water) / Math.max(t0.water, 1e-12);
const dMse = Math.abs(t1.mse - t0.mse) / Math.max(Math.abs(t0.mse), 1e-12);

console.log(
  JSON.stringify(
    {
      cloudMax: +st.cloudMax.toFixed(5),
      waterDrift: +dWater.toFixed(5),
      mseDrift: +dMse.toFixed(5),
      water0: +t0.water.toFixed(2),
      water1: +t1.water.toFixed(2),
    },
    null,
    2,
  ),
);

if (st.cloudMax <= 0) {
  console.error("FAIL: bubble produced no cloud");
  process.exit(2);
}
if (dWater > 0.05) {
  // Allow a few % for rain leaving the domain via sedimentation surface sink.
  console.error("FAIL: total water drift too large", dWater);
  process.exit(3);
}
if (dMse > 0.05) {
  console.error("FAIL: moist static energy drift too large", dMse);
  process.exit(4);
}
console.log("OK");
