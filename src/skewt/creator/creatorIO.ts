import { dirOf, integrateLevels, Tdw, wm } from "./creatorPhysics";
import { KT, toSoundingLevels } from "./soundingBridge";
import type { CreatorLevel } from "./types";
import type { SoundingLevel } from "../../sim/thermo";

const K = 273.15;
const g = 9.80665;
const cp = 1005.7;
const kap = 287.04 / cp;

export function parseCreatorText(t: string): CreatorLevel[] {
  const R = t
    .split(/\r?\n/)
    .map((s) => s.trim().split(/[\s,;]+/).filter(Boolean))
    .filter((a) => a.length && a.every((x) => !Number.isNaN(+x)))
    .map((a) => a.map(Number));
  let o: CreatorLevel[] = [];
  if (R.length && R[0].length === 3) {
    const [ps, ts, qs] = R[0];
    const rows = R.slice(1).filter((r) => r.length >= 5);
    const uv = (r: number[]) => ({
      d: dirOf(r[3], r[4]),
      s: Math.hypot(r[3], r[4]) / KT,
    });
    let pi = Math.pow(ps / 1e3, kap);
    let zp = 0;
    let tp = ts * (1 + 0.61e-3 * qs);
    if (rows.length) {
      o.push({
        p: ps,
        T: ts * pi - K,
        Td: Math.min(Tdw(ps, Math.max(qs, 0.01)), ts * pi - K),
        ...uv(rows[0]),
      });
    }
    rows.forEach((r) => {
      if (r[0] <= 0) return;
      const t2 = r[1] * (1 + 0.61e-3 * r[2]);
      pi -= ((g / cp) * (r[0] - zp) * (1 / tp + 1 / t2)) / 2;
      zp = r[0];
      tp = t2;
      const p = 1e3 * Math.pow(pi, 1 / kap);
      const T = r[1] * pi - K;
      o.push({
        p,
        T,
        Td: Math.min(Tdw(p, Math.max(r[2], 0.01)), T),
        ...uv(r),
      });
    });
  } else {
    o = R.filter(
      (r) => (r.length === 5 || r.length === 6) && !r.includes(-9999),
    ).map((r) => {
      const a = r.length === 6 ? [r[0], r[2], r[3], r[4], r[5]] : r;
      return {
        p: a[0],
        T: a[1],
        Td: Math.min(a[2], a[1]),
        d: a[3],
        s: a[4],
      };
    });
  }
  if (o.length < 3) {
    throw new Error(
      "Could not read at least 3 levels. Use CM1, CSV (p,T,Td,dir,spd) or SHARPpy text.",
    );
  }
  return o;
}

/** Stormforge CSV: alt_m,p_hPa,t_C,td_C,u,v */
export function tryParseStormforge(t: string): CreatorLevel[] | null {
  const lines = t
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  const start = /^alt_m/i.test(lines[0]) ? 1 : 0;
  const rows: CreatorLevel[] = [];
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(/[\s,;]+/).map(Number);
    if (parts.length < 6 || parts.some((n) => Number.isNaN(n))) continue;
    const [z, pHpa, tC, tdC, u, v] = parts;
    rows.push({
      p: pHpa,
      T: tC,
      Td: Math.min(tdC, tC),
      d: dirOf(u, v),
      s: Math.hypot(u, v) / KT,
      z,
      u,
      v,
    });
  }
  return rows.length >= 3 ? rows : null;
}

export function exportCreator(
  L: CreatorLevel[],
  fm: "CM1" | "CSV" | "SHARPpy",
): string {
  integrateLevels(L);
  const s = L[0];
  const n = (a: number[], d = 2) => a.map((v) => v.toFixed(d));
  if (fm === "CSV") {
    return (
      "pres_hPa,temp_C,dwpt_C,wdir_deg,wspd_kt\n" +
      L.map((l) => n([l.p, l.T, l.Td, l.d, l.s]).join(",")).join("\n")
    );
  }
  if (fm === "SHARPpy") {
    return (
      "%TITLE%\n SKEWT-ED 000000/0000\n\n LEVEL HGHT TEMP DWPT WDIR WSPD\n-------------------------------------------------------------------\n%RAW%\n" +
      L.map((l) =>
        n([l.p, l.z ?? 0, l.T, l.Td, l.d, l.s])
          .map((v) => v.padStart(10))
          .join(","),
      ).join("\n") +
      "\n%END%"
    );
  }
  const th = (l: CreatorLevel) => (l.T + K) * Math.pow(1e3 / l.p, kap);
  const q = (l: CreatorLevel) => wm(l.p, l.Td);
  return (
    n([s.p, th(s), q(s)]).join(" ") +
    "\n" +
    L.filter((l) => (l.z ?? 0) > 0)
      .map((l) =>
        n([l.z ?? 0, th(l), q(l), (l.u ?? 0) * KT, (l.v ?? 0) * KT]).join(" "),
      )
      .join("\n")
  );
}

export function stormforgeExport(levels: SoundingLevel[]): string {
  return (
    ["alt_m,p_hPa,t_C,td_C,u,v"]
      .concat(
        levels.map((l) =>
          [
            l.z.toFixed(1),
            (l.p / 100).toFixed(2),
            (l.T - 273.15).toFixed(2),
            (l.Td - 273.15).toFixed(2),
            l.u.toFixed(2),
            l.v.toFixed(2),
          ].join(","),
        ),
      )
      .join("\n")
  );
}

export function parseAnySounding(text: string): CreatorLevel[] {
  const sf = tryParseStormforge(text);
  if (sf) return sf;
  return parseCreatorText(text);
}

/** Convenience: SI levels from any text. */
export function parseToSoundingLevels(text: string): SoundingLevel[] {
  return toSoundingLevels(parseAnySounding(text));
}
