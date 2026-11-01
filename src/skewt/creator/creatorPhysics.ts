import { KT } from "./soundingBridge";
import type {
  CreatorLevel,
  Diagnostics,
  HazardFlag,
  Hemisphere,
  LiftResult,
  ParcelKey,
} from "./types";

const PI = Math.PI;
const g = 9.80665;
const Rd = 287.04;
const cp = 1005.7;
const Lv = 2.5e6;
const K = 273.15;
const kap = Rd / cp;

export const es = (T: number): number =>
  6.112 * Math.exp((17.67 * T) / (T + 243.5));

export const wm = (p: number, Td: number): number => {
  const e = es(Td);
  return (622 * e) / (p - e);
};

export const Tdw = (p: number, w: number): number => {
  const l = Math.log(((p * w) / (622 + w)) / 6.112);
  return (243.5 * l) / (17.67 - l);
};

export const tv = (T: number, Td: number, p: number): number =>
  (T + K) * (1 + (0.61 * wm(p, Td)) / 1e3);

export const cl = (x: number, a: number, b: number): number =>
  Math.max(a, Math.min(b, x));

export const f = (x: number | null | undefined, d = 0): string =>
  x == null || Number.isNaN(x) ? "—" : x.toFixed(d);

export const dirOf = (u: number, v: number): number =>
  (((Math.atan2(-u, -v) * 180) / PI) + 360) % 360;

export function lerp(
  levels: CreatorLevel[],
  fx: (l: CreatorLevel) => number,
  fy: (l: CreatorLevel) => number,
  x: number,
): number {
  const n = levels.length;
  if (n === 0) return 0;
  if (x <= fx(levels[0])) return fy(levels[0]);
  for (let i = 1; i < n; i++) {
    const x1 = fx(levels[i]);
    if (x <= x1) {
      const x0 = fx(levels[i - 1]);
      const t = (x - x0) / ((x1 - x0) || 1);
      return fy(levels[i - 1]) + t * (fy(levels[i]) - fy(levels[i - 1]));
    }
  }
  return fy(levels[n - 1]);
}

const np = (l: CreatorLevel) => -Math.log(l.p);

export function Tat(levels: CreatorLevel[], p: number): number {
  return lerp(levels, np, (l) => l.T, -Math.log(p));
}

export function Dat(levels: CreatorLevel[], p: number): number {
  return lerp(levels, np, (l) => l.Td, -Math.log(p));
}

export function Zat(levels: CreatorLevel[], p: number): number {
  return lerp(levels, np, (l) => l.z ?? 0, -Math.log(p));
}

export function UV(levels: CreatorLevel[], z: number): [number, number] {
  return [
    lerp(levels, (l) => l.z ?? 0, (l) => l.u ?? 0, z),
    lerp(levels, (l) => l.z ?? 0, (l) => l.v ?? 0, z),
  ];
}

const mf = (T: number, p: number): [number, number] => {
  const e = es(T - K);
  const r = (0.622 * e) / (p - e);
  return [
    (Rd * T + Lv * r) / (p * (cp + (Lv * Lv * r * 0.622) / (Rd * T * T))),
    r,
  ];
};

export const thE = (l: CreatorLevel): number => {
  const T = l.T + K;
  const Td = l.Td + K;
  const w = wm(l.p, l.Td);
  const Tl = 1 / (1 / (Td - 56) + Math.log(T / Td) / 800) + 56;
  return (
    T *
    Math.pow(1e3 / l.p, kap * (1 - 0.28e-3 * w)) *
    Math.exp((3.376 / Tl - 0.00254) * w * (1 + 0.81e-3 * w))
  );
};

export function lift(
  levels: CreatorLevel[],
  p0: number,
  T0: number,
  Td0: number,
): LiftResult {
  const w0 = wm(p0, Td0) / 1e3;
  const Tk = T0 + K;
  const Td = Td0 + K;
  const Tl = 1 / (1 / (Td - 56) + Math.log(Tk / Td) / 800) + 56;
  const pl = p0 * Math.pow(Tl / Tk, 1 / kap);
  const pts: [number, number, number][] = [];
  let p = p0;
  let T = Tl;
  while (p > pl && p > 100) {
    pts.push([p, Tk * Math.pow(p / p0, kap), w0]);
    p -= 5;
  }
  p = Math.min(pl, p0);
  while (p > 100) {
    const [d1, r] = mf(T, p);
    pts.push([p, T, r]);
    const d2 = mf(T - 2.5 * d1, p - 2.5)[0];
    T -= 5 * d2;
    p -= 5;
  }
  let cape = 0;
  let cin = 0;
  let lfc: number | null = null;
  let el: number | null = null;
  const B = pts.map(
    (q) =>
      q[1] * (1 + 0.61 * q[2]) - tv(Tat(levels, q[0]), Dat(levels, q[0]), q[0]),
  );
  for (let i = 0; i < pts.length - 1; i++) {
    const b0 = B[i];
    const b1 = B[i + 1];
    const a = ((Rd * (b0 + b1)) / 2) * Math.log(pts[i][0] / pts[i + 1][0]);
    if (lfc == null && pts[i][0] <= pl + 0.01 && b0 > 0) lfc = pts[i][0];
    if (lfc == null) {
      if (a < 0) cin += a;
    } else {
      if (a > 0) cape += a;
      if (b1 > 0) el = pts[i + 1][0];
    }
  }
  if (lfc == null) {
    cape = 0;
    cin = 0;
  }
  return { cape, cin, pl, lfc, el, pts };
}

/** Integrate heights + wind components, then compute diagnostics. Mutates levels. */
export function integrateLevels(L: CreatorLevel[]): void {
  L.sort((a, b) => b.p - a.p);
  L.forEach((l, i) => {
    const q = L[i - 1];
    l.z = i
      ? (q.z ?? 0) +
        ((Rd / g) *
          (tv(l.T, l.Td, l.p) + tv(q.T, q.Td, q.p)) *
          0.5 *
          Math.log(q.p / l.p))
      : 0;
    const a = (l.d * PI) / 180;
    l.u = -l.s * Math.sin(a);
    l.v = -l.s * Math.cos(a);
  });
}

function hazardFrom(D: Omit<Diagnostics, "hz">, L: CreatorLevel[]): HazardFlag[] {
  const ml = D.P.ML;
  const mu = D.P.MU;
  const s = L[0];
  const stp = D.stp;
  const scp = D.scp;
  const w = D.pw;
  const o: HazardFlag[] = [];
  const n = (x: number | null | undefined) => (x == null ? 0 : x);
  const tor = `STP ${f(stp, 1)}, SRH 0–1 km ${f(D.s1)} m²/s², ML LCL ${f(D.lcl)} m, ML CIN ${f(ml.cin)} J/kg`;
  const sv = `SCP ${f(scp, 1)}, MU CAPE ${f(mu.cape)} J/kg, 0–6 km shear ${f(D.sh[2])} kt`;
  if (n(stp) >= 4 && D.s1 >= 200 && n(D.sh[2])! * KT >= 20 && D.lcl < 1e3 && ml.cin > -125)
    o.push({ label: "PDS TOR", detail: tor });
  else if (n(stp) >= 1 && D.s1 >= 100) o.push({ label: "TOR", detail: tor });
  else if (n(stp) >= 0.5) o.push({ label: "MRGL TOR", detail: tor });
  else if (n(scp) >= 2) o.push({ label: "SVR", detail: sv });
  else if (n(scp) >= 1 || mu.cape >= 1500) o.push({ label: "MRGL SVR", detail: sv });
  const ta = `STP ${f(D.stpA, 1)}, anticyclonic SRH 0–1 km ${f(D.a1)} m²/s², ML LCL ${f(D.lcl)} m, ML CIN ${f(ml.cin)} J/kg`;
  if (n(D.stpA) >= 1 && D.a1 >= 100) o.push({ label: "ANTI TOR", detail: ta });
  else if (n(D.stpA) >= 0.5) o.push({ label: "MRGL ANTI TOR", detail: ta });
  if (w >= 40 && mu.cape >= 250)
    o.push({
      label: "FLASH FLOOD",
      detail: `PWAT ${f(w, 1)} mm, MU CAPE ${f(mu.cape)} J/kg`,
    });
  if (s.T >= 38)
    o.push({
      label: "EXCESSIVE HEAT",
      detail: `Surface T ${f(s.T, 1)} °C`,
    });
  if (s.T <= 0 && s.s >= 30)
    o.push({
      label: "BLIZZARD",
      detail: `Surface T ${f(s.T, 1)} °C, wind ${f(s.s)} kt`,
    });
  return o;
}

export function calcDiagnostics(
  L: CreatorLevel[],
  hemi: Hemisphere,
): Diagnostics {
  integrateLevels(L);
  const s = L[0];
  const top = L[L.length - 1].z ?? 0;
  const ok = (z: number) => top >= z;
  const P = {
    SB: lift(L, s.p, s.T, s.Td),
  } as Record<ParcelKey, LiftResult>;
  let th = 0;
  let w = 0;
  let n = 0;
  for (let p = s.p; p >= s.p - 100; p -= 5) {
    th += (Tat(L, p) + K) * Math.pow(1e3 / p, kap);
    w += wm(p, Dat(L, p));
    n++;
  }
  th /= n;
  w /= n;
  P.ML = lift(
    L,
    s.p,
    th * Math.pow(s.p / 1e3, kap) - K,
    Tdw(s.p, w),
  );
  let be = -1;
  let bl = s;
  L.forEach((l) => {
    if (l.p >= s.p - 300) {
      const e = thE(l);
      if (e > be) {
        be = e;
        bl = l;
      }
    }
  });
  P.MU = lift(L, bl.p, bl.T, bl.Td);

  const mw = (a: number, b: number): [number, number] => {
    let x = 0;
    let y = 0;
    let c = 0;
    for (let z = a; z <= b; z += 100) {
      const [u, v] = UV(L, z);
      x += u;
      y += v;
      c++;
    }
    return [x / c, y / c];
  };
  const m = mw(0, 6e3);
  const a = mw(0, 500);
  const b = mw(5500, 6e3);
  const sx = b[0] - a[0];
  const sy = b[1] - a[1];
  const sm = Math.hypot(sx, sy) || 1;
  const dv = 7.5 / KT;
  const RM: [number, number] = [m[0] + (dv * sy) / sm, m[1] - (dv * sx) / sm];
  const LM: [number, number] = [m[0] - (dv * sy) / sm, m[1] + (dv * sx) / sm];
  const srh = (z1: number, cyc: [number, number]): number => {
    let x = 0;
    for (let z = 0; z < z1; z += 100) {
      const [u0, v0] = UV(L, z);
      const [u1, v1] = UV(L, z + 100);
      x += (u1 - cyc[0]) * (v0 - cyc[1]) - (u0 - cyc[0]) * (v1 - cyc[1]);
    }
    return x * KT * KT;
  };
  const sh = (z: number): number | null => {
    const [u, v] = UV(L, z);
    const [u0, v0] = UV(L, 0);
    return ok(z) ? Math.hypot(u - u0, v - v0) : null;
  };
  const Tz = (z: number) =>
    lerp(L, (l) => l.z ?? 0, (l) => l.T, z);
  const lr = (a0: number, b0: number) =>
    ok(b0) ? (Tz(a0) - Tz(b0)) / ((b0 - a0) / 1e3) : null;
  const lvl = (T0: number): number | null => {
    for (let i = 1; i < L.length; i++) {
      if (L[i - 1].T > T0 && L[i].T <= T0) {
        return (
          (L[i - 1].z ?? 0) +
          ((L[i - 1].T - T0) / (L[i - 1].T - L[i].T)) *
            ((L[i].z ?? 0) - (L[i - 1].z ?? 0))
        );
      }
    }
    return null;
  };
  let pw = 0;
  for (let i = 1; i < L.length; i++) {
    pw +=
      (((wm(L[i].p, L[i].Td) + wm(L[i - 1].p, L[i - 1].Td)) / 2) / 1e3) *
      (L[i - 1].p - L[i].p) *
      100 /
      g;
  }
  const ml = P.ML;
  const mp = ml.pts.reduce(
    (acc, q) => (Math.abs(q[0] - 500) < Math.abs(acc[0] - 500) ? q : acc),
    ml.pts[0],
  );
  const hi = L[L.length - 1].p <= 500;
  const A1 = srh(1e3, RM);
  const A3 = srh(3e3, RM);
  const B1 = -srh(1e3, LM);
  const B3 = -srh(3e3, LM);
  const S = hemi === "S";
  const s1 = S ? B1 : A1;
  const s3 = S ? B3 : A3;
  const a1 = S ? A1 : B1;
  const a3 = S ? A3 : B3;
  const b6 = sh(6e3);
  const lcl = Zat(L, ml.pl);
  const stpf = (h: number) =>
    b6 == null
      ? null
      : Math.max(
          0,
          (ml.cape / 1500) *
            cl((2e3 - lcl) / 1e3, 0, 1) *
            (h / 150) *
            (b6 * KT < 12.5 ? 0 : Math.min((b6 * KT) / 20, 1.5)) *
            cl((ml.cin + 200) / 150, 0, 1),
        );
  const stp = stpf(s1);
  const stpA = stpf(a1);
  const mu = P.MU;
  const sc = (h: number) =>
    b6 == null
      ? null
      : Math.max(
          0,
          (mu.cape / 1e3) *
            (h / 50) *
            (b6 * KT < 10 ? 0 : Math.min((b6 * KT) / 20, 1.5)) *
            (mu.cin > -40 ? 1 : -40 / mu.cin),
        );

  const base: Omit<Diagnostics, "hz"> = {
    P,
    m,
    RM,
    LM,
    S,
    cyc: S ? LM : RM,
    ant: S ? RM : LM,
    pw,
    stp,
    stpA,
    scp: sc(s3),
    scpA: sc(a3),
    s1,
    a1,
    s3: ok(3e3) ? s3 : null,
    a3: ok(3e3) ? a3 : null,
    li: hi ? Tat(L, 500) - (mp[1] - K) : null,
    z0: lvl(0),
    z20: lvl(-20),
    l03: lr(0, 3e3),
    l36: lr(3e3, 6e3),
    l75: hi
      ? (Tat(L, 700) - Tat(L, 500)) / ((Zat(L, 500) - Zat(L, 700)) / 1e3)
      : null,
    sh: [1e3, 3e3, 6e3].map(sh),
    lcl,
  };
  return { ...base, hz: hazardFrom(base, L) };
}
