import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { defaultSounding } from "../src/sim/thermo";
import { nestBoxAround, findStormCentroid } from "../src/sim/nestTrack";

const g = new Grid3D({ nx: 48, ny: 48, nz: 24, zTop: 12000 });
const s = new FluidSolver(g);
const sounding = defaultSounding(12000, 25);
const start = nestBoxAround(0.3, 0.35, 0.28, 2);
start.follow = true;
s.rebuild(g, sounding, {
  bubbleStrength: 6,
  surface: { nest: start },
});
s.setNestFollow(true);

const before = s.getNestRect();
for (let i = 0; i < 120; i++) s.step(2);
const after = s.getNestRect();
const c = findStormCentroid(g, s.fields);
console.log("Stormforge nest-follow smoke:", {
  before,
  after,
  centroid: c,
  follow: s.getNestFollow(),
  info: s.getNestInfo(),
});
if (!after) {
  console.error("FAIL: nest disappeared");
  process.exit(2);
}
console.log("OK");
