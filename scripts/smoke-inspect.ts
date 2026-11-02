/**
 * Column probe and cross-section samples, plus the severe-index threshold.
 */
import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { columnIndices } from "../src/sim/mapDerived";
import { sampleColumn, sampleSection } from "../src/sim/inspect";
import { defaultSounding, type SoundingLevel } from "../src/sim/thermo";

let failures = 0;

function check(ok: boolean, message: string): void {
  if (ok) return;
  console.error(`FAIL ${message}`);
  failures++;
}

function stableSounding(zTop: number): SoundingLevel[] {
  const n = 24;
  const levels: SoundingLevel[] = [];
  for (let i = 0; i < n; i++) {
    const z = (i / (n - 1)) * zTop;
    const p = 100000 * Math.exp(-z / 8000);
    const T = 285 - 0.003 * z;
    levels.push({ z, p, T, Td: T - 25, u: 4, v: 1 });
  }
  return levels;
}

const grid = new Grid3D({ nx: 16, ny: 16, nz: 32, zTop: 12000 });

const stable = new FluidSolver(grid);
stable.rebuild(grid, stableSounding(12000), { bubbleStrength: 0 });
const calm = columnIndices(grid, stable.fields, 8, 8);
check(
  Number.isFinite(calm.ship) && calm.ship === 0,
  `SHIP should be 0 on a stable column, got ${calm.ship}`,
);
for (const [key, value] of Object.entries(calm)) {
  check(Number.isFinite(value), `stable ${key} is not finite`);
}

const sheared = defaultSounding(12000, 32).map((level) => ({
  ...level,
  u: 5 + 25 * (level.z / 12000),
  v: 3,
}));
const run = new FluidSolver(grid);
run.rebuild(grid, sheared, { bubbleStrength: 8 });
for (let i = 0; i < 30; i++) run.step(2);
const live = columnIndices(grid, run.fields, 8, 8);
for (const [key, value] of Object.entries(live)) {
  check(Number.isFinite(value), `live ${key} is not finite (${value})`);
}

const column = sampleColumn(grid, run.fields, 8, 8, run.time);
check(column !== null && column.levels.length === grid.nz * 6, "column level length");
check(column !== null && column.nz === grid.nz, "column nz");

const section = sampleSection(grid, run.fields, {
  i0: 0,
  j0: 0,
  i1: 15,
  j1: 15,
  variable: "refl",
});
check(section.width >= 2 && section.width <= 160, `section width ${section.width}`);
check(section.nz === grid.nz, "section nz");
check(
  section.rgba.length === section.width * section.nz * 4,
  "section buffer length",
);
let opaque = true;
for (let p = 3; p < section.rgba.length; p += 4) {
  if (section.rgba[p] !== 255) {
    opaque = false;
    break;
  }
}
check(opaque, "section pixels are not opaque");

for (const variable of ["thetae", "w"] as const) {
  const curtain = sampleSection(grid, run.fields, {
    i0: 2,
    j0: 3,
    i1: 12,
    j1: 5,
    variable,
  });
  check(
    curtain.rgba.length === curtain.width * grid.nz * 4 && curtain.rgba[3] === 255,
    `${variable} curtain`,
  );
}

if (failures > 0) process.exit(2);
console.log("OK inspect: column, section, and composite indices");
