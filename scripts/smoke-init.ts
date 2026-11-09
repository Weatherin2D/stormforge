import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { defaultSounding } from "../src/sim/thermo";

function run(
  label: string,
  opts: {
    bubble: number;
    steps: number;
    xExtent: number;
    hydrostatic?: "auto" | "on" | "off";
  },
): void {
  const g = new Grid3D({
    nx: 32,
    ny: 32,
    nz: 24,
    zTop: 12000,
    xExtent: opts.xExtent,
    yExtent: opts.xExtent,
  });
  const s = new FluidSolver(g);
  if (opts.hydrostatic) s.hydrostatic = opts.hydrostatic;
  s.rebuild(g, defaultSounding(12000, 24), { bubbleStrength: opts.bubble });
  s.setRadiation({
    enabled: true,
    latitudeDeg: -34,
    month: 11,
    solarHour: 13,
    diurnalSpeed: 20,
  });
  for (let i = 0; i < opts.steps; i++) s.step(4);
  const st = s.cloudRainStats();
  console.log(label, { dx: g.dx, ...st });
  if (st.cloudMax <= 0 && st.rainMax <= 0) {
    console.error("FAIL:", label);
    process.exit(2);
  }
}

run("storm-scale bubble", { bubble: 3, steps: 80, xExtent: 32000, hydrostatic: "off" });
run("synoptic daytime", {
  bubble: 0,
  steps: 180,
  xExtent: 320000,
  hydrostatic: "auto",
});
console.log("OK");
