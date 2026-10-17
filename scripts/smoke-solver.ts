import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { defaultSounding } from "../src/sim/thermo";

const g = new Grid3D({ nx: 32, ny: 32, nz: 24, zTop: 12000 });
const s = new FluidSolver(g);
s.rebuild(g, defaultSounding(12000, 25), { bubbleStrength: 4 });
for (let i = 0; i < 120; i++) s.step(2);
const st = s.cloudRainStats();
console.log("Stormforge smoke:", st);
if (st.cloudMax <= 0 && st.rainMax <= 0) {
  console.error("FAIL: no cloud/rain formed");
  process.exit(2);
}
console.log("OK");
