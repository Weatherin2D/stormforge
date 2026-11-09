import * as THREE from 'three';
import { cloudFragmentShader, cloudVertexShader } from './cloudShader';
import { createCloudNoise } from './noiseTextures';
import { computeSkyLighting } from './sunLighting';

/** Everything that changes how the cloud looks, without touching the sim. All lengths in metres. */
export interface CloudLook {
  sigmaLiquid: number; // extinction at density 1, 1/m
  sigmaIce: number;
  sigmaRain: number;
  erosionLiquid: number; // 0..1, billow strength on liquid cloud
  erosionIce: number; // 0..1, keep low for smooth anvils
  iceStretch: [number, number, number]; // kept for preset / advanced compat
  phaseLiquid: [number, number]; // (forward g, backward g)
  phaseIce: [number, number];
  phaseRain: [number, number];
  backWeight: number;
  multiScatter: [number, number, number]; // kept for advanced compat (unused in cheap march)
  powder: number;
  powderLength: number;
  ambientStrength: number;
  ambientAtten: number;
  hazeDensity: number; // 1/m
  exposure: number;
  shapeTileMeters: number;
  detailTileMeters: number;
  stepSize: number;
  lodDistance: number;
  detailFade: [number, number];
  mammatusDepth: number;
  mammatusCell: number;
  shaftMax: number; // max shaft extinction, 1/km
  freezing: number;
  shadowProbes: number; // kept for advanced compat (unused — lighting is baked)
}

/**
 * Spotter-realism defaults: carved liquid towers, translucent ice, contrasty lighting.
 */
export const DEFAULT_LOOK: CloudLook = {
  sigmaLiquid: 0.012,
  sigmaIce: 0.0022,
  sigmaRain: 0.0024,
  erosionLiquid: 1.0,
  erosionIce: 0.48,
  iceStretch: [0.5, 2.6, 0.5],
  phaseLiquid: [0.8, 0.2],
  phaseIce: [0.75, 0.15],
  phaseRain: [0.85, 0.2],
  backWeight: 0.3,
  multiScatter: [0.5, 0.5, 0.5],
  powder: 0.9,
  powderLength: 750,
  ambientStrength: 0.7,
  ambientAtten: 1.05,
  // Extra turbidity on top of Koschmieder visibility from lodDistance.
  hazeDensity: 1.2e-5,
  exposure: 1.02,
  // Smaller tiles → readable cauliflower lobes from afar.
  shapeTileMeters: 4800,
  detailTileMeters: 1400,
  stepSize: 48,
  // Characteristic visibility (~28 km) — mid decks stay opaque longer.
  lodDistance: 28000,
  detailFade: [8000, 45000],
  mammatusDepth: 600,
  mammatusCell: 1600,
  shaftMax: 7,
  freezing: 4000,
  shadowProbes: 0,
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
  quality?: { maxSteps?: number };
}

const v2 = (a: [number, number]) => new THREE.Vector2(a[0], a[1]);
const v3 = (a: [number, number, number]) => new THREE.Vector3(a[0], a[1], a[2]);

/** 1×1×1 black 3D texture used until LightVolume is bound. */
function emptyLightVol(): THREE.Data3DTexture {
  const data = new Uint8Array(4);
  const tex = new THREE.Data3DTexture(data, 1, 1, 1);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export class VolumetricCloudMaterial extends THREE.ShaderMaterial {
  private look: CloudLook;
  private sunAzimuthDeg = 0;
  private sunElevationDeg = 45;
  private windDir = new THREE.Vector3(1, 0, 0);
  private windSpeed = 8; // m/s
  private boil = 1.5; // m/s upward drift of the noise
  private frame = 0;
  private readonly fallbackLight: THREE.Data3DTexture;

  constructor(opts: VolumetricCloudOptions) {
    const noise = createCloudNoise();
    const look: CloudLook = { ...DEFAULT_LOOK, ...opts.look };
    const q = opts.quality ?? {};
    const fallbackLight = emptyLightVol();

    super({
      vertexShader: cloudVertexShader,
      fragmentShader: cloudFragmentShader,
      defines: {
        MAX_STEPS: q.maxSteps ?? 256,
        FINE_STEP: "40.0",
        COARSE_STEP_MUL: "3.5",
      },
      uniforms: {
        uFields: { value: opts.fields },
        uFieldsPrev: { value: opts.fields },
        uVolumeMix: { value: 1 },
        uStepBudget: { value: q.maxSteps ?? 256 },
        uShapeNoise: { value: noise.shape },
        uDetailNoise: { value: noise.detail },
        uLightVol: { value: fallbackLight },
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
        uRainFallSpeed: { value: 14.0 },
        uRainWindShear: { value: new THREE.Vector3(0, 0, 0) },
        uMammatusDepth: { value: 0 },
        uMammatusCell: { value: 0 },
        uShaftMax: { value: 0 },
        uFreezing: { value: 0 },
        uShadowProbes: { value: 0 },
      },
      side: THREE.BackSide,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      depthTest: false,
    });

    this.fallbackLight = fallbackLight;
    this.look = look;
    this.setLook({});
    this.setSun(this.sunAzimuthDeg, this.sunElevationDeg);
    this.setWind(1, 0, this.windSpeed);
  }

  private u<T>(name: string): { value: T } {
    return this.uniforms[name] as { value: T };
  }

  /** Bind the GPU-baked sun OD / sky-visibility volume. */
  setLightVolume(tex: THREE.Texture | null): void {
    this.u<THREE.Texture>('uLightVol').value = tex ?? this.fallbackLight;
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
    this.u<number>('uMammatusDepth').value = l.mammatusDepth;
    this.u<number>('uMammatusCell').value = l.mammatusCell;
    this.u<number>('uShaftMax').value = l.shaftMax;
    this.u<number>('uFreezing').value = l.freezing;
    this.u<number>('uShadowProbes').value = 0;
  }

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

  setSunRelativeToCamera(camera: THREE.Camera, relativeAzimuthDeg: number, elevationDeg: number): void {
    const f = new THREE.Vector3();
    camera.getWorldDirection(f);
    const headingDeg = (Math.atan2(f.x, -f.z) * 180) / Math.PI;
    this.setSun(headingDeg + relativeAzimuthDeg, elevationDeg);
  }

  setWind(dirX: number, dirZ: number, speed: number): void {
    this.windDir.set(dirX, 0, dirZ).normalize();
    this.windSpeed = speed;
    this.u<THREE.Vector3>('uWindDir').value.copy(this.windDir);
  }

  setBoil(metresPerSecond: number): void {
    this.boil = metresPerSecond;
  }

  setFields(fields: THREE.Data3DTexture): void {
    this.u<THREE.Data3DTexture>('uFields').value = fields;
  }

  setFieldsPrev(fields: THREE.Data3DTexture): void {
    this.u<THREE.Data3DTexture>('uFieldsPrev').value = fields;
  }

  setVolumeMix(mix: number): void {
    this.u<number>('uVolumeMix').value = Math.min(1, Math.max(0, mix));
  }

  setStepBudget(steps: number): void {
    this.u<number>('uStepBudget').value = steps;
  }

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

  setSceneDepth(depth: THREE.Texture, camera: THREE.PerspectiveCamera, resolution: THREE.Vector2): void {
    this.u<THREE.Texture>('uSceneDepth').value = depth;
    this.u<THREE.Matrix4>('uInvProjection').value.copy(camera.projectionMatrixInverse);
    this.u<THREE.Matrix4>('uCameraWorld').value.copy(camera.matrixWorld);
    this.u<THREE.Vector2>('uResolution').value.copy(resolution);
  }

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

  update(timeSeconds: number): void {
    this.frame++;
    this.u<number>('uFrame').value = this.frame % 64;
    this.u<number>('uTime').value = timeSeconds;
    this.u<THREE.Vector3>('uNoiseOffset').value.set(
      -this.windDir.x * this.windSpeed * timeSeconds,
      this.boil * timeSeconds,
      -this.windDir.z * this.windSpeed * timeSeconds,
    );
    this.u<THREE.Vector3>('uRainWindShear').value.set(
      this.windDir.x * this.windSpeed * 0.001,
      0,
      this.windDir.z * this.windSpeed * 0.001,
    );
  }
}

export function createCloudMesh(material: VolumetricCloudMaterial, boxMin: THREE.Vector3, boxMax: THREE.Vector3): THREE.Mesh {
  const size = new THREE.Vector3().subVectors(boxMax, boxMin);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.copy(boxMin).addScaledVector(size, 0.5);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return mesh;
}
