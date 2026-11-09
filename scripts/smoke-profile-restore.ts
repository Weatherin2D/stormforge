/**
 * Mid-length run: domain-mean mid-level qv must not collapse vs the sounding.
 */
import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { defaultSounding } from "../src/sim/thermo";

const g = new Grid3D({ nx: 24, ny: 24, nz: 24, zTop: 12000 });
const sounding = defaultSounding(12000, 24);
const s = new FluidSolver(g);
s.rebuild(g, sounding, { bubbleStrength: 5 });

const mid = 10;
const qv0 = s.fields.qv0[mid];
const meanQv = (): number => {
  const f = s.fields;
  let sum = 0;
  for (let j = 0; j < g.ny; j++) {
    for (let i = 0; i < g.nx; i++) sum += f.qv[g.idx(i, j, mid)];
  }
  return sum / (g.nx * g.ny);
};
for (let i = 0; i < 240; i++) s.step(5); // 20 min sim
const end = meanQv();
const floor = qv0 * 0.08;
const stats = s.cloudRainStats();
console.log("Stormforge profile-restore smoke:", { qv0, end, floor, cloud: stats });
if (end < floor) {
  console.error("FAIL: mid-level qv collapsed below 8% of sounding");
  process.exit(2);
}
if (stats.cloudMax <= 0 && stats.rainMax <= 0) {
  console.error("FAIL: no cloud formed (restore may be too strong)");
  process.exit(3);
}
console.log("OK");
