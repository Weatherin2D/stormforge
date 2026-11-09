/**
 * WebGPU smoke: device init, pack-only residency path, non-zero cloud pack.
 */
import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { WebGPUBackend } from "../src/sim/WebGPUBackend";
import { defaultSounding } from "../src/sim/thermo";
import { volumeDisplaySize } from "../src/sim/Grid3D";

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

gpu.rebuild(g, sounding, opts);
for (let i = 0; i < 40; i++) await gpu.step(2);
await gpu.syncDisplay();
const stats = gpu.cloudRainStats();
const disp = volumeDisplaySize(g.nx, g.ny, g.nz);
const pack = new Uint8Array(disp.nx * disp.ny * disp.nz * 4);
gpu.packVolumeRGBA(pack);
let nonzero = 0;
for (let i = 0; i < pack.length; i++) if (pack[i]) nonzero++;
console.log("Stormforge WebGPU smoke (GPU pack-only):", stats, {
  packBytes: pack.length,
  nonzero,
});
if (nonzero <= 0 && stats.cloudMax <= 0 && stats.rainMax <= 0) {
  console.error("FAIL: GPU pack/stats empty after steps");
  process.exit(3);
}
console.log("OK");
