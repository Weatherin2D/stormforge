# Plan: Merge MeteoLAB 2D Views into Stormforge

## Goal
Port MeteoLAB's 2D map/radar view quality (basemap, legend, overlays) into Stormforge's `Radar2DView`, keeping Stormforge's color scales.

## Scope
- Study MeteoLAB `src/radar/panel.ts` (85KB) and `src/render/view.ts` (92KB) for map rendering, basemap, legend, overlays.
- Identify reusable pieces: coastline/borders, grid, lat/lon labels, compass, scale bar, legend styling.
- Adapt to Stormforge's `Radar2DView` + `mapProducts` without replacing existing products.

## Tasks
1. Read MeteoLAB radar panel and view rendering code; catalog 2D map features.
2. Design overlay layer in `Radar2DView` (drawn after data blit): grid, borders, labels, scale bar.
3. Implement overlay drawing methods.
4. Wire toggles (show/hide overlays) in UI.
5. Validate build + smoke.

## Risks
- Large codebase; porting GLSL/Canvas details may conflict with Three.js version.
- Performance: overlay redraw each frame.

## Validation
- `npm run build`
- Visual check via dev server.
