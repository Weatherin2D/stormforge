/**
 * WebGPU scaffold smoke. The shipping solver is the CPU FluidSolver; the
 * WGSL kernels are not compared for field parity.
 */
import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { WebGPUBackend } from "../src/sim/WebGPUBackend";
import { defaultSounding } from "../src/sim/thermo";

const g = new Grid3D({ nx: 32, ny: 32, nz: 24, zTop: 12000 });
const sounding = defaultSounding(12000, 25);
const opts = { bubbleStrength: 4 };

const cpu = new FluidSolver(g);
cpu.rebuild(g, sounding, opts);
for (let i = 0; i < 60; i++) cpu.step(2);
const cpuStats = cpu.cloudRainStats();
console.log("Stormforge WebGPU smoke (CPU):", cpuStats);
if (cpuStats.cloudMax <= 0 && cpuStats.rainMax <= 0) {
  console.error("FAIL: CPU produced no cloud/rain");
  process.exit(2);
}

const gpu = new WebGPUBackend();
await gpu.whenReady();
if (!gpu.available) {
  console.log(
    `WebGPU unavailable (${gpu.initFailure ?? "unknown"}) — CPU is the solver.`,
  );
  console.log("OK");
  process.exit(0);
}

console.log(
  "WebGPU backend present, but GPU kernels are not the shipping solver; skipping field parity.",
);
console.log("OK");
