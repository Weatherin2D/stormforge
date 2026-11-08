/**
 * Stormforge save-file format.
 *
 * A save is a plain JSON file (*.sfz) that stores:
 *  - the full setup config (grid, sounding, synoptic, radiation, land maps)
 *  - the display/render preferences
 *  - the sim-time and solar hour at the moment of saving
 *
 * This is enough to reproduce an identical starting environment and restore
 * the viewer to the same look without requiring a binary physics snapshot.
 */

import type { SetupValues } from "../setup/SetupScreen";
import type { MapProductId } from "./mapProducts";
import type { AdvancedToggles, AdvancedValues } from "./AdvancedSettings";

/** Wall-clock multipliers offered in the sim menu. */
export const SIM_SPEEDS = [1, 5, 15, 40, 75, 100, 250, 1000, 5000] as const;
export type SimSpeed = (typeof SIM_SPEEDS)[number];

export function asSimSpeed(n: number): SimSpeed {
  for (let i = 0; i < SIM_SPEEDS.length; i++) {
    if (SIM_SPEEDS[i] === n) return SIM_SPEEDS[i];
  }
  return 40;
}

/** Persisted render/display state. */
export interface SavedView {
  showClouds: boolean;
  showRadar3d: boolean;
  showRadar2d: boolean;
  showSurfaceWinds: boolean;
  /** Rain/snow particles. Absent in older saves means on. */
  showDroplets?: boolean;
  mapProduct: MapProductId;
  simSpeed: SimSpeed;
  cloudLookPreset: string;
  cloudTune: {
    gain: number;
    sigmaLiquid: number;
    sigmaRain: number;
    erosionLiquid: number;
    erosionIce: number;
    /** Metres; how far volumetric clouds stay readable before haze. Optional on older saves. */
    lodDistance?: number;
  };
  lightningFreq: number;
  clockPaused: boolean;
  /** Optional advanced slider bag (additive; older saves omit it). */
  advanced?: Partial<AdvancedValues>;
  /** Optional advanced feature toggles (additive; older saves omit it). */
  advancedToggles?: Partial<AdvancedToggles>;
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

/** Defaults used when saving from the setup screen (no live viewer yet). */
export const DEFAULT_SAVED_VIEW: SavedView = {
  showClouds: true,
  showRadar3d: false,
  showRadar2d: false,
  showSurfaceWinds: false,
  showDroplets: true,
  mapProduct: "refl",
  simSpeed: 40,
  cloudLookPreset: "",
  cloudTune: {
    gain: 1,
    sigmaLiquid: 0.0085,
    sigmaRain: 0.0022,
    erosionLiquid: 1.0,
    erosionIce: 0.5,
    lodDistance: 25000,
  },
  lightningFreq: 1,
  clockPaused: false,
};

/** Build a .sfz document from setup values (weather, terrain, domain, sun). */
export function saveFromSetup(
  setup: SetupValues,
  view: SavedView = DEFAULT_SAVED_VIEW,
): StormforgeSave {
  return {
    version: 1,
    created: new Date().toISOString(),
    name: setup.name,
    setup,
    simTime: 0,
    solarHour: setup.startHour,
    view: { ...view },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialisation helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Trigger a browser download of the save file. */
export function downloadSave(save: StormforgeSave): void {
  const json = JSON.stringify(save);
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
