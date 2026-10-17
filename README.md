# Stormforge

**3D clouds & rain sandbox** — a CM1-inspired weather sandbox driven by a custom Skew-T sounding. No paint tools, terrain, or extra views: just domain setup, a warm bubble, and moist convection.

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

## Notes

- Defaults (~64×64×40, 12 km) target interactive CPU fluid + WebGL volume rendering.
- High grids show a performance warning on the setup screen.
- Dynamics are a CM1-like anelastic core on an Arakawa C-grid (density-weighted projection + virtual-θ buoyancy) with Kessler-like warm rain — not a full CM1 port.

## Project layout

- `electron/` — desktop shell
- `src/sim/` — grid, fluid, microphysics, sounding init
- `src/skewt/` — Skew-T editor
- `src/render/` — Three.js volume renderer
- `src/setup/` — setup screen
