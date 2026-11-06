/**
 * Flux-form MUSCL (monotonized-central) advection on the anelastic C-grid.
 */

import { Grid3D } from "./Grid3D";
import { SimFields } from "./InitFromSounding";
import { TFromTheta, qsat } from "./thermo";
import { sampleSynoptic } from "./synoptic";
import { musclFace, clampIdx } from "./advection";

/** Advect face winds with a single MUSCL upwind step (RK2-ready caller). */
export function musclAdvectVelocity(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  tmpU: Float32Array,
  tmpV: Float32Array,
  tmpW: Float32Array,
  openK?: Uint16Array | null,
): void {
  const g = grid;
  const { nx, ny, nz, dx, dy, dz } = g;
  const height: Float32Array | null = null; // caller seals floor after

  // --- u ---
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const id = g.uIdx(i, j, k);
        if (openK) {
          const iL = i > 0 ? i - 1 : 0;
          const iR = i < nx ? i : nx - 1;
          if (k < openK[iL + j * nx] || k < openK[iR + j * nx]) {
            tmpU[id] = 0;
            continue;
          }
        }
        const uc = f.u[id];
        const vc =
          i === 0
            ? 0.5 * (f.v[g.vIdx(0, j, k)] + f.v[g.vIdx(0, j + 1, k)])
            : i === nx
              ? 0.5 *
                (f.v[g.vIdx(nx - 1, j, k)] + f.v[g.vIdx(nx - 1, j + 1, k)])
              : 0.25 *
                (f.v[g.vIdx(i - 1, j, k)] +
                  f.v[g.vIdx(i, j, k)] +
                  f.v[g.vIdx(i - 1, j + 1, k)] +
                  f.v[g.vIdx(i, j + 1, k)]);
        const wc =
          i === 0
            ? 0.5 * (f.w[g.wIdx(0, j, k)] + f.w[g.wIdx(0, j, k + 1)])
            : i === nx
              ? 0.5 *
                (f.w[g.wIdx(nx - 1, j, k)] + f.w[g.wIdx(nx - 1, j, k + 1)])
              : 0.25 *
                (f.w[g.wIdx(i - 1, j, k)] +
                  f.w[g.wIdx(i, j, k)] +
                  f.w[g.wIdx(i - 1, j, k + 1)] +
                  f.w[g.wIdx(i, j, k + 1)]);

        const iL = clampIdx(i - 1, nx + 1);
        const iR = clampIdx(i + 1, nx + 1);
        const jB = clampIdx(j - 1, ny);
        const jT = clampIdx(j + 1, ny);
        const kD = clampIdx(k - 1, nz);
        const kU = clampIdx(k + 1, nz);

        const du =
          -(
            (uc >= 0
              ? uc * (f.u[id] - f.u[g.uIdx(iL, j, k)])
              : uc * (f.u[g.uIdx(iR, j, k)] - f.u[id])) / dx
          ) -
          ((vc >= 0
            ? vc * (f.u[id] - f.u[g.uIdx(i, jB, k)])
            : vc * (f.u[g.uIdx(i, jT, k)] - f.u[id])) /
            dy) -
          ((wc >= 0
            ? wc * (f.u[id] - f.u[g.uIdx(i, j, kD)])
            : wc * (f.u[g.uIdx(i, j, kU)] - f.u[id])) /
            dz);

        // Lateral inflow from synoptic boundary.
        if (i === 0 || i === nx) {
          const yn = j / Math.max(1, ny - 1);
          const s = sampleSynoptic(i === 0 ? 0 : 1, yn, (k + 0.5) * dz);
          tmpU[id] = f.u0[k] + s.du;
        } else {
          tmpU[id] = f.u[id] + du * dt;
        }
      }
    }
  }

  // --- v ---
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i < nx; i++) {
        const id = g.vIdx(i, j, k);
        if (openK) {
          const jB = j > 0 ? j - 1 : 0;
          const jT = j < ny ? j : ny - 1;
          if (k < openK[i + jB * nx] || k < openK[i + jT * nx]) {
            tmpV[id] = 0;
            continue;
          }
        }
        const vc = f.v[id];
        const uc =
          j === 0
            ? 0.5 * (f.u[g.uIdx(i, 0, k)] + f.u[g.uIdx(i + 1, 0, k)])
            : j === ny
              ? 0.5 *
                (f.u[g.uIdx(i, ny - 1, k)] + f.u[g.uIdx(i + 1, ny - 1, k)])
              : 0.25 *
                (f.u[g.uIdx(i, j - 1, k)] +
                  f.u[g.uIdx(i + 1, j - 1, k)] +
                  f.u[g.uIdx(i, j, k)] +
                  f.u[g.uIdx(i + 1, j, k)]);
        const wc =
          j === 0
            ? 0.5 * (f.w[g.wIdx(i, 0, k)] + f.w[g.wIdx(i, 0, k + 1)])
            : j === ny
              ? 0.5 *
                (f.w[g.wIdx(i, ny - 1, k)] + f.w[g.wIdx(i, ny - 1, k + 1)])
              : 0.25 *
                (f.w[g.wIdx(i, j - 1, k)] +
                  f.w[g.wIdx(i, j, k)] +
                  f.w[g.wIdx(i, j - 1, k + 1)] +
                  f.w[g.wIdx(i, j, k + 1)]);

        const iL = clampIdx(i - 1, nx);
        const iR = clampIdx(i + 1, nx);
        const jB = clampIdx(j - 1, ny + 1);
        const jT = clampIdx(j + 1, ny + 1);
        const kD = clampIdx(k - 1, nz);
        const kU = clampIdx(k + 1, nz);

        const dv =
          -(
            (uc >= 0
              ? uc * (f.v[id] - f.v[g.vIdx(iL, j, k)])
              : uc * (f.v[g.vIdx(iR, j, k)] - f.v[id])) / dx
          ) -
          ((vc >= 0
            ? vc * (f.v[id] - f.v[g.vIdx(i, jB, k)])
            : vc * (f.v[g.vIdx(i, jT, k)] - f.v[id])) /
            dy) -
          ((wc >= 0
            ? wc * (f.v[id] - f.v[g.vIdx(i, j, kD)])
            : wc * (f.v[g.vIdx(i, j, kU)] - f.v[id])) /
            dz);

        if (j === 0 || j === ny) {
          const xn = i / Math.max(1, nx - 1);
          const s = sampleSynoptic(xn, j === 0 ? 0 : 1, (k + 0.5) * dz);
          tmpV[id] = f.v0[k] + s.dv;
        } else {
          tmpV[id] = f.v[id] + dv * dt;
        }
      }
    }
  }

  // --- w ---
  for (let k = 0; k <= nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const id = g.wIdx(i, j, k);
        if (k === 0 || k === nz) {
          tmpW[id] = 0;
          continue;
        }
        if (openK && k < openK[i + j * nx]) {
          tmpW[id] = 0;
          continue;
        }
        const wc = f.w[id];
        const uc =
          0.25 *
          (f.u[g.uIdx(i, j, k - 1)] +
            f.u[g.uIdx(i + 1, j, k - 1)] +
            f.u[g.uIdx(i, j, k)] +
            f.u[g.uIdx(i + 1, j, k)]);
        const vc =
          0.25 *
          (f.v[g.vIdx(i, j, k - 1)] +
            f.v[g.vIdx(i, j + 1, k - 1)] +
            f.v[g.vIdx(i, j, k)] +
            f.v[g.vIdx(i, j + 1, k)]);

        const iL = clampIdx(i - 1, nx);
        const iR = clampIdx(i + 1, nx);
        const jB = clampIdx(j - 1, ny);
        const jT = clampIdx(j + 1, ny);
        const kD = clampIdx(k - 1, nz + 1);
        const kU = clampIdx(k + 1, nz + 1);

        const dw =
          -(
            (uc >= 0
              ? uc * (f.w[id] - f.w[g.wIdx(iL, j, k)])
              : uc * (f.w[g.wIdx(iR, j, k)] - f.w[id])) / dx
          ) -
          ((vc >= 0
            ? vc * (f.w[id] - f.w[g.wIdx(i, jB, k)])
            : vc * (f.w[g.wIdx(i, jT, k)] - f.w[id])) /
            dy) -
          ((wc >= 0
            ? wc * (f.w[id] - f.w[g.wIdx(i, j, kD)])
            : wc * (f.w[g.wIdx(i, j, kU)] - f.w[id])) /
            dz);
        tmpW[id] = f.w[id] + dw * dt;
      }
    }
  }

  f.u.set(tmpU);
  f.v.set(tmpV);
  f.w.set(tmpW);
  void height;
}

/**
 * Flux-form MUSCL advection of θ, qv, and all condensate species.
 * Lateral inflow uses the synoptic boundary state; condensate is zero there.
 */
export function musclAdvectScalars(
  grid: Grid3D,
  f: SimFields,
  dt: number,
  tmp: {
    th: Float32Array;
    qv: Float32Array;
    qc: Float32Array;
    qr: Float32Array;
    qi: Float32Array;
    qs: Float32Array;
    qg: Float32Array;
    qh: Float32Array;
    ni: Float32Array;
  },
  openK?: Uint16Array | null,
): void {
  const g = grid;
  const { nx, ny, nz, dx, dy, dz } = g;
  const nxny = nx * ny;
  const fields = [
    f.theta,
    f.qv,
    f.qc,
    f.qr,
    f.qi,
    f.qs,
    f.qg,
    f.qh,
    f.ni,
  ];
  const outs = [
    tmp.th,
    tmp.qv,
    tmp.qc,
    tmp.qr,
    tmp.qi,
    tmp.qs,
    tmp.qg,
    tmp.qh,
    tmp.ni,
  ];

  for (let s = 0; s < fields.length; s++) {
    const src = fields[s];
    const dst = outs[s];
    const isTheta = s === 0;
    const isQv = s === 1;
    const isCondensate = s >= 2;

    for (let k = 0; k < nz; k++) {
      const th0 = f.theta0[k];
      const qv0 = f.qv0[k];
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const id = i + j * nx + k * nxny;
          const kFloor = openK ? openK[i + j * nx] : 0;
          if (k < kFloor) {
            if (isTheta) dst[id] = th0;
            else if (isQv) dst[id] = qv0;
            else dst[id] = 0;
            continue;
          }

          const uu =
            0.5 * (f.u[g.uIdx(i, j, k)] + f.u[g.uIdx(i + 1, j, k)]);
          const vv =
            0.5 * (f.v[g.vIdx(i, j, k)] + f.v[g.vIdx(i, j + 1, k)]);
          const ww =
            0.5 * (f.w[g.wIdx(i, j, k)] + f.w[g.wIdx(i, j, k + 1)]);

          const iL = clampIdx(i - 1, nx);
          const iR = clampIdx(i + 1, nx);
          const iLL = clampIdx(i - 2, nx);
          const iRR = clampIdx(i + 2, nx);
          const jB = clampIdx(j - 1, ny);
          const jT = clampIdx(j + 1, ny);
          const jBB = clampIdx(j - 2, ny);
          const jTT = clampIdx(j + 2, ny);
          const kD = Math.max(kFloor, clampIdx(k - 1, nz));
          const kU = clampIdx(k + 1, nz);
          const kDD = Math.max(kFloor, clampIdx(k - 2, nz));
          const kUU = clampIdx(k + 2, nz);

          const idL = iL + j * nx + k * nxny;
          const idR = iR + j * nx + k * nxny;
          const idLL = iLL + j * nx + k * nxny;
          const idRR = iRR + j * nx + k * nxny;
          const idB = i + jB * nx + k * nxny;
          const idT = i + jT * nx + k * nxny;
          const idBB = i + jBB * nx + k * nxny;
          const idTT = i + jTT * nx + k * nxny;
          const idD = i + j * nx + kD * nxny;
          const idU = i + j * nx + kU * nxny;
          const idDD = i + j * nx + kDD * nxny;
          const idUU = i + j * nx + kUU * nxny;

          // Advective form −u·∇φ (MUSCL face states) so residual divergence
          // cannot source θ/qv. Condensate still uses flux form for positivity.
          const uL = f.u[g.uIdx(i, j, k)];
          const uR = f.u[g.uIdx(i + 1, j, k)];
          const vB = f.v[g.vIdx(i, j, k)];
          const vT = f.v[g.vIdx(i, j + 1, k)];
          const wD = f.w[g.wIdx(i, j, k)];
          const wU = f.w[g.wIdx(i, j, k + 1)];

          const fxL = musclFace(src[idLL], src[idL], src[id], src[idR], uL);
          const fxR = musclFace(src[idL], src[id], src[idR], src[idRR], uR);
          const fyB = musclFace(src[idBB], src[idB], src[id], src[idT], vB);
          const fyT = musclFace(src[idB], src[id], src[idT], src[idTT], vT);
          const fzD = musclFace(src[idDD], src[idD], src[id], src[idU], wD);
          const fzU = musclFace(src[idD], src[id], src[idU], src[idUU], wU);

          let tend: number;
          if (isCondensate) {
            tend =
              -((uR * fxR - uL * fxL) / dx +
                (vT * fyT - vB * fyB) / dy +
                (wU * fzU - wD * fzD) / dz);
          } else {
            // −u·∇φ ≈ −[u(φR−φL)/dx + …]
            tend =
              -(uu * (fxR - fxL) / dx +
                vv * (fyT - fyB) / dy +
                ww * (fzU - fzD) / dz);
          }

          // Edge inflow: replace with boundary state for θ/qv.
          const onEdge = i === 0 || i === nx - 1 || j === 0 || j === ny - 1;
          if (onEdge && (uu < 0 && i === 0 || uu > 0 && i === nx - 1 || vv < 0 && j === 0 || vv > 0 && j === ny - 1)) {
            const xn = i / Math.max(1, nx - 1);
            const yn = j / Math.max(1, ny - 1);
            const syn = sampleSynoptic(xn, yn, (k + 0.5) * dz);
            if (isTheta) {
              dst[id] = th0 + syn.dTheta;
            } else if (isQv) {
              const th = th0 + syn.dTheta;
              const cap = qsat(TFromTheta(th, f.p0[k]), f.p0[k]) * 0.98;
              dst[id] = Math.min(cap, Math.max(0, qv0 * syn.qScale));
            } else {
              dst[id] = 0;
            }
          } else {
            let next = src[id] + tend * dt;
            if (isCondensate || isQv) next = Math.max(0, next);
            dst[id] = next;
          }
        }
      }
    }
  }

  f.theta.set(tmp.th);
  f.qv.set(tmp.qv);
  f.qc.set(tmp.qc);
  f.qr.set(tmp.qr);
  f.qi.set(tmp.qi);
  f.qs.set(tmp.qs);
  f.qg.set(tmp.qg);
  f.qh.set(tmp.qh);
  f.ni.set(tmp.ni);
}
