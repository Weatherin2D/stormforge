import { Grid3D } from "../src/sim/Grid3D";
import { FluidSolver } from "../src/sim/FluidSolver";
import { defaultSounding } from "../src/sim/thermo";
import { MAP_PRODUCTS, MapProductId } from "../src/sim/mapProducts";
import { VIEW_CATALOG } from "../src/sim/viewCatalog";

const g = new Grid3D({ nx: 32, ny: 32, nz: 32, zTop: 14000 });
const s = new FluidSolver(g);
s.rebuild(g, defaultSounding(14000, 30), { bubbleStrength: 5 });
for (let i = 0; i < 200; i++) s.step(2);

const out = new Uint8Array(g.nx * g.ny * 4);
let failures = 0;
for (const id of Object.keys(MAP_PRODUCTS) as MapProductId[]) {
  try {
    s.packMapProduct(id, out);
    let alphaOk = true;
    for (let p = 3; p < out.length; p += 4) {
      if (out[p] !== 255) {
        alphaOk = false;
        break;
      }
    }
    if (!alphaOk) {
      console.error(`FAIL ${id}: non-opaque pixel`);
      failures++;
      continue;
    }
    console.log(`ok ${id} (${MAP_PRODUCTS[id].title})`);
  } catch (err) {
    console.error(`FAIL ${id}:`, err);
    failures++;
  }
}

const catalogIds = new Set(
  VIEW_CATALOG.map((view) => view.productId).filter(Boolean),
);
const missingCatalog = (Object.keys(MAP_PRODUCTS) as MapProductId[]).filter(
  (id) => !catalogIds.has(id),
);
if (missingCatalog.length > 0) {
  console.error(`FAIL: products missing a catalog entry: ${missingCatalog.join(", ")}`);
  failures++;
}

const undocumented = VIEW_CATALOG.filter(
  (view) =>
    view.productId &&
    view.provenance === "derived" &&
    (!view.formula || !view.assumptions),
);
if (undocumented.length > 0) {
  console.error(
    `FAIL: mapped derived views without formula/assumptions: ${undocumented
      .map((view) => view.id)
      .join(", ")}`,
  );
  failures++;
}

if (failures > 0) process.exit(2);
console.log(
  `OK: ${Object.keys(MAP_PRODUCTS).length} map products packed, all catalogued and documented`,
);
