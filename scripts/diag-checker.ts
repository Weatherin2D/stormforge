import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver, stableOuterDt } from "../src/sim/FluidSolver";
import { defaultSounding } from "../src/sim/thermo";
import { resetAdvanced } from "../src/sim/AdvancedSettings";
import { defaultSynoptic } from "../src/sim/synoptic";

function checkerScore(field: Float32Array, nx: number, ny: number, base: number) {
  let n = 0, score = 0;
  for (let j = 1; j < ny - 1; j++) {
    for (let i = 1; i < nx - 1; i++) {
      const a = field[base + i + j * nx];
      const b = field[base + i + 1 + j * nx];
      const c = field[base + i + (j + 1) * nx];
      const d = field[base + i + 1 + (j + 1) * nx];
      const ab = Math.abs(a - b);
      const ac = Math.abs(a - c);
      const ad = Math.abs(a - d);
      const bc = Math.abs(b - c);
      // Checker: neighbors differ, diagonal similar
      if (ab > 0.15 && ac > 0.15 && ad < 0.08 && bc < 0.08) {
        score++;
      }
      n++;
    }
  }
  return { score, n, frac: score / n };
}

resetAdvanced();
const g = new Grid3D({ nx: 64, ny: 64, nz: 32, zTop: 12000, xExtent: 64000, yExtent: 64000 });
const s = new FluidSolver(g);
s.rebuild(g, defaultSounding(12000, 30), { bubbleStrength: 3, synoptic: defaultSynoptic() });
const dt = stableOuterDt(g.dx, g.dy, g.dz, false);
for (let step = 0; step <= 60; step++) {
  if (step > 0) s.step(dt);
  if (step === 0 || step === 5 || step === 15 || step === 30 || step === 60) {
    const f = s.fields;
    const k2 = checkerScore(f.theta, g.nx, g.ny, 2 * g.nx * g.ny);
    const k0 = checkerScore(f.theta, g.nx, g.ny, 0);
    const q2 = checkerScore(f.qv, g.nx, g.ny, 2 * g.nx * g.ny);
    // qc checker at low levels
    const qc = checkerScore(f.qc, g.nx, g.ny, 1 * g.nx * g.ny);
    let wMax = 0;
    for (const w of f.w) if (Math.abs(w) > wMax) wMax = Math.abs(w);
    console.log(`t=${(step*dt)|0}`, {
      thK0: +k0.frac.toFixed(4), thK2: +k2.frac.toFixed(4),
      qvK2: +q2.frac.toFixed(4), qcK1: +qc.frac.toFixed(4),
      wMax: +wMax.toFixed(2),
      cloud: +s.cloudRainStats().cloudMax.toFixed(5),
    });
  }
}
