import * as THREE from 'three';
import { cloudFragmentShader, cloudVertexShader } from './cloudShader';
import { createCloudNoise } from './noiseTextures';
import { computeSkyLighting } from './sunLighting';

/** Everything that changes how the cloud looks, without touching the sim. All lengths in metres. */
export interface CloudLook {
  sigmaLiquid: number; // extinction at density 1, 1/m. ~0.04-0.1 gives an opaque, dark-based Cb
  sigmaIce: number; // ~10x lower than liquid, so anvils stay translucent
  sigmaRain: number;
  erosionLiquid: number; // 0..1, billow strength on liquid cloud
  erosionIce: number; // 0..1, keep low for smooth anvils
  iceStretch: [number, number, number]; // fibre frequency multipliers (along wind, vertical, across wind)
  phaseLiquid: [number, number]; // (forward g, backward g)
  phaseIce: [number, number];
  phaseRain: [number, number];
  backWeight: number;
  multiScatter: [number, number, number]; // (a, b, c)
  powder: number;
  powderLength: number;
  ambientStrength: number;
  ambientAtten: number;
  hazeDensity: number; // 1/m
  exposure: number;
  shapeTileMeters: number; // size of one shape-noise tile
  detailTileMeters: number; // size of one detail-noise tile
  stepSize: number;
  lodDistance: number;
  detailFade: [number, number];
}

export const DEFAULT_LOOK: CloudLook = {
  sigmaLiquid: 0.08,
  sigmaIce: 0.008,
  sigmaRain: 0.18,
  erosionLiquid: 0.6,
  erosionIce: 0.25,
  iceStretch: [0.25, 0.6, 2.5],
  phaseLiquid: [0.65, 0.3],
  phaseIce: [0.5, 0.2],
  phaseRain: [0.85, 0.1],
  backWeight: 0.3,
  multiScatter: [0.5, 0.5, 0.5],
  powder: 0.8,
  powderLength: 150,
  ambientStrength: 0.7,
  ambientAtten: 0.04,
  hazeDensity: 2e-5,
  exposure: 0.6,
  shapeTileMeters: 8000,
  detailTileMeters: 1600,
  stepSize: 60,
  lodDistance: 15000,
  detailFade: [8000, 30000],
};

export interface VolumetricCloudOptions {
  /** Sim volume. R = cloud liquid, G = cloud ice, B = rain, spanning exactly boxMin..boxMax. */
  fields: THREE.Data3DTexture;
  /** World-space bounds of the sim domain (Y up, metres). */
  boxMin: THREE.Vector3;
  boxMax: THREE.Vector3;
  /** Multipliers that map sim values to roughly 0..1 for (liquid, ice, rain). */
  fieldGain?: THREE.Vector3;
  look?: Partial<CloudLook>;
  /** Compile-time quality settings. */
  quality?: { maxSteps?: number; lightSteps?: number; ambientSteps?: number; msOctaves?: number };
}

const v2 = (a: [number, number]) => new THREE.Vector2(a[0], a[1]);
const v3 = (a: [number, number, number]) => new THREE.Vector3(a[0], a[1], a[2]);

export class VolumetricCloudMaterial extends THREE.ShaderMaterial {
  private look: CloudLook;
  private sunAzimuthDeg = 0;
  private sunElevationDeg = 45;
  private windDir = new THREE.Vector3(1, 0, 0);
  private windSpeed = 8; // m/s
  private boil = 1.5; // m/s upward drift of the noise
  private frame = 0;

  constructor(opts: VolumetricCloudOptions) {
    const noise = createCloudNoise();
    const look: CloudLook = { ...DEFAULT_LOOK, ...opts.look };
    const q = opts.quality ?? {};

    super({
      vertexShader: cloudVertexShader,
      fragmentShader: cloudFragmentShader,
      defines: {
        MAX_STEPS: q.maxSteps ?? 128,
        LIGHT_STEPS: q.lightSteps ?? 6,
        AMBIENT_STEPS: q.ambientSteps ?? 2,
        MS_OCTAVES: q.msOctaves ?? 4,
      },
      uniforms: {
        uFields: { value: opts.fields },
        uShapeNoise: { value: noise.shape },
        uDetailNoise: { value: noise.detail },
        uBoxMin: { value: opts.boxMin.clone() },
        uBoxMax: { value: opts.boxMax.clone() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Vector3(1, 1, 1) },
        uSkyColor: { value: new THREE.Vector3() },
        uGroundColor: { value: new THREE.Vector3() },
        uHazeColor: { value: new THREE.Vector3() },
        uFieldGain: { value: (opts.fieldGain ?? new THREE.Vector3(1, 1, 1)).clone() },
        uSigma: { value: new THREE.Vector3() },
        uNoiseOffset: { value: new THREE.Vector3() },
        uWindDir: { value: new THREE.Vector3(1, 0, 0) },
        uShapeFreq: { value: 0 },
        uDetailFreq: { value: 0 },
        uErosionLiquid: { value: 0 },
        uErosionIce: { value: 0 },
        uIceStretch: { value: new THREE.Vector3() },
        uDetailFade: { value: new THREE.Vector2() },
        uStepSize: { value: 0 },
        uLodDistance: { value: 0 },
        uLightStep: { value: 150 },
        uLightGrowth: { value: 2.0 },
        uAmbientStep: { value: 600 },
        uFrame: { value: 0 },
        uPhaseLiquid: { value: new THREE.Vector2() },
        uPhaseIce: { value: new THREE.Vector2() },
        uPhaseRain: { value: new THREE.Vector2() },
        uBackWeight: { value: 0 },
        uMultiScatter: { value: new THREE.Vector3() },
        uPowder: { value: 0 },
        uPowderLength: { value: 0 },
        uAmbientStrength: { value: 0 },
        uAmbientAtten: { value: 0 },
        uHazeDensity: { value: 0 },
        uExposure: { value: 1 },
        uSceneDepth: { value: null },
        uInvProjection: { value: new THREE.Matrix4() },
        uCameraWorld: { value: new THREE.Matrix4() },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uFlashPos: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
        uFlashColor: { value: [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)] },
        uFlashAmt: { value: [0, 0, 0, 0] },
        uTime: { value: 0 },
        uRainFallSpeed: { value: 7.0 },
        uRainWindShear: { value: new THREE.Vector3(0, 0, 0) },
      },
      side: THREE.BackSide, // so the camera can sit inside the box
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      depthTest: false,
    });

    this.look = look;
    this.setLook({});
    this.setSun(this.sunAzimuthDeg, this.sunElevationDeg);
    this.setWind(1, 0, this.windSpeed);
  }

  private u<T>(name: string): { value: T } {
    return this.uniforms[name] as { value: T };
  }

  /** Update any look parameters. Safe to call every frame from a GUI. */
  setLook(partial: Partial<CloudLook>): void {
    this.look = { ...this.look, ...partial };
    const l = this.look;
    this.u<THREE.Vector3>('uSigma').value.set(l.sigmaLiquid, l.sigmaIce, l.sigmaRain);
    this.u<number>('uErosionLiquid').value = l.erosionLiquid;
    this.u<number>('uErosionIce').value = l.erosionIce;
    this.u<THREE.Vector3>('uIceStretch').value.copy(v3(l.iceStretch));
    this.u<THREE.Vector2>('uPhaseLiquid').value.copy(v2(l.phaseLiquid));
    this.u<THREE.Vector2>('uPhaseIce').value.copy(v2(l.phaseIce));
    this.u<THREE.Vector2>('uPhaseRain').value.copy(v2(l.phaseRain));
    this.u<number>('uBackWeight').value = l.backWeight;
    this.u<THREE.Vector3>('uMultiScatter').value.copy(v3(l.multiScatter));
    this.u<number>('uPowder').value = l.powder;
    this.u<number>('uPowderLength').value = l.powderLength;
    this.u<number>('uAmbientStrength').value = l.ambientStrength;
    this.u<number>('uAmbientAtten').value = l.ambientAtten;
    this.u<number>('uHazeDensity').value = l.hazeDensity;
    this.u<number>('uExposure').value = l.exposure;
    this.u<number>('uShapeFreq').value = 1 / l.shapeTileMeters;
    this.u<number>('uDetailFreq').value = 1 / l.detailTileMeters;
    this.u<number>('uStepSize').value = l.stepSize;
    this.u<number>('uLodDistance').value = l.lodDistance;
    this.u<THREE.Vector2>('uDetailFade').value.set(l.detailFade[0], l.detailFade[1]);
  }

  /**
   * Place the sun by compass direction. Azimuth 0 = -Z, 90 = +X (Three's default camera looks down -Z).
   * Also recomputes the sun, sky, ground and haze colours for that elevation.
   */
  setSun(azimuthDeg: number, elevationDeg: number): void {
    this.sunAzimuthDeg = azimuthDeg;
    this.sunElevationDeg = elevationDeg;
    const az = (azimuthDeg * Math.PI) / 180;
    const el = (elevationDeg * Math.PI) / 180;
    this.u<THREE.Vector3>('uSunDir').value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));

    const c = computeSkyLighting(elevationDeg);
    this.u<THREE.Vector3>('uSunColor').value.copy(c.sun);
    this.u<THREE.Vector3>('uSkyColor').value.copy(c.sky);
    this.u<THREE.Vector3>('uGroundColor').value.copy(c.ground);
    this.u<THREE.Vector3>('uHazeColor').value.copy(c.haze);
  }

  /**
   * Place the sun relative to where the camera is looking, which is how you compare against photos.
   *   0   = sun straight ahead (back-lit: silver lining, glowing anvil)
   *   90  = sun to the right (side-lit: most sculpted)
   *   180 = sun behind the camera (front-lit: bright and flat)
   */
  setSunRelativeToCamera(camera: THREE.Camera, relativeAzimuthDeg: number, elevationDeg: number): void {
    const f = new THREE.Vector3();
    camera.getWorldDirection(f);
    const headingDeg = (Math.atan2(f.x, -f.z) * 180) / Math.PI;
    this.setSun(headingDeg + relativeAzimuthDeg, elevationDeg);
  }

  /** Wind direction on the XZ plane (need not be normalised) and speed in m/s. Drives anvil streak direction and noise drift. */
  setWind(dirX: number, dirZ: number, speed: number): void {
    this.windDir.set(dirX, 0, dirZ).normalize();
    this.windSpeed = speed;
    this.u<THREE.Vector3>('uWindDir').value.copy(this.windDir);
  }

  /** Upward drift of the billow noise in m/s; this is what makes the towers look like they are boiling. */
  setBoil(metresPerSecond: number): void {
    this.boil = metresPerSecond;
  }

  /** Swap in a new sim volume (same bounds). */
  setFields(fields: THREE.Data3DTexture): void {
    this.u<THREE.Data3DTexture>('uFields').value = fields;
  }

  /** One multiplier for liquid, ice, and rain. 1 means a packed dense core stays 1. */
  setFieldGain(gain: number): void {
    this.u<THREE.Vector3>('uFieldGain').value.set(gain, gain, gain);
  }

  fieldGain(): number {
    return this.u<THREE.Vector3>('uFieldGain').value.x;
  }

  lookSnapshot(): { sigmaLiquid: number; sigmaRain: number; erosionLiquid: number; erosionIce: number } {
    return {
      sigmaLiquid: this.look.sigmaLiquid,
      sigmaRain: this.look.sigmaRain,
      erosionLiquid: this.look.erosionLiquid,
      erosionIce: this.look.erosionIce,
    };
  }

  /**
   * Full-resolution scene depth. The march is half resolution, so uResolution is the
   * march target and the depth is sampled in the same NDC.
   */
  setSceneDepth(depth: THREE.Texture, camera: THREE.PerspectiveCamera, resolution: THREE.Vector2): void {
    this.u<THREE.Texture>('uSceneDepth').value = depth;
    this.u<THREE.Matrix4>('uInvProjection').value.copy(camera.projectionMatrixInverse);
    this.u<THREE.Matrix4>('uCameraWorld').value.copy(camera.matrixWorld);
    this.u<THREE.Vector2>('uResolution').value.copy(resolution);
  }

  /** Up to four flashes. Missing slots are turned off. */
  setFlashes(flashes: { x: number; y: number; z: number; r: number; g: number; b: number; amount: number }[]): void {
    const pos = this.u<THREE.Vector3[]>('uFlashPos').value;
    const col = this.u<THREE.Vector3[]>('uFlashColor').value;
    const amt = this.u<number[]>('uFlashAmt').value;
    for (let i = 0; i < 4; i++) {
      const f = flashes[i];
      if (!f || f.amount <= 0) {
        amt[i] = 0;
        continue;
      }
      pos[i].set(f.x, f.y, f.z);
      col[i].set(f.r, f.g, f.b);
      amt[i] = f.amount;
    }
  }

  /** Call once per frame with elapsed seconds. */
  update(timeSeconds: number): void {
    this.frame++;
    this.u<number>('uFrame').value = this.frame % 64;
    this.u<number>('uTime').value = timeSeconds;
    this.u<THREE.Vector3>('uNoiseOffset').value.set(
      -this.windDir.x * this.windSpeed * timeSeconds,
      this.boil * timeSeconds,
      -this.windDir.z * this.windSpeed * timeSeconds,
    );
    // Rain wind shear: lean streaks in wind direction, ~1m horizontal per 1000m height
    this.u<THREE.Vector3>('uRainWindShear').value.set(
      this.windDir.x * this.windSpeed * 0.001,
      0,
      this.windDir.z * this.windSpeed * 0.001,
    );
  }
}

/** Convenience: a box mesh covering the sim domain, with the cloud material applied. */
export function createCloudMesh(material: VolumetricCloudMaterial, boxMin: THREE.Vector3, boxMax: THREE.Vector3): THREE.Mesh {
  const size = new THREE.Vector3().subVectors(boxMax, boxMin);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.copy(boxMin).addScaledVector(size, 0.5);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10; // after opaque geometry
  return mesh;
}
