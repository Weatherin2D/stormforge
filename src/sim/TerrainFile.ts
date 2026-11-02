/**
 * Land & water map file (*.sft).
 *
 * Stores the painted surface fields from TerrainEditor so a map can be reused
 * across runs without loading a full simulation save.
 */

import { SURFACE_N, type NestRect } from "./surface";

export const TERRAIN_FILE_KIND = "stormforge-terrain";

/** Painted surface fields shared by the editor, setup, and .sft files. */
export interface SurfaceExport {
  terrain?: number[];
  water?: number[];
  kind?: number[];
  waterTemp?: number[];
  soil?: number[];
  veg?: number[];
  sstC?: number;
  nest?: NestRect | null;
}

/** On-disk document for a painted surface. */
export interface TerrainFile {
  version: 1;
  kind: typeof TERRAIN_FILE_KIND;
  /** Editor resolution (cells per side). Must match SURFACE_N. */
  n: number;
  terrain?: number[];
  water?: number[];
  /** Cover kind map (0 land, 1 lake, 2 ocean). Named apart from document.kind. */
  kindMap?: number[];
  waterTemp?: number[];
  soil?: number[];
  veg?: number[];
  sstC?: number;
  nest?: NestRect | null;
}

/** Build a downloadable terrain document from the editor export. */
export function toTerrainFile(surface: SurfaceExport): TerrainFile {
  return {
    version: 1,
    kind: TERRAIN_FILE_KIND,
    n: SURFACE_N,
    terrain: surface.terrain,
    water: surface.water,
    kindMap: surface.kind,
    waterTemp: surface.waterTemp,
    soil: surface.soil,
    veg: surface.veg,
    sstC: surface.sstC,
    nest: surface.nest ?? null,
  };
}

/** Trigger a browser download of the terrain file. */
export function downloadTerrain(surface: SurfaceExport, name = "stormforge-terrain"): void {
  const doc = toTerrainFile(surface);
  const json = JSON.stringify(doc);
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  const safe = name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_") || "stormforge-terrain";
  a.href = URL.createObjectURL(blob);
  a.download = `${safe}.sft`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function asNumberArray(value: unknown, expected: number): number[] | undefined {
  if (!Array.isArray(value) || value.length !== expected) return undefined;
  const out = new Array<number>(expected);
  for (let i = 0; i < expected; i++) {
    const v = Number(value[i]);
    out[i] = Number.isFinite(v) ? v : 0;
  }
  return out;
}

function nestFrom(value: unknown): NestRect | null | undefined {
  if (value === null) return null;
  if (typeof value !== "object" || value === null) return undefined;
  const o = value as Record<string, unknown>;
  const x0 = Number(o["x0"]);
  const y0 = Number(o["y0"]);
  const x1 = Number(o["x1"]);
  const y1 = Number(o["y1"]);
  const refinement = Number(o["refinement"]);
  if (![x0, y0, x1, y1, refinement].every(Number.isFinite)) return undefined;
  return {
    x0,
    y0,
    x1,
    y1,
    refinement: refinement >= 3 ? 3 : 2,
  };
}

function surfaceFromRecord(o: Record<string, unknown>, n: number): SurfaceExport {
  const cells = n * n;
  // Dedicated .sft uses kindMap so it does not clash with document.kind string.
  // Full .sfz setup (and older drafts) use "kind".
  const kindSrc = o["kindMap"] ?? o["kind"];
  const out: SurfaceExport = {};
  const terrain = asNumberArray(o["terrain"], cells);
  const water = asNumberArray(o["water"], cells);
  const kind = asNumberArray(kindSrc, cells);
  const waterTemp = asNumberArray(o["waterTemp"], cells);
  const soil = asNumberArray(o["soil"], cells);
  const veg = asNumberArray(o["veg"], cells);
  if (terrain) out.terrain = terrain;
  if (water) out.water = water;
  if (kind) out.kind = kind;
  if (waterTemp) out.waterTemp = waterTemp;
  if (soil) out.soil = soil;
  if (veg) out.veg = veg;
  if (typeof o["sstC"] === "number" && Number.isFinite(o["sstC"])) {
    out.sstC = o["sstC"];
  }
  if ("nest" in o) {
    const nest = nestFrom(o["nest"]);
    if (nest !== undefined) out.nest = nest;
  }
  return out;
}

/**
 * Parse a .sft terrain file, or pull surface fields from a full .sfz save.
 * Throws on failure.
 */
export function parseTerrainFile(json: string): SurfaceExport {
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    throw new Error("Invalid terrain file: not valid JSON.");
  }
  if (typeof obj !== "object" || obj === null) {
    throw new Error("Invalid terrain file: expected a JSON object.");
  }
  const root = obj as Record<string, unknown>;

  // Full simulation save — surface lives under setup.
  if (root["setup"] && typeof root["setup"] === "object") {
    const setup = root["setup"] as Record<string, unknown>;
    const n =
      typeof root["n"] === "number"
        ? root["n"]
        : typeof setup["n"] === "number"
          ? (setup["n"] as number)
          : SURFACE_N;
    if (n !== SURFACE_N) {
      throw new Error(
        `Unsupported terrain resolution: ${n}×${n}. Expected ${SURFACE_N}×${SURFACE_N}.`,
      );
    }
    const surface = surfaceFromRecord(setup, n);
    if (
      !surface.terrain &&
      !surface.water &&
      !surface.soil &&
      !surface.veg &&
      surface.nest == null
    ) {
      throw new Error("Save file has no land & water maps.");
    }
    return surface;
  }

  const n = typeof root["n"] === "number" ? root["n"] : SURFACE_N;
  if (n !== SURFACE_N) {
    throw new Error(
      `Unsupported terrain resolution: ${n}×${n}. Expected ${SURFACE_N}×${SURFACE_N}.`,
    );
  }
  if (root["kind"] === TERRAIN_FILE_KIND) {
    // Empty maps are valid (flat land).
    return surfaceFromRecord(root, n);
  }
  if (root["version"] === 1) {
    const surface = surfaceFromRecord(root, n);
    if (
      !surface.terrain &&
      !surface.water &&
      !surface.soil &&
      !surface.veg &&
      surface.nest == null
    ) {
      throw new Error("Terrain file has no map data.");
    }
    return surface;
  }

  // Bare surface object (terrain/water arrays at top level).
  if (
    Array.isArray(root["terrain"]) ||
    Array.isArray(root["water"]) ||
    Array.isArray(root["soil"]) ||
    Array.isArray(root["veg"])
  ) {
    return surfaceFromRecord(root, n);
  }

  throw new Error("Unrecognized terrain file format.");
}
