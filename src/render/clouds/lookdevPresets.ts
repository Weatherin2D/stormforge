import * as THREE from 'three';
import type { CloudLook, VolumetricCloudMaterial } from './VolumetricCloudMaterial';

/**
 * Starting points for matching the reference photos.
 *
 * The SHAPE of the storm comes from the sim, so these presets only set the sun geometry
 * (relative to the camera) and the appearance parameters. Tuned for Perlin-Worley carve
 * + baked-light march (spotter realism).
 */
export interface LookdevPreset {
  description: string;
  sunRelativeAzimuthDeg: number; // 0 = sun ahead (back-lit), 90 = side-lit, 180 = sun behind camera
  sunElevationDeg: number;
  look: Partial<CloudLook>;
}

export const LOOKDEV_PRESETS: Record<string, LookdevPreset> = {
  A_towerWithAnvil: {
    description: 'Side-lit congestus with a developing anvil; the anvil shadows the tower below it',
    sunRelativeAzimuthDeg: 100,
    sunElevationDeg: 45,
    look: {
      erosionLiquid: 1.0,
      erosionIce: 0.55,
      powder: 0.9,
      sigmaLiquid: 0.009,
      ambientStrength: 0.78,
      exposure: 0.96,
    },
  },
  B_matureAnvil: {
    description: 'Mature Cb, thin smooth anvil with striations, bluish shaded underside, hazy horizon',
    sunRelativeAzimuthDeg: 80,
    sunElevationDeg: 55,
    look: {
      erosionLiquid: 0.95,
      erosionIce: 0.4,
      iceStretch: [0.2, 0.6, 3.0],
      sigmaIce: 0.0022,
      hazeDensity: 1.4e-5,
      ambientStrength: 0.72,
      powder: 0.85,
      exposure: 0.95,
    },
  },
  C_flatBaseRain: {
    description: 'Congestus / early Cb with a flat dark base and a visible rain shaft; sun mostly behind the camera',
    sunRelativeAzimuthDeg: 150,
    sunElevationDeg: 30,
    look: {
      erosionLiquid: 1.0,
      sigmaRain: 0.0035,
      shaftMax: 10,
      ambientStrength: 0.62,
      sigmaLiquid: 0.0095,
      powder: 0.88,
      exposure: 0.94,
    },
  },
  D_towerPileus: {
    description: 'Growing tower with a pileus wisp, dark flat base, strong side light',
    sunRelativeAzimuthDeg: 95,
    sunElevationDeg: 35,
    look: {
      erosionLiquid: 1.0,
      powder: 0.92,
      sigmaLiquid: 0.009,
      ambientStrength: 0.75,
      exposure: 0.96,
    },
  },
  E_afternoonHighDeck: {
    description:
      'Soft high overcast at mid-afternoon AEST: fibrous ice sheet, milky fill light, thin drizzle shafts',
    sunRelativeAzimuthDeg: 120,
    sunElevationDeg: 47,
    look: {
      sigmaLiquid: 0.005,
      sigmaIce: 0.0012,
      erosionLiquid: 0.65,
      erosionIce: 0.38,
      iceStretch: [0.35, 1.2, 2.2],
      powder: 0.7,
      ambientStrength: 0.95,
      ambientAtten: 0.85,
      hazeDensity: 1.2e-5,
      sigmaRain: 0.0012,
      shaftMax: 4.0,
      exposure: 0.98,
    },
  },
};

export function applyLookdevPreset(
  material: VolumetricCloudMaterial,
  camera: THREE.Camera,
  name: keyof typeof LOOKDEV_PRESETS,
): void {
  const p = LOOKDEV_PRESETS[name];
  material.setLook(p.look);
  material.setSunRelativeToCamera(camera, p.sunRelativeAzimuthDeg, p.sunElevationDeg);
}
