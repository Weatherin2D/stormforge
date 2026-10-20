import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { WebGPUBackend } from "../src/sim/WebGPUBackend";
import { defaultSounding } from "../src/sim/thermo";

const g = new Grid3D({ nx: 32, ny: 32, nz: 24, zTop: 12000 });
const sounding = defaultSounding(12000, 25);
const opts = { bubbleStrength: 4 };

// ── CPU reference ─────────────────────────────────────────────────────────
const cpu = new FluidSolver(g);
cpu.rebuild(g, sounding, opts);
for (let i = 0; i < 60; i++) cpu.step(2);
const cpuStats = cpu.cloudRainStats();
console.log("Stormforge WebGPU smoke (CPU):", cpuStats);
if (cpuStats.cloudMax <= 0 && cpuStats.rainMax <= 0) {
  console.error("FAIL: CPU produced no cloud/rain");
  process.exit(2);
}

// ── GPU backend (graceful when WebGPU is unavailable, e.g. Node) ─────────
const gpu = new WebGPUBackend();
await gpu.whenReady();
if (!gpu.available) {
  console.log(
    `WebGPU unavailable (${gpu.initFailure ?? "unknown"}) — CPU fallback only.`,
  );
  console.log("OK");
  process.exit(0);
}

// Rebuild GPU backend on the same grid/sounding and compare.
const g2 = new Grid3D({ nx: 32, ny: 32, nz: 24, zTop: 12000 });
gpu.rebuild(g2, sounding, opts);
for (let i = 0; i < 60; i++) await gpu.step(2);
const gpuStats = gpu.cloudRainStats();
console.log("Stormforge WebGPU smoke (GPU):", gpuStats);

// Compare fields within tolerance (not bitwise).
const maxDiff = fieldMaxDiff(cpu, gpu);
console.log("max field diff (CPU vs GPU):", maxDiff.toExponential(3));
if (maxDiff > 1e-3) {
  console.error("FAIL: GPU and CPU fields diverge beyond tolerance");
  process.exit(2);
}
console.log("OK");

function fieldMaxDiff(a: FluidSolver, b: WebGPUBackend): number {
  const fields = ["theta", "qv", "qc", "qr", "p", "u", "v", "w"] as const;
  let max = 0;
  for (const name of fields) {
    const fa = (a.fields as any)[name];
    const fb = (b.fields as any)[name];
    for (let i = 0; i < fa.length; i++) {
      const d = Math.abs(fa[i] - fb[i]);
      if (d > max) max = d;
    }
  }
  return max;
}
