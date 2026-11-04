/**
 * Drawn fronts are an initial condition: the air-mass contrast holds without
 * per-step relaxation, cold air shifts with steering wind when move is on,
 * and mid-run setSynoptic still takes effect once.
 */
import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { defaultSounding } from "../src/sim/thermo";
import { SynopticSetup, getActiveSynoptic } from "../src/sim/synoptic";
import { setAdvanced, setToggles } from "../src/sim/AdvancedSettings";

function setup(fronts: SynopticSetup["fronts"], move = false): SynopticSetup {
  return {
    marine: false,
    latitudeDeg: 35,
    enabled: true,
    jetstream: false,
    jetstreamSouth: 0.5,
    move,
    moveSpeed: 35,
    fronts,
    centers: [],
  };
}

const eastWestFront = {
  id: "custom-cold",
  kind: "cold" as const,
  enabled: true,
  points: [
    { x: 0.02, y: 0.5 },
    { x: 0.5, y: 0.5 },
    { x: 0.98, y: 0.5 },
  ],
};

const northSouthFront = {
  id: "custom-ns",
  kind: "cold" as const,
  enabled: true,
  points: [
    { x: 0.35, y: 0.02 },
    { x: 0.35, y: 0.5 },
    { x: 0.35, y: 0.98 },
  ],
};

function build(s: SynopticSetup): { g: Grid3D; solver: FluidSolver } {
  const g = new Grid3D({ nx: 40, ny: 40, nz: 24, zTop: 12000 });
  const solver = new FluidSolver(g);
  setToggles({ enableRadiation: false, enableSponge: true });
  setAdvanced({ viscosityScale: 0.4, horizMixing: 0.4, vertMixing: 0.4 });
  solver.rebuild(g, defaultSounding(12000, 25), {
    bubbleStrength: 0,
    synoptic: s,
  });
  return { g, solver };
}

function sideMean(g: Grid3D, solver: FluidSolver, j: number): number {
  const f = solver.fields;
  let sum = 0;
  for (let i = 0; i < g.nx; i++) sum += f.theta[g.idx(i, j, 1)] - f.theta0[1];
  return sum / g.nx;
}

/** Cold-air centroid in x (normalized), weighted by negative θ anomaly. */
function coldCentroidX(g: Grid3D, solver: FluidSolver): number {
  const f = solver.fields;
  let wSum = 0;
  let xSum = 0;
  for (let i = 0; i < g.nx; i++) {
    for (let j = 0; j < g.ny; j++) {
      const d = f.theta[g.idx(i, j, 1)] - f.theta0[1];
      if (d >= -0.5) continue;
      const w = -d;
      wSum += w;
      xSum += w * (i / Math.max(1, g.nx - 1));
    }
  }
  return wSum > 0 ? xSum / wSum : 0;
}

const failures: string[] = [];
function check(ok: boolean, message: string): void {
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
  if (!ok) failures.push(message);
}

// ── 1. Air-mass contrast holds ~10 min without per-step forcing ──────────
{
  const { g, solver } = build(setup([eastWestFront]));
  const cold0 = sideMean(g, solver, 30);
  const warm0 = sideMean(g, solver, 8);
  const jump0 = warm0 - cold0;
  for (let i = 0; i < 150; i++) solver.step(4);
  const cold = sideMean(g, solver, 30);
  const warm = sideMean(g, solver, 8);
  const jump = warm - cold;
  console.log(
    `jump0 ${jump0.toFixed(2)} K → jump ${jump.toFixed(2)} K · cold ${cold.toFixed(2)} warm ${warm.toFixed(2)}`,
  );
  check(jump > 3 && jump > jump0 * 0.45, "cold-front θ jump retains a large fraction after 10 minutes");
  check(cold < warm - 2, "drawn front keeps cold side colder than warm side");
}

// ── 2. Steering wind shifts the cold air when move is on ─────────────────
{
  const { g, solver } = build(setup([northSouthFront], true));
  const c0 = coldCentroidX(g, solver);
  const lineStart = getActiveSynoptic().fronts[0].points[0].x;
  for (let i = 0; i < 200; i++) solver.step(4);
  const c1 = coldCentroidX(g, solver);
  const lineEnd = getActiveSynoptic().fronts[0].points[0].x;
  console.log(
    `line ${lineStart.toFixed(2)} → ${lineEnd.toFixed(2)} · cold centroid ${c0.toFixed(2)} → ${c1.toFixed(2)}`,
  );
  check(lineEnd > lineStart + 0.05, "a moving front's line advances east");
  check(c1 > c0 + 0.03, "cold air shifts east with the steering wind");
}

// ── 3. Mid-run pattern swap takes effect once ────────────────────────────
{
  const { g, solver } = build(setup([]));
  for (let i = 0; i < 20; i++) solver.step(4);
  const before = sideMean(g, solver, 30);
  solver.setSynoptic(setup([eastWestFront]));
  for (let i = 0; i < 40; i++) solver.step(4);
  const after = sideMean(g, solver, 30);
  console.log(`cold side before ${before.toFixed(2)} K · after ${after.toFixed(2)} K`);
  check(
    after < -1.5 && after < before - 1.5,
    "fronts applied while the simulation runs take effect",
  );
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} front check(s) failed`);
  process.exit(2);
}
console.log("OK");
