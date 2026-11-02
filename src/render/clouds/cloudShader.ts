/**
 * Volumetric cloud shader, for THREE.ShaderMaterial on a WebGL2 renderer.
 * Written GLSL1-style (varying / gl_FragColor); Three converts it to GLSL ES 3.00, so sampler3D and textureLod are available.
 *
 * Draw it on a box that covers the sim domain, with side = BackSide. The fragment shader
 * raymarches from the camera through the box in world space.
 *
 * Inputs
 *   uFields       MeteoLAB volume: R cloud, G shafts, B updraught/20, A ice share.
 *                 uFieldGain scales channels so dense cores sit near 1.0.
 *   uColumns      2D column map: R rotation, G anvilBase×presence, B presence, A cloud base.
 *   uGrid         display volume size (nx, nz_up, ny) matching Data3DTexture.
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
uniform sampler2D uColumns;
uniform sampler3D uShapeNoise;
uniform sampler3D uDetailNoise;

uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform vec3 uGrid; // (nx, nz_up, ny) — Data3DTexture width/height/depth

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
uniform float uLodDistance;   // soft LOD scale (metres); growth is capped to avoid rings
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

// Distance along the view ray to the opaque scene (terrain, trees, …).
// Sky / cleared depth does not clip. Uses a 5-tap min so thin canopy edges
// still hide the volume instead of letting cloud bleed through.
float depthToHit(vec2 uv, vec3 ro, vec3 rd) {
  float depth = texture(uSceneDepth, uv).r;
  if (depth >= 0.9995) return 1e9;
  vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 viewPos = uInvProjection * ndc;
  viewPos /= max(viewPos.w, 1e-6);
  vec3 world = (uCameraWorld * viewPos).xyz;
  float tHit = dot(world - ro, rd);
  return tHit > 0.05 ? tHit : 1e9;
}

float groundDistance(vec3 ro, vec3 rd, float tFar) {
  vec2 uv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
  vec2 texel = 1.0 / max(uResolution, vec2(1.0));
  float tHit = depthToHit(uv, ro, rd);
  tHit = min(tHit, depthToHit(uv + vec2(texel.x, 0.0), ro, rd));
  tHit = min(tHit, depthToHit(uv - vec2(texel.x, 0.0), ro, rd));
  tHit = min(tHit, depthToHit(uv + vec2(0.0, texel.y), ro, rd));
  tHit = min(tHit, depthToHit(uv - vec2(0.0, texel.y), ro, rd));
  if (tHit > 1e8) return tFar;
  // Pull the clip a few metres toward the camera so opaque surfaces fully win.
  return min(tFar, max(tHit - 2.5, 0.0));
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

// Cell-centred volume: texel centres already sit at (k+0.5)/N of the box.
// Texture is Data3DTexture(nx, nz_up, ny) → uvw = (east, up, N→S).
vec3 toTex(vec3 p){
  vec3 s = max(uBoxMax - uBoxMin, vec3(1.0));
  return vec3(
    (p.x - uBoxMin.x) / s.x,
    (p.y - uBoxMin.y) / s.y,
    (p.z - uBoxMin.z) / s.z
  );
}
vec4 fieldsAll(vec3 p){
  vec4 raw = textureLod(uFields, toTex(p), 0.0);
  // Gain on cloud / shafts / updraught; ice share stays 0..1 as packed.
  return vec4(raw.rgb * uFieldGain, raw.a);
}
// Column map UV: east × N→S (volume's X and Z).
vec2 colUV(vec3 p){
  vec3 t = toTex(p);
  return vec2(t.x, t.z);
}

// Mammatus under anvil base from the column map (MeteoLAB mammaDensity).
float mammaDensity(vec3 p){
  vec3 c = texture2D(uColumns, colUV(p)).rgb;
  if(c.b < 0.02) return 0.0;
  float h = c.g / max(c.b, 1e-4) * 20000.0 - p.y; // ANVIL_BASE_SCALE metres
  if(h < 0.0 || h > uMammatusDepth) return 0.0;
  vec2 q = p.xz / uMammatusCell;
  vec2 cell = floor(q);
  float reach = 0.0;
  for(int j = -1; j <= 1; j++) for(int i = -1; i <= 1; i++){
    vec2 k = cell + vec2(float(i), float(j));
    vec3 r = fract(sin(vec3(dot(k, vec2(127.1, 311.7)), dot(k, vec2(269.5, 183.3)), dot(k, vec2(419.2, 371.9)))) * 43758.5);
    float here = smoothstep(r.z * 0.8 + 0.1, r.z * 0.8 + 0.2, c.b);
    reach = max(reach, (1.0 - smoothstep(0.1, 0.7, length(q - k - 0.5 - 0.35 * (r.xy - 0.5)))) * here);
  }
  reach *= uMammatusDepth;
  return smoothstep(0.0, 0.4, reach - h + 0.15) * 0.6;
}

float rotationAt(vec3 p){
  return smoothstep(0.3, 0.65, texture2D(uColumns, colUV(p)).r) *
    (1.0 - smoothstep(6000.0, 7500.0, p.y - uBoxMin.y));
}

// Exact MeteoLAB cloudDensity. p is metres; noise runs in km like MeteoLAB.
// f = fieldsAll (R cloud, B updraught 0..1 of 20 m/s, A ice share).
float cloudDensity(vec3 p, vec4 f){
  float base = f.r;
  if(base < 0.004) return 0.0;
  vec3 pk = p * 0.001;
  float cloudBase = texture2D(uColumns, colUV(p)).a * 10000.0; // BASE_SCALE
  float aboveKm = ((p.y - uBoxMin.y) - cloudBase) * 0.001;
  if(aboveKm < -0.2) return 0.0;
  float rise = smoothstep(0.0, 0.5, aboveKm);
  float under = smoothstep(-0.2, 0.15, aboveKm);
  float vigor = smoothstep(0.05, 0.4, f.b);
  float ice = smoothstep(0.5, 0.95, f.a);
  ice *= 1.0 - vigor;
  float n = vigor + ice < 1.0
    ? fbm(pk * 1.15 + vec3(0.0, -uTime * 0.0015, 0.0))
    : 0.0;
  if(vigor > 0.0){
    float spin = rotationAt(p);
    float tower = spin < 1.0 ? min(1.0, risingBillow(pk, f.b * 0.02) * 1.5) : 0.0;
    if(spin > 0.0) tower = mix(tower, 0.35 + 0.65 * fbm(pk * vec3(0.35, 3.2, 0.35)), spin);
    n = mix(n, tower, vigor);
  }
  if(ice > 0.0) n = mix(n, fbm(pk * vec3(0.55, 2.8, 0.55) + vec3(uTime * 0.0004, 0.0, 0.0)), ice);
  float erode = mix(mix(0.42, 0.62, vigor), 0.3, ice) * mix(0.2, 1.0, rise) *
    mix(uErosionIce, uErosionLiquid, 1.0 - ice);
  float d = base * 1.35 - (1.0 - n) * erode * (1.0 - base * 0.6);
  return clamp(d * (1.0 + 4.0 * vigor) * mix(1.0, 0.75, ice), 0.0, 1.0) * under;
}

// Precipitation shaft extinction (1/m): MeteoLAB curtains, uShaftMax in 1/km.
float shaftDensity(vec3 p, float rain){
  if(rain <= 0.0) return 0.0;
  vec3 pk = p * 0.001;
  vec3 n = octaves(vec3(pk.x * 2.4, pk.y * 0.08 + uTime * 0.0009, pk.z * 2.4) + vec3(5.3, 0.0, 2.9));
  float streak = smoothstep(0.3, 0.75, n.g * 0.7 + n.b * 0.3);
  float km = rain * uShaftMax * mix(0.15, 2.0, streak) * smoothstep(0.0, 0.5, rain * 12.0 + n.r - 0.5);
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

// Extinction per species at world position p, in 1/m: (liquid, ice, rain/shaft).
// detail>0 applies MeteoLAB billow carving; detail=0 is the raw packed field
// (cheap light / ambient probes).
vec3 sampleSigma(vec3 p, float detail) {
  vec4 f = fieldsAll(p);
  float cloud = f.r;
  float shaft = f.g;
  float iceShare = clamp(f.a, 0.0, 1.0);

  float carved = cloud;
  if (detail > 0.01 && cloud >= 0.004) {
    carved = cloudDensity(p, f);
  } else if (detail > 0.01) {
    carved = 0.0;
  }
  // Mammatus under anvil (only where the packed cloud is thin).
  float mamma = 0.0;
  if (detail > 0.01 && p.y > uBoxMin.y + 5000.0 && cloud < 0.004) {
    mamma = mammaDensity(p);
  }
  carved = max(carved, mamma);

  float liq = carved * (1.0 - iceShare);
  float ice = carved * iceShare;
  float rain = shaft;

  // Domain-edge fade (MeteoLAB: ~1 km to the side wall; shafts over ~3–4 km).
  vec2 side = min(p.xz - uBoxMin.xz, uBoxMax.xz - p.xz);
  float toWall = min(side.x, side.y);
  float cloudFade = smoothstep(250.0, 1250.0, toWall);
  float shaftFade = smoothstep(500.0, 4000.0, toWall);
  shaftFade *= shaftFade;

  vec3 sigma = vec3(liq, ice, 0.0) * uSigma;
  sigma.xy *= cloudFade;
  sigma.z += shaftDensity(p, rain) * shaftFade;
  return sigma;
}

// ---------------------------------------------------------------- lighting

// Former hail-core channel is now ice share — no separate hail extinction.
float hailSigma(vec3 p) {
  return 0.0;
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

  float pathLen = max(tFar - tNear, 1.0);
  // Fine steps stay near uStepSize. Do NOT inflate to pathLen/MAX_STEPS —
  // that made horizon rays use kilometre steps and miss thin decks as rings.
  float fineStep = max(uStepSize, 12.0);
  float coarseStep = max(fineStep * 2.5, min(pathLen / float(MAX_STEPS), fineStep * 6.0));
  float lodScale = max(uLodDistance, 4000.0);
  float jitter0 = ign(gl_FragCoord.xy + uFrame * 5.588238);
  float t = tNear + coarseStep * jitter0;
  bool inside = false;
  int clearRun = 0;

  vec3 col = vec3(0.0);
  float T = 1.0;
  float distAcc = 0.0;
  float weightAcc = 0.0;
  float boxH = max(1.0, uBoxMax.y - uBoxMin.y);

  for (int i = 0; i < MAX_STEPS; i++) {
    if (t >= tFar || T < 0.02) break;

    // Soft distance LOD, hard-capped so sample shells stay dense enough to
    // hit a flat cloud layer seen edge-on (the classic concentric rings).
    float lod = 1.0 + 0.28 * (t / lodScale);
    float dtNom = (inside ? fineStep : coarseStep) * lod;
    dtNom = min(dtNom, fineStep * 8.0);

    // Per-step jitter breaks coherent spherical shells around the camera.
    float j = ign(gl_FragCoord.xy + vec2(float(i) * 19.19 + uFrame * 7.1, float(i) * 3.7));
    float dt = dtNom;
    float tSample = t + (j - 0.5) * dtNom * 0.9;
    if (tSample < tNear) tSample = tNear;
    if (tSample > tFar) tSample = tFar;
    vec3 p = ro + rd * tSample;

    // MeteoLAB empty-space probe: packed cloud (R) or mammatus under anvil.
    vec4 field = fieldsAll(p);
    float mammaHere = p.y > uBoxMin.y + 5000.0 && field.r < 0.004
      ? mammaDensity(p) : 0.0;
    bool cloudy = field.r >= 0.004 || mammaHere > 0.0;
    float hailHere = 0.0;

    // MeteoLAB-style refine: step back into the slab with fine steps so a
    // distant thin deck is not skipped between coarse samples.
    if (!inside) {
      if (cloudy && coarseStep > fineStep * 1.05) {
        inside = true;
        clearRun = 0;
        t = max(tNear, t - coarseStep * 0.85);
        continue;
      }
      if (!cloudy) {
        t += dt * 1.75;
        continue;
      }
    } else if (!cloudy) {
      clearRun += 1;
      if (float(clearRun) * fineStep > coarseStep + fineStep) {
        inside = false;
      }
      t += dt;
      continue;
    } else {
      clearRun = 0;
    }

    float detail = 1.0 - smoothstep(uDetailFade.x, uDetailFade.y, tSample);
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

      // Integrate with the nominal step so jitter does not bias optical depth.
      float stepT = exp(-sigT * dtNom);
      float w = T * (1.0 - stepT);
      col += S * w;
      distAcc += tSample * w;
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
