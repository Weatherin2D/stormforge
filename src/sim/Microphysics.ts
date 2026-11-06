import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import { LV, CP, esatFast, mixingRatio, saturatedEvapLimit } from "./thermo";
import { getAdvanced } from "./AdvancedSettings";

/**
 * Terminal fall speed (m/s) from rain mixing ratio (Marshall–Palmer-like).
 * `qr` in kg/kg, `rho` in kg/m³.
 */
export function rainFallSpeed(qr: number, rho: number): number {
  if (!(qr > 1e-9)) return 0;
  const scale = getAdvanced().rainFallPhys;
  // vt ≈ 14 · (ρ qr / 10⁻³)^0.125, capped
  const bulk = Math.max(1e-6, rho * qr);
  return Math.min(12, 14 * scale * Math.pow(bulk / 1e-3, 0.125));
}

/**
 * Kessler warm-rain processes after saturation adjustment has already set
 * cloud water. Condensation/evaporation of cloud is no longer done here.
 */
export function stepMicrophysics(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  qrScratch: Float32Array,
  exner: Float32Array,
): void {
  const { nx, ny, nz, dz } = grid;
  const S = getAdvanced();
  const pace = Math.max(0.2, S.microphysicsPace);
  const autoc = 0.001 * S.autocRate * pace;
  const qcrit = 0.0005 * S.qcrit;
  const accr = 1.15 * S.accrRate * pace;
  // ~1 K/min under a rain shaft when the air is a few g/kg below saturation.
  const evapRain = 0.028 * S.evapRain * pace;
  const nxny = nx * ny;
  const latHeat = LV / CP;
  f.precipRate.fill(0);

  for (let k = 0; k < nz; k++) {
    const p0 = f.p0[k];
    const ex = exner[k];
    const rho = f.rho0[k];
    const kBase = k * nxny;
    for (let j = 0; j < ny; j++) {
      const jBase = kBase + j * nx;
      for (let i = 0; i < nx; i++) {
        const id = jBase + i;
        let qv = f.qv[id];
        let qc = f.qc[id];
        let qr = f.qr[id];
        let th = f.theta[id];

        if (qc < 1e-10 && qr < 1e-10) continue;

        const T = th * ex;
        const qs = Math.max(1e-6, mixingRatio(esatFast(T), p0));

        // Autoconversion
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

        // Rain evaporation (unsaturated air)
        if (qr > 0 && qv < qs) {
          let ev = Math.min(qr, evapRain * (qs - qv) * dt);
          ev = saturatedEvapLimit(th, qv, ev, p0, ex);
          qr -= ev;
          qv += ev;
          th -= (latHeat * ev * th) / Math.max(T, 1);
        }

        f.qv[id] = Math.max(0, qv);
        f.qc[id] = Math.max(0, qc);
        f.qr[id] = Math.max(0, qr);
        f.theta[id] = th;
        void rho;
      }
    }
  }

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
    const kBase = k * nxny;
    const rho = f.rho0[k];
    for (let j = 0; j < ny; j++) {
      const jBase = kBase + j * nx;
      for (let i = 0; i < nx; i++) {
        const remain = f.qr[jBase + i];
        if (remain <= 0) continue;
        const vt = rainFallSpeed(remain, rho);
        // Allow multi-cell fall on coarse/long steps (stableOuterDt).
        const cells = Math.min(48, (vt * dt) / Math.max(dz, 1));
        const kDest = k - cells;
        if (kDest <= 0) {
          const ij = i + j * nx;
          const mm = remain * rho * dz;
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
