/** One recorded view frame for CM1-style batch review. */
export interface RecordedFrame {
  t: number;
  solarHour: number;
  volume: Uint8Array;
  radar: Uint8Array;
}

/** Soft memory cap for the in-RAM frame strip (~512 MB). */
export const BATCH_MEMORY_CAP_BYTES = 512 * 1024 * 1024;

export function estimateBatchBytes(
  nx: number,
  ny: number,
  nz: number,
  frameCount: number,
): number {
  const volumeBytes = nx * ny * nz * 4;
  const radarBytes = nx * ny * 4;
  return Math.max(0, frameCount) * (volumeBytes + radarBytes);
}

export function estimateFrameCount(
  durationSec: number,
  outputIntervalSec: number,
): number {
  const dur = Math.max(1, durationSec);
  const every = Math.max(0.5, outputIntervalSec);
  // t=0 plus each interval, including a final frame at duration
  return Math.floor(dur / every) + 1;
}

/**
 * In-memory strip of packed volume + reflectivity frames.
 * Buffers are owned copies — safe to keep after the solver advances.
 */
export class FrameStore {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  private frames: RecordedFrame[] = [];

  constructor(nx: number, ny: number, nz: number) {
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
  }

  get length(): number {
    return this.frames.length;
  }

  clear(): void {
    this.frames = [];
  }

  push(frame: RecordedFrame): void {
    this.frames.push(frame);
  }

  get(i: number): RecordedFrame | null {
    if (i < 0 || i >= this.frames.length) return null;
    return this.frames[i];
  }

  last(): RecordedFrame | null {
    return this.frames.length ? this.frames[this.frames.length - 1] : null;
  }

  bytesUsed(): number {
    return estimateBatchBytes(this.nx, this.ny, this.nz, this.frames.length);
  }
}
