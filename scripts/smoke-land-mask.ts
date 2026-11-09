import { buildLandMask } from "../src/sim/SurfaceRadiation";

const m = buildLandMask(64, 64, false);
let min = 1;
let max = 0;
for (let i = 0; i < m.length; i++) {
  if (m[i] < min) min = m[i];
  if (m[i] > max) max = m[i];
}
console.log("non-marine land mask", { min, max });
if (min !== 1 || max !== 1) {
  console.error("FAIL: expected uniform land=1 without marine/water");
  process.exit(2);
}

const sea = buildLandMask(64, 64, true);
let landish = 0;
let wetish = 0;
for (let i = 0; i < sea.length; i++) {
  if (sea[i] > 0.9) landish++;
  if (sea[i] < 0.2) wetish++;
}
console.log("marine land mask", { landish, wetish });
if (landish < 1000 || wetish < 10) {
  console.error("FAIL: marine SE water missing or land not mostly uniform");
  process.exit(3);
}
console.log("OK");
