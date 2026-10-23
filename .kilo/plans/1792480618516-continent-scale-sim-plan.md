# Plan: Continent-Scale 10k×10k Weather Simulation with Fast Execution

## Goal
Enable continent-scale simulations (up to ~10,000×10,000 horizontal cells) while running fast enough to complete ~1 full day in 10–30 minutes, by adopting a different architectural approach.

## Current State (Baseline)
- Grid: Arakawa C-grid, explicit, CPU-bound (TypeScript/Float32Arrays). Max practical ~256×256×96 (UI warns >~96³).
- Solver: Anelastic, CM1-like with microphysics, radiation, dynamics. Substepping for CFL.
- Rendering: Three.js volume with downsampled display (128³ max).
- Memory: ~ (nx*ny*nz*fields)*4 bytes; 256³×(5 scalars + 3 faces) ~ large but manageable. 10k³ is infeasible.
- Timestep: Explicit, CFL-limited by dx,dy,dz and max winds.

## Core Challenge
10,000×10,000×nz is O(10^8) cells. Each step touches many fields. Explicit CFL at 100–500m dx gives seconds-scale dt (often < 10s) → ~10^4–10^5 steps/day. CPU single-threaded JS is ~10–100M simple ops/sec realistically → infeasible without fundamental change.

## Proposed Approach (Hybrid: Large-Scale Efficient + Regional Detail)

Rather than uniform 10k×10k explicit 3D everywhere at LES resolution, support multiple modes:

### 1) Compute Architecture (GPU-first)
- Migrate core solver to **WebGPU Compute** (WGSL). Keep TS for UI, I/O, orchestration.
- Use storage buffers/textures; exploit workgroups (2D/3D tiling). Target 10–100× CPU speedup.
- Chunked/ tiled domain per compute pass (memory bandwidth aware). Support async readback for diagnostics.

### 2) Grid Strategy (Variable Resolution, not naive uniform)
To cover continents (e.g. 4000–6000 km) at practical cost:
- **Variable resolution (VR)**: MPAS-like Voronoi or stretched Cartesian with refinement regions (nests). Allow 10k×10k total cells distributed (coarse global, fine nests).
- **Nested domains**: Run parent (coarse, hydrostatic/efficient) + child nests (finer, nonhydrostatic) with two-way feedback.
- **Quasi-uniform target**: User specifies region + resolution; cap finest dx (e.g. 250m) and total cell count (GPU memory budget).
- **Adaptive mesh refinement (AMR)**: Optional - refine around deep convection, fronts (cost/complexity). Defer initially.

### 3) Physics & Numerics (Speed + Scale)
- **Split timestep**: Slow physics (radiation, microphysics, BL) less frequent; fast dynamics every small step.
- **Semi-implicit**: For vertically propagating waves or larger dt in stratified flow (anelastic/hydrostatic switch). Reduces CFL constraint.
- **Hydrostatic vs Nonhydrostatic**: Hydrostatic for dx>~1km (large scales, continents) is cheaper/stable larger dt; NH for <1km.
- **Cumulus parameterization (CP)**: For coarse grids (dx>=1–2km) parameterize deep/shallow Cu instead of explicit (critical for continent-scale speed/realism). Disable CP in convection-resolving nests.
- **Subgrid turbulence**: Smagorinsky/EDMF depending on resolution.
- **Time integration**: Runge–Kutta 3 or split-explicit (MPAS/WRF style) for efficiency/stability.

### 4) Memory & Streaming (10k×10k feasible)
- 10k×10k×60 cells * (say 6–8 4-byte fields active) = ~10k*10k*60*32 = 1.92e9 bytes = 1.92 GB if all resident - borderline on GPU (VRAM). With VR + nests + active region + out-of-core tiling (stream tiles on/off) + FP16 where safe, feasible (4–8GB).
- Keep base state 1D; store 3D in tiled ZYX or compressed. Use double-buffering.
- Display: keep downsampled (current 128³) independent of physics res.

### 5) Domain Configuration (UI)
- Replace fixed nx,ny,nz with: **Domain type** (Global regional/Local), **Map extent** (lat/lon or km box), **Resolution** (finest dx + total cells or nx,ny with extent), **Vertical levels** (stretching), **Nest editor**.
- Add **Performance/Mode**: “Realtime”, “Forecast fast” (target day/hr per wall-min), “Research”.
- Warn on VRAM/cell count. Presets: Continental (10k×10k equiv VR), Regional, Local.

## Implementation Plan (Phased, Low-Risk)

### Phase 1: Prep & Abstractions (1–2 days)
- [ ] Extract solver interface (`ISolver`, step(dt), fields access, resize). Allow CPU and GPU backends.
- [ ] Abstract field storage (tiled arrays) behind views; decouple rendering from in-memory full grid shape.
- [ ] Add `domain` config (extent km, dx, dy, map projection, nests). Keep backward compatible with current GridConfig (translate old nx,ny to extent+dx).
- [ ] Type definitions for nests, VR, physics modes.

### Phase 2: WebGPU Compute Scaffold (2–3 days)
- [ ] Add WebGPU device init (with fallback to CPU if unavailable).
- [ ] WGSL kernels: advection (WENO/van Leer or semi-Lagrangian), pressure Poisson/projection, buoyancy, microphysics (subset), copy.
- [ ] Tiled 2D workgroups for horizontal, iterate Z. Ping-pong buffers for scalars.
- [ ] Memory budget + tiling (chunk nx,ny into tiles). 
- [ ] Smoke tests vs CPU for small grids.

### Phase 3: Numerics for Large Scale (2–3 days)
- [ ] Hydrostatic mode + switch (NH<dx threshold). Pressure solver split (vertical implicit optional).
- [ ] Split-explicit or larger substepping strategy; adaptive dt with CFL by resolution class.
- [ ] Cumulus parameterization hook (Kain–Fritsch or simplified Betts–Miller) + toggle per nest.
- [ ] Vertical grid stretching (terrain-following optional later).

### Phase 4: Variable Resolution + Nests (2–4 days)
- [ ] Cartesian VR: stretched grid or block-structured nests (easier first). Two-way interpolation (relaxation/bilinear+conservation for scalars).
- [ ] Nest definition UI (draw rectangle on map, dx factor). Parent→child, child→parent.
- [ ] Overlap zones, sponge/buffers.
- [ ] Load balancing: different dt per nest level.

### Phase 5: Continental Presets + UI (1–2 days)
- [ ] SetupScreen: “Scale” dropdown (Local/Regional/Continental). Auto-compute extent+dx from preset (e.g. CONUS ~3500×2500 km, 10k×7k cells @ 350m VR).
- [ ] Performance target UI (target day/min). Estimate steps + ETA.
- [ ] VRAM estimate, perf warning updated.

### Phase 6: Rendering & I/O (1–2 days)
- [ ] Volume rendering: sample from tiled/VR grid (LOD: coarser for far, or just display downsample of active region). Keep 128³ display target.
- [ ] 2D maps (radar/products) on same grid projection. 
- [ ] Save/load: support chunked fields (stream). Batch frames chunked.
- [ ] Teleport/map aligned to extent (lat/lon or km).

### Phase 7: Validation, Perf, Optimization (2–3 days)
- [ ] Conservation tests (mass/moisture), spin-up, baroclinic wave, squall line across nest boundary.
- [ ] Benchmark: target 1 day in 10–30 min. Profile GPU (occupancy, bandwidth). Reduce atomics, use shared memory.
- [ ] Fallbacks, memory caps, graceful CPU fallback.

## Performance Target Rationale
- 4000km×4000km @ 400m = 10k×10k. Hydrostatic + VR + GPU: expect 10–50M cell-steps/sec (vs 0.5–2M CPU). With split physics, ~10^6–10^7 effective cell-updates/sec → ~10–30 min/day plausible.
- Critical: move advection/projection to GPU + larger dt (hydrostatic, CP where coarse).

## Risks & Mitigations
- WebGPU availability (older browsers/GPUs) → CPU fallback path (Phase 1 interface).
- Nest boundary artifacts → conservative interpolation + buffer zones + testing.
- VRAM pressure → tiling + FP16 + cap total cells by device.
- Complexity vs goal → Phase 2 scaffold first (GPU speedup on current uniform grids) gives big win immediately, add VR/nests incrementally.

## Dependencies
- WebGPU API (modern Chrome/Edge, Electron supports). No external heavy deps.
- WGSL tooling (TypeScript types optional).

## Validation Plan
- Small regression: existing 64³ case identical results (CPU vs GPU).
- Continental smoke: 5k×5k VR, 24hr forecast < 20 min, stable, reasonable convection.
- Memory: stays within caps, no leaks.
- Batch/review still works (chunked frames).

## Recommendation
**Adopt GPU-first + VR/nests + hydrostatic/CP modes.** This is the standard path (MPAS/WRF/HARMONIE, and modern GPU NWP). Naive uniform 10k³ in JS arrays is not viable; this hybrid approach achieves “10k×10k coverage” with fast runtimes.