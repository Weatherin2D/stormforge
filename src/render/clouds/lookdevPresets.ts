import * as THREE from 'three';
import type { CloudLook, VolumetricCloudMaterial } from './VolumetricCloudMaterial';

/**
 * Starting points for matching the reference photos.
 *
 * The SHAPE of the storm comes from the sim, so these presets only set the sun geometry
 * (relative to the camera) and the appearance parameters. The sun values are read by eye
 * from the photos; treat them as first guesses and tune against a side-by-side.
 */
export interface LookdevPreset {
  description: string;
  sunRelativeAzimuthDeg: number; // 0 = sun ahead (back-lit), 90 = side-lit, 180 = sun behind camera
  sunElevationDeg: number;
  look: Partial<CloudLook>;
}

export const LOOKDEV_PRESETS: Record<string, LookdevPreset> = {
  // Photo 1: sunlit cauliflower tower with an anvil spreading above and shadowing it
  A_towerWithAnvil: {
    description: 'Side-lit congestus with a developing anvil; the anvil shadows the tower below it',
    sunRelativeAzimuthDeg: 100,
    sunElevationDeg: 45,
    look: { erosionLiquid: 1.0, erosionIce: 1.0, powder: 0.8 },
  },
  // Photos 2 and 4: mature Cb, smooth fibrous anvil, grey-blue underside
  B_matureAnvil: {
    description: 'Mature Cb, thin smooth anvil with striations, bluish shaded underside, hazy horizon',
    sunRelativeAzimuthDeg: 80,
    sunElevationDeg: 55,
    look: { erosionLiquid: 1.0, erosionIce: 1.0, iceStretch: [0.2, 0.6, 3.0], sigmaIce: 0.006, hazeDensity: 3e-5 },
  },
  // Photo 3: flat dark base, bright crisp top, rain shaft underneath
  C_flatBaseRain: {
    description: 'Congestus / early Cb with a flat dark base and a visible rain shaft; sun mostly behind the camera',
    sunRelativeAzimuthDeg: 150,
    sunElevationDeg: 30,
    look: { erosionLiquid: 1.0, sigmaRain: 0.015, ambientStrength: 0.6 },
  },
  // Photo 5: big turret with pileus wisp, dark base, strong side light
  D_towerPileus: {
    description: 'Growing tower with a pileus wisp, dark flat base, strong side light',
    sunRelativeAzimuthDeg: 95,
    sunElevationDeg: 35,
    look: { erosionLiquid: 1.0, powder: 0.9 },
  },
  // Sydney 2 Nov 2026 ~15:00 AEST — optional soft high deck (not the default).
  E_afternoonHighDeck: {
    description:
      'Soft high overcast at mid-afternoon AEST: fibrous ice sheet, milky fill light, thin drizzle shafts',
    sunRelativeAzimuthDeg: 120,
    sunElevationDeg: 47,
    look: {
      sigmaLiquid: 0.0022,
      sigmaIce: 0.0005,
      erosionLiquid: 0.7,
      erosionIce: 0.4,
      iceStretch: [0.35, 1.2, 2.2],
      powder: 0.75,
      ambientStrength: 1.15,
      ambientAtten: 0.85,
      hazeDensity: 2.2e-5,
      sigmaRain: 0.001,
      shaftMax: 4.0,
      exposure: 1.02,
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
