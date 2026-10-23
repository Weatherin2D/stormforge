/**
 * Smoke test for drawn fronts.
 *
 * Checks that a hand-drawn front is not just painted into the initial state
 * but keeps working inside the running simulation: it holds its air-mass
 * contrast, it makes weather along its line, it travels west->east when it is
 * set to move, and a pattern swapped in mid-run takes effect.
 */
import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { defaultSounding } from "../src/sim/thermo";
import { SynopticSetup, getActiveSynoptic } from "../src/sim/synoptic";

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

/** Cold front drawn west -> east across the middle of the domain. */
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

/** Same front drawn south -> north, so it advances east as it moves. */
const northSouthFront = {
  id: "custom-ns",
  kind: "cold" as const,
  enabled: true,
  points: [
    { x: 0.4, y: 0.02 },
    { x: 0.4, y: 0.5 },
    { x: 0.4, y: 0.98 },
  ],
};

function build(s: SynopticSetup): { g: Grid3D; solver: FluidSolver } {
  const g = new Grid3D({ nx: 40, ny: 40, nz: 24, zTop: 12000 });
  const solver = new FluidSolver(g);
  solver.rebuild(g, defaultSounding(12000, 25), { bubbleStrength: 0, synoptic: s });
  return { g, solver };
}

/** Mean surface θ anomaly north of the front line (the cold side). */
function coldSideMean(g: Grid3D, solver: FluidSolver, j: number): number {
  const f = solver.fields;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < g.nx; i++) {
    sum += f.theta[g.idx(i, j, 0)] - f.theta0[0];
    n++;
  }
  return sum / Math.max(1, n);
}

const failures: string[] = [];
function check(ok: boolean, message: string): void {
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
  if (!ok) failures.push(message);
}

// ── 1. The front holds its air-mass contrast while the run goes on ───────
{
  const { g, solver } = build(setup([eastWestFront]));
  for (let i = 0; i < 60; i++) solver.step(4);
  const cold = coldSideMean(g, solver, 30);
  const warm = coldSideMean(g, solver, 8);
  console.log(`cold side ${cold.toFixed(2)} K · warm side ${warm.toFixed(2)} K`);
  check(cold < -2, "drawn front keeps its cold side colder than the base state");
  check(cold - warm < -4, "drawn front keeps a sharp air-mass edge");
}

// ── 2. The front makes weather along its line ────────────────────────────
{
  const bare = build(setup([]));
  for (let i = 0; i < 90; i++) bare.solver.step(4);
  const withFront = build(setup([eastWestFront]));
  for (let i = 0; i < 90; i++) withFront.solver.step(4);
  const a = bare.solver.cloudRainStats();
  const b = withFront.solver.cloudRainStats();
  console.log(
    `no front: cloudMax ${a.cloudMax.toFixed(5)} rainMax ${a.rainMax.toFixed(5)}`,
  );
  console.log(
    `front:    cloudMax ${b.cloudMax.toFixed(5)} rainMax ${b.rainMax.toFixed(5)}`,
  );
  check(
    b.cloudMax > a.cloudMax * 1.3 || b.rainMax > a.rainMax * 1.3,
    "a drawn front produces more cloud/rain than a run without one",
  );
}

// ── 3. A moving front travels east through the domain ────────────────────
{
  const { g, solver } = build(setup([northSouthFront], true));
  /** Where the band of weather along the front sits (peak cloud water). */
  const bandAt = (): number => {
    const f = solver.fields;
    let best = 0;
    let bestX = 0;
    for (let i = 0; i < g.nx; i++) {
      let c = 0;
      for (let k = 0; k < g.nz; k++) c += f.qc[g.idx(i, 20, k)];
      if (c > best) {
        best = c;
        bestX = i / (g.nx - 1);
      }
    }
    return bestX;
  };
  const lineAt = (): number => getActiveSynoptic().fronts[0].points[0].x;

  const lineStart = lineAt();
  for (let i = 0; i < 200; i++) solver.step(4);
  const bandStart = bandAt();
  for (let i = 0; i < 200; i++) solver.step(4);
  const bandEnd = bandAt();
  const lineEnd = lineAt();
  console.log(
    `front line x=${lineStart.toFixed(2)} → ${lineEnd.toFixed(2)} · ` +
      `weather band ${bandStart.toFixed(2)} → ${bandEnd.toFixed(2)}`,
  );
  check(lineEnd > lineStart + 0.05, "a moving front's line advances east");
  check(
    bandEnd > bandStart + 0.03,
    "the weather along a moving front travels east with it",
  );
}

// ── 4. A pattern swapped in mid-run takes effect ─────────────────────────
{
  const { g, solver } = build(setup([]));
  for (let i = 0; i < 20; i++) solver.step(4);
  const before = coldSideMean(g, solver, 30);
  solver.setSynoptic(setup([eastWestFront]));
  for (let i = 0; i < 120; i++) solver.step(4);
  const after = coldSideMean(g, solver, 30);
  console.log(`cold side before ${before.toFixed(2)} K · after ${after.toFixed(2)} K`);
  check(
    after < -2 && after < before - 2,
    "fronts applied while the simulation runs take effect",
  );
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} front check(s) failed`);
  process.exit(2);
}
console.log("OK");
