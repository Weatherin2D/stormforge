/**
 * Stormforge save-file format.
 *
 * A save is a plain JSON file (*.sfz) that stores:
 *  - the full setup config (grid, sounding, synoptic, radiation)
 *  - the display/render preferences
 *  - the sim-time and solar hour at the moment of saving
 *
 * This is enough to reproduce an identical starting environment and restore
 * the viewer to the same look without requiring a binary physics snapshot.
 * Binary field saves are intentionally omitted to keep files small (~20 KB).
 */

import type { SetupValues } from "../setup/SetupScreen";
import type { MapProductId } from "./mapProducts";

/** Persisted render/display state. */
export interface SavedView {
  showClouds: boolean;
  showRadar3d: boolean;
  showRadar2d: boolean;
  showSurfaceWinds: boolean;
  mapProduct: MapProductId;
  simSpeed: 1 | 5 | 15 | 40;
  cloudLookPreset: string;
  cloudTune: {
    gain: number;
    sigmaLiquid: number;
    sigmaRain: number;
    erosionLiquid: number;
    erosionIce: number;
  };
  clockPaused: boolean;
}

/** Top-level save document. */
export interface StormforgeSave {
  /** Incremented when the schema changes in a breaking way. */
  version: 1;
  /** ISO-8601 timestamp of when the file was written. */
  created: string;
  /** Human-readable label (matches the run name). */
  name: string;

  /**
   * Full setup configuration — sufficient to reconstruct the exact initial
   * conditions when passed back into App.startRun().
   */
  setup: SetupValues;

  /**
   * Sim time (seconds) and solar hour at save time.
   * Applied after startRun() so the solar clock continues from where you left off.
   */
  simTime: number;
  solarHour: number;

  /** Render and display preferences. */
  view: SavedView;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialisation helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Trigger a browser download of the save file. */
export function downloadSave(save: StormforgeSave): void {
  const json = JSON.stringify(save, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  const safeName = save.name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_") || "stormforge";
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName}.sfz`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Parse and validate a JSON string as a StormforgeSave. Throws on failure. */
export function parseSave(json: string): StormforgeSave {
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    throw new Error("Invalid save file: not valid JSON.");
  }
  if (typeof obj !== "object" || obj === null) {
    throw new Error("Invalid save file: expected a JSON object.");
  }
  const o = obj as Record<string, unknown>;
  if (o["version"] !== 1) {
    throw new Error(
      `Unsupported save version: ${String(o["version"])}. Expected 1.`,
    );
  }
  if (!o["setup"] || typeof o["setup"] !== "object") {
    throw new Error("Invalid save file: missing 'setup' block.");
  }
  const setup = o["setup"] as Record<string, unknown>;
  if (
    typeof setup["nx"] !== "number" ||
    typeof setup["ny"] !== "number" ||
    typeof setup["nz"] !== "number" ||
    !Array.isArray(setup["sounding"])
  ) {
    throw new Error("Invalid save file: 'setup' is missing required fields.");
  }
  return obj as StormforgeSave;
}
