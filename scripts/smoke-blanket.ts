import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { defaultSounding, TFromTheta, esatFast, mixingRatio } from "../src/sim/thermo";
import {
  coldReflectivityMass,
  reflectivityDbz,
} from "../src/sim/mapProducts";
import { setActiveSynoptic, defaultSynoptic } from "../src/sim/synoptic";

function echoStats(s: FluidSolver, g: Grid3D) {
  const f = s.fields;
  let echo20 = 0;
  let echo35 = 0;
  let maxDbz = -30;
  let qi = 0;
  let qc = 0;
  let qr = 0;
  const n = g.nx * g.ny;
  for (let j = 0; j < g.ny; j++) {
    for (let i = 0; i < g.nx; i++) {
      let colDbz = -30;
      for (let k = 0; k < g.nz; k++) {
        const id = g.idx(i, j, k);
        qi += f.qi[id];
        qc += f.qc[id];
        qr += f.qr[id];
        colDbz = Math.max(
          colDbz,
          reflectivityDbz(f.qr[id], f.qc[id], 0, coldReflectivityMass(f, id)),
        );
      }
      if (colDbz >= 20) echo20++;
      if (colDbz >= 35) echo35++;
      maxDbz = Math.max(maxDbz, colDbz);
    }
  }
  return { echo20: echo20 / n, echo35: echo35 / n, maxDbz, qi, qc, qr };
}

function maxRH(s: FluidSolver, g: Grid3D) {
  const f = s.fields;
  let max = 0;
  for (let k = 0; k < g.nz; k++) {
    const id = g.idx((g.nx / 2) | 0, (g.ny / 2) | 0, k);
    const T = TFromTheta(f.theta[id], f.p0[k]);
    const qs = mixingRatio(esatFast(T), f.p0[k]);
    max = Math.max(max, f.qv[id] / Math.max(qs, 1e-12));
  }
  return max;
}

function run(
  label: string,
  opts: {
    xExtent: number;
    nx?: number;
    steps: number;
    dt: number;
    hydrostatic?: "auto" | "on" | "off";
    bubble?: number;
  },
) {
  const nx = opts.nx ?? 32;
  const g = new Grid3D({
    nx,
    ny: nx,
    nz: 24,
    zTop: 12000,
    xExtent: opts.xExtent,
    yExtent: opts.xExtent,
  });
  const syn = defaultSynoptic();
  syn.fronts = [];
  syn.centers = [];
  syn.enabled = false;
  setActiveSynoptic(syn);
  const s = new FluidSolver(g);
  if (opts.hydrostatic) s.hydrostatic = opts.hydrostatic;
  s.rebuild(g, defaultSounding(12000, 24), {
    bubbleStrength: opts.bubble ?? 0,
  });
  s.setRadiation({
    enabled: true,
    latitudeDeg: -34,
    month: 11,
    solarHour: 13,
    diurnalSpeed: 20,
  });
  for (let i = 0; i < opts.steps; i++) s.step(opts.dt);
  const st = echoStats(s, g);
  console.log(label, { dx: g.dx, t: s.time, initLikeRH: maxRH(s, g), ...st });
  if (opts.bubble && opts.bubble > 0) {
    if (st.maxDbz < 5 && st.qc + st.qi + st.qr <= 0) {
      console.error("FAIL initiation:", label);
      process.exit(2);
    }
  } else if (st.echo20 > 0.35) {
    console.error("FAIL blanket:", label, st.echo20);
    process.exit(2);
  }
}

run("storm calm", {
  xExtent: 32e3,
  steps: 60,
  dt: 4,
  hydrostatic: "off",
});
run("meso calm", {
  xExtent: 320e3,
  steps: 50,
  dt: 8,
  hydrostatic: "auto",
});
run("continental calm", {
  xExtent: 20e6,
  nx: 40,
  steps: 40,
  dt: 30,
  hydrostatic: "auto",
});
run("storm bubble", {
  xExtent: 32e3,
  steps: 80,
  dt: 4,
  hydrostatic: "off",
  bubble: 3,
});
console.log("OK");
