import * as THREE from "three";

/**
 * Renderer-side precipitation.
 *
 * The live physics runs in `live.worker.ts`, so this only sees the packed
 * volume: G = ice/snow, B = rain, A = hail core. Snow flutters and melts
 * through the 0 °C level. Hail is a fast, round stone spawned from the core
 * and barely follows the wind.
 */

const PARTICLE_CAPACITY = 12000;
/** Spawn attempts per second. Each attempt targets one random column. */
const SPAWN_RATE = 2800;
/**
 * Packed byte value below which a cell is considered empty.
 * Keep low so drizzle (~few dBZ) still seeds particles.
 */
const PACK_EMPTY = 1;
/** Vertical distance over which snow melts, metres (MeteoLAB MELT_DEPTH). */
const MELT_DEPTH = 600;
/** Snowflake fall speed, m/s. Aggregates are near 1 m/s; size scales it. */
const SNOW_FALL = 1.15;
/**
 * Rain terminal fall speed at melt=1, m/s.
 * Kessler-class rain is ~6–8; bumped for clearer streaks.
 */
const RAIN_FALL = 12.0;
/** How strongly rain follows the environmental wind (0–1). Snow is higher, hail lower. */
const WIND_DRAG = 0.7;

const vertexShader = /* glsl */ `
attribute float aMelt;
attribute float aKind;
attribute float aSize;
attribute float aSeed;
uniform float uScale;
varying float vMelt;
varying float vKind;
varying float vSize;
varying float vSeed;
void main(){
  vMelt = aMelt;
  vKind = aKind;
  vSize = aSize;
  vSeed = aSeed;
  if(aKind < 0.0){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float px = mix(1.3, 2.6, aSize);
  if(aKind > 1.5) px = mix(1.15, 3.6, aSize);
  else if(aKind > 0.5) px = mix(0.55, 0.85, aMelt);
  gl_PointSize = clamp(px * uScale / -mv.z, 2.0, 40.0);
}
`;

const fragmentShader = /* glsl */ `
varying float vMelt;
varying float vKind;
varying float vSize;
varying float vSeed;
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = length(c);
  if(vKind > 1.5){
    float body = smoothstep(1.0, 0.62, r);
    if(body < 0.04) discard;
    vec2 spec = c - vec2(-0.28, 0.34);
    float shine = smoothstep(0.55, 0.0, length(spec));
    vec3 ice = mix(vec3(0.55, 0.58, 0.62), vec3(0.96, 0.97, 0.99), smoothstep(0.2, 0.85, vSize));
    vec3 col = mix(ice, vec3(1.0), shine * 0.8);
    float rim = smoothstep(0.98, 0.45, r);
    gl_FragColor = vec4(col, body * rim * 0.95);
  } else {
    float ang = vSeed * 6.2831853;
    float cs = cos(ang), sn = sin(ang);
    vec2 cr = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
    float arms = pow(abs(cos(3.0 * atan(cr.y, cr.x))), mix(6.0, 16.0, vSeed));
    float snow = clamp(smoothstep(1.0, 0.28, r) * arms + smoothstep(0.38, 0.05, r), 0.0, 1.0);
    float stretch = mix(3.5, 5.2, vMelt);
    float rain = smoothstep(1.0, 0.45, length(vec2(c.x * stretch, c.y)));
    float m = vKind > 0.5 ? 1.0 : clamp(vMelt, 0.0, 1.0);
    float alpha = mix(snow, rain, m);
    if(alpha < 0.05) discard;
    vec3 flake = mix(vec3(0.84, 0.90, 0.98), vec3(1.0, 0.99, 0.98), 0.55 + 0.45 * vSeed);
    vec3 col = mix(flake, vec3(0.42, 0.62, 0.92), m);
    gl_FragColor = vec4(col, alpha * mix(0.9, 0.95, m));
  }
  #include <colorspace_fragment>
}
`;

export class PrecipitationParticles {
  readonly points: THREE.Points;

  private readonly positions = new Float32Array(PARTICLE_CAPACITY * 3);
  private readonly melt = new Float32Array(PARTICLE_CAPACITY).fill(-1);
  private readonly kind = new Float32Array(PARTICLE_CAPACITY).fill(-1);
  private readonly size = new Float32Array(PARTICLE_CAPACITY);
  private readonly seed = new Float32Array(PARTICLE_CAPACITY);
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
    geo.setAttribute("aKind", new THREE.BufferAttribute(this.kind, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(this.seed, 1));
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
    this.kind.fill(-1);
    this.cursor = 0;
    this.touch();
  }

  private touch(): void {
    const geo = this.points.geometry;
    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("aMelt") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("aKind") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
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

  /** 0 snow, 1 rain, 2 hail. */
  private fallSpeed(kind: number, size: number, melt: number): number {
    if (kind >= 2) return 8 + 14 * size;
    if (kind === 1) return RAIN_FALL;
    const snow = SNOW_FALL * (0.65 + 0.7 * size);
    return snow + (RAIN_FALL - snow) * melt;
  }

  private emit(dt: number): void {
    const data = this.volume;
    if (!data) return;
    const { dnx, dny, dnz } = this;
    if (dnx < 1 || dny < 1 || dnz < 1) return;

    this.spawnDebt += dt * SPAWN_RATE;
    let attempts = Math.min(240, this.spawnDebt | 0);
    this.spawnDebt -= attempts;

    while (attempts-- > 0) {
      const i = (Math.random() * dnx) | 0;
      const j = (Math.random() * dny) | 0;
      let k = (Math.random() * dnz) | 0;
      // Prefer the lower half of the column so shafts read as curtains.
      if (Math.random() < 0.55) k = (Math.random() * (dnz * 0.55)) | 0;
      let found = this.cellHasPrecip(data, i, j, k);
      if (!found) {
        for (let s = k + 1; s < dnz; s++) {
          if (this.cellHasPrecip(data, i, j, s)) {
            k = s;
            found = true;
            break;
          }
        }
      }
      if (!found) {
        for (let s = k - 1; s >= 0; s--) {
          if (this.cellHasPrecip(data, i, j, s)) {
            k = s;
            found = true;
            break;
          }
        }
      }
      if (!found) continue;

      const sample = this.sampleCell(data, i, j, k);
      if (!sample) continue;
      const y = this.groundY + ((k + 0.5) / dnz) * this.height;
      const melt0 = this.meltAt(y);
      let kind = 1;
      let size = 0.4 + Math.random() * 0.6;
      if (sample.hail > 16 && Math.random() < 0.72) {
        kind = 2;
        size = Math.min(1, Math.max(0.12, (sample.hail / 255) * (0.65 + Math.random() * 0.7)));
      } else if (sample.cold > sample.rain && sample.cold > PACK_EMPTY) {
        kind = melt0 > 0.85 ? 1 : 0;
        size = 0.25 + Math.random() * 0.75;
      } else if (sample.rain > PACK_EMPTY) {
        kind = 1;
      } else if (sample.cold > PACK_EMPTY) {
        kind = melt0 > 0.85 ? 1 : 0;
        size = 0.25 + Math.random() * 0.75;
      } else {
        continue;
      }

      const p = this.cursor;
      this.cursor = (this.cursor + 1) % PARTICLE_CAPACITY;
      const o = p * 3;
      const x = ((i + 0.5 + (Math.random() - 0.5) * 0.9) / dnx - 0.5) * this.spanX;
      const z =
        -((j + 0.5 + (Math.random() - 0.5) * 0.9) / dny - 0.5) * this.spanZ;
      this.positions[o] = x;
      this.positions[o + 1] = y;
      this.positions[o + 2] = z;
      this.age[p] = 0;
      const fall0 = this.fallSpeed(kind, size, kind === 0 ? melt0 : kind === 2 ? 0 : 1);
      const drop = Math.max(80, y - (this.groundY + 1));
      this.life[p] = drop / Math.max(fall0, 0.4) + 1.2 + Math.random() * 2.5;
      this.alive[p] = 1;
      this.kind[p] = kind;
      this.size[p] = size;
      this.seed[p] = Math.random();
      this.melt[p] = kind === 0 ? melt0 : kind === 2 ? 0 : 1;
    }
  }

  private sampleCell(
    data: Uint8Array,
    i: number,
    j: number,
    k: number,
  ): { cold: number; rain: number; hail: number } | null {
    const row = k + this.dnz * (this.dny - 1 - j);
    const o = (i + this.dnx * row) * 4;
    if (o < 0 || o + 3 >= data.length) return null;
    return { cold: data[o + 1], rain: data[o + 2], hail: data[o + 3] };
  }

  private cellHasPrecip(
    data: Uint8Array,
    i: number,
    j: number,
    k: number,
  ): boolean {
    const sample = this.sampleCell(data, i, j, k);
    if (!sample) return false;
    return (
      sample.cold > PACK_EMPTY ||
      sample.rain > PACK_EMPTY ||
      sample.hail > PACK_EMPTY
    );
  }

  private advance(dt: number): void {
    const pos = this.positions;
    const floor = this.groundY + 1;
    for (let p = 0; p < PARTICLE_CAPACITY; p++) {
      if (!this.alive[p]) continue;
      const o = p * 3;
      const y = pos[o + 1];
      let kind = this.kind[p];
      const size = this.size[p];
      let melt = kind < 0.5 ? this.meltAt(y) : kind < 1.5 ? 1 : 0;
      if (kind < 0.5 && melt > 0.92) {
        kind = 1;
        this.kind[p] = 1;
        melt = 1;
      }
      const fall = this.fallSpeed(kind, size, melt);
      const drag = kind >= 2 ? 0.18 : kind < 0.5 ? 0.9 : WIND_DRAG;
      const age = (this.age[p] += dt);
      let ny = y - fall * dt;
      let nx = pos[o] + this.windEast * drag * dt;
      let nz = pos[o + 2] - this.windNorth * drag * dt;
      if (kind < 0.5) {
        const wobble = age * 2.3 + this.seed[p] * 6.2831853;
        nx += Math.sin(wobble) * 0.85 * dt;
        nz += Math.cos(wobble * 0.8) * 0.65 * dt;
      } else if (kind >= 2) {
        const wobble = age * 9.0 + this.seed[p] * 6.2831853;
        nx += Math.sin(wobble) * 0.15 * dt;
      }
      if (ny <= floor || age > this.life[p]) {
        this.alive[p] = 0;
        this.kind[p] = -1;
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
    this.touch();
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
