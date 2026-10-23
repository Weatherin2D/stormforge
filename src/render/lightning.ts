import type { LightningKind } from "../sim/FluidSolver";

/** At most this many strokes along one channel; negative CGs log-normally average ~3.7. */
const STROKE_COUNTS = [0.18, 0.15, 0.17, 0.16, 0.12, 0.09, 0.07, 0.06];
const NEW_CONTACT = 0.2;
const CRAWL_MS_PER_KM = 10;
const CRAWL_MAX = 600;
const ROUGHNESS = 0.12;
const KINK_STEP = 0.05;
const KINK_SPREAD = 0.22;

export interface LightningStroke {
  at: number;      // ms from flash start when this stroke peaks
  peak: number;    // 0-1 brightness
  cc: number;      // continuing current brightness while it lasts
  ccLength: number // ms the continuing current holds after the stroke
  path: 0 | 1;     // 0 = old path, 1 = new ground contact
}

export interface LightningCourse {
  leader: number;   // ms the stepped/crawling leader takes to reach the ground / complete
  strokes: LightningStroke[];
  end: number;      // ms when the flash is fully over
}

/** A standard normal deviate (Box-Muller). */
function normal(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

/**
 * The temporal course of one flash, in ms from its start, as observed (Rakov & Uman 2003 etc.):
 * a CG's stepped leader grows down dimly, then the return stroke lights the main channel and,
 * briefly, the branches; a negative CG has 1-8 strokes along the same channel (log-normal,
 * geometric mean ~60 ms apart); a continuing current follows ~11% of subsequent strokes; a
 * positive CG usually one stroke with a long continuing current. An IC flash grows over the
 * first 60-150 ms, then K-changes flicker it.
 *
 * `kind` "cg" = cloud-to-ground, anything else = in-cloud. `charge` > 0 means positive CG.
 * `extent` is the flash's horizontal extent in km (drives how long a crawling leader takes).
 */
export function course(kind: LightningKind, charge: number, extentKm: number, rng: () => number): LightningCourse {
  const crawl = Math.min(CRAWL_MAX, extentKm * CRAWL_MS_PER_KM);
  const isCg = kind === "cg";
  const positive = charge > 0;

  if (!isCg) {
    // IC flash: K-changes once the channel is there, the first as it completes.
    const leader = Math.max(60 + rng() * 90, crawl);
    const end = Math.max(200 + rng() * 300, leader + 150 + rng() * 300);
    const n = 3 + Math.floor(rng() * 8);
    const strokes: LightningStroke[] = Array.from({ length: n }, (_, k) => ({
      at: k ? leader + rng() * (end - leader) : leader,
      peak: 0.15 + rng() * 0.2,
      cc: 0,
      ccLength: 0,
      path: 0 as 0 | 1,
    })).sort((a, b) => a.at - b.at);
    return { leader, strokes, end: end + 120 };
  }

  // Negative CG: stepped leader comes down in 20-35 ms.
  // Positive CG: long horizontal leader in the cloud first.
  const leader = positive ? Math.max(100 + rng() * 100, crawl) : 20 + rng() * 15;

  // Number of strokes: 1 in ~1/5 of flashes, then fewer up to 8.
  let n = 1;
  if (!positive) {
    let r = rng();
    for (n = 1; n < STROKE_COUNTS.length && r > STROKE_COUNTS[n - 1]; n++) r -= STROKE_COUNTS[n - 1];
  }

  const strokes: LightningStroke[] = [];
  let at = leader;
  let forked = false;
  for (let k = 0; k < n; k++) {
    if (k) at += Math.min(300, Math.max(5, 60 * Math.exp(0.8 * normal(rng))));
    const cc = positive ? 0.35 : k && rng() < 0.11 ? 0.25 : 0;
    const ccLength = positive ? 100 + rng() * 150 : cc ? 40 + rng() * 110 : 0;
    let path: 0 | 1 = 0 as 0 | 1;
    if (k && !forked && rng() < NEW_CONTACT) { path = 1; forked = true; }
    else if (k && forked && rng() < 0.6) path = 1;
    strokes.push({ at, peak: k ? 0.6 + rng() * 0.3 : 1, cc, ccLength, path });
    at += ccLength;
  }
  return { leader, strokes, end: at + 220 };
}

/**
 * Brightness at `t` ms of a flash's course:
 *  - main: the main channel (brightest after a return stroke)
 *  - branch: branches (light with the first stroke of a CG, all of an IC's channel)
 *  - reveal: how much of the channel has grown (0-1, leader phase)
 *  - old: the old path below where a new ground contact leaves it
 *  - fork: the new path after a new ground contact
 * `slow`: slowed replay (faint stepped leader shows, return stroke dies in a few ms).
 */
export function brightness(c: LightningCourse, isCg: boolean, t: number, slow = false) {
  const reveal = Math.min(1, t / c.leader);
  const fade = slow ? 3 : 25;
  let main = t < c.leader ? (slow ? 0.35 : c.leader > 60 ? 0.22 : 0.12) : 0;
  let branch = main, old = main, fork = 0;

  for (const [k, s] of c.strokes.entries()) {
    if (t < s.at) continue;
    const after = t - s.at;
    const now = Math.max(
      s.peak * Math.exp(-after / fade),
      after < s.ccLength ? s.cc : s.cc * Math.exp(-(after - s.ccLength) / 30),
    );
    main = Math.max(main, now);
    if (s.path) fork = Math.max(fork, now); else old = Math.max(old, now);
    if (!isCg) branch = main;
    else if (k === 0) branch = Math.max(branch, 0.5 * Math.exp(-after / (slow ? 2 : 15)));
  }
  if (!isCg && t >= c.leader) main = branch = old = Math.max(main, 0.08);
  return { main, branch, reveal, old, fork };
}
