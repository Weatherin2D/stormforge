# Plan: Merge MeteoLAB Cloud Looks & Features into Stormforge

## Goal
Merge MeteoLAB's cloud looks and features (atmospheric sky, volumetric cloud billows/mammatus/striations/anvils, precipitation shafts, realistic lightning courses, sprites & halos, cloud genus labels, wet/hail ground effects, i18n) into Stormforge while keeping Stormforge's Electron + WebGPU + Three.js ^0.170.0 architecture and augmenting (not replacing) its existing CloudRainRenderer.

## Decisions
| Decision | Chosen |
|---|---|
| Scope | Everything (sky + clouds + lightning + sprites + genus + surface + i18n) |
| Architecture | Keep Electron + WebGPU + Three.js ^0.170.0 (do not upgrade Three, do not drop WebGPU) |
| Integration | Augment CloudRainRenderer; keep lookdev presets selectable; layer MeteoLAB features on top |
| Camera controls | Keep Stormforge's custom pointer-lock look (do not switch to OrbitControls) |

## Current State (Baseline)

**Stormforge** (`C:\Users\tajan\OneDrive\Desktop\Stormforge`):
- Electron desktop app, Three.js ^0.170.0, WebGPU backend (`src/sim/WebGPUBackend.ts`)
- `src/render/CloudRainRenderer.ts` — volumetric cloud renderer with sky shader, lightning ribbons, radar, wind arrows
- `src/render/clouds/` — `VolumetricCloudMaterial.ts`, `cloudShader.ts`, `lookdevPresets.ts` (4 presets: A_towerWithAnvil, B_matureAnvil, C_flatBaseRain, D_towerPileus), `noiseTextures.ts`, `sunLighting.ts`
- Cloud tuning UI in `src/App.ts` (#cloud-look, #cloud-gain, #cloud-sigma, #cloud-erosion, #cloud-erosion-ice, #cloud-sigma-rain, #lightning-freq, #vorticity)
- Styles in `src/styles.css`
- Build: `tsc && vite build`, dev: `vite`, electron: `electron .`

**MeteoLAB** (`C:\Users\tajan\OneDrive\Desktop\MeteoLab-main`):
- Web app, Three.js ^0.185.1 (no Electron, no WebGPU)
- `src/render/sky.ts` — Bruneton & Neyret atmospheric sky scattering (Rayleigh/Mie/ozone, twilight, night, sun tables)
- `src/render/shaders.ts` — volumetric cloud density with billows, mammatus, striations, anvils, precipitation shafts (rain/snow/graupel/hail), ground surface shaders (wet/hail/surface types)
- `src/render/lightning.ts` — course-based lightning (stepped leaders, return strokes, branching, bead lightning)
- `src/render/sprites.ts` — sprites & halos (transient luminous events above CG strikes)
- `src/describe.ts` — cloud genus classification (Cu hum, Cu med, Cu cong, Cb calv, Cb cap)
- `src/i18n.ts` — Russian/English translations
- `src/render/view.ts` — StormView with quality auto-levels, surface/zone/front rendering

## Implementation Plan (Phased)

### Phase 1: Sky — atmospheric scattering (from sky.ts)
- [ ] Port `computeSky`/`SkyState` tables and `adaptation` from `src/render/sky.ts` into Stormforge (adapt GLSL to Three ^0.170.0-compatible shader chunks)
- [ ] Replace/augment `skyFrag` in `CloudRainRenderer.ts` with MeteoLAB's `skyFragment` (sun disc, stars, ground beyond horizon, aerial perspective)
- [ ] Wire sun direction/elevation from Stormforge's `setSun` into the sky uniforms
- [ ] Add day/night/twilight sky clear color and fog blending

### Phase 2: Volumetric clouds — billows, mammatus, striations, anvils (from shaders.ts volumeFragment)
- [ ] Port cloud density function (`cloudDensity`) with billow noise, rising billows, mammatus pouches, rotation striations, anvil base into `cloudShader.ts` / `VolumetricCloudMaterial.ts`
- [ ] Add precipitation shaft extinction (rain/snow/graupel/hail) falling from cloud base
- [ ] Add sub-grid shadow probes toward the sun for billow self-shadowing
- [ ] Keep `DEFAULT_LOOK` and lookdev presets; extend `CloudLook` with new params where needed

### Phase 3: Lightning — realistic courses (from lightning.ts)
- [ ] Port `course()` (stepped leader, return strokes, branching, bead lightning, IC/CG differences) into Stormforge's sim/render layer
- [ ] Replace simple bolt ribbons in `CloudRainRenderer.ts` with MeteoLAB's camera-facing ribbon quads with white core + coloured glow
- [ ] Wire lightning brightness into cloud lighting (flash lights the cloud volume)
- [ ] Keep `#lightning-freq` UI control; map to flash generation rate

### Phase 4: Sprites & halos (from sprites.ts)
- [ ] Port `SpriteView` — transient luminous events (sprites, halos) above CG strikes, visible only in dark/twilight
- [ ] Wire `onEvent` callback from lightning to sprites when a CG occurs
- [ ] Add sprite/halo shader (camera-facing ribbons, red body / blue tendrils, red halo disc)

### Phase 5: Cloud genus labels (from describe.ts)
- [ ] Port `cloudGenus()` classification (Cu hum, Cu med, Cu cong, Cb calv, Cb cap) from `src/describe.ts`
- [ ] Display current cloud genus in Stormforge's HUD/sim-menu alongside rain rate
- [ ] Reuse existing stats display in `sim-menu`

### Phase 6: Surface effects — wet ground, hail, surface types (from shaders.ts groundSurfacePars + view.ts)
- [ ] Port ground surface shading: wet ground under rain, hail cover on ground, surface type patterns (grass/dry/water/urban)
- [ ] Inject into Stormforge's ground mesh material via `onBeforeCompile` (as MeteoLAB does)
- [ ] Track rain totals/hail per ground column from the sim

### Phase 7: i18n (from i18n.ts)
- [ ] Port `i18n.ts` translation framework (Russian + English) 
- [ ] Wrap Stormforge UI strings in `L()` helper
- [ ] Add language toggle to UI (default English)

### Phase 8: Quality auto-levels (from view.ts)
- [ ] Port automatic quality adjustment (low/medium/high based on frame time) to reduce march steps when the view drags
- [ ] Add quality badge to HUD

## Risks & Mitigations
| Risk | Mitigation |
|---|---|
| Three.js ^0.170.0 vs ^0.185.1 API differences (three/examples/jsm imports, ShaderChunk, color space) | Port GLSL and TS logic only; do not copy MeteoLAB's Three.js API usage verbatim; test against ^0.170.0 |
| WebGPU backend (`WebGPUBackend.ts`) unrelated to cloud rendering | Cloud features use WebGL (Three.js WebGLRenderer) — no WebGPU changes needed |
| Shader compilation failures on some GPUs | Add shader error handling with quality fallback (low→medium→high) |
| Performance: billows/mammatus/striations increase march cost | Use quality levels; reduce steps on mobile/low-end; keep auto-levels |
| Lookdev presets conflict with new sky scattering | Apply presets after sky setup; presets override sun geometry only |

## Validation Plan
- [ ] `npm run build` (tsc + vite build) passes with no type errors
- [ ] `npm run dev` starts; cloud rendering shows day/night sky, billows, shafts, lightning, sprites (at night)
- [ ] Lookdev presets still switch cloud appearance
- [ ] Cloud genus label appears in HUD when a cloud exists
- [ ] Ground darkens under rain; hail appears on ground after hail events
- [ ] Language toggle switches UI strings

## Files to Touch (Stormforge)
- `src/render/CloudRainRenderer.ts` — sky, lightning, sprites integration
- `src/render/clouds/cloudShader.ts` — cloud density with billows/mammatus/striations/shafts
- `src/render/clouds/VolumetricCloudMaterial.ts` — extended CloudLook, new uniforms
- `src/render/clouds/lookdevPresets.ts` — keep existing 4 presets (no changes needed)
- `src/render/clouds/sunLighting.ts` — may extend with sky table lighting
- `src/App.ts` — UI wiring: genus label, language toggle, quality badge
- `src/styles.css` — new UI styles for genus label, language toggle, quality badge
- New files: `src/render/sky.ts`, `src/render/lightning.ts`, `src/render/sprites.ts`, `src/i18n.ts` (ported/adapted from MeteoLAB)
