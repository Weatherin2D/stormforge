# Stormforge

**3D clouds & rain sandbox** — a CM1-inspired weather sandbox driven by a custom Skew-T sounding, terrain, and drawn synoptic patterns.

The browser build is published at [weatherin2d.github.io/stormforge](https://weatherin2d.github.io/stormforge/).

## Requirements

- Node.js 18+
- Windows / macOS / Linux with a WebGL2 GPU

## Run (desktop)

```bash
npm install
npm start
```

This starts Vite and opens an **Electron** window (high-performance GPU preferred).

If Electron fails to launch after install, run `node scripts/ensure-electron.cjs` once (unpacks the cached Windows binary), then `npm start` again.

### Browser-only (dev)

```bash
npm run dev
```

Then open the URL Vite prints (usually `http://127.0.0.1:5173`).

`npm run build` writes the static site to `dist/`. Pushes to `master` publish that build to GitHub Pages.

## How to use

1. **Setup** — set resolution **X / Y / Z**, domain **altitude**, and warm-bubble strength, then **Start**.
2. **Sim** — orbit the 3D view (drag / scroll).
3. **Skew-T** — drag to edit **T** (orange) or **Td** (green). **Apply sounding** re-initializes the domain from the profile + bubble.
4. **Import / Export** — CSV text (`alt_m,p_hPa,t_C,td_C,u,v`). Extra-style columns are accepted when possible.

## Dynamics

Two regimes share the same fields and maps:

- **Storm mode** (`dx` below about 4 km) — nonhydrostatic anelastic core on an Arakawa C-grid: buoyancy, flux-form MUSCL advection, density-weighted pressure projection, saturation adjustment, warm-rain + cold microphysics, Smagorinsky mixing, and Coriolis.
- **Synoptic mode** (`dx` above about 4 km, or hydrostatic forced on) — hydrostatic primitive equations with diagnosed vertical motion and a one-plume mass-flux cumulus scheme.

Drawn highs, lows, and fronts set the **initial** air mass and a geostrophic / steering wind. They are not relaxed back onto the fields every step. Nested grids always run in storm mode inside the parent.

Surface fluxes, a K-profile boundary layer (coarse grids), and gray longwave cooling from liquid/ice water path run on a slow clock (~2 minutes of simulated time).

## Notes

- Defaults (~64×64×40, 12 km) target interactive CPU fluid + WebGL volume rendering.
- High grids show a performance warning on the setup screen.
- The time step is CFL-limited (Courant ~0.5) with no hard substep cap; simulated time may lag the frame on large grids instead of going unstable.
- A WebGPU compute scaffold exists for experiments; the shipping solver is the CPU `FluidSolver`.

## Project layout

- `electron/` — desktop shell
- `src/sim/` — grid, fluid, microphysics, sounding init, synoptic, cumulus
- `src/skewt/` — Skew-T editor
- `src/render/` — Three.js volume renderer
- `src/setup/` — setup screen
