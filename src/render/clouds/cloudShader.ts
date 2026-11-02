/**
 * Volumetric cloud shader, for THREE.ShaderMaterial on a WebGL2 renderer.
 * Written GLSL1-style (varying / gl_FragColor); Three converts it to GLSL ES 3.00, so sampler3D and textureLod are available.
 *
 * Draw it on a box that covers the sim domain, with side = BackSide. The fragment shader
 * raymarches from the camera through the box in world space.
 *
 * Inputs
 *   uFields       sim volume, spanning exactly [uBoxMin, uBoxMax]. R = cloud liquid, G = cloud ice/snow, B = rain, A = hail core.
 *                 uFieldGain scales each channel so that "very dense" is about 1.0.
 *   uShapeNoise   64^3 MeteoLAB value-noise octaves (R/G/B = periods 8/16/32)
 *   uDetailNoise  same cube (kept for uniform compatibility)
 *
 * Compile-time defines (set through material.defines, see VolumetricCloudMaterial):
 *   MAX_STEPS, LIGHT_STEPS, AMBIENT_STEPS, MS_OCTAVES
 *
 * World space is Y-up, all lengths in metres.
 */

export const cloudVertexShader = /* glsl */ `
varying vec3 vWorldPos;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const cloudFragmentShader = /* glsl */ `
#ifndef MAX_STEPS
#define MAX_STEPS 128
#endif
#ifndef LIGHT_STEPS
#define LIGHT_STEPS 6
#endif
#ifndef AMBIENT_STEPS
#define AMBIENT_STEPS 2
#endif
#ifndef MS_OCTAVES
#define MS_OCTAVES 4
#endif

varying vec3 vWorldPos;

uniform sampler3D uFields;
uniform sampler3D uShapeNoise;
uniform sampler3D uDetailNoise;

uniform vec3 uBoxMin;
uniform vec3 uBoxMax;

// lighting (linear RGB)
uniform vec3 uSunDir;      // unit vector pointing TOWARD the sun
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uHazeColor;

// medium
uniform vec3 uFieldGain;   // (liquid, ice, rain) sim value -> 0..1
uniform vec3 uSigma;       // extinction at density 1.0, per metre: (liquid, ice, rain)

// noise / shape
uniform vec3  uNoiseOffset;   // metres; scrolls the noise with wind and "boil"
uniform vec3  uWindDir;       // unit, horizontal
uniform float uShapeFreq;     // 1 / metres per shape-noise tile
uniform float uDetailFreq;    // 1 / metres per detail-noise tile
uniform float uErosionLiquid; // 0..1, how hard the billows bite into liquid cloud
uniform float uErosionIce;    // 0..1, kept low so anvils stay smooth
uniform vec3  uIceStretch;    // fibre noise frequency multipliers: (along wind, vertical, across wind)
uniform vec2  uDetailFade;    // (start, end) distance in metres where detail fades out

// marching
uniform float uStepSize;      // metres
uniform float uLodDistance;   // step size doubles every uLodDistance metres from the camera
uniform float uLightStep;     // metres, first sun-march step
uniform float uLightGrowth;   // step growth per sun-march sample (2.0 = doubling)
uniform float uAmbientStep;   // metres between ambient up/down samples
uniform float uFrame;

// light transport
uniform vec2  uPhaseLiquid;   // (forward g, backward g magnitude)
uniform vec2  uPhaseIce;
uniform vec2  uPhaseRain;
uniform float uBackWeight;    // weight of the backward lobe
uniform vec3  uMultiScatter;  // (a, b, c) per-octave attenuation of energy, extinction, anisotropy
uniform float uPowder;        // 0..1 strength of the dark-edge effect
uniform float uPowderLength;  // metres
uniform float uAmbientStrength;
uniform float uAmbientAtten;
uniform float uHazeDensity;   // 1 / metres
uniform float uExposure;

// scene depth (full-resolution texture, sampled with this pass's NDC)
uniform sampler2D uSceneDepth;
uniform mat4 uInvProjection;
uniform mat4 uCameraWorld;
uniform vec2 uResolution;

// up to four lightning flashes. amount 0 disables a slot.
uniform vec3 uFlashPos[4];
uniform vec3 uFlashColor[4];
uniform float uFlashAmt[4];
uniform float uTime;          // seconds, for scrolling rain streaks
uniform float uRainFallSpeed; // m/s, scroll rate of streak noise
uniform vec3  uRainWindShear; // horizontal drift per metre of height (lean)

// Mammatus pouches under the cloud base.
uniform float uMammatusDepth;   // max pouch depth below base, metres
uniform float uMammatusCell;    // pouch cell size, metres
// Precipitation shafts falling below cloud.
uniform float uShaftMax;        // max shaft extinction, 1/km
uniform float uFreezing;        // melting level height, metres
// Sub-grid shadow probes toward the sun (0 = off, 1 = one, 2 = two).
uniform float uShadowProbes;

const float PI = 3.14159265359;

// Distance along the view ray to the opaque scene. Sky (cleared depth) does not clip.
float groundDistance(vec3 ro, vec3 rd, float tFar) {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float depth = texture(uSceneDepth, uv).r;
  if (depth >= 0.9995) return tFar;
  vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 viewPos = uInvProjection * ndc;
  viewPos /= viewPos.w;
  vec4 world = uCameraWorld * viewPos;
  float tHit = dot(world.xyz - ro, rd);
  if (tHit <= 0.05) return tFar;
  return min(tFar, tHit);
}

vec3 flashLight(vec3 p) {
  vec3 flash = vec3(0.0);
  for (int f = 0; f < 4; f++) {
    float amt = uFlashAmt[f];
    if (amt <= 0.0) continue;
    vec3 d = p - uFlashPos[f];
    float d2 = dot(d, d);
    // Tighter falloff so a strike lights a local pocket, not the whole storm.
    float core = exp(-d2 / (2500.0 * 2500.0));
    float mid = exp(-d2 / (6000.0 * 6000.0));
    float wide = exp(-d2 / (11000.0 * 11000.0));
    flash += uFlashColor[f] * amt * (core + 0.55 * mid + 0.18 * wide);
  }
  return flash;
}

// ---------------------------------------------------------------- helpers

bool intersectBox(vec3 ro, vec3 rd, out float tNear, out float tFar) {
  // A zero component makes 1/rd infinite and the min/max NaN, which drops the pixel.
  vec3 inv = vec3(
    abs(rd.x) > 1e-6 ? 1.0 / rd.x : (rd.x < 0.0 ? -1e6 : 1e6),
    abs(rd.y) > 1e-6 ? 1.0 / rd.y : (rd.y < 0.0 ? -1e6 : 1e6),
    abs(rd.z) > 1e-6 ? 1.0 / rd.z : (rd.z < 0.0 ? -1e6 : 1e6)
  );
  vec3 t0 = (uBoxMin - ro) * inv;
  vec3 t1 = (uBoxMax - ro) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  tNear = max(max(tmin.x, tmin.y), max(tmin.z, 0.0));
  tFar  = min(min(tmax.x, tmax.y), tmax.z);
  return tFar > tNear;
}

bool insideBox(vec3 p) {
  return all(greaterThanEqual(p, uBoxMin)) && all(lessThanEqual(p, uBoxMax));
}

// interleaved gradient noise, used to jitter the ray start
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

// Henyey-Greenstein without the 1/(4pi), so an isotropic phase function is exactly 1.0
float hg(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * c, 1e-3), 1.5);
}

// two lobes: a strong forward lobe (silver lining) and a weak back lobe. s shrinks g per scattering octave.
float dualLobe(float c, vec2 g, float s) {
  return mix(hg(c, g.x * s), hg(c, -g.y * s), uBackWeight);
}

// MeteoLAB noise.ts octaves: lattice periods 1, 1/2, 1/4 in R,G,B. NOISE_TURN
// breaks the wallpaper repeat when looking down on a whole anvil.
const mat3 NOISE_TURN = mat3(
  0.5731, 0.7403, -0.3513,
  -0.6090, 0.6716, 0.4219,
  0.5483, -0.0279, 0.8358
);
vec3 octaves(vec3 x){ return textureLod(uShapeNoise, NOISE_TURN * x * 0.125, 0.0).rgb; }
float fbm(vec3 x){ return dot(octaves(x), vec3(0.55, 0.3, 0.15)); }

// Billow noise (|2n-1|): rounded lobes meeting in creases — cauliflower towers.
float billow(vec3 x){
  vec3 o = octaves(x);
  return abs(o.r * 2.0 - 1.0) * 0.6 + abs(o.g * 2.0 - 1.0) * 0.28 + o.b * 0.12;
}

// Rising billows. p is in km (MeteoLAB world units); w is km/s of updraught.
const float BILLOW_PERIOD = 240.0;
float risingBillow(vec3 pKm, float wKm){
  float a = fract(uTime / BILLOW_PERIOD), b = fract(uTime / BILLOW_PERIOD + 0.5);
  float rise = 0.5 * wKm * BILLOW_PERIOD;
  vec3 q = pKm * 0.9;
  return mix(
    billow(q - vec3(0.0, rise * a * 0.9, 0.0)),
    billow(q - vec3(0.0, rise * b * 0.9, 0.0) + vec3(5.2, 1.3, 7.9)),
    abs(2.0 * a - 1.0)
  );
}

// Soft 5-tap filter on the packed volume — breaks stair-stepped voxel faces
// before billow noise carves the cauliflower.
vec3 sampleFieldsSoft(vec3 uvw){
  ivec3 sz = textureSize(uFields, 0);
  vec3 texel = 1.0 / max(vec3(sz), vec3(1.0));
  vec3 sum = textureLod(uFields, uvw, 0.0).rgb;
  sum += textureLod(uFields, uvw + vec3(texel.x, 0.0, 0.0), 0.0).rgb;
  sum += textureLod(uFields, uvw - vec3(texel.x, 0.0, 0.0), 0.0).rgb;
  sum += textureLod(uFields, uvw + vec3(0.0, texel.y, 0.0), 0.0).rgb;
  sum += textureLod(uFields, uvw - vec3(0.0, texel.y, 0.0), 0.0).rgb;
  return max(sum * 0.2 * uFieldGain, vec3(0.0));
}

// Mammatus: rounded pouches hanging up to uMammatusDepth under the base of an anvil.
float mammaDensity(vec3 p, float anvilBase, float anvilPresence){
  if(anvilPresence < 0.02) return 0.0;
  float h = anvilBase - p.y;
  if(h < 0.0 || h > uMammatusDepth) return 0.0;
  vec2 q = p.xz / uMammatusCell;
  vec2 cell = floor(q);
  float reach = 0.0;
  for(int j = -1; j <= 1; j++) for(int i = -1; i <= 1; i++){
    vec2 k = cell + vec2(float(i), float(j));
    vec3 r = fract(sin(vec3(dot(k, vec2(127.1, 311.7)), dot(k, vec2(269.5, 183.3)), dot(k, vec2(419.2, 371.9)))) * 43758.5);
    float here = smoothstep(r.z * 0.8 + 0.1, r.z * 0.8 + 0.2, anvilPresence);
    reach = max(reach, (1.0 - smoothstep(0.1, 0.7, length(q - k - 0.5 - 0.35 * (r.xy - 0.5)))) * here);
  }
  reach *= uMammatusDepth;
  return smoothstep(0.0, 0.4, reach - h + 0.15) * 0.6;
}

// Precipitation shaft extinction (1/m): MeteoLAB curtains, uShaftMax in 1/km.
// Soft intensity gate so drizzle (~few dBZ) still draws a very transparent curtain.
float shaftDensity(vec3 p, float rain){
  if(rain <= 0.0) return 0.0;
  vec3 n = octaves(vec3(p.x * 0.0024, p.y * 0.00008 + uTime * 0.0009, p.z * 0.0024) + vec3(5.3, 0.0, 2.9));
  float streak = smoothstep(0.22, 0.7, n.g * 0.7 + n.b * 0.3);
  float gate = smoothstep(0.0, 0.4, rain * 55.0 + n.r * 0.35 - 0.08);
  float km = rain * uShaftMax * mix(0.35, 2.0, streak) * gate;
  return km * 0.001;
}

// Two-stream forward scatter through OD (MeteoLAB sunThrough, g≈0.85).
float sunThrough(float od){
  return max(exp(-od), 1.0 / (1.0 + 1.7 * od));
}

// MeteoLAB dual-lobe phase (relative to isotropic), k widens for MS octaves.
float mlPhase(float c, float k){
  return mix(hg(c, -0.15 * k), hg(c, 0.75 * k), 0.3);
}

// Wrenninge/Hillaire multi-scatter sunlight.
float sunlight(float od, vec3 phases){
  return phases.x * exp(-od) + phases.y * exp(-od * 0.5) + phases.z * exp(-od * 0.25);
}

// Rainbow / Alexander dark band (MeteoLAB rainPhase); angles in degrees from anti-solar.
const vec3 BOW1 = vec3(42.3, 41.5, 40.7);
const vec3 BOW2 = vec3(50.4, 51.6, 53.3);
vec3 rainPhase(float c){
  float a = degrees(acos(clamp(-c, -1.0, 1.0)));
  vec3 d1 = (a - BOW1) / 0.6;
  vec3 d2 = (a - BOW2) / 0.8;
  vec3 bow = 0.9 * exp(-0.5 * d1 * d1) + 0.35 * exp(-0.5 * d2 * d2);
  float back = mix(hg(c, 0.85), hg(c, -0.2), 0.15);
  float dark = 1.0 - 0.5 * smoothstep(41.0, 43.0, a) * (1.0 - smoothstep(49.0, 51.0, a));
  return vec3(back * dark) + bow;
}

// ---------------------------------------------------------------- medium

// Extinction per species at world position p, in 1/m: (liquid, ice, rain).
// detail in 0..1 blends the noise erosion in (0 = raw sim field, used for cheap light/ambient samples).
vec3 sampleSigma(vec3 p, float detail) {
  vec3 uvw = (p - uBoxMin) / (uBoxMax - uBoxMin);
  // Soft field sample when carving detail — raw for cheap light probes.
  vec3 f = detail > 0.01
    ? sampleFieldsSoft(uvw)
    : max(textureLod(uFields, uvw, 0.0).rgb * uFieldGain, vec3(0.0));
  float liq = f.x;
  float ice = f.y;
  float rain = f.z;

  // Estimate anvil base: the lowest height where ice is significant in this column.
  // Approximate by checking a few samples above the current point.
  float anvilBase = 0.0, anvilPresence = 0.0;
  if (ice > 0.002) {
    float iceAbove = 0.0;
    int steps = 0;
    for (int s = 1; s <= 6; s++) {
      vec3 up = p + vec3(0.0, float(s) * 500.0, 0.0);
      if (up.y < uBoxMax.y) {
        vec3 uvw2 = (up - uBoxMin) / (uBoxMax - uBoxMin);
        vec3 f2 = textureLod(uFields, uvw2, 0.0).rgb * uFieldGain;
        if (f2.y > 0.002) { iceAbove += f2.y; steps++; }
      }
    }
    if (steps > 0) {
      anvilPresence = min(1.0, iceAbove / float(steps));
      anvilBase = p.y + float(steps) * 500.0 * 0.5; // rough mid of ice layer
    }
  }

  if (detail > 0.01 && (liq + ice + rain) > 0.002) {
    // MeteoLAB cloudDensity — world coords in km. Stormforge packs liquid/ice/rain
    // separately; MeteoLAB packs combined cloud (R), updraught (B), ice share (A).
    // Map: base = liquid+ice, vigor from liquid (tower proxy), iceFrac from ice share.
    vec3 pk = (p + uNoiseOffset) * 0.001;
    float base = clamp(liq + ice, 0.0, 1.0);
    if (base >= 0.004) {
      float vigor = smoothstep(0.05, 0.4, liq);
      float iceFrac = smoothstep(0.5, 0.95, ice / max(liq + ice, 1e-3));
      iceFrac *= 1.0 - vigor;
      // Without a column-base map, erode sides/top fully (rise=1); flat base still
      // comes from the sim field itself.
      float rise = 1.0;
      float n = vigor + iceFrac < 1.0
        ? fbm(pk * 1.15 + vec3(0.0, -uTime * 0.0015, 0.0))
        : 0.0;
      if (vigor > 0.0) {
        // f.b * 0.02 in MeteoLAB (B = updraught 0..1 of 20 m/s → km/s).
        float tower = min(1.0, risingBillow(pk, vigor * 0.02) * 1.5);
        n = mix(n, tower, vigor);
      }
      if (iceFrac > 0.0) {
        n = mix(
          n,
          fbm(pk * vec3(0.55, 2.8, 0.55) + vec3(uTime * 0.0004, 0.0, 0.0)),
          iceFrac
        );
      }
      float erode =
        mix(mix(0.42, 0.62, vigor), 0.3, iceFrac) *
        mix(0.2, 1.0, rise) *
        mix(uErosionIce, uErosionLiquid, 1.0 - iceFrac) *
        detail;
      float d = base * 1.35 - (1.0 - n) * erode * (1.0 - base * 0.6);
      float carved = clamp(
        d * (1.0 + 4.0 * vigor) * mix(1.0, 0.75, iceFrac),
        0.0,
        1.0
      );
      float share = max(liq + ice, 1e-6);
      liq = carved * (liq / share);
      ice = carved * (ice / share);
    }

    // Mammatus under ice anvil (MeteoLAB mammaDensity).
    if (ice > 0.002 && anvilPresence > 0.02) {
      float mamma = mammaDensity(p, anvilBase, anvilPresence);
      ice = max(ice, mamma * 0.6);
    }

    // Rain: scrolling sheared streaks via the same value-noise octaves.
    if (rain > 0.0004) {
      float rainCore = smoothstep(0.002, 0.45, rain);
      rain = mix(rain, max(rain, rainCore * 0.35), 0.35);
      vec3 sheared = p + uNoiseOffset + uRainWindShear * (p.y - uBoxMin.y);
      vec3 pkR = sheared * 0.001;
      float streak = fbm(vec3(pkR.x * 1.8, pkR.y * 0.04 - uTime * 0.001 * uRainFallSpeed, pkR.z * 1.8));
      float edgeMask = 1.0 - rainCore;
      rain *= mix(1.0, mix(0.45, 1.4, streak), detail * (0.35 + 0.65 * edgeMask));
      float groundFade = 1.0 - smoothstep(0.0, 150.0, p.y - uBoxMin.y);
      rain += rainCore * groundFade * 0.35;
      rain = clamp(rain, 0.0, 1.0);
    }
  }

  // Domain-edge fade (MeteoLAB: cloud fades over last ~1 km to the side wall).
  vec2 side = min(p.xz - uBoxMin.xz, uBoxMax.xz - p.xz);
  float toWall = min(side.x, side.y);
  float cloudFade = smoothstep(250.0, 1250.0, toWall);
  float shaftFade = smoothstep(500.0, 4000.0, toWall);
  shaftFade *= shaftFade;

  vec3 sigma = vec3(liq, ice, rain) * uSigma;
  sigma.xy *= cloudFade;
  float shaft = shaftDensity(p, rain) * shaftFade;
  sigma.z += shaft;
  return sigma;
}

// ---------------------------------------------------------------- lighting

// Hail-core extinction. A is packed separately so a dense core is not eroded like anvil ice.
float hailSigma(vec3 p) {
  vec3 uvw = (p - uBoxMin) / (uBoxMax - uBoxMin);
  return max(textureLod(uFields, uvw, 0.0).a, 0.0) * uFieldGain.x;
}

// Optical depth from p toward the sun. Steps grow exponentially so the last sample is long
// enough to see an anvil far above the tower and let it shadow what is below.
float sunOpticalDepth(vec3 p) {
  float od = 0.0;
  float t = 0.0;
  float len = uLightStep;
  for (int i = 0; i < LIGHT_STEPS; i++) {
    vec3 sp = p + uSunDir * (t + 0.5 * len);
    if (!insideBox(sp)) break;
    vec3 s = sampleSigma(sp, i < 2 ? 1.0 : 0.0);
    od += (s.x + s.y + s.z + hailSigma(sp) * 1.8) * len;
    t += len;
    len *= uLightGrowth;
  }
  return od;
}

// Optical depth straight up (sky light) and straight down (ground bounce).
void ambientDepth(vec3 p, out float odUp, out float odDown) {
  odUp = 0.0;
  odDown = 0.0;
  for (int k = 1; k <= AMBIENT_STEPS; k++) {
    float h = float(k) * uAmbientStep;
    vec3 up = p + vec3(0.0, h, 0.0);
    vec3 dn = p - vec3(0.0, h, 0.0);
    if (up.y < uBoxMax.y) {
      vec3 s = sampleSigma(up, 0.0);
      odUp += (s.x + s.y + s.z + hailSigma(up) * 1.4) * uAmbientStep;
    }
    if (dn.y > uBoxMin.y) {
      vec3 s = sampleSigma(dn, 0.0);
      odDown += (s.x + s.y + s.z + hailSigma(dn) * 1.4) * uAmbientStep;
    }
  }
}

// ---------------------------------------------------------------- main

void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorldPos - ro);

  float tNear, tFar;
  if (!intersectBox(ro, rd, tNear, tFar)) discard;
  tFar = groundDistance(ro, rd, tFar);
  if (tFar <= tNear) discard;

  // Angle between sun and view ray. +1 = looking straight at the sun (forward scattering).
  float cosT = dot(rd, uSunDir);
  // MeteoLAB multi-scatter phase octaves + rainbow for liquid precip.
  vec3 phases = vec3(mlPhase(cosT, 1.0), 0.5 * mlPhase(cosT, 0.5), 0.25 * mlPhase(cosT, 0.25));
  vec3 rainPh = rainPhase(cosT);

  float pathLen = tFar - tNear;
  float baseStep = max(uStepSize, pathLen / float(MAX_STEPS));
  float t = tNear + baseStep * ign(gl_FragCoord.xy + uFrame * 5.588238);

  vec3 col = vec3(0.0);
  float T = 1.0;
  float distAcc = 0.0;
  float weightAcc = 0.0;
  float boxH = max(1.0, uBoxMax.y - uBoxMin.y);

  for (int i = 0; i < MAX_STEPS; i++) {
    if (t >= tFar || T < 0.02) break;

    float dt = baseStep * (1.0 + t / uLodDistance);
    vec3 p = ro + rd * t;

    // cheap empty-space probe: one fetch of the raw field, no noise
    vec3 uvw = (p - uBoxMin) / (uBoxMax - uBoxMin);
    vec4 field = textureLod(uFields, uvw, 0.0);
    vec3 probe = max(field.rgb * uFieldGain, vec3(0.0));
    float hailHere = max(field.a * uFieldGain.x, 0.0);
    if (probe.x + probe.y + probe.z + hailHere < 0.003) {
      t += dt * 2.0;
      continue;
    }

    float detail = 1.0 - smoothstep(uDetailFade.x, uDetailFade.y, t);
    vec3 sig = sampleSigma(p, detail);
    float cloudSig = sig.x + sig.y;
    float rainSig = sig.z;
    // Square the hail signal so only the dense core, not a thin veil, goes opaque.
    float hSig = hailHere * hailHere * 3.2;
    float sigT = cloudSig + rainSig + hSig;

    if (sigT > 1e-5) {
      float odSun = sunOpticalDepth(p);
      // Sub-grid shadow probes (MeteoLAB SHADOW_PROBE = 0.15 km → 150 m).
      if (uShadowProbes > 0.5 && cloudSig > 1e-5 && uSunDir.y > -0.1) {
        const float SHADOW_PROBE = 150.0;
        if (uShadowProbes > 1.5) {
          vec3 s1 = p + uSunDir * SHADOW_PROBE;
          vec3 s2 = p + uSunDir * (SHADOW_PROBE * 3.0);
          odSun += (sampleSigma(s1, 0.0).x + sampleSigma(s2, 0.0).x * 2.0) * SHADOW_PROBE;
        } else {
          vec3 s1 = p + uSunDir * (SHADOW_PROBE * 2.0);
          odSun += sampleSigma(s1, 0.0).x * 3.0 * SHADOW_PROBE;
        }
      }

      float powder = 1.0 - exp(-cloudSig * uPowderLength);
      powder = mix(0.6, 1.0, powder);
      float h = clamp((p.y - uBoxMin.y) / boxH * 1.3, 0.0, 1.0);

      float odUp, odDown;
      ambientDepth(p, odUp, odDown);
      // Sky visibility ≈ exp(-odUp). Floor is higher than MeteoLAB's 0.18 so storm
      // cores stay dark-grey (readable) instead of pure black voids.
      float skyVis = exp(-odUp * uAmbientAtten);
      vec3 ambientBottom = uGroundColor + uSunColor * sunThrough(odSun) * 0.15;
      vec3 ambient = mix(ambientBottom, uSkyColor, h) * mix(0.36, 1.0, skyVis) * uAmbientStrength;
      // Soft multi-scatter fill that never fully dies in deep OD.
      vec3 coreFill = (uSkyColor * 0.55 + uGroundColor * 0.45) * 0.14;

      // Cloud colour: MeteoLAB cloudCol mix.
      vec3 cloudCol = uSunColor * sunlight(odSun, phases) * powder * 0.55 + ambient * 0.9 + coreFill;

      // Shafts: liquid rain (rainbow) below freezing, snow-like phase above.
      float liquid = 1.0 - smoothstep(uFreezing - 300.0, uFreezing + 300.0, p.y - uBoxMin.y);
      vec3 precipPh = mix(vec3(phases.x), rainPh, liquid);
      vec3 rainCol = uSunColor * (exp(-odSun) * precipPh + sunThrough(odSun) - exp(-odSun)) * 0.55
                   + mix(ambient, vec3(dot(ambient, vec3(0.3, 0.5, 0.2))), 0.5) * 0.8
                   + coreFill * 0.5;

      vec3 flash = flashLight(p);
      cloudCol += flash;
      rainCol += flash * 0.4;

      // Inside cloud, droplets dominate; shafts show through where cloud is thin.
      vec3 S = mix(cloudCol, rainCol, rainSig / max(sigT, 1e-6));
      if (hSig > 1e-4) {
        vec3 hailCol =
          uSunColor * (exp(-odSun) * 0.55 + sunThrough(odSun) * 0.38) * vec3(0.80, 0.84, 0.90)
          + ambient * vec3(0.70, 0.75, 0.82)
          + vec3(0.04);
        S = mix(S, hailCol, clamp(hSig / max(sigT, 1e-4), 0.0, 0.92));
      }

      float stepT = exp(-sigT * dt);
      float w = T * (1.0 - stepT);
      col += S * w;
      distAcc += t * w;
      weightAcc += w;
      T *= stepT;
    }

    t += dt;
  }

  // Kill residual transmittance so the sun disc does not glow through dense cores.
  T *= smoothstep(0.02, 0.1, T);
  float alpha = 1.0 - T;
  if (alpha < 0.003) discard;

  vec3 straight = col / max(1.0 - T, 1e-4);
  float avgDist = distAcc / max(weightAcc, 1e-4);
  float haze = 1.0 - exp(-avgDist * uHazeDensity);
  straight = mix(straight, uHazeColor, haze) * uExposure;
  // Stronger highlight compress so silver linings / sunset rims don't clip to white.
  straight = straight / (vec3(1.0) + straight * 0.55);
  straight = max(straight, vec3(0.0));
  // Dither before tonemap so HalfFloat→display still looks smooth at night.
  float dn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float dm = fract(sin(dot(gl_FragCoord.xy + 19.19, vec2(12.9898, 78.233))) * 43758.5453);
  straight += (dn + dm - 1.0) / 255.0;

  gl_FragColor = vec4(straight, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb *= gl_FragColor.a; // premultiply for blending
}
`;
