import {
  SoundingLevel,
  TFromTheta,
  dewpointFromE,
  esat,
  pressureAtZ,
  uvFromSpdDir,
} from "./thermo";

export type SoundingFormat =
  | "stormforge"
  | "extra"
  | "sharppy"
  | "spc"
  | "cm1"
  | "unknown";

/** SHARPpy/SPC missing sentinel (9999), not heights. */
function isMissingMet(n: number | undefined): boolean {
  if (n === undefined || !Number.isFinite(n)) return true;
  return Math.abs(n) >= 900 && Math.abs(n) < 1e6 && Number.isInteger(Math.abs(n));
}

function isMissingTemp(n: number | undefined): boolean {
  if (n === undefined || !Number.isFinite(n)) return true;
  // 9999-style sentinels only (keep real cold temps like -80)
  return Math.abs(n) >= 9000;
}

/**
 * Parse pasted/file sounding text into Stormforge levels.
 * Supports:
 * - Stormforge: alt_m, p_hPa, t_C, td_C, u, v
 * - Extra sandbox: alt, p, t, tw, td, rh, vel, angle
 * - SHARPpy / NSHARP %RAW%: p_hPa, hght_m, t_C, td_C, wdir, wspd
 * - SPC / UWYO: PRES HGHT TEMP DWPT … DRCT SKNT
 * - CM1 input_sounding: sfc p/th/qv then z/th/qv/u/v
 */
export function parseSoundingText(
  text: string,
  zTop: number,
): {
  ok: boolean;
  message: string;
  levels: SoundingLevel[];
  format: SoundingFormat;
} {
  const raw = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // CM1 native format (no %RAW%, first line is sfc p/th/qv)
  const cm1 = tryParseCm1(lines, zTop);
  if (cm1) return cm1;

  // Prefer %RAW% ... %END% block if present (SHARPpy)
  let dataLines = lines;
  const rawStart = lines.findIndex((l) => /^%RAW%/i.test(l));
  const rawEnd = lines.findIndex((l) => /^%END%/i.test(l));
  if (rawStart >= 0) {
    dataLines = lines.slice(
      rawStart + 1,
      rawEnd > rawStart ? rawEnd : undefined,
    );
  }

  const looksSpcHeader = lines.some((l) =>
    /\bPRES\b/i.test(l) && /\bHGHT\b/i.test(l) && /\bTEMP\b/i.test(l),
  );

  dataLines = dataLines.filter(
    (l) =>
      !l.startsWith("#") &&
      !l.startsWith("%") &&
      !/^-{3,}/.test(l) &&
      !/^[A-Za-z_]/.test(l) &&
      !/^LEVEL\b/i.test(l) &&
      !/^hPa\b/i.test(l),
  );

  const rows: number[][] = [];
  for (const line of dataLines) {
    const parts = line
      .split(/[,\s\t]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s));
    if (parts.length < 4 || parts.some((n) => Number.isNaN(n))) continue;
    rows.push(parts);
  }

  if (rows.length < 3) {
    return {
      ok: false,
      message:
        "Need at least 3 numeric levels. Try SHARPpy, Extra, SPC, CM1 input_sounding, or Stormforge CSV.",
      levels: [],
      format: "unknown",
    };
  }

  const format = detectFormat(rows, looksSpcHeader || rawStart >= 0);
  const sharpKnots =
    (format === "sharppy" || format === "spc") && looksLikeKnots(rows, format);
  const levels: SoundingLevel[] = [];

  for (const parts of rows) {
    let z: number;
    let p: number;
    let tC: number;
    let tdC: number;
    let u = 0;
    let v = 0;

    if (format === "sharppy") {
      // p_hPa, hght_m, t_C, td_C, wdir, wspd
      p = parts[0] * (parts[0] > 0 && parts[0] < 1200 ? 100 : 1);
      z = parts[1];
      tC = parts[2];
      tdC = parts[3];
      const wdir = isMissingMet(parts[4]) ? 0 : (parts[4] ?? 0);
      let wspd = isMissingMet(parts[5]) ? 0 : (parts[5] ?? 0);
      if (sharpKnots) wspd *= 0.514444;
      const uv = uvFromSpdDir(wspd, wdir);
      u = uv.u;
      v = uv.v;
    } else if (format === "spc") {
      // PRES HGHT TEMP DWPT RELH MIXR DRCT SKNT …
      p = parts[0] * (parts[0] > 0 && parts[0] < 1200 ? 100 : 1);
      z = parts[1];
      tC = parts[2];
      tdC = parts[3];
      const wdir = isMissingMet(parts[6]) ? 0 : (parts[6] ?? 0);
      let wspd = isMissingMet(parts[7]) ? 0 : (parts[7] ?? 0);
      if (sharpKnots) wspd *= 0.514444;
      const uv = uvFromSpdDir(wspd, wdir);
      u = uv.u;
      v = uv.v;
    } else if (format === "extra") {
      // alt, p, t, tw, td, rh, vel, angle
      z = parts[0];
      p = parts[1];
      tC = parts[2];
      tdC = parts[4];
      if (p > 0 && p < 1200) p *= 100;
      let vel = parts[6] ?? 0;
      const angle = parts[7] ?? 0;
      if (vel > 80) vel = vel / 3.6; // km/h → m/s
      const uv = uvFromSpdDir(vel, angle);
      u = uv.u;
      v = uv.v;
      if (z > 0 && z < 40 && zTop > 1000) z *= 1000;
    } else {
      // Stormforge: alt_m, p_hPa, t_C, td_C, u, v
      z = parts[0];
      p = parts[1];
      tC = parts[2];
      tdC = parts[3];
      u = parts.length > 4 ? parts[parts.length - 2] : 0;
      v = parts.length > 5 ? parts[parts.length - 1] : 0;
      if (p > 0 && p < 1200) p *= 100;
      if (z > 0 && z < 40 && zTop > 1000) z *= 1000;
    }

    if (isMissingTemp(tC) || !Number.isFinite(z) || !(p > 0)) continue;

    let T = Math.abs(tC) < 200 ? tC + 273.15 : tC;
    let Td: number;
    if (isMissingTemp(tdC)) {
      Td = T - 20;
    } else {
      Td = Math.abs(tdC) < 200 ? tdC + 273.15 : tdC;
    }
    if (Td > T) Td = T;
    if (!(p > 1000 && p < 120000)) p = pressureAtZ(Math.max(0, z), zTop);
    if (z < 0) continue;

    levels.push({ z, p, T, Td, u, v });
  }

  if (levels.length < 3) {
    return {
      ok: false,
      message: "Parsed fewer than 3 valid levels.",
      levels: [],
      format,
    };
  }

  return finalize(levels, format, zTop);
}

/** CM1 input_sounding: line1 = p_mb th_K qv_g/kg; then z th qv u v */
function tryParseCm1(
  lines: string[],
  zTop: number,
):
  | {
      ok: boolean;
      message: string;
      levels: SoundingLevel[];
      format: SoundingFormat;
    }
  | null {
  if (lines.some((l) => /^%RAW%/i.test(l))) return null;

  const numeric: number[][] = [];
  for (const line of lines) {
    if (line.startsWith("#") || /^[A-Za-z_%]/.test(line)) continue;
    const parts = line
      .split(/[,\s\t]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n));
    if (parts.length >= 3) numeric.push(parts);
  }
  if (numeric.length < 4) return null;

  const sfc = numeric[0];
  // Surface: p(~50-1100 mb), theta(~250-400 K), qv (g/kg ~0-40 or kg/kg)
  const pSfc = sfc[0];
  const thSfc = sfc[1];
  const qvSfc = sfc[2];
  if (!(pSfc >= 50 && pSfc <= 1100 && thSfc >= 250 && thSfc <= 400)) {
    return null;
  }
  // qv column should look like mixing ratio, not temperature °C
  if (!(qvSfc >= 0 && qvSfc <= 50)) return null;

  const body = numeric.slice(1);
  // Body: z, theta, qv[, u, v] — theta stays ~250-400 and usually increases
  const cm1Like = body.filter(
    (r) =>
      r.length >= 3 &&
      r[0] >= 0 &&
      r[0] <= 40000 &&
      r[1] >= 250 &&
      r[1] <= 400 &&
      r[2] >= 0 &&
      r[2] <= 50,
  ).length;
  if (cm1Like < body.length * 0.75) return null;

  // Stormforge/Extra have pressure decreasing in col1 of data rows; CM1 has height in col0
  // and potential temperature in col1 (often rising). Reject pressure-descending profiles.
  let pDescents = 0;
  for (let i = 1; i < Math.min(body.length, 8); i++) {
    if (body[i][1] < body[i - 1][1] - 5) pDescents++;
  }
  if (pDescents >= 3) return null;

  const levels: SoundingLevel[] = [];
  const p0 = pSfc * 100;
  const qv0 = qvSfc > 1 ? qvSfc / 1000 : qvSfc; // g/kg → kg/kg if needed
  const T0 = TFromTheta(thSfc, p0);
  const e0 = Math.min(esat(T0) * 0.999, (qv0 * p0) / (0.622 + qv0));
  const Td0 = dewpointFromE(e0) + 273.15;
  levels.push({
    z: 0,
    p: p0,
    T: T0,
    Td: Math.min(Td0, T0),
    u: sfc[3] ?? 0,
    v: sfc[4] ?? 0,
  });

  for (const r of body) {
    const z = r[0];
    const th = r[1];
    let qv = r[2];
    if (qv > 1) qv /= 1000;
    const u = r[3] ?? 0;
    const v = r[4] ?? 0;
    const p = pressureAtZ(z, zTop);
    const T = TFromTheta(th, p);
    const e = Math.min(esat(T) * 0.999, (qv * p) / (0.622 + Math.max(qv, 1e-9)));
    const Td = Math.min(dewpointFromE(e) + 273.15, T);
    if (z < 0 || !Number.isFinite(T)) continue;
    levels.push({ z, p, T, Td, u, v });
  }

  if (levels.length < 3) return null;
  return finalize(levels, "cm1", zTop);
}

function finalize(
  levels: SoundingLevel[],
  format: SoundingFormat,
  _zTop: number,
): {
  ok: boolean;
  message: string;
  levels: SoundingLevel[];
  format: SoundingFormat;
} {
  levels.sort((a, b) => a.z - b.z);

  // Convert MSL station height to AGL for sim
  const z0 = levels[0].z;
  if (z0 > 50 && z0 < 5000) {
    for (const l of levels) l.z = Math.max(0, l.z - z0);
  }

  // Deduplicate identical heights
  const dedup: SoundingLevel[] = [];
  for (const l of levels) {
    const prev = dedup[dedup.length - 1];
    if (prev && Math.abs(prev.z - l.z) < 1) {
      dedup[dedup.length - 1] = l;
    } else {
      dedup.push(l);
    }
  }

  const fmtLabel =
    format === "sharppy"
      ? "SHARPpy"
      : format === "extra"
        ? "Extra"
        : format === "spc"
          ? "SPC/UWYO"
          : format === "cm1"
            ? "CM1"
            : "Stormforge";

  return {
    ok: true,
    message: `Imported ${dedup.length} levels (${fmtLabel}).`,
    levels: dedup,
    format,
  };
}

function looksLikeKnots(rows: number[][], format: SoundingFormat): boolean {
  let max = 0;
  const idx = format === "spc" ? 7 : 5;
  for (const r of rows) {
    if (r.length > idx && !isMissingMet(r[idx])) max = Math.max(max, r[idx]);
  }
  // Typical SHARPpy/SPC jet winds in knots exceed ~80
  return max > 80;
}

function detectFormat(
  rows: number[][],
  forceSharpFamily: boolean,
): SoundingFormat {
  const sample = rows.slice(0, Math.min(10, rows.length));
  const ncols = sample.reduce((m, r) => Math.max(m, r.length), 0);

  // SPC/UWYO usually has 10–11 columns; Extra has exactly 8
  if (ncols >= 10) {
    let spcVotes = 0;
    for (const r of sample) {
      const c0 = r[0];
      const c1 = r[1];
      if (c0 >= 50 && c0 <= 1100 && c1 >= 0 && c1 <= 40000 && r.length >= 8) {
        spcVotes++;
      }
    }
    if (spcVotes >= sample.length * 0.6) return "spc";
  }

  if (ncols >= 8) {
    const looksExtra = sample.every((r) => r.length === 8 || r.length === 9);
    // Extra: col0 altitude (not pressure-descending), col1 pressure
    let extraVotes = 0;
    for (const r of sample) {
      if (
        r.length >= 8 &&
        r[0] >= 0 &&
        r[0] <= 40000 &&
        r[1] >= 50 &&
        r[1] <= 1100
      ) {
        extraVotes++;
      }
    }
    if (looksExtra && extraVotes >= sample.length * 0.6) return "extra";
    // 8+ cols but pressure-first → SPC-like truncated
    if (forceSharpFamily || extraVotes < sample.length * 0.4) {
      const pressureFirst = sample.filter(
        (r) => r[0] >= 50 && r[0] <= 1100,
      ).length;
      if (pressureFirst >= sample.length * 0.7) {
        return ncols >= 10 ? "spc" : "sharppy";
      }
    }
    if (extraVotes >= sample.length * 0.6) return "extra";
  }

  let sharpVotes = 0;
  let sfVotes = 0;
  for (const r of sample) {
    const c0 = r[0];
    const c1 = r[1];
    const c4 = r[4];
    if (c0 >= 50 && c0 <= 1100 && c1 >= 0 && c1 <= 40000) {
      if (r.length >= 6 && c4 >= 0 && c4 <= 360) sharpVotes++;
      else if (forceSharpFamily) sharpVotes++;
    }
    if (c0 >= 0 && c0 <= 40000 && c1 >= 50 && c1 <= 1100) {
      sfVotes++;
    }
  }

  if (sharpVotes >= sample.length * 0.6) return "sharppy";
  if (sfVotes >= sample.length * 0.6) return "stormforge";

  const pressureLike = sample.filter((r) => r[0] >= 50 && r[0] <= 1100).length;
  if (pressureLike >= sample.length * 0.7 && ncols <= 7) return "sharppy";

  return "stormforge";
}
