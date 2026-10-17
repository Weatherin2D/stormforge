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
    look: { erosionLiquid: 0.65, erosionIce: 0.25, powder: 0.8 },
  },
  // Photos 2 and 4: mature Cb, smooth fibrous anvil, grey-blue underside
  B_matureAnvil: {
    description: 'Mature Cb, thin smooth anvil with striations, bluish shaded underside, hazy horizon',
    sunRelativeAzimuthDeg: 80,
    sunElevationDeg: 55,
    look: { erosionLiquid: 0.5, erosionIce: 0.2, iceStretch: [0.2, 0.6, 3.0], sigmaIce: 0.006, hazeDensity: 3e-5 },
  },
  // Photo 3: flat dark base, bright crisp top, rain shaft underneath
  C_flatBaseRain: {
    description: 'Congestus / early Cb with a flat dark base and a visible rain shaft; sun mostly behind the camera',
    sunRelativeAzimuthDeg: 150,
    sunElevationDeg: 30,
    look: { erosionLiquid: 0.7, sigmaRain: 0.015, ambientStrength: 0.6 },
  },
  // Photo 5: big turret with pileus wisp, dark base, strong side light
  D_towerPileus: {
    description: 'Growing tower with a pileus wisp, dark flat base, strong side light',
    sunRelativeAzimuthDeg: 95,
    sunElevationDeg: 35,
    look: { erosionLiquid: 0.7, powder: 0.9 },
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
