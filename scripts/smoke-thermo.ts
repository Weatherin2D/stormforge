import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { defaultSounding, TFromTheta } from "../src/sim/thermo";
import { defaultSynoptic } from "../src/sim/synoptic";

/**
 * Thermodynamic stability check.
 *
 * Evaporating cloud or rain cools the parcel, which shrinks its
 * saturation capacity. If the evaporation is not capped, the parcel ends
 * up supersaturated, the next step condenses it straight back, and the
 * cell flips between two states every step with a large latent-heat
 * temperature swing each way. That shows up as surface-temperature tiles
 * that jump ~20 °C and snap back a few steps later, and as clouds that
 * flash in and out.
 *
 * This run asserts that one step never moves a cell by more than a few
 * K and that no tile spikes and reverts.
 */

interface Cfg {
  name: string;
  nx: number;
  ny: number;
  nz: number;
  zTop: number;
  steps: number;
  synoptic: boolean;
  hydro: "on" | "off";
  bubble: number;
}

const cfgs: Cfg[] = [
  { name: "sandbox 64", nx: 64, ny: 64, nz: 40, zTop: 12000, steps: 220, synoptic: false, hydro: "off", bubble: 3 },
  { name: "synoptic 64", nx: 64, ny: 64, nz: 40, zTop: 12000, steps: 220, synoptic: true, hydro: "off", bubble: 4 },
  { name: "hydrostatic 64", nx: 64, ny: 64, nz: 40, zTop: 12000, steps: 220, synoptic: true, hydro: "on", bubble: 4 },
  { name: "coarse 32", nx: 32, ny: 32, nz: 24, zTop: 12000, steps: 220, synoptic: false, hydro: "off", bubble: 3 },
];

/**
 * Largest one-step theta jump (K) and largest surface-tile jump (°C).
 * The outermost ring is excluded: cells whose backtrace leaves the domain
 * are re-seeded with the open-boundary state, which is a deliberate jump
 * of its own and not what this check is about.
 */
const MAX_THETA_JUMP = 8;
const MAX_SURFACE_JUMP = 8;

let failed = false;

for (const c of cfgs) {
  const g = new Grid3D({ nx: c.nx, ny: c.ny, nz: c.nz, zTop: c.zTop });
  const s = new FluidSolver(g);
  const syn = defaultSynoptic();
  syn.enabled = c.synoptic;
  s.rebuild(g, defaultSounding(c.zTop, 41), { bubbleStrength: c.bubble, synoptic: syn });
  s.hydrostatic = c.hydro;

  const f = s.fields;
  const n = f.theta.length;
  const nxy = g.nx * g.ny;
  const p0 = f.p0[0];
  const interior: number[] = [];
  for (let j = 1; j < g.ny - 1; j++) {
    for (let i = 1; i < g.nx - 1; i++) interior.push(i + g.nx * j);
  }

  let prevTh = new Float32Array(n);
  let prevSfc = new Float32Array(nxy);
  let maxJump = 0;
  let maxSfcJump = 0;
  let revertEvents = 0;
  const sfc: Float32Array[] = [];

  for (let step = 0; step < c.steps; step++) {
    s.step(2);
    const curTh = Float32Array.from(f.theta);
    const curSfc = new Float32Array(nxy);
    for (let ij = 0; ij < nxy; ij++) {
      curSfc[ij] = TFromTheta(f.theta[ij], p0) - 273.15;
    }
    if (step > 0) {
      for (const ij of interior) {
        for (let k = 0; k < g.nz; k++) {
          const id = ij + k * nxy;
          const d = Math.abs(curTh[id] - prevTh[id]);
          if (d > maxJump) maxJump = d;
        }
      }
      for (const ij of interior) {
        const d = curSfc[ij] - prevSfc[ij];
        if (d > maxSfcJump) maxSfcJump = d;
      }
    }
    sfc.push(curSfc);
    if (sfc.length > 7) sfc.shift();
    // A tile that jumps up and is back near its old value within 5 steps.
    if (sfc.length === 7) {
      for (const ij of interior) {
        if (sfc[6][ij] - sfc[5][ij] < 10) continue;
        for (let back = 0; back < 5; back++) {
          if (Math.abs(sfc[back][ij] - sfc[5][ij]) <= 3) {
            revertEvents++;
            break;
          }
        }
      }
    }
    prevTh = curTh;
    prevSfc = curSfc;
  }

  const st = s.cloudRainStats();
  const ok = maxJump <= MAX_THETA_JUMP && maxSfcJump <= MAX_SURFACE_JUMP && revertEvents === 0;
  if (!ok) failed = true;
  console.log(
    `${ok ? "OK  " : "FAIL"} ${c.name.padEnd(16)} ` +
      `maxThetaJump=${maxJump.toFixed(2)}K maxTileJump=${maxSfcJump.toFixed(2)}C ` +
      `spikeRevert=${revertEvents} cloudMass=${st.cloudMass.toFixed(1)} rainMax=${st.rainMax.toExponential(2)}`,
  );
}

if (failed) {
  console.error("FAIL: unstable thermodynamic adjustment detected");
  process.exit(2);
}
console.log("OK");
