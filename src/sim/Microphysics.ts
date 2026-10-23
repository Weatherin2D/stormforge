import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import { LV, CP, esatFast, mixingRatio, saturatedEvapLimit } from "./thermo";

/** Terminal fall speed (m/s) used by rain advection and sedimentation. */
export function rainFallSpeed(k: number, nz: number): number {
  const vt0 = 14;
  // Milder decay aloft so shafts still fall quickly
  return vt0 * (1 - 0.18 * (k / Math.max(nz - 1, 1)));
}

/** Kessler-like warm-rain microphysics on continuum fields. */
export function stepMicrophysics(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  qrScratch: Float32Array,
  exner: Float32Array,
): void {
  const { nx, ny, nz, dz } = grid;
  const autoc = 0.0007;
  const qcrit = 0.0011;
  const accr = 1.15;
  const condRate = 2.0; // less explosive than 3.5 on long batch runs
  const evapCloud = 0.35;
  // ~1 K/min under a rain shaft when the air is a few g/kg below saturation.
  const evapRain = 0.028; // strong enough to produce virga in dry sub-cloud air
  const qcCap = 0.006; // thicker shield before leftover cloud is forced into rain
  const condFac = 1 - Math.exp(-condRate * dt);
  const evapCloudFac = 1 - Math.exp(-evapCloud * dt);
  const nxny = nx * ny;
  const latHeat = LV / CP;
  f.precipRate.fill(0);

  for (let k = 0; k < nz; k++) {
    const p0 = f.p0[k];
    const ex = exner[k];
    const kBase = k * nxny;
    for (let j = 0; j < ny; j++) {
      const jBase = kBase + j * nx;
      for (let i = 0; i < nx; i++) {
        const id = jBase + i;
        let qv = f.qv[id];
        let qc = f.qc[id];
        let qr = f.qr[id];
        let th = f.theta[id];

        const T = th * ex;
        const qs = Math.max(1e-6, mixingRatio(esatFast(T), p0));
        const excess = qv - qs;

        // Condensation grows cloud whenever supersaturated.
        // Cap the amount so a single step can't release more than ~3 K of
        // latent heat (e.g. when moist air is lifted into a much colder
        // layer) — otherwise a cell spikes +20 K in one step.
        if (excess > 0) {
          const maxCond = (3 * T) / Math.max(latHeat * th, 1);
          const cond = Math.min(excess, excess * condFac, maxCond);
          qv -= cond;
          qc += cond;
          th += (latHeat * cond * th) / Math.max(T, 1);
        } else if (qc > 0) {
          // Rate-limited evaporation (does not wipe cloud in one step).
          // Evaporating cools the parcel, so the amount is capped to keep
          // the parcel from ending up supersaturated — otherwise the next
          // step re-condenses it and the cell oscillates by tens of K.
          const deficit = -excess;
          let evap = Math.min(qc, deficit * evapCloudFac);
          evap = saturatedEvapLimit(th, qv, evap, p0, ex);
          qv += evap;
          qc -= evap;
          th -= (latHeat * evap * th) / Math.max(T, 1);
        }

        // Autoconversion (only thicker cloud)
        if (qc > qcrit) {
          const auto = Math.min(
            qc - qcrit * 0.5,
            autoc * dt * (qc - qcrit),
          );
          if (auto > 0) {
            qc -= auto;
            qr += auto;
          }
        }

        // Accretion
        if (qc > 0 && qr > 0) {
          const ac = Math.min(qc, accr * qc * qr * dt);
          qc -= ac;
          qr += ac;
        }

        // Rain evaporation
        if (qr > 0 && qv < qs) {
          let ev = Math.min(qr, evapRain * (qs - qv) * dt);
          ev = saturatedEvapLimit(th, qv, ev, p0, ex);
          qr -= ev;
          qv += ev;
          th -= (latHeat * ev * th) / Math.max(T, 1);
        }

        // Excess cloud above cap converts to rain (keeps storms rain-producing, not fog)
        if (qc > qcCap) {
          qr += qc - qcCap;
          qc = qcCap;
        }

        f.qv[id] = Math.max(0, qv);
        f.qc[id] = Math.max(0, qc);
        f.qr[id] = Math.max(0, qr);
        f.theta[id] = th;
      }
    }
  }

  // Sedimentation (semi-Lagrangian, up to ~1.8 cells/step)
  sedimentRain(grid, f, dt, qrScratch);
}

function sedimentRain(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  qrNew: Float32Array,
): void {
  const { nx, ny, nz, dz } = grid;
  const nxny = nx * ny;
  qrNew.fill(0);
  for (let k = 0; k < nz; k++) {
    const vt = rainFallSpeed(k, nz);
    const cells = Math.min(1.8, (vt * dt) / Math.max(dz, 1));
    const kBase = k * nxny;
    for (let j = 0; j < ny; j++) {
      const jBase = kBase + j * nx;
      for (let i = 0; i < nx; i++) {
        const remain = f.qr[jBase + i];
        if (remain <= 0) continue;
        const kDest = k - cells;
        if (kDest <= 0) {
          // Rains out at the surface: store accumulation and instantaneous rate.
          const ij = i + j * nx;
          const mm = remain * f.rho0[k] * dz;
          f.rainAccum[ij] += mm;
          if (dt > 0) f.precipRate[ij] += (mm / dt) * 3600;
          continue;
        }
        const k0 = Math.floor(kDest);
        const k1 = Math.min(nz - 1, k0 + 1);
        const fz = kDest - k0;
        const ij = i + j * nx;
        qrNew[ij + k0 * nxny] += remain * (1 - fz);
        if (k1 !== k0) qrNew[ij + k1 * nxny] += remain * fz;
      }
    }
  }
  f.qr.set(qrNew);
}
