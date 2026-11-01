import * as THREE from "three";

/**
 * Renderer-side precipitation particles.
 *
 * The live physics runs in `live.worker.ts`, so App only ever sees the packed
 * RGBA cloud volume (R = liquid, G = cold species, B = rain). These particles
 * are therefore spawned from the packed B/G channels rather than from
 * `SimFields`: rain cells give drops, cold cells give snowflakes that melt as
 * they fall through the 0 °C level.
 *
 * Look and motion follow MeteoLAB (`precipVertex` / `precipFragment`,
 * `SNOW_FALL`, `MELT_DEPTH`, rain terminal ~ Kessler fallSpeed).
 */

const PARTICLE_CAPACITY = 8000;
/** Spawn attempts per second. Each attempt targets one random column. */
const SPAWN_RATE = 2200;
/**
 * Packed byte value below which a cell is considered empty.
 * Keep low so drizzle (~few dBZ) still seeds particles.
 */
const PACK_EMPTY = 1;
/** Vertical distance over which snow melts, metres (MeteoLAB MELT_DEPTH). */
const MELT_DEPTH = 600;
/** Snowflake fall speed, m/s (MeteoLAB SNOW_FALL). */
const SNOW_FALL = 2.0;
/**
 * Rain terminal fall speed at melt=1, m/s.
 * Kessler-class rain is ~6–8; bumped for clearer streaks and “faster” feel.
 */
const RAIN_FALL = 12.0;
/** How strongly particles follow the environmental wind (0–1). */
const WIND_DRAG = 0.7;

const vertexShader = /* glsl */ `
attribute float aMelt;
uniform float uScale;
varying float vMelt;
void main(){
  vMelt = aMelt;
  if(aMelt < 0.0){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // Rain reads smaller / sharper; snow a bit larger (MeteoLAB).
  gl_PointSize = clamp(mix(0.75, 0.48, aMelt) * uScale / -mv.z, 2.5, 28.0);
}
`;

const fragmentShader = /* glsl */ `
varying float vMelt;
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = length(c);
  // Snowflake: six soft arms + bright core (MeteoLAB).
  float arms = pow(abs(cos(3.0 * atan(c.y, c.x))), 8.0);
  float snow = clamp(smoothstep(1.0, 0.3, r) * arms + smoothstep(0.4, 0.1, r), 0.0, 1.0);
  // Rain: vertically stretched streak (taller when fully melted).
  float stretch = mix(3.5, 5.2, vMelt);
  float rain = smoothstep(1.0, 0.45, length(vec2(c.x * stretch, c.y)));
  float alpha = mix(snow, rain, vMelt);
  if(alpha < 0.05) discard;
  vec3 col = mix(vec3(0.97, 0.98, 1.0), vec3(0.42, 0.62, 0.92), vMelt);
  gl_FragColor = vec4(col, alpha * mix(0.85, 0.95, vMelt));
  #include <colorspace_fragment>
}
`;

export class PrecipitationParticles {
  readonly points: THREE.Points;

  private readonly positions = new Float32Array(PARTICLE_CAPACITY * 3);
  private readonly melt = new Float32Array(PARTICLE_CAPACITY).fill(-1);
  private readonly age = new Float32Array(PARTICLE_CAPACITY);
  private readonly life = new Float32Array(PARTICLE_CAPACITY);
  private readonly alive = new Uint8Array(PARTICLE_CAPACITY);
  private cursor = 0;
  private spawnDebt = 0;
  private lastMs = 0;

  private volume: Uint8Array | null = null;
  private dnx = 0;
  private dny = 0;
  private dnz = 0;

  private spanX = 1;
  private spanZ = 1;
  private groundY = -1;
  private height = 1;
  /** Height of the 0 °C level above ground, in metres; null means all rain. */
  private freezeAgl: number | null = null;
  /** World Y of the 0 °C level, derived from `freezeAgl` and `groundY`. */
  private freezeWorldY: number | null = null;

  private windEast = 0;
  private windNorth = 0;

  private readonly material: THREE.ShaderMaterial;

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute("aMelt", new THREE.BufferAttribute(this.melt, 1));
    geo.setDrawRange(0, PARTICLE_CAPACITY);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = 5;
  }

  /** Match the renderer's world box. */
  setBounds(spanX: number, spanZ: number, groundY: number, height: number): void {
    this.spanX = Math.max(1, spanX);
    this.spanZ = Math.max(1, spanZ);
    this.groundY = groundY;
    this.height = Math.max(1, height);
    this.applyFreezingLevel();
    this.killAll();
  }

  /** The packed display volume (same array the cloud texture uses). */
  setVolume(data: Uint8Array, dnx: number, dny: number, dnz: number): void {
    this.volume = data;
    this.dnx = dnx;
    this.dny = dny;
    this.dnz = dnz;
  }

  /** Height of the 0 °C level above the ground, in metres, or null. */
  setFreezingLevel(zAboveGround: number | null): void {
    this.freezeAgl =
      zAboveGround === null || !Number.isFinite(zAboveGround)
        ? null
        : zAboveGround;
    this.applyFreezingLevel();
  }

  private applyFreezingLevel(): void {
    this.freezeWorldY =
      this.freezeAgl === null ? null : this.groundY + this.freezeAgl;
  }

  setWind(east: number, north: number): void {
    this.windEast = east;
    this.windNorth = north;
  }

  /** MeteoLAB: `drawingBufferHeight * 0.5` so point size tracks the viewport. */
  setPixelScale(drawingBufferHeight: number): void {
    (this.material.uniforms.uScale as { value: number }).value = Math.max(
      120,
      drawingBufferHeight * 0.5,
    );
  }

  setVisible(on: boolean): void {
    this.points.visible = on;
  }

  clear(): void {
    this.killAll();
    this.spawnDebt = 0;
  }

  private killAll(): void {
    this.alive.fill(0);
    this.melt.fill(-1);
    this.cursor = 0;
    const geo = this.points.geometry;
    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("aMelt") as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Advance and emit. `nowMs` is the render clock. */
  update(nowMs: number): void {
    const last = this.lastMs || nowMs;
    this.lastMs = nowMs;
    let dt = (nowMs - last) / 1000;
    if (!(dt > 0)) return;
    if (dt > 0.12) dt = 0.12;

    if (this.volume && this.points.visible) this.emit(dt);
    this.advance(dt);
  }

  private meltAt(y: number): number {
    if (this.freezeWorldY === null) return 1;
    let m = (this.freezeWorldY - y) / MELT_DEPTH;
    if (m < 0) m = 0;
    else if (m > 1) m = 1;
    return m;
  }

  private emit(dt: number): void {
    const data = this.volume;
    if (!data) return;
    const { dnx, dny, dnz } = this;
    if (dnx < 1 || dny < 1 || dnz < 1) return;

    this.spawnDebt += dt * SPAWN_RATE;
    let attempts = Math.min(180, this.spawnDebt | 0);
    this.spawnDebt -= attempts;

    const nxny = dnx * dny;
    while (attempts-- > 0) {
      const i = (Math.random() * dnx) | 0;
      const j = (Math.random() * dny) | 0;
      let k = (Math.random() * dnz) | 0;
      // Prefer lower half of the column for shafts (more visible curtains).
      if (Math.random() < 0.55) k = (Math.random() * (dnz * 0.55)) | 0;
      // Find a precipitating cell in this column, searching up then down.
      let found = this.cellHasPrecip(data, i, j, k, nxny);
      if (!found) {
        for (let s = k + 1; s < dnz; s++) {
          if (this.cellHasPrecip(data, i, j, s, nxny)) {
            k = s;
            found = true;
            break;
          }
        }
      }
      if (!found) {
        for (let s = k - 1; s >= 0; s--) {
          if (this.cellHasPrecip(data, i, j, s, nxny)) {
            k = s;
            found = true;
            break;
          }
        }
      }
      if (!found) continue;

      const p = this.cursor;
      this.cursor = (this.cursor + 1) % PARTICLE_CAPACITY;
      const o = p * 3;
      const x = ((i + 0.5 + (Math.random() - 0.5) * 0.9) / dnx - 0.5) * this.spanX;
      const z =
        -((j + 0.5 + (Math.random() - 0.5) * 0.9) / dny - 0.5) * this.spanZ;
      const y = this.groundY + ((k + 0.5) / dnz) * this.height;
      this.positions[o] = x;
      this.positions[o + 1] = y;
      this.positions[o + 2] = z;
      this.age[p] = 0;
      // Live long enough to fall under gravity from spawn height to the ground
      // (MeteoLAB ages out at 2400 model-s; wall-clock life must cover the drop).
      const melt0 = this.meltAt(y);
      const fall0 = SNOW_FALL + (RAIN_FALL - SNOW_FALL) * melt0;
      const drop = Math.max(80, y - (this.groundY + 1));
      this.life[p] = drop / Math.max(fall0, 0.5) + 1.5 + Math.random() * 3;
      this.alive[p] = 1;
      this.melt[p] = melt0;
    }
  }

  private cellHasPrecip(
    data: Uint8Array,
    i: number,
    j: number,
    k: number,
    nxny: number,
  ): boolean {
    void nxny;
    const row = k + this.dnz * (this.dny - 1 - j);
    const o = (i + this.dnx * row) * 4;
    if (o < 0 || o + 2 >= data.length) return false;
    return data[o + 1] > PACK_EMPTY || data[o + 2] > PACK_EMPTY;
  }

  private advance(dt: number): void {
    const pos = this.positions;
    const driftX = this.windEast * WIND_DRAG * dt;
    const driftZ = -this.windNorth * WIND_DRAG * dt;
    const floor = this.groundY + 1;
    for (let p = 0; p < PARTICLE_CAPACITY; p++) {
      if (!this.alive[p]) continue;
      const o = p * 3;
      const y = pos[o + 1];
      const melt = this.meltAt(y);
      // MeteoLAB: lerp(SNOW_FALL, max(2, rainFallSpeed), melt).
      const fall = SNOW_FALL + (RAIN_FALL - SNOW_FALL) * melt;
      const age = (this.age[p] += dt);
      let ny = y - fall * dt;
      let nx = pos[o] + driftX;
      let nz = pos[o + 2] + driftZ;
      if (ny <= floor || age > this.life[p]) {
        this.alive[p] = 0;
        this.melt[p] = -1;
        continue;
      }
      const halfX = this.spanX * 0.5;
      const halfZ = this.spanZ * 0.5;
      if (nx < -halfX) nx += this.spanX;
      else if (nx > halfX) nx -= this.spanX;
      if (nz < -halfZ) nz += this.spanZ;
      else if (nz > halfZ) nz -= this.spanZ;
      pos[o] = nx;
      pos[o + 1] = ny;
      pos[o + 2] = nz;
      this.melt[p] = melt;
    }
    const geo = this.points.geometry;
    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("aMelt") as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
