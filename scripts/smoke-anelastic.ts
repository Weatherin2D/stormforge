import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { defaultSounding } from "../src/sim/thermo";

function anelasticDivMax(s: FluidSolver): number {
  const g = s.grid;
  const f = s.fields;
  const { nx, ny, nz, dx, dy, dz } = g;
  let maxAbs = 0;
  for (let k = 0; k < nz; k++) {
    const rho = f.rho0[k];
    const rhowB = f.rho0w[k];
    const rhowT = f.rho0w[k + 1];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const du =
          (rho * f.u[g.uIdx(i + 1, j, k)] - rho * f.u[g.uIdx(i, j, k)]) / dx;
        const dv =
          (rho * f.v[g.vIdx(i, j + 1, k)] - rho * f.v[g.vIdx(i, j, k)]) / dy;
        const dw =
          (rhowT * f.w[g.wIdx(i, j, k + 1)] - rhowB * f.w[g.wIdx(i, j, k)]) /
          dz;
        const d = Math.abs(du + dv + dw);
        if (d > maxAbs) maxAbs = d;
      }
    }
  }
  return maxAbs;
}

// Even 48×48 grid — the old code skipped the fine residual here.
const g = new Grid3D({ nx: 48, ny: 48, nz: 24, zTop: 12000 });
const s = new FluidSolver(g);
s.rebuild(g, defaultSounding(12000, 25), { bubbleStrength: 4 });

const div0 = anelasticDivMax(s);
for (let i = 0; i < 40; i++) s.step(1);
const div1 = anelasticDivMax(s);
const st = s.cloudRainStats();

let wLid = 0;
for (let j = 0; j < g.ny; j++) {
  for (let i = 0; i < g.nx; i++) {
    wLid +=
      Math.abs(s.fields.w[g.wIdx(i, j, 0)]) +
      Math.abs(s.fields.w[g.wIdx(i, j, g.nz)]);
  }
}

console.log(
  JSON.stringify(
    {
      cloudMax: +st.cloudMax.toFixed(5),
      rainMax: +st.rainMax.toFixed(5),
      divAfterInit: +div0.toFixed(6),
      divAfterRun: +div1.toFixed(6),
      wLidSum: +wLid.toFixed(6),
    },
    null,
    2,
  ),
);

if (st.cloudMax <= 0 && st.rainMax <= 0) {
  console.error("FAIL: no cloud/rain formed");
  process.exit(2);
}
if (wLid > 1e-6) {
  console.error("FAIL: lid w not zero");
  process.exit(3);
}
// Fine-grid residual must stay far below the old loose bound of 5.
if (!(div1 < 0.5)) {
  console.error("FAIL: anelastic divergence too large", div1);
  process.exit(4);
}
console.log("OK");
