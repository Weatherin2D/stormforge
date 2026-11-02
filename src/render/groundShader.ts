/**
 * Ground surface + cloud-shadow injection for MeshStandardMaterial.
 * Land patterns match MeteoLAB (fields / steppe / city / water).
 * World units are metres; landPattern receives coordinates in km via uGroundSize.
 *
 * Cloud shadows come from a 2D map (uCloudShadow) built from the packed volume:
 * R = direct-sun transmittance, G = sky visibility. That avoids the MeteoLAB
 * light-volume axis/unit mismatch (km, Z-up texture) against Stormforge's
 * metre Y-up density texture.
 */

export const groundSurfacePars = /* glsl */`
uniform sampler2D uGround;
uniform sampler2D uWind;
uniform vec2 uGroundOffset;
uniform vec2 uGroundSize;
uniform float uSurface;
uniform sampler3D uNoise;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform vec3 uGrid;
const float GROUND_WATER = 16.0, WIND_SCALE = 40.0;
float gWater, gSnow, gHailDots, gSpec;

float hash2(vec2 k){ return fract(sin(dot(k, vec2(127.1, 311.7))) * 43758.5453); }

// One field of hail stones. radKm is the stone radius in kilometres; freq is the fraction of cells that hold a stone.
float hailOctave(vec2 q, float scale, float freq, float radKm, float salt){
  vec2 g = q * scale + salt;
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  float show = step(hash2(cell), freq);
  vec2 jitter = vec2(hash2(cell + 1.7), hash2(cell + 8.3)) - 0.5;
  float rad = radKm * scale * (0.75 + 0.45 * hash2(cell + 3.1));
  return show * smoothstep(rad, rad * 0.42, length(f - jitter * 0.7));
}

// freq (0–1) sets how many stones; size01 (0–1) sets how large each stone is.
// The lattice is fixed in kilometres, so stones stay where they fell. A higher
// frequency only fills empty sites, and size only grows the stones already there.
float hailStones(vec2 q, float freq, float size01){
  if(freq < 0.004) return 0.0;
  float scale = 14.0;
  float blur = min(length(dFdx(q)), length(dFdy(q)));
  float radKm = max(mix(0.02, 0.12, clamp(size01, 0.0, 1.0)), blur * 0.55);
  float a = hailOctave(q, scale, freq, radKm, 0.0);
  float b = hailOctave(q, scale * 1.7, min(1.0, freq * 1.15), radKm * 0.62, 4.7);
  return clamp(a + b, 0.0, 1.0);
}

// Normalised ground UV (0..1 over the domain) plus sliding offset.
vec2 groundAt(vec3 p){
  vec3 s = uBoxMax - uBoxMin;
  return vec2((p.x - uBoxMin.x) / s.x, (uBoxMax.z - p.z) / s.z) + 0.5 / uGrid.xy + uGroundOffset;
}

// Brightness of the land's pattern relative to its mean (1), at q km.
vec3 landPattern(vec2 q, float blur){
  vec3 n = texture(uNoise, vec3(q * 0.09, 0.31)).rgb;
  float mottle = 0.85 + 0.3 * n.g + 0.1 * (n.b - 0.5);
  if(uSurface > 2.5){
    vec2 b = q / 0.12, cell = floor(b), f = fract(b);
    float street = 1.0 - smoothstep(0.0, 0.08 + blur / 0.12, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    float r = hash2(cell);
    vec3 block = r < 0.12 ? vec3(0.75, 1.15, 0.7) : vec3(0.8 + 0.45 * r);
    return mix(mix(block, vec3(0.75), street * clamp(0.02 / blur, 0.0, 1.0)), vec3(1.0), smoothstep(0.03, 0.2, blur)) * mottle;
  }
  vec2 g = mat2(0.94, 0.34, -0.34, 0.94) * q / vec2(0.8, 0.5), cell = floor(g), f = fract(g);
  float r = hash2(cell), dry = uSurface > 0.5 ? 1.0 : 0.0;
  vec3 crop = r < 0.3 ? vec3(0.8, 0.92, 0.75) : r < 0.55 ? vec3(1.05, 1.12, 0.9) : r < 0.72 ? vec3(1.4, 1.25, 0.75) : r < 0.86 ? vec3(1.12, 0.86, 0.78) : vec3(0.95, 1.0, 0.95);
  crop = mix(vec3(1.0), crop, 0.7);
  crop = mix(crop, vec3(0.9 + 0.25 * r), dry * 0.7);
  float edge = 1.0 - smoothstep(0.0, 0.03, min(min(f.x, 1.0 - f.x) * 0.8, min(f.y, 1.0 - f.y) * 0.5));
  crop = mix(crop, vec3(0.7, 0.8, 0.65), edge * clamp(0.015 / blur, 0.0, 1.0));
  return mix(crop, vec3(1.0), smoothstep(0.2, 1.0, blur)) * mottle;
}
`;

/**
 * Cloud shade on the ground from uCloudShadow (R = sun transmittance, G = sky visibility).
 */
export const groundShadowPars = /* glsl */`
uniform sampler2D uCloudShadow;
varying vec3 vCloudWorld;

float sunThroughVis(float t){
  // Invert T≈exp(-od) soft two-stream: scattered light under cloud.
  float od = -log(max(t, 1e-3));
  return max(t, 1.0 / (1.0 + 1.7 * od));
}

// x: direct sun, y: sky light, z: scattered sunlight under cloud.
vec3 cloudShade(vec3 p){
  vec2 uv = groundAt(p);
  vec4 L = texture(uCloudShadow, uv);
  float sunVis = L.r;
  float skyVis = L.g;
  float scatter = max(0.0, sunThroughVis(sunVis) - sunVis);
  vec3 s = vec3(sunVis, mix(0.28, 1.0, skyVis), scatter);
  vec2 side = min(p.xz - uBoxMin.xz, uBoxMax.xz - p.xz);
  // Fade out over the last ~3 km so domain edges don't cast hard shadow walls.
  float fade = smoothstep(0.0, 3000.0, min(side.x, side.y));
  return mix(vec3(1.0, 1.0, 0.0), s, fade);
}
`;
