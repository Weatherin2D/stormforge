import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { defaultSounding } from "../src/sim/thermo";

function bench(label: string, nx: number, ny: number, nz: number, steps: number, dt: number): void {
  const g = new Grid3D({ nx, ny, nz, zTop: 12000 });
  const s = new FluidSolver(g);
  s.rebuild(g, defaultSounding(12000, Math.max(20, nz + 1)), { bubbleStrength: 4 });

  // Warm-up
  for (let i = 0; i < 3; i++) s.step(dt);

  const t0 = performance.now();
  for (let i = 0; i < steps; i++) s.step(dt);
  const t1 = performance.now();

  const st = s.cloudRainStats();
  const msPerStep = (t1 - t0) / steps;
  const cells = g.cellCount();
  console.log(
    `Benchmark ${label}: ${nx}×${ny}×${nz} (${(cells / 1e6).toFixed(2)}M cells) · ${steps}×${dt}s · ${msPerStep.toFixed(2)} ms/step · cloudMax=${st.cloudMax.toExponential(2)} rainMax=${st.rainMax.toExponential(2)}`,
  );
}

console.log("Stormforge continental smoke benchmark (CPU):");
bench("continental-proxy", 256, 256, 24, 30, 2);
bench("cpu-fallback", 32, 32, 24, 60, 2);
console.log("OK");
