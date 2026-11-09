/**
 * Live advanced settings: declarative slider + toggle registries and stores.
 * Slider defaults are 1.0 for multipliers so physics match the pre-settings baseline.
 * Values persist under SavedView.advanced / advancedToggles (optional / additive).
 */

export type SettingCategory =
  | "display"
  | "clouds"
  | "fluid"
  | "precip"
  | "microphysics"
  | "terrain"
  | "radiation"
  | "speed"
  | "lightning"
  | "storm";

export interface SettingDef {
  id: keyof AdvancedValues;
  category: SettingCategory;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** Short unit / suffix for the value readout. */
  unit?: string;
  decimals?: number;
}

export interface ToggleDef {
  id: keyof AdvancedToggles;
  category: SettingCategory;
  label: string;
  default: boolean;
  hint?: string;
}

/** Flat numeric bag consumed by sim + render. */
export interface AdvancedValues {
  // —— Display ——
  exposure: number;
  hazeDensity: number;
  ambientStrength: number;
  ambientAtten: number;
  powder: number;
  powderLength: number;
  stepSize: number;
  lodDistance: number;
  detailFadeNear: number;
  detailFadeFar: number;
  shadowProbes: number;
  dropletOpacity: number;
  dropletSize: number;
  fogStrength: number;
  groundBrightness: number;

  // —— Clouds (volumetric look) ——
  sigmaIce: number;
  mammatusDepth: number;
  mammatusCell: number;
  shaftMax: number;
  iceStretchX: number;
  iceStretchY: number;
  iceStretchZ: number;
  phaseLiquidFwd: number;
  phaseLiquidBack: number;
  backWeight: number;
  multiScatterA: number;
  multiScatterB: number;
  multiScatterC: number;
  cloudSoftness: number;
  anvilOpacity: number;
  rainShaftOpacity: number;

  // —— Fluid / velocity ——
  vorticityBoost: number;
  buoyancyScale: number;
  viscosityScale: number;
  horizMixing: number;
  vertMixing: number;
  divergenceDamp: number;
  wDamping: number;
  spongeStrength: number;
  coriolisScale: number;
  pressureRelax: number;
  advectionSharpness: number;
  /**
   * Quiet-air restore of θ/qv toward the initial sounding (hours).
   * Longer = slower; storms are left alone.
   */
  profileNudgeTau: number;
  /** Minimum qv as a fraction of the base-state qv0 outside heavy precip. */
  qvFloorFrac: number;
  /** Clear-sky Newtonian cooling toward θ0 (K/day). */
  clearSkyCooling: number;

  // —— Precipitation (visual particles) ——
  precipSpawn: number;
  rainFallVisual: number;
  snowFallVisual: number;
  precipWindDrag: number;
  meltDepth: number;
  rainSize: number;
  snowSize: number;
  precipStreak: number;

  // —— Microphysics (warm + cold rates) ——
  condRate: number;
  autocRate: number;
  qcrit: number;
  accrRate: number;
  evapCloud: number;
  evapRain: number;
  qcCap: number;
  rainFallPhys: number;
  iceAutoconvRate: number;
  iceAutoconvThresh: number;
  snowToGraupelRate: number;
  snowToGraupelThresh: number;
  hailGrowth: number;
  iceNucleation: number;
  rimingRate: number;
  meltingRate: number;

  // —— Terrain coupling ——
  terrainDrag: number;
  orographicLift: number;
  slopeWind: number;
  terrainTau: number;
  sstTau: number;
  soilMoistureFlux: number;
  vegMoistureFlux: number;
  roughnessVeg: number;
  leeWaveDepth: number;

  // —— Radiation / surface energy ——
  swHeating: number;
  lwLandCooling: number;
  lwWaterCooling: number;
  landAlbedo: number;
  waterAlbedo: number;
  evaporativeLand: number;
  evaporativeWater: number;
  airMassSoft: number;
  heatDepth: number;
  nightCoolBoost: number;
  slopeAspectGain: number;

  // —— Speed / cadence ——
  physicsPace: number;
  slowPhysicsCadence: number;
  radiationPace: number;
  microphysicsPace: number;
  cflSafety: number;

  // —— Lightning ——
  chargeRate: number;
  chargeCap: number;
  flashThreshold: number;
  flashDecay: number;
  anvilBias: number;
  boltBrightness: number;
  boltDuration: number;
  boltThickness: number;
  cgFraction: number;
  recombination: number;

  // —— Storm / forcing ——
  bubbleStrengthScale: number;
  bubbleRadiusScale: number;
  synopticForce: number;
  frontForce: number;
  followStormGain: number;
  coldPoolStrength: number;
  /** Nest box size when auto-spawned (fraction of parent domain). */
  nestAutoFrac: number;
  /** Mild per-run land heating mottling (±amp). 0 = perfectly uniform. */
  heatingNoiseAmp: number;
}

/** Boolean feature gates consumed by sim + render. */
export interface AdvancedToggles {
  // Display
  enableFog: boolean;
  enableShadowProbes: boolean;
  enablePowder: boolean;
  enableGroundFlash: boolean;
  enableCloudTAA: boolean;
  enableDepthOcclusion: boolean;
  enableSoftParticles: boolean;
  enableSkyHaze: boolean;

  // Clouds
  enableMammatus: boolean;
  enableRainShafts: boolean;
  enableIceFibres: boolean;
  enableMultiScatter: boolean;
  enableAnvilHighlight: boolean;

  // Fluid
  enableBuoyancy: boolean;
  /** @deprecated Ignored — vorticity confinement removed. Kept for old saves. */
  enableVorticity: boolean;
  enableSponge: boolean;
  /** Soft restore of quiet columns toward the init sounding. */
  enableProfileNudge: boolean;
  /** @deprecated Ignored — w-damping removed. Kept for old saves. */
  enableWDamping: boolean;
  enableRK2Advection: boolean;
  enableDivergenceDamp: boolean;

  // Precip visual
  enableRainParticles: boolean;
  enableSnowParticles: boolean;
  enableHailParticles: boolean;
  enablePrecipWind: boolean;
  enableVirga: boolean;

  // Microphysics
  enableWarmRain: boolean;
  enableColdMicro: boolean;
  enableHailProcess: boolean;
  enableIceNucleation: boolean;
  enableMelting: boolean;
  enableRiming: boolean;

  // Terrain
  enableTerrainDrag: boolean;
  enableOrographic: boolean;
  enableSlopeWinds: boolean;
  enableSoilMoisture: boolean;
  enableSST: boolean;
  enableBuriedReset: boolean;
  enableLeeWaves: boolean;

  // Radiation
  enableRadiation: boolean;
  enableSlopeAspect: boolean;
  enableBowenSplit: boolean;
  enableNightCooling: boolean;
  enableLandWaterContrast: boolean;
  /** @deprecated Ignored — replaced by gray longwave. Kept for old saves. */
  enableCloudTopCooling: boolean;
  /** @deprecated Ignored — replaced by K-profile PBL. Kept for old saves. */
  enableBLMixing: boolean;
  /** @deprecated Ignored — shallow-cu seeding removed. Kept for old saves. */
  enableShallowCu: boolean;

  // Speed (keys kept for old saves; solver ignores these)
  /** @deprecated Ignored. */
  enableSplitPhysics: boolean;
  /** @deprecated Ignored — CFL is always uncapped. */
  enableCFLClamp: boolean;
  /** @deprecated Ignored — physics pace no longer scales dt. */
  enablePhysicsPace: boolean;

  // Lightning
  enableLightning: boolean;
  enableCharge: boolean;
  enableCG: boolean;
  enableIC: boolean;
  enableSpider: boolean;
  enableSprites: boolean;
  enableAnvilLightning: boolean;

  // Storm
  enableSynoptic: boolean;
  enableFronts: boolean;
  enableColdPool: boolean;
  enableFollowStormGain: boolean;
  enableBubbleScale: boolean;
  /** Recenter the nest on the storm centroid (EMA). */
  enableNestFollow: boolean;
  /** Spawn a default nest when convection appears and none was drawn. */
  enableNestAutoSpawn: boolean;
}

export const CATEGORY_LABELS: Record<SettingCategory, string> = {
  display: "Display",
  clouds: "Clouds",
  fluid: "Fluid",
  precip: "Precip (visual)",
  microphysics: "Microphysics",
  terrain: "Terrain",
  radiation: "Radiation",
  speed: "Speed",
  lightning: "Lightning",
  storm: "Storm",
};

export const SETTING_DEFS: SettingDef[] = [
  // Display
  { id: "exposure", category: "display", label: "Exposure", min: 0.4, max: 2.5, step: 0.05, default: 1.08, decimals: 2 },
  { id: "hazeDensity", category: "display", label: "Haze density", min: 0, max: 8e-5, step: 1e-6, default: 1.8e-5, decimals: 6 },
  { id: "ambientStrength", category: "display", label: "Ambient light", min: 0.2, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "ambientAtten", category: "display", label: "Ambient atten", min: 0.2, max: 2.5, step: 0.05, default: 0.9, decimals: 2 },
  { id: "powder", category: "display", label: "Powder sugar", min: 0, max: 2, step: 0.05, default: 0.75, decimals: 2 },
  { id: "powderLength", category: "display", label: "Powder length", min: 200, max: 4000, step: 50, default: 1200, unit: "m", decimals: 0 },
  { id: "stepSize", category: "display", label: "Ray step size", min: 8, max: 96, step: 1, default: 40, unit: "m", decimals: 0 },
  { id: "lodDistance", category: "display", label: "Cloud view distance", min: 8000, max: 80000, step: 1000, default: 25000, unit: "m", decimals: 0 },
  { id: "detailFadeNear", category: "display", label: "Detail near", min: 1000, max: 20000, step: 250, default: 6000, unit: "m", decimals: 0 },
  { id: "detailFadeFar", category: "display", label: "Detail far", min: 8000, max: 80000, step: 500, default: 40000, unit: "m", decimals: 0 },
  { id: "shadowProbes", category: "display", label: "Shadow probes (unused)", min: 0, max: 2, step: 1, default: 0, decimals: 0 },
  { id: "dropletOpacity", category: "display", label: "Droplet opacity", min: 0.1, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "dropletSize", category: "display", label: "Droplet size", min: 0.4, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "fogStrength", category: "display", label: "Fog strength", min: 0, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "groundBrightness", category: "display", label: "Ground bright", min: 0.4, max: 1.8, step: 0.05, default: 1, decimals: 2 },

  // Clouds
  { id: "sigmaIce", category: "clouds", label: "Ice extinction", min: 0.00005, max: 0.004, step: 0.00005, default: 0.0018, decimals: 5 },
  { id: "mammatusDepth", category: "clouds", label: "Mammatus depth", min: 0, max: 2000, step: 50, default: 600, unit: "m", decimals: 0 },
  { id: "mammatusCell", category: "clouds", label: "Mammatus cell", min: 400, max: 4000, step: 50, default: 1600, unit: "m", decimals: 0 },
  { id: "shaftMax", category: "clouds", label: "Shaft max", min: 0, max: 20, step: 0.5, default: 7, decimals: 1 },
  { id: "iceStretchX", category: "clouds", label: "Ice stretch X", min: 0.2, max: 2, step: 0.05, default: 0.55, decimals: 2 },
  { id: "iceStretchY", category: "clouds", label: "Ice stretch Y", min: 0.5, max: 6, step: 0.1, default: 2.8, decimals: 1 },
  { id: "iceStretchZ", category: "clouds", label: "Ice stretch Z", min: 0.2, max: 2, step: 0.05, default: 0.55, decimals: 2 },
  { id: "phaseLiquidFwd", category: "clouds", label: "Liquid phase fwd", min: 0.2, max: 0.95, step: 0.01, default: 0.78, decimals: 2 },
  { id: "phaseLiquidBack", category: "clouds", label: "Liquid phase back", min: 0.05, max: 0.6, step: 0.01, default: 0.18, decimals: 2 },
  { id: "backWeight", category: "clouds", label: "Backscatter", min: 0, max: 1, step: 0.02, default: 0.28, decimals: 2 },
  { id: "multiScatterA", category: "clouds", label: "Multi-scatter A (unused)", min: 0.1, max: 1, step: 0.05, default: 0.5, decimals: 2 },
  { id: "multiScatterB", category: "clouds", label: "Multi-scatter B (unused)", min: 0.1, max: 1, step: 0.05, default: 0.5, decimals: 2 },
  { id: "multiScatterC", category: "clouds", label: "Multi-scatter C (unused)", min: 0.1, max: 1, step: 0.05, default: 0.5, decimals: 2 },
  { id: "cloudSoftness", category: "clouds", label: "Cloud softness", min: 0.4, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "anvilOpacity", category: "clouds", label: "Anvil opacity", min: 0.3, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "rainShaftOpacity", category: "clouds", label: "Rain shaft opacity", min: 0.2, max: 2.5, step: 0.05, default: 1, decimals: 2 },

  // Fluid
  { id: "vorticityBoost", category: "fluid", label: "Vorticity", min: 0, max: 5, step: 0.1, default: 0, decimals: 1 },
  { id: "buoyancyScale", category: "fluid", label: "Buoyancy", min: 0.4, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "viscosityScale", category: "fluid", label: "Viscosity", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "horizMixing", category: "fluid", label: "Horiz mixing", min: 0.2, max: 3, step: 0.05, default: 0.75, decimals: 2 },
  { id: "vertMixing", category: "fluid", label: "Vert mixing", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "divergenceDamp", category: "fluid", label: "Div. damping", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "wDamping", category: "fluid", label: "W damping", min: 0, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "spongeStrength", category: "fluid", label: "Sponge strength", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "profileNudgeTau", category: "fluid", label: "Profile restore (h)", min: 2, max: 24, step: 0.5, default: 12, decimals: 1 },
  { id: "qvFloorFrac", category: "fluid", label: "qv floor vs sounding", min: 0.05, max: 0.6, step: 0.05, default: 0.1, decimals: 2 },
  { id: "clearSkyCooling", category: "radiation", label: "Clear-sky cool (K/d)", min: 0, max: 4, step: 0.1, default: 1, decimals: 1 },
  { id: "heatingNoiseAmp", category: "radiation", label: "Heating mottling", min: 0, max: 0.25, step: 0.01, default: 0.12, decimals: 2 },
  { id: "coriolisScale", category: "fluid", label: "Coriolis", min: 0, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "pressureRelax", category: "fluid", label: "Pressure relax", min: 0.4, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "advectionSharpness", category: "fluid", label: "Advection sharp", min: 0.5, max: 1.5, step: 0.05, default: 1, decimals: 2 },

  // Precip visual
  { id: "precipSpawn", category: "precip", label: "Spawn rate", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "rainFallVisual", category: "precip", label: "Rain fall speed", min: 0.3, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "snowFallVisual", category: "precip", label: "Snow fall speed", min: 0.3, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "precipWindDrag", category: "precip", label: "Wind drag", min: 0.2, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "meltDepth", category: "precip", label: "Melt depth", min: 100, max: 2000, step: 50, default: 600, unit: "m", decimals: 0 },
  { id: "rainSize", category: "precip", label: "Rain size", min: 0.4, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "snowSize", category: "precip", label: "Snow size", min: 0.4, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "precipStreak", category: "precip", label: "Streak length", min: 0.4, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  // Microphysics
  { id: "condRate", category: "microphysics", label: "Condensation", min: 0.3, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "autocRate", category: "microphysics", label: "Autoconversion", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "qcrit", category: "microphysics", label: "Cloud→rain thresh", min: 0.3, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "accrRate", category: "microphysics", label: "Accretion", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "evapCloud", category: "microphysics", label: "Cloud evaporate", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "evapRain", category: "microphysics", label: "Rain evaporate", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "qcCap", category: "microphysics", label: "Cloud water cap", min: 0.4, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "rainFallPhys", category: "microphysics", label: "Rain fall (phys)", min: 0.4, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "iceAutoconvRate", category: "microphysics", label: "Ice→snow rate", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "iceAutoconvThresh", category: "microphysics", label: "Ice→snow thresh", min: 0.3, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "snowToGraupelRate", category: "microphysics", label: "Snow→graupel rate", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "snowToGraupelThresh", category: "microphysics", label: "Snow→graupel thresh", min: 0.3, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "hailGrowth", category: "microphysics", label: "Hail growth", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "iceNucleation", category: "microphysics", label: "Ice nucleation", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "rimingRate", category: "microphysics", label: "Riming", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "meltingRate", category: "microphysics", label: "Melting", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },

  // Terrain
  { id: "terrainDrag", category: "terrain", label: "Surface drag", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "orographicLift", category: "terrain", label: "Orographic lift", min: 0, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "slopeWind", category: "terrain", label: "Slope winds", min: 0, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "terrainTau", category: "terrain", label: "Terrain W τ", min: 0.3, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "sstTau", category: "terrain", label: "SST relax τ", min: 0.3, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "soilMoistureFlux", category: "terrain", label: "Soil moisture", min: 0, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "vegMoistureFlux", category: "terrain", label: "Veg moisture", min: 0, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "roughnessVeg", category: "terrain", label: "Veg roughness", min: 0.2, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "leeWaveDepth", category: "terrain", label: "Lee-wave depth", min: 0.4, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  // Radiation
  { id: "swHeating", category: "radiation", label: "SW heating", min: 0.2, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "lwLandCooling", category: "radiation", label: "LW land cool", min: 0.2, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "lwWaterCooling", category: "radiation", label: "LW water cool", min: 0.2, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "landAlbedo", category: "radiation", label: "Land albedo", min: 0.05, max: 0.45, step: 0.01, default: 0.18, decimals: 2 },
  { id: "waterAlbedo", category: "radiation", label: "Water albedo", min: 0.02, max: 0.2, step: 0.005, default: 0.06, decimals: 3 },
  { id: "evaporativeLand", category: "radiation", label: "Land evaporative", min: 0.2, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "evaporativeWater", category: "radiation", label: "Water evaporative", min: 0.2, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "airMassSoft", category: "radiation", label: "Air-mass soft", min: 0.05, max: 0.4, step: 0.01, default: 0.12, decimals: 2 },
  { id: "heatDepth", category: "radiation", label: "Heat depth", min: 0.4, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "nightCoolBoost", category: "radiation", label: "Night cool boost", min: 0.5, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "slopeAspectGain", category: "radiation", label: "Slope aspect", min: 0, max: 2, step: 0.05, default: 1, decimals: 2 },

  // Speed
  { id: "physicsPace", category: "speed", label: "Physics pace", min: 0.5, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "slowPhysicsCadence", category: "speed", label: "Slow phys cadence", min: 0.4, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "radiationPace", category: "speed", label: "Radiation pace", min: 0.4, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "microphysicsPace", category: "speed", label: "Microphys pace", min: 0.4, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "cflSafety", category: "speed", label: "CFL safety", min: 0.5, max: 1.5, step: 0.05, default: 1, decimals: 2 },

  // Lightning
  { id: "chargeRate", category: "lightning", label: "Charge rate", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "chargeCap", category: "lightning", label: "Charge cap", min: 10, max: 80, step: 1, default: 40, decimals: 0 },
  { id: "flashThreshold", category: "lightning", label: "Flash threshold", min: 0.15, max: 1.2, step: 0.01, default: 0.45, decimals: 2 },
  { id: "flashDecay", category: "lightning", label: "Flash decay τ", min: 60, max: 900, step: 15, default: 300, unit: "s", decimals: 0 },
  { id: "anvilBias", category: "lightning", label: "Anvil bias", min: 0, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "boltBrightness", category: "lightning", label: "Bolt brightness", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "boltDuration", category: "lightning", label: "Bolt duration", min: 0.3, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "boltThickness", category: "lightning", label: "Bolt thickness", min: 0.4, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "cgFraction", category: "lightning", label: "CG tendency", min: 0.2, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "recombination", category: "lightning", label: "Recombination", min: 0.3, max: 2.5, step: 0.05, default: 1, decimals: 2 },

  // Storm
  { id: "bubbleStrengthScale", category: "storm", label: "Bubble strength", min: 0.3, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "bubbleRadiusScale", category: "storm", label: "Bubble radius", min: 0.4, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "synopticForce", category: "storm", label: "Synoptic force", min: 0.2, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "frontForce", category: "storm", label: "Front force", min: 0.2, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "followStormGain", category: "storm", label: "Follow-storm gain", min: 0.2, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "coldPoolStrength", category: "storm", label: "Cold-pool strength", min: 0.2, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "nestAutoFrac", category: "storm", label: "Auto-nest size", min: 0.18, max: 0.4, step: 0.02, default: 0.28, decimals: 2 },
];

export const TOGGLE_DEFS: ToggleDef[] = [
  // Display
  { id: "enableFog", category: "display", label: "Atmospheric fog", default: true },
  { id: "enableShadowProbes", category: "display", label: "Cloud shadow probes (unused)", default: false, hint: "Lighting is baked into LightVolume; probes are not sampled." },
  { id: "enablePowder", category: "display", label: "Powder-sugar edges", default: true },
  { id: "enableGroundFlash", category: "display", label: "Ground CG flash", default: true },
  { id: "enableCloudTAA", category: "display", label: "Cloud temporal AA", default: true },
  { id: "enableDepthOcclusion", category: "display", label: "Depth occlusion", default: true },
  { id: "enableSoftParticles", category: "display", label: "Soft precip particles", default: true },
  { id: "enableSkyHaze", category: "display", label: "Sky haze", default: true },

  // Clouds
  { id: "enableMammatus", category: "clouds", label: "Mammatus pouches", default: true },
  { id: "enableRainShafts", category: "clouds", label: "Rain shafts", default: true },
  { id: "enableIceFibres", category: "clouds", label: "Ice fibre stretch", default: true },
  { id: "enableMultiScatter", category: "clouds", label: "Multi-scatter (unused)", default: false, hint: "Cheap march uses baked light; multi-scatter octaves removed." },
  { id: "enableAnvilHighlight", category: "clouds", label: "Anvil highlight", default: true },

  // Fluid
  { id: "enableBuoyancy", category: "fluid", label: "Buoyancy", default: true },
  { id: "enableSponge", category: "fluid", label: "Domain sponges", default: true },
  { id: "enableProfileNudge", category: "fluid", label: "Profile restore", default: true },
  { id: "enableRK2Advection", category: "fluid", label: "RK2 / MUSCL advection", default: true },
  { id: "enableDivergenceDamp", category: "fluid", label: "Divergence damping", default: true },

  // Precip
  { id: "enableRainParticles", category: "precip", label: "Rain particles", default: true },
  { id: "enableSnowParticles", category: "precip", label: "Snow particles", default: true },
  { id: "enableHailParticles", category: "precip", label: "Hail particles", default: true },
  { id: "enablePrecipWind", category: "precip", label: "Precip wind drift", default: true },
  { id: "enableVirga", category: "precip", label: "Virga / melt trail", default: true },

  // Microphysics
  { id: "enableWarmRain", category: "microphysics", label: "Warm-rain Kessler", default: true },
  { id: "enableColdMicro", category: "microphysics", label: "Cold microphysics", default: true },
  { id: "enableHailProcess", category: "microphysics", label: "Hail growth", default: true },
  { id: "enableIceNucleation", category: "microphysics", label: "Ice nucleation", default: true },
  { id: "enableMelting", category: "microphysics", label: "Melting", default: true },
  { id: "enableRiming", category: "microphysics", label: "Riming", default: true },

  // Terrain
  { id: "enableTerrainDrag", category: "terrain", label: "Surface drag", default: true },
  { id: "enableOrographic", category: "terrain", label: "Orographic lift", default: true },
  { id: "enableSlopeWinds", category: "terrain", label: "Slope winds", default: true },
  { id: "enableSoilMoisture", category: "terrain", label: "Soil moisture flux", default: true },
  { id: "enableSST", category: "terrain", label: "SST / water relax", default: true },
  { id: "enableBuriedReset", category: "terrain", label: "Buried-cell reset", default: true },
  { id: "enableLeeWaves", category: "terrain", label: "Lee-wave depth", default: true },

  // Radiation
  { id: "enableRadiation", category: "radiation", label: "Surface radiation", default: true },
  { id: "enableSlopeAspect", category: "radiation", label: "Slope / aspect sun", default: true },
  { id: "enableBowenSplit", category: "radiation", label: "Bowen evaporative split", default: true },
  { id: "enableNightCooling", category: "radiation", label: "Night LW cooling", default: true },
  { id: "enableLandWaterContrast", category: "radiation", label: "Land/water contrast", default: true },

  // Lightning
  { id: "enableLightning", category: "lightning", label: "Lightning flashes", default: true },
  { id: "enableCharge", category: "lightning", label: "Charge buildup", default: true },
  { id: "enableCG", category: "lightning", label: "Cloud-to-ground", default: true },
  { id: "enableIC", category: "lightning", label: "Intra-cloud", default: true },
  { id: "enableSpider", category: "lightning", label: "Spider lightning", default: true },
  { id: "enableSprites", category: "lightning", label: "Sprites / halo", default: true },
  { id: "enableAnvilLightning", category: "lightning", label: "Anvil-biased flashes", default: true },

  // Storm
  { id: "enableSynoptic", category: "storm", label: "Synoptic forcing", default: true },
  { id: "enableFronts", category: "storm", label: "Front forcing", default: true },
  { id: "enableColdPool", category: "storm", label: "Cold-pool loading", default: true },
  { id: "enableFollowStormGain", category: "storm", label: "Follow-storm gain", default: true },
  { id: "enableBubbleScale", category: "storm", label: "Bubble strength scale", default: true },
  { id: "enableNestFollow", category: "storm", label: "Follow storm (nest)", default: true },
  { id: "enableNestAutoSpawn", category: "storm", label: "Auto-spawn nest", default: false },
];

export function defaultAdvancedValues(): AdvancedValues {
  const out = {} as AdvancedValues;
  for (const d of SETTING_DEFS) out[d.id] = d.default;
  return out;
}

export function mergeAdvancedValues(
  partial?: Partial<AdvancedValues> | null,
): AdvancedValues {
  const base = defaultAdvancedValues();
  if (!partial) return base;
  for (const d of SETTING_DEFS) {
    const v = partial[d.id];
    if (typeof v === "number" && Number.isFinite(v)) {
      base[d.id] = Math.min(d.max, Math.max(d.min, v));
    }
  }
  return base;
}

export function formatSettingValue(def: SettingDef, value: number): string {
  const n = def.decimals ?? 2;
  const s = value.toFixed(n);
  return def.unit ? `${s}${def.unit}` : s;
}

export const ADVANCED_SETTING_COUNT = SETTING_DEFS.length;
export const ADVANCED_TOGGLE_COUNT = TOGGLE_DEFS.length;

/** Keys removed from the panel but still readable from old saves. */
const LEGACY_TOGGLE_DEFAULTS: Partial<AdvancedToggles> = {
  enableVorticity: false,
  enableWDamping: false,
  enableCloudTopCooling: false,
  enableBLMixing: false,
  enableShallowCu: false,
  enableSplitPhysics: false,
  enableCFLClamp: false,
  enablePhysicsPace: false,
};

export function defaultAdvancedToggles(): AdvancedToggles {
  const out = { ...LEGACY_TOGGLE_DEFAULTS } as AdvancedToggles;
  for (const d of TOGGLE_DEFS) out[d.id] = d.default;
  return out;
}

export function mergeAdvancedToggles(
  partial?: Partial<AdvancedToggles> | null,
): AdvancedToggles {
  const base = defaultAdvancedToggles();
  if (!partial) return base;
  for (const d of TOGGLE_DEFS) {
    const v = partial[d.id];
    if (typeof v === "boolean") base[d.id] = v;
  }
  // Preserve legacy keys from old saves without exposing them in the UI.
  for (const key of Object.keys(LEGACY_TOGGLE_DEFAULTS) as (keyof AdvancedToggles)[]) {
    const v = partial[key];
    if (typeof v === "boolean") base[key] = v;
  }
  return base;
}

let store: AdvancedValues = defaultAdvancedValues();
let toggleStore: AdvancedToggles = defaultAdvancedToggles();

export function getAdvanced(): AdvancedValues {
  return store;
}

export function getToggles(): AdvancedToggles {
  return toggleStore;
}

export function setAdvanced(partial: Partial<AdvancedValues>): AdvancedValues {
  store = mergeAdvancedValues({ ...store, ...partial });
  return store;
}

export function setToggles(partial: Partial<AdvancedToggles>): AdvancedToggles {
  toggleStore = mergeAdvancedToggles({ ...toggleStore, ...partial });
  return toggleStore;
}

export function replaceAdvanced(values: AdvancedValues): AdvancedValues {
  store = mergeAdvancedValues(values);
  return store;
}

export function replaceToggles(values: Partial<AdvancedToggles>): AdvancedToggles {
  toggleStore = mergeAdvancedToggles(values);
  return toggleStore;
}

export function resetAdvanced(): AdvancedValues {
  store = defaultAdvancedValues();
  toggleStore = defaultAdvancedToggles();
  return store;
}

/** Partial CloudLook derived from advanced display/cloud knobs. */
export function cloudLookFromAdvanced(
  s: AdvancedValues = store,
): Record<string, number | [number, number] | [number, number, number]> {
  return {
    exposure: s.exposure,
    hazeDensity: s.hazeDensity * s.fogStrength,
    ambientStrength: s.ambientStrength,
    ambientAtten: s.ambientAtten,
    powder: s.powder,
    powderLength: s.powderLength,
    stepSize: s.stepSize,
    lodDistance: s.lodDistance,
    detailFade: [s.detailFadeNear, s.detailFadeFar] as [number, number],
    shadowProbes: 0,
    sigmaIce: s.sigmaIce * s.anvilOpacity,
    mammatusDepth: s.mammatusDepth,
    mammatusCell: s.mammatusCell,
    shaftMax: s.shaftMax * s.rainShaftOpacity,
    iceStretch: [s.iceStretchX, s.iceStretchY, s.iceStretchZ] as [
      number,
      number,
      number,
    ],
    phaseLiquid: [s.phaseLiquidFwd, s.phaseLiquidBack] as [number, number],
    backWeight: s.backWeight,
    multiScatter: [s.multiScatterA, s.multiScatterB, s.multiScatterC] as [
      number,
      number,
      number,
    ],
  };
}

/**
 * Build collapsible category sections (toggles + sliders) into `host`.
 * Calls `onChange` whenever any control changes.
 */
export function mountAdvancedSettingsUI(
  host: HTMLElement,
  onChange: () => void,
): { syncFromStore: () => void } {
  host.replaceChildren();
  host.classList.add("advanced-settings");

  const byCat = new Map<SettingCategory, SettingDef[]>();
  for (const d of SETTING_DEFS) {
    const list = byCat.get(d.category) ?? [];
    list.push(d);
    byCat.set(d.category, list);
  }
  const togglesByCat = new Map<SettingCategory, ToggleDef[]>();
  for (const d of TOGGLE_DEFS) {
    const list = togglesByCat.get(d.category) ?? [];
    list.push(d);
    togglesByCat.set(d.category, list);
  }

  const inputs = new Map<keyof AdvancedValues, HTMLInputElement>();
  const labels = new Map<keyof AdvancedValues, HTMLElement>();
  const checks = new Map<keyof AdvancedToggles, HTMLInputElement>();

  for (const cat of Object.keys(CATEGORY_LABELS) as SettingCategory[]) {
    const defs = byCat.get(cat) ?? [];
    const toggles = togglesByCat.get(cat) ?? [];
    if (!defs.length && !toggles.length) continue;
    const details = document.createElement("details");
    details.className = "menu-section";
    const summary = document.createElement("summary");
    const nToggle = toggles.length;
    const nSlide = defs.length;
    summary.textContent = `${CATEGORY_LABELS[cat]} (${nToggle} toggles · ${nSlide} sliders)`;
    details.appendChild(summary);
    const body = document.createElement("div");
    body.className = "menu-section-body";

    if (toggles.length) {
      const toggleBox = document.createElement("div");
      toggleBox.className = "advanced-toggles";
      for (const d of toggles) {
        const label = document.createElement("label");
        label.className = "advanced-toggle";
        label.title = d.hint ?? d.id;
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = toggleStore[d.id];
        input.dataset.toggleId = d.id;
        const name = document.createElement("span");
        name.textContent = d.label;
        input.addEventListener("change", () => {
          toggleStore = { ...toggleStore, [d.id]: input.checked };
          onChange();
        });
        label.append(input, name);
        toggleBox.appendChild(label);
        checks.set(d.id, input);
      }
      body.appendChild(toggleBox);
    }

    if (defs.length) {
      const slideBox = document.createElement("div");
      slideBox.className = "cloud-tune advanced-tune";
      for (const d of defs) {
        const label = document.createElement("label");
        label.title = d.id;
        const name = document.createElement("span");
        name.className = "adv-name";
        name.textContent = d.label;
        const input = document.createElement("input");
        input.type = "range";
        input.min = String(d.min);
        input.max = String(d.max);
        input.step = String(d.step);
        input.value = String(store[d.id]);
        input.dataset.settingId = d.id;
        const val = document.createElement("span");
        val.className = "adv-val";
        val.textContent = formatSettingValue(d, store[d.id]);
        input.addEventListener("input", () => {
          const v = Number(input.value);
          store = { ...store, [d.id]: v };
          val.textContent = formatSettingValue(d, v);
          onChange();
        });
        label.append(name, input, val);
        slideBox.appendChild(label);
        inputs.set(d.id, input);
        labels.set(d.id, val);
      }
      body.appendChild(slideBox);
    }

    details.appendChild(body);
    host.appendChild(details);
  }

  const resetRow = document.createElement("div");
  resetRow.className = "advanced-reset-row";
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.textContent = "Reset advanced";
  resetBtn.title = "Restore all advanced toggles and sliders to defaults";
  resetBtn.addEventListener("click", () => {
    resetAdvanced();
    for (const d of SETTING_DEFS) {
      const input = inputs.get(d.id);
      const val = labels.get(d.id);
      if (input) input.value = String(store[d.id]);
      if (val) val.textContent = formatSettingValue(d, store[d.id]);
    }
    for (const d of TOGGLE_DEFS) {
      const input = checks.get(d.id);
      if (input) input.checked = toggleStore[d.id];
    }
    onChange();
  });
  resetRow.appendChild(resetBtn);
  host.appendChild(resetRow);

  return {
    syncFromStore: () => {
      for (const d of SETTING_DEFS) {
        const input = inputs.get(d.id);
        const val = labels.get(d.id);
        if (input) input.value = String(store[d.id]);
        if (val) val.textContent = formatSettingValue(d, store[d.id]);
      }
      for (const d of TOGGLE_DEFS) {
        const input = checks.get(d.id);
        if (input) input.checked = toggleStore[d.id];
      }
    },
  };
}
