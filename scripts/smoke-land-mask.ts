import { buildLandMask, reseedLandMask } from "../src/sim/SurfaceRadiation";

reseedLandMask(42);
const m = buildLandMask(64, 64, false);
let min = 1;
let max = 0;
let sum = 0;
for (let i = 0; i < m.length; i++) {
  if (m[i] < min) min = m[i];
  if (m[i] > max) max = m[i];
  sum += m[i];
}
const mean = sum / m.length;
console.log("non-marine mottled land mask", { min, max, mean });
if (mean < 0.9 || mean > 1.1) {
  console.error("FAIL: mean land weight drifted from ~1");
  process.exit(2);
}
if (max - min < 0.02) {
  console.error("FAIL: expected mild heating mottling");
  process.exit(3);
}
if (min < 0.7 || max > 1.3) {
  console.error("FAIL: mottling amplitude too large");
  process.exit(4);
}

reseedLandMask(99);
const m2 = buildLandMask(64, 64, false);
let same = 0;
for (let i = 0; i < m.length; i++) if (Math.abs(m[i] - m2[i]) < 1e-9) same++;
if (same === m.length) {
  console.error("FAIL: reseeding did not change mottling");
  process.exit(5);
}

const sea = buildLandMask(64, 64, true);
let landish = 0;
let wetish = 0;
for (let i = 0; i < sea.length; i++) {
  if (sea[i] > 0.85) landish++;
  if (sea[i] < 0.2) wetish++;
}
console.log("marine land mask", { landish, wetish });
if (landish < 1000 || wetish < 10) {
  console.error("FAIL: marine SE water missing or land not mostly dry");
  process.exit(6);
}
console.log("OK");
