import {
  SoundingLevel,
  spdDirFromUv,
  uvFromSpdDir,
} from "../../sim/thermo";
import type { CreatorLevel } from "./types";

/** kt → m/s */
export const KT = 0.514444;
const K = 273.15;

export function toSoundingLevels(levels: CreatorLevel[]): SoundingLevel[] {
  return levels
    .map((l) => {
      const spdMs = Math.max(0, l.s) * KT;
      const { u, v } =
        l.u != null && l.v != null
          ? { u: l.u, v: l.v }
          : uvFromSpdDir(spdMs, l.d);
      return {
        z: l.z ?? 0,
        p: l.p * 100,
        T: l.T + K,
        Td: Math.min(l.Td, l.T) + K,
        u,
        v,
      };
    })
    .sort((a, b) => a.z - b.z);
}

export function fromSoundingLevels(levels: SoundingLevel[]): CreatorLevel[] {
  return levels
    .map((l) => {
      const { spd, dir } = spdDirFromUv(l.u, l.v);
      return {
        p: l.p / 100,
        T: l.T - K,
        Td: l.Td - K,
        d: dir,
        s: spd / KT,
        z: l.z,
        u: l.u,
        v: l.v,
      };
    })
    .sort((a, b) => b.p - a.p);
}
