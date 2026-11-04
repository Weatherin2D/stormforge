/**
 * Drawn low on a ~20 km grid: initial surface wind is near-cyclonic,
 * and the hydrostatic + cumulus path produces cloud/rain near the centre.
 */
import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { defaultSounding } from "../src/sim/thermo";
import type { SynopticSetup } from "../src/sim/synoptic";
import { resetAdvanced } from "../src/sim/AdvancedSettings";

resetAdvanced();

const setup: SynopticSetup = {
  marine: false,
  latitudeDeg: 40,
  enabled: true,
  jetstream: false,
  move: false,
  fronts: [],
  centers: [
    { id: "low1", kind: "low", enabled: true, x: 0.5, y: 0.5, hPa: 10 },
  ],
};

const g = new Grid3D({
  nx: 16,
  ny: 16,
  nz: 16,
  zTop: 12000,
  xExtent: 320000,
  yExtent: 320000,
});
const s = new FluidSolver(g);
s.hydrostatic = "on";
s.rebuild(g, defaultSounding(12000, 25), { bubbleStrength: 0, synoptic: setup });

const f = s.fields;
const iE = Math.floor(g.nx * 0.7);
const iW = Math.floor(g.nx * 0.3);
const jC = Math.floor(g.ny * 0.5);
const vEast = f.v[g.vIdx(iE, jC, 0)];
const vWest = f.v[g.vIdx(iW, jC, 0)];
const cyclonic = vEast - vWest;

console.log(`cyclonic shear vE-vW = ${cyclonic.toFixed(2)} m/s · dx=${g.dx}`);

for (let i = 0; i < 12; i++) s.step(60);

let centre = 0;
let corner = 0;
let nanCount = 0;
for (let j = 0; j < g.ny; j++) {
  for (let i = 0; i < g.nx; i++) {
    const r = Math.hypot(i / (g.nx - 1) - 0.5, j / (g.ny - 1) - 0.5);
    let col = f.rainAccum[i + j * g.nx];
    for (let k = 0; k < g.nz; k++) {
      const q = f.qc[g.idx(i, j, k)];
      if (!Number.isFinite(q)) nanCount++;
      else col += q;
    }
    if (!Number.isFinite(col)) {
      nanCount++;
      continue;
    }
    if (r < 0.35) centre += col;
    if (r > 0.55) corner += col;
  }
}
const st = s.cloudRainStats();
console.log(
  JSON.stringify(
    {
      cyclonic: +cyclonic.toFixed(2),
      centreCloudRain: +centre.toFixed(5),
      cornerCloudRain: +corner.toFixed(5),
      cloudMax: +st.cloudMax.toFixed(5),
      nanCount,
    },
    null,
    2,
  ),
);

if (!(cyclonic > 1)) {
  console.error("FAIL: initial wind around the low is not cyclonic");
  process.exit(2);
}
if (nanCount > 0) {
  console.error("FAIL: NaNs in hydrostatic fields", nanCount);
  process.exit(5);
}
if (!(st.cloudMax > 0 || centre > 0)) {
  console.error("FAIL: no cloud/rain near the low");
  process.exit(3);
}
if (corner > 1e-3 && centre < corner * 0.15) {
  console.error("FAIL: rain prefers the far field over the low");
  process.exit(4);
}
console.log("OK");
