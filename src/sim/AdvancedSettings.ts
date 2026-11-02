/**
 * Live advanced settings: declarative slider registry + mutable store.
 * Defaults are 1.0 for multipliers so physics match the pre-settings baseline.
 * Values persist under SavedView.advanced (optional / additive).
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
  { id: "exposure", category: "display", label: "Exposure", min: 0.4, max: 2.5, step: 0.05, default: 1.05, decimals: 2 },
  { id: "hazeDensity", category: "display", label: "Haze density", min: 0, max: 8e-5, step: 1e-6, default: 1.5e-5, decimals: 6 },
  { id: "ambientStrength", category: "display", label: "Ambient light", min: 0.2, max: 2, step: 0.05, default: 0.9, decimals: 2 },
  { id: "ambientAtten", category: "display", label: "Ambient atten", min: 0.2, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "powder", category: "display", label: "Powder sugar", min: 0, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "powderLength", category: "display", label: "Powder length", min: 200, max: 4000, step: 50, default: 1500, unit: "m", decimals: 0 },
  { id: "stepSize", category: "display", label: "Ray step size", min: 8, max: 96, step: 1, default: 32, unit: "m", decimals: 0 },
  { id: "lodDistance", category: "display", label: "LOD distance", min: 4000, max: 40000, step: 500, default: 14000, unit: "m", decimals: 0 },
  { id: "detailFadeNear", category: "display", label: "Detail near", min: 1000, max: 12000, step: 250, default: 4500, unit: "m", decimals: 0 },
  { id: "detailFadeFar", category: "display", label: "Detail far", min: 8000, max: 50000, step: 500, default: 24000, unit: "m", decimals: 0 },
  { id: "shadowProbes", category: "display", label: "Shadow probes", min: 0, max: 2, step: 1, default: 2, decimals: 0 },
  { id: "dropletOpacity", category: "display", label: "Droplet opacity", min: 0.1, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "dropletSize", category: "display", label: "Droplet size", min: 0.4, max: 2.5, step: 0.05, default: 1, decimals: 2 },
  { id: "fogStrength", category: "display", label: "Fog strength", min: 0, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "groundBrightness", category: "display", label: "Ground bright", min: 0.4, max: 1.8, step: 0.05, default: 1, decimals: 2 },

  // Clouds
  { id: "sigmaIce", category: "clouds", label: "Ice extinction", min: 0.00005, max: 0.003, step: 0.00005, default: 0.00055, decimals: 5 },
  { id: "mammatusDepth", category: "clouds", label: "Mammatus depth", min: 0, max: 2000, step: 50, default: 600, unit: "m", decimals: 0 },
  { id: "mammatusCell", category: "clouds", label: "Mammatus cell", min: 400, max: 4000, step: 50, default: 1600, unit: "m", decimals: 0 },
  { id: "shaftMax", category: "clouds", label: "Shaft max", min: 0, max: 20, step: 0.5, default: 6, decimals: 1 },
  { id: "iceStretchX", category: "clouds", label: "Ice stretch X", min: 0.2, max: 2, step: 0.05, default: 0.55, decimals: 2 },
  { id: "iceStretchY", category: "clouds", label: "Ice stretch Y", min: 0.5, max: 6, step: 0.1, default: 2.8, decimals: 1 },
  { id: "iceStretchZ", category: "clouds", label: "Ice stretch Z", min: 0.2, max: 2, step: 0.05, default: 0.55, decimals: 2 },
  { id: "phaseLiquidFwd", category: "clouds", label: "Liquid phase fwd", min: 0.2, max: 0.95, step: 0.01, default: 0.75, decimals: 2 },
  { id: "phaseLiquidBack", category: "clouds", label: "Liquid phase back", min: 0.05, max: 0.6, step: 0.01, default: 0.15, decimals: 2 },
  { id: "backWeight", category: "clouds", label: "Backscatter", min: 0, max: 1, step: 0.02, default: 0.3, decimals: 2 },
  { id: "multiScatterA", category: "clouds", label: "Multi-scatter A", min: 0.1, max: 1, step: 0.05, default: 0.5, decimals: 2 },
  { id: "multiScatterB", category: "clouds", label: "Multi-scatter B", min: 0.1, max: 1, step: 0.05, default: 0.5, decimals: 2 },
  { id: "multiScatterC", category: "clouds", label: "Multi-scatter C", min: 0.1, max: 1, step: 0.05, default: 0.5, decimals: 2 },
  { id: "cloudSoftness", category: "clouds", label: "Cloud softness", min: 0.4, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "anvilOpacity", category: "clouds", label: "Anvil opacity", min: 0.3, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "rainShaftOpacity", category: "clouds", label: "Rain shaft opacity", min: 0.2, max: 2.5, step: 0.05, default: 1, decimals: 2 },

  // Fluid
  { id: "vorticityBoost", category: "fluid", label: "Vorticity boost", min: 0, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "buoyancyScale", category: "fluid", label: "Buoyancy", min: 0.4, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "viscosityScale", category: "fluid", label: "Viscosity", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "horizMixing", category: "fluid", label: "Horiz mixing", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "vertMixing", category: "fluid", label: "Vert mixing", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "divergenceDamp", category: "fluid", label: "Div. damping", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
  { id: "wDamping", category: "fluid", label: "W damping", min: 0, max: 2, step: 0.05, default: 1, decimals: 2 },
  { id: "spongeStrength", category: "fluid", label: "Sponge strength", min: 0.2, max: 3, step: 0.05, default: 1, decimals: 2 },
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

let store: AdvancedValues = defaultAdvancedValues();

export function getAdvanced(): AdvancedValues {
  return store;
}

export function setAdvanced(partial: Partial<AdvancedValues>): AdvancedValues {
  store = mergeAdvancedValues({ ...store, ...partial });
  return store;
}

export function replaceAdvanced(values: AdvancedValues): AdvancedValues {
  store = mergeAdvancedValues(values);
  return store;
}

export function resetAdvanced(): AdvancedValues {
  store = defaultAdvancedValues();
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
    shadowProbes: s.shadowProbes,
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
 * Build collapsible category sections of range inputs into `host`.
 * Calls `onChange(id, value)` whenever a slider moves.
 */
export function mountAdvancedSettingsUI(
  host: HTMLElement,
  onChange: (id: keyof AdvancedValues, value: number) => void,
): { syncFromStore: () => void } {
  host.replaceChildren();
  host.classList.add("advanced-settings");

  const byCat = new Map<SettingCategory, SettingDef[]>();
  for (const d of SETTING_DEFS) {
    const list = byCat.get(d.category) ?? [];
    list.push(d);
    byCat.set(d.category, list);
  }

  const inputs = new Map<keyof AdvancedValues, HTMLInputElement>();
  const labels = new Map<keyof AdvancedValues, HTMLElement>();

  for (const cat of Object.keys(CATEGORY_LABELS) as SettingCategory[]) {
    const defs = byCat.get(cat);
    if (!defs?.length) continue;
    const details = document.createElement("details");
    details.className = "menu-section";
    const summary = document.createElement("summary");
    summary.textContent = `${CATEGORY_LABELS[cat]} (${defs.length})`;
    details.appendChild(summary);
    const body = document.createElement("div");
    body.className = "menu-section-body cloud-tune advanced-tune";
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
        onChange(d.id, v);
      });
      label.append(name, input, val);
      body.appendChild(label);
      inputs.set(d.id, input);
      labels.set(d.id, val);
    }
    details.appendChild(body);
    host.appendChild(details);
  }

  const resetRow = document.createElement("div");
  resetRow.className = "advanced-reset-row";
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.textContent = "Reset advanced";
  resetBtn.title = "Restore all advanced sliders to defaults";
  resetBtn.addEventListener("click", () => {
    resetAdvanced();
    for (const d of SETTING_DEFS) {
      const input = inputs.get(d.id);
      const val = labels.get(d.id);
      if (input) input.value = String(store[d.id]);
      if (val) val.textContent = formatSettingValue(d, store[d.id]);
      onChange(d.id, store[d.id]);
    }
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
    },
  };
}
