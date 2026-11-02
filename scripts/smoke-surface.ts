/**
 * Ridge lift, a cooler moister sea, and a one-way nest boundary.
 */
import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { defaultSounding, qsat, TFromTheta } from "../src/sim/thermo";
import { defaultSynoptic } from "../src/sim/synoptic";
import {
  COVER_LAKE,
  COVER_OCEAN,
  SURFACE_N,
  fillRidge,
  fillSoutheastSea,
} from "../src/sim/surface";

function quietSynoptic() {
  const s = defaultSynoptic();
  s.marine = false;
  s.fronts = [];
  s.centers = [];
  s.jetstream = false;
  s.enabled = true;
  return s;
}

function fail(msg: string): never {
  console.error("FAIL", msg);
  process.exit(2);
}

const zTop = 12000;
const nz = 28;
const ridgeGrid = new Grid3D({
  nx: 32,
  ny: 12,
  nz,
  zTop,
  xExtent: 64000,
  yExtent: 24000,
});
const terrain = new Float32Array(SURFACE_N * SURFACE_N);
fillRidge(terrain, 2200);
const ridge = new FluidSolver(ridgeGrid);
ridge.rebuild(ridgeGrid, defaultSounding(zTop, nz + 1), {
  bubbleStrength: 0,
  synoptic: quietSynoptic(),
  surface: { terrain, water: new Float32Array(SURFACE_N * SURFACE_N), sstC: 20 },
});
ridge.fields.u.fill(12);
ridge.fields.v.fill(0);
for (let n = 0; n < 40; n++) ridge.step(2);

let west = 0;
let east = 0;
let westN = 0;
let eastN = 0;
const midJ = Math.floor(ridgeGrid.ny / 2);
for (let i = 0; i < ridgeGrid.nx; i++) {
  const w = ridgeGrid.wCenter(ridge.fields.w, i, midJ, 1);
  if (i < ridgeGrid.nx * 0.4) {
    west += w;
    westN++;
  } else if (i > ridgeGrid.nx * 0.6) {
    east += w;
    eastN++;
  }
}
west /= westN;
east /= eastN;
if (!(west > 0.05) || !(east < -0.05) || !(west > east)) {
  fail(`ridge lift west=${west.toFixed(3)} east=${east.toFixed(3)}`);
}

const seaGrid = new Grid3D({
  nx: 16,
  ny: 8,
  nz: 24,
  zTop,
  xExtent: 32000,
  yExtent: 16000,
});
const water = new Float32Array(SURFACE_N * SURFACE_N);
fillSoutheastSea(water);
for (let j = 0; j < SURFACE_N; j++) {
  for (let i = Math.floor(SURFACE_N / 2); i < SURFACE_N; i++) {
    water[i + SURFACE_N * j] = 1;
  }
}
const sea = new FluidSolver(seaGrid);
sea.rebuild(seaGrid, defaultSounding(zTop, 25), {
  bubbleStrength: 0,
  synoptic: quietSynoptic(),
  surface: { water, sstC: 8 },
});
for (let n = 0; n < 200; n++) sea.step(2);
const landI = 2;
const seaI = seaGrid.nx - 3;
const j = Math.floor(seaGrid.ny / 2);
const landTh = sea.fields.theta[seaGrid.idx(landI, j, 0)];
const seaTh = sea.fields.theta[seaGrid.idx(seaI, j, 0)];
const p0 = sea.fields.p0[0];
const landT = TFromTheta(landTh, p0);
const seaT = TFromTheta(seaTh, p0);
const landRh = sea.fields.qv[seaGrid.idx(landI, j, 0)] / Math.max(1e-8, qsat(landT, p0));
const seaRh = sea.fields.qv[seaGrid.idx(seaI, j, 0)] / Math.max(1e-8, qsat(seaT, p0));
if (!(seaTh < landTh - 0.4) || !(seaRh > landRh + 0.02)) {
  fail(
    `sea contrast dT=${(landTh - seaTh).toFixed(2)} landRH=${landRh.toFixed(2)} seaRH=${seaRh.toFixed(2)}`,
  );
}

const parentGrid = new Grid3D({
  nx: 20,
  ny: 16,
  nz: 20,
  zTop,
  xExtent: 40000,
  yExtent: 32000,
});
const nestRun = new FluidSolver(parentGrid);
nestRun.rebuild(parentGrid, defaultSounding(zTop, 21), {
  bubbleStrength: 1,
  synoptic: quietSynoptic(),
  surface: {
    nest: { x0: 0.25, y0: 0.25, x1: 0.75, y1: 0.75, refinement: 2 },
  },
});
for (let n = 0; n < 6; n++) nestRun.step(2);
const child = nestRun.displayGrid;
if (child === parentGrid) fail("nest did not create a child grid");
if (child.nx < 16 || child.nx > 192) fail(`nest nx ${child.nx}`);
const cf = nestRun.displayFields;
let worst = 0;
const fx = 0.5;
const fy = 0.5;
for (let j = 0; j < child.ny; j++) {
  for (let i = 0; i < child.nx; i++) {
    const d = Math.min(i, j, child.nx - 1 - i, child.ny - 1 - j);
    if (d !== 0) continue;
    const xn = 0.25 + ((i + 0.5) / child.nx) * fx;
    const yn = 0.25 + ((j + 0.5) / child.ny) * fy;
    const pi = Math.max(0, Math.min(parentGrid.nx - 1, Math.round(xn * parentGrid.nx - 0.5)));
    const pj = Math.max(0, Math.min(parentGrid.ny - 1, Math.round(yn * parentGrid.ny - 0.5)));
    const parentTh = nestRun.fields.theta[parentGrid.idx(pi, pj, 2)];
    const childTh = cf.theta[child.idx(i, j, 2)];
    worst = Math.max(worst, Math.abs(parentTh - childTh));
  }
}
if (worst > 1.5) fail(`nest boundary theta error ${worst.toFixed(2)} K`);

const cells = SURFACE_N * SURFACE_N;
const kind = new Float32Array(cells);
const paintedWater = new Float32Array(cells);
const paintedTemp = new Float32Array(cells);
paintedTemp.fill(8);
for (let j = 0; j < SURFACE_N; j++) {
  for (let i = 0; i < SURFACE_N; i++) {
    const s = i + SURFACE_N * j;
    if (i < SURFACE_N / 2) {
      kind[s] = COVER_OCEAN;
      paintedWater[s] = 1;
      paintedTemp[s] = 8;
    } else {
      kind[s] = COVER_LAKE;
      paintedWater[s] = 1;
      paintedTemp[s] = 26;
    }
  }
}
const waterGrid = new Grid3D({
  nx: 20,
  ny: 8,
  nz: 20,
  zTop,
  xExtent: 40000,
  yExtent: 16000,
});
const waters = new FluidSolver(waterGrid);
waters.rebuild(waterGrid, defaultSounding(zTop, 21), {
  bubbleStrength: 0,
  synoptic: quietSynoptic(),
  surface: { kind, water: paintedWater, waterTemp: paintedTemp, sstC: 8 },
});
for (let n = 0; n < 220; n++) waters.step(2);
const oceanTh = waters.fields.theta[waterGrid.idx(2, 4, 0)];
const lakeTh = waters.fields.theta[waterGrid.idx(waterGrid.nx - 3, 4, 0)];
if (!(oceanTh < lakeTh - 1.5)) {
  fail(`cold ocean ${oceanTh.toFixed(2)} vs warm lake ${lakeTh.toFixed(2)}`);
}

const soil = new Float32Array(cells);
const veg = new Float32Array(cells);
for (let j = 0; j < SURFACE_N; j++) {
  for (let i = Math.floor(SURFACE_N / 2); i < SURFACE_N; i++) {
    const s = i + SURFACE_N * j;
    soil[s] = 0.9;
    veg[s] = 1;
  }
}
const landGrid = new Grid3D({
  nx: 16,
  ny: 8,
  nz: 20,
  zTop,
  xExtent: 32000,
  yExtent: 16000,
});
const land = new FluidSolver(landGrid);
land.rebuild(landGrid, defaultSounding(zTop, 21), {
  bubbleStrength: 0,
  synoptic: quietSynoptic(),
  surface: { soil, veg },
});
const dryI = 2;
const wetI = landGrid.nx - 3;
const dryJ = Math.floor(landGrid.ny / 2);
const dry0 = land.fields.theta[landGrid.idx(dryI, dryJ, 0)];
const wet0 = land.fields.theta[landGrid.idx(wetI, dryJ, 0)];
const dryQ0 = land.fields.qv[landGrid.idx(dryI, dryJ, 0)];
const wetQ0 = land.fields.qv[landGrid.idx(wetI, dryJ, 0)];
for (let n = 0; n < 280; n++) land.step(2);
const dryTh = land.fields.theta[landGrid.idx(dryI, dryJ, 0)];
const wetTh = land.fields.theta[landGrid.idx(wetI, dryJ, 0)];
const dryQ = land.fields.qv[landGrid.idx(dryI, dryJ, 0)];
const wetQ = land.fields.qv[landGrid.idx(wetI, dryJ, 0)];
const dryHeat = dryTh - dry0;
const wetHeat = wetTh - wet0;
if (!(wetQ > dryQ + 0.0004) || !(wetHeat < dryHeat - 0.3)) {
  fail(
    `cover heat dry ${dryHeat.toFixed(2)} wet ${wetHeat.toFixed(2)} q dry ${dryQ.toExponential(2)} wet ${wetQ.toExponential(2)} (start ${dryQ0.toExponential(2)} ${wetQ0.toExponential(2)})`,
  );
}

console.log(
  `OK surface: ridge west ${west.toFixed(2)} east ${east.toFixed(2)} m/s, sea cooler by ${(landTh - seaTh).toFixed(1)} K and RH ${(seaRh * 100).toFixed(0)}%, nest boundary ${worst.toFixed(2)} K, ocean colder than lake by ${(lakeTh - oceanTh).toFixed(1)} K, forest heats ${wetHeat.toFixed(2)} K vs bare ${dryHeat.toFixed(2)} K`,
);
