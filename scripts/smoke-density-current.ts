/**
 * Density current: a cold bubble drives outflow; lid w stays zero; the
 * gust-front column of cold air moves outward (or a strong outflow forms).
 */
import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { defaultSounding } from "../src/sim/thermo";
import { setAdvanced, setToggles } from "../src/sim/AdvancedSettings";

const g = new Grid3D({
  nx: 64,
  ny: 16,
  nz: 24,
  zTop: 6000,
  xExtent: 32000,
  yExtent: 8000,
});
const s = new FluidSolver(g);
setToggles({ enableRadiation: false, enableSponge: false });
setAdvanced({ viscosityScale: 0.3, horizMixing: 0.3, vertMixing: 0.3 });
s.rebuild(g, defaultSounding(6000, 20), {
  bubbleStrength: 0,
  synoptic: {
    marine: false,
    latitudeDeg: 35,
    enabled: false,
    jetstream: false,
    fronts: [],
    centers: [],
  },
});

const f = s.fields;
const cx = g.xExtent * 0.2;
const cz = 500;
const R = 1800;
for (let k = 0; k < Math.min(g.nz, 8); k++) {
  const z = (k + 0.5) * g.dz;
  for (let j = 0; j < g.ny; j++) {
    const y = (j + 0.5) * g.dy;
    for (let i = 0; i < g.nx; i++) {
      const x = (i + 0.5) * g.dx;
      const r = Math.sqrt(
        ((x - cx) / R) ** 2 +
          ((y - g.yExtent / 2) / (R * 1.2)) ** 2 +
          ((z - cz) / (R * 0.45)) ** 2,
      );
      if (r < 1) f.theta[g.idx(i, j, k)] -= 10 * (1 - r);
    }
  }
}

function coldFrontX(): number {
  let best = 0;
  for (let i = 0; i < g.nx; i++) {
    let minD = 0;
    for (let j = 0; j < g.ny; j++) {
      for (let k = 0; k < 3; k++) {
        const dth = f.theta[g.idx(i, j, k)] - f.theta0[k];
        if (dth < minD) minD = dth;
      }
    }
    if (minD < -1.0) best = (i + 0.5) / g.nx;
  }
  return best;
}

const x0 = coldFrontX();
for (let i = 0; i < 80; i++) s.step(1);
const x1 = coldFrontX();

let wLid = 0;
let uOut = 0;
for (let j = 0; j < g.ny; j++) {
  for (let i = 0; i < g.nx; i++) {
    wLid +=
      Math.abs(f.w[g.wIdx(i, j, 0)]) + Math.abs(f.w[g.wIdx(i, j, g.nz)]);
    uOut = Math.max(uOut, Math.abs(f.u[g.uIdx(i, j, 0)]));
  }
}

console.log(
  JSON.stringify(
    {
      front0: +x0.toFixed(3),
      front1: +x1.toFixed(3),
      uOutMax: +uOut.toFixed(2),
      wLidSum: +wLid.toFixed(6),
    },
    null,
    2,
  ),
);

if (wLid > 1e-5) {
  console.error("FAIL: lid w not zero");
  process.exit(2);
}
if (!(uOut > 1.5)) {
  console.error("FAIL: no density-current outflow", uOut);
  process.exit(3);
}
if (!(x1 + 0.01 >= x0) && !(x1 > 0.05)) {
  console.error("FAIL: cold pool vanished without spreading", x0, x1);
  process.exit(4);
}
console.log("OK");
