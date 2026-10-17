import { FluidSolver } from "./FluidSolver";
import { FrameStore } from "./FrameStore";

/** Smaller than classic CM1 output dt — keeps sandbox microphysics stable. */
export const BATCH_FIXED_DT = 1;

export interface BatchProgress {
  frac: number;
  t: number;
  frames: number;
  message: string;
}

export interface BatchConfig {
  durationSec: number;
  outputIntervalSec: number;
  /** Physics step (sim seconds). Default CM1-like 2 s. */
  fixedDt?: number;
  onProgress?: (p: BatchProgress) => void;
  shouldCancel?: () => boolean;
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * Integrate a fixed duration at fixed dt, capturing packed volume + refl
 * every outputIntervalSec. Yields to the UI between chunks.
 */
export async function runBatch(
  solver: FluidSolver,
  cfg: BatchConfig,
): Promise<FrameStore> {
  const duration = Math.max(1, cfg.durationSec);
  const every = Math.max(0.5, cfg.outputIntervalSec);
  const fixedDt = Math.max(0.25, cfg.fixedDt ?? BATCH_FIXED_DT);
  const { nx, ny, nz } = solver.grid;
  const store = new FrameStore(nx, ny, nz);

  const capture = (): void => {
    const volume = new Uint8Array(nx * ny * nz * 4);
    const radar = new Uint8Array(nx * ny * 4);
    solver.packVolumeRGBA(volume);
    solver.packMapProduct("refl", radar);
    store.push({
      t: solver.time,
      solarHour: solver.radiation.solarHour,
      volume,
      radar,
    });
  };

  capture();
  let nextOut = every;
  cfg.onProgress?.({
    frac: 0,
    t: solver.time,
    frames: store.length,
    message: "Recording…",
  });

  while (solver.time < duration - 1e-6) {
    if (cfg.shouldCancel?.()) {
      throw new Error("Batch cancelled");
    }

    const chunkDeadline = performance.now() + 20;
    while (performance.now() < chunkDeadline && solver.time < duration - 1e-6) {
      const remain = duration - solver.time;
      solver.step(Math.min(fixedDt, remain));

      while (nextOut <= duration + 1e-6 && solver.time + 1e-6 >= nextOut) {
        capture();
        nextOut += every;
      }
    }

    const frac = Math.min(1, solver.time / duration);
    cfg.onProgress?.({
      frac,
      t: solver.time,
      frames: store.length,
      message: `Integrating t=${solver.time.toFixed(0)}s / ${duration.toFixed(0)}s`,
    });
    await yieldToUi();
  }

  // Always keep a frame at the final time if the last interval missed it
  const last = store.last();
  if (!last || solver.time - last.t > 0.05) {
    capture();
  }

  cfg.onProgress?.({
    frac: 1,
    t: solver.time,
    frames: store.length,
    message: "Done",
  });

  return store;
}
