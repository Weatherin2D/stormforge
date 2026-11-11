/**
 * Volumetric cloud shader — baked-light march with Perlin-Worley carving.
 *
 * Draw on a domain box (BackSide). The fragment raymarches the packed sim volume
 * and shades with uLightVol (R = 1-exp(-sunOd/8), G = sky visibility) instead of
 * nested sun/ambient marches.
 *
 * World space is Y-up, lengths in metres.
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
#define MAX_STEPS 256
#endif
#ifndef FINE_STEP
#define FINE_STEP 40.0
#endif
#ifndef COARSE_STEP_MUL
#define COARSE_STEP_MUL 3.5
#endif

varying vec3 vWorldPos;

uniform sampler3D uFields;
uniform sampler3D uFieldsPrev;
uniform float uVolumeMix;
uniform float uStepBudget;
uniform sampler3D uShapeNoise;
uniform sampler3D uDetailNoise;
uniform sampler3D uLightVol;

uniform vec3 uBoxMin;
uniform vec3 uBoxMax;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uHazeColor;

uniform vec3 uFieldGain;
uniform vec3 uSigma;

uniform vec3  uNoiseOffset;
uniform vec3  uWindDir;
uniform float uShapeFreq;
uniform float uDetailFreq;
uniform float uErosionLiquid;
uniform float uErosionIce;
uniform vec3  uIceStretch;
uniform vec2  uDetailFade;

uniform float uStepSize;
uniform float uLodDistance;
uniform float uFrame;

uniform vec2  uPhaseLiquid;
uniform float uBackWeight;
uniform float uPowder;
uniform float uPowderLength;
uniform float uAmbientStrength;
uniform float uAmbientAtten;
uniform float uHazeDensity;
uniform float uExposure;

uniform sampler2D uSceneDepth;
uniform mat4 uInvProjection;
uniform mat4 uCameraWorld;
uniform vec2 uResolution;

uniform vec3 uFlashPos[4];
uniform vec3 uFlashColor[4];
uniform float uFlashAmt[4];
uniform float uTime;
uniform float uRainFallSpeed;
uniform vec3  uRainWindShear;

uniform float uMammatusDepth;
uniform float uMammatusCell;
uniform float uShaftMax;
uniform float uFreezing;

const float PI = 3.14159265359;
const float LIGHT_OD_SCALE = 8.0;

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
  return min(tFar, max(tHit - 1.0, 0.0));
}

vec3 flashLight(vec3 p) {
  vec3 flash = vec3(0.0);
  for (int f = 0; f < 4; f++) {
    float amt = uFlashAmt[f];
    if (amt <= 0.0) continue;
    vec3 d = p - uFlashPos[f];
    float d2 = dot(d, d);
    // Wide fill so flashes light whole towers across the domain.
    float core = exp(-d2 / (4500.0 * 4500.0));
    float mid = exp(-d2 / (12000.0 * 12000.0));
    float wide = exp(-d2 / (28000.0 * 28000.0));
    flash += uFlashColor[f] * amt * (2.6 * core + 1.2 * mid + 0.4 * wide);
  }
  return flash;
}

bool intersectBox(
  vec3 ro,
  vec3 rd,
  vec3 bMin,
  vec3 bMax,
  out float tNear,
  out float tFar
) {
  vec3 inv = vec3(
    abs(rd.x) > 1e-6 ? 1.0 / rd.x : (rd.x < 0.0 ? -1e6 : 1e6),
    abs(rd.y) > 1e-6 ? 1.0 / rd.y : (rd.y < 0.0 ? -1e6 : 1e6),
    abs(rd.z) > 1e-6 ? 1.0 / rd.z : (rd.z < 0.0 ? -1e6 : 1e6)
  );
  vec3 t0 = (bMin - ro) * inv;
  vec3 t1 = (bMax - ro) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  tNear = max(max(tmin.x, tmin.y), max(tmin.z, 0.0));
  tFar  = min(min(tmax.x, tmax.y), tmax.z);
  return tFar > tNear;
}

float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

float hg(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * c, 1e-3), 1.5);
}

float dualLobe(float c, vec2 g) {
  return mix(hg(c, g.x), hg(c, -g.y), uBackWeight);
}

const mat3 NOISE_TURN = mat3(
  0.5731, 0.7403, -0.3513,
  -0.6090, 0.6716, 0.4219,
  0.5483, -0.0279, 0.8358
);

// Shape: R = Perlin-Worley, GBA = Worley billows (noiseTextures.ts).
vec4 shapeSample(vec3 pKm) {
  vec3 uvw = NOISE_TURN * (pKm * uShapeFreq) + uNoiseOffset * 0.00012;
  return textureLod(uShapeNoise, uvw, 0.0);
}

// Detail: RGB = Worley billows at increasing frequency.
vec3 detailSample(vec3 pKm) {
  vec3 uvw = NOISE_TURN * (pKm * uDetailFreq) + uNoiseOffset * 0.00035;
  return textureLod(uDetailNoise, uvw, 0.0).rgb;
}

float shapeFbm(vec4 s) {
  return s.r * 0.625 + s.g * 0.25 + s.b * 0.125;
}

float detailFbm(vec3 d) {
  return d.r * 0.625 + d.g * 0.25 + d.b * 0.125;
}

vec4 fieldTap(vec3 uvw) {
  vec4 cur = textureLod(uFields, uvw, 0.0);
  if (uVolumeMix >= 0.999) return cur;
  return mix(textureLod(uFieldsPrev, uvw, 0.0), cur, clamp(uVolumeMix, 0.0, 1.0));
}

float mammaDensity(vec3 p, float anvilBase, float anvilPresence){
  if(anvilPresence < 0.02 || uMammatusDepth < 1.0) return 0.0;
  float h = anvilBase - p.y;
  if(h < 0.0 || h > uMammatusDepth) return 0.0;
  vec2 q = p.xz / max(uMammatusCell, 1.0);
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

float shaftDensity(vec3 p, float rain){
  if(rain <= 0.0 || uShaftMax <= 0.0) return 0.0;
  vec3 n = detailSample(vec3(p.x * 0.001, p.y * 0.00004 + uTime * 0.0009, p.z * 0.001));
  float streak = smoothstep(0.22, 0.7, n.g * 0.7 + n.b * 0.3);
  float gate = smoothstep(0.0, 0.4, rain * 55.0 + n.r * 0.35 - 0.08);
  float km = rain * uShaftMax * mix(0.35, 2.0, streak) * gate;
  return km * 0.001;
}

float sunThrough(float od){
  return max(exp(-od), 1.0 / (1.0 + 1.7 * od));
}

// Realistic aerial perspective: Koschmieder visibility from uLodDistance,
// stronger toward the horizon and through low air, chromatic (blue fades first).
vec3 airBeta(vec3 rd, float midHeight) {
  float vis = max(uLodDistance, 8000.0);
  float beta0 = 3.2 / vis + uHazeDensity * 2.4;
  float elev = rd.y;
  float horizon = pow(1.0 - smoothstep(-0.04, 0.32, elev), 1.35);
  float heightFac = exp(-max(midHeight, 0.0) / 2400.0);
  float scale = mix(0.55, 1.55, horizon) * mix(0.65, 1.25, heightFac);
  return vec3(0.78, 1.0, 1.32) * (beta0 * scale);
}

// Distance fog shifts hue into haze without brightening far decks vs near ones.
vec3 aerialFog(vec3 col, vec3 rd, float dist, float midHeight) {
  vec3 beta = airBeta(rd, midHeight) * 0.7;
  float near = max(uLodDistance, 8000.0) * 0.12;
  float path = max(0.0, dist - near);
  float Tmean = exp(-dot(beta, vec3(0.333)) * path);
  float fogAmt = 1.0 - Tmean;
  vec3 inscatter = mix(uHazeColor, uSkyColor, 0.16 * clamp(rd.y * 2.0 + 0.15, 0.0, 1.0));
  // Match inscatter luminance to the cloud so fog does not act as a brightness boost.
  float cLum = max(dot(col, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  float fLum = max(dot(inscatter, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  inscatter *= cLum / fLum;
  return mix(col, inscatter, fogAmt * 0.55);
}

// Decode baked light: R encodes 1-exp(-od/8), G is sky visibility.
void bakedLight(vec3 uvw, out float odSun, out float skyVis) {
  vec4 L = textureLod(uLightVol, clamp(uvw, vec3(0.0), vec3(1.0)), 0.0);
  odSun = -LIGHT_OD_SCALE * log(max(1.0 - L.r, 1e-4));
  skyVis = clamp(L.g, 0.0, 1.0);
  if (L.r + L.g < 1e-4) {
    odSun = 0.15;
    skyVis = 0.72;
  }
}

/**
 * Schneider-style remap with multi-scale shape.
 * shapeCarve stays strong at all distances (afar cauliflower silhouette);
 * fineDetail (Worley micro) fades with range only.
 */
vec3 sampleSigma(vec3 p, float shapeCarve, float fineDetail) {
  vec3 uvw = (p - uBoxMin) / (uBoxMax - uBoxMin);
  vec3 f = max(fieldTap(uvw).rgb * uFieldGain, vec3(0.0));
  float liq = f.x;
  float ice = f.y;
  float rain = f.z;

  float anvilBase = 0.0, anvilPresence = 0.0;
  bool doMamma = fineDetail > 0.08 && ice > 0.002 && uMammatusDepth > 1.0;
  if (doMamma) {
    float iceAbove = 0.0;
    int steps = 0;
    for (int s = 1; s <= 4; s++) {
      vec3 up = p + vec3(0.0, float(s) * 500.0, 0.0);
      if (up.y < uBoxMax.y) {
        vec3 uvw2 = (up - uBoxMin) / (uBoxMax - uBoxMin);
        vec3 f2 = fieldTap(uvw2).rgb * uFieldGain;
        if (f2.y > 0.002) { iceAbove += f2.y; steps++; }
      }
    }
    if (steps > 0) {
      anvilPresence = min(1.0, iceAbove / float(steps));
      anvilBase = p.y + float(steps) * 250.0;
    }
  }

  if (shapeCarve > 0.02 && (liq + ice) > 0.002) {
    vec3 pk = p * 0.001;
    float base = clamp(liq + ice, 0.0, 1.0);
    float vigor = smoothstep(0.03, 0.32, liq);
    float iceFrac = smoothstep(0.4, 0.9, ice / max(liq + ice, 1e-3));
    iceFrac *= 1.0 - vigor;

    // Flat dark base, dense body, ragged cauliflower top.
    float hNorm = clamp((p.y - uBoxMin.y) / max(uBoxMax.y - uBoxMin.y, 1.0), 0.0, 1.0);
    float heightGrad = smoothstep(0.015, 0.1, hNorm) * (1.0 - 0.28 * smoothstep(0.68, 0.98, hNorm));

    // Coarse lobes (~2× tile) readable from afar + mid shape for towers.
    vec4 shapeLo = shapeSample(pk * 0.45);
    vec4 shape = shapeSample(pk);
    float lobes = shapeLo.g * 0.5 + shapeLo.b * 0.3 + shapeLo.a * 0.2;
    float sn = mix(shapeFbm(shape), lobes, 0.55);
    // Cauliflower billows — stronger on liquid towers.
    float billow = shape.g * 0.5 + shape.b * 0.32 + shape.a * 0.18;
    sn = mix(sn, max(sn, billow), mix(0.35, 0.85, vigor));
    if (vigor > 0.04) {
      float rise = fract(uTime * 0.0035 + pk.x * 0.06 + pk.z * 0.04);
      sn = mix(sn, billow, vigor * (0.55 + 0.25 * sin(rise * 6.28318)));
    }
    // Fibrous ice / anvil striations.
    if (iceFrac > 0.0) {
      vec3 iceUv = pk * uIceStretch + vec3(uTime * 0.00035, 0.0, 0.0);
      vec4 iceShape = shapeSample(iceUv);
      float fibrous = iceShape.r * 0.4 + iceShape.g * 0.35 + iceShape.b * 0.25;
      sn = mix(sn, fibrous, iceFrac * 0.9);
    }

    // Carve enough for cauliflower without erasing sparse decks to nothing.
    float erodeAmt =
      mix(mix(0.32, 0.72, vigor), 0.28, iceFrac) *
      mix(uErosionIce, uErosionLiquid, 1.0 - iceFrac) *
      shapeCarve;
    erodeAmt *= mix(0.55, 1.0, smoothstep(0.03, 0.3, base));
    erodeAmt = min(erodeAmt, 0.85);

    if (fineDetail > 0.1) {
      vec3 dn = detailSample(pk * mix(1.05, 1.4, vigor));
      float df = detailFbm(dn);
      float detailErode = mix(0.15, 0.45, vigor) * (1.0 - iceFrac * 0.7) * fineDetail;
      sn = mix(sn, sn * df, detailErode);
      erodeAmt *= mix(1.0, 1.15, fineDetail * (1.0 - df));
      erodeAmt = min(erodeAmt, 0.88);
    }

    float soft = mix(0.42, 0.18, vigor);
    float d = (base * heightGrad - (1.0 - sn) * erodeAmt) / max(1.0 - erodeAmt * soft, 0.08);
    d = clamp(d, 0.0, 1.0);
    // Keep a readable core for any liquid/ice so carve cannot blank the volume.
    float coreFloor = base * mix(0.35, mix(0.55, 0.22, iceFrac), mix(0.4, 1.0, vigor));
    d = max(d, coreFloor);
    d = clamp(d * (1.0 + 2.4 * vigor) * mix(1.0, 0.85, iceFrac), 0.0, 1.0);
    // Soft edge trim only — do not zero moderate density.
    d *= smoothstep(0.0, 0.04, d);

    float share = max(liq + ice, 1e-6);
    liq = d * (liq / share);
    ice = d * (ice / share);

    if (ice > 0.002 && anvilPresence > 0.02) {
      ice = max(ice, mammaDensity(p, anvilBase, anvilPresence) * 0.6);
    }
  }

  if (fineDetail > 0.08 && rain > 0.0004) {
    vec3 sheared = p + uRainWindShear * (p.y - uBoxMin.y);
    vec3 pkR = sheared * 0.001;
    float streak = detailFbm(detailSample(vec3(pkR.x * 1.6, pkR.y * 0.05 - uTime * 0.001 * uRainFallSpeed, pkR.z * 1.6)));
    rain *= mix(1.0, mix(0.45, 1.4, streak), fineDetail * 0.55);
    rain = clamp(rain, 0.0, 1.0);
  }

  vec2 side = min(p.xz - uBoxMin.xz, uBoxMax.xz - p.xz);
  float toWall = min(side.x, side.y);
  float cloudFade = smoothstep(250.0, 1250.0, toWall);
  float shaftFade = smoothstep(500.0, 4000.0, toWall);
  shaftFade *= shaftFade;

  vec3 sigma = vec3(liq, ice, rain) * uSigma;
  sigma.xy *= cloudFade;
  sigma.z += shaftDensity(p, rain) * shaftFade;
  return sigma;
}

float hailSigma(vec3 p) {
  vec3 uvw = (p - uBoxMin) / (uBoxMax - uBoxMin);
  return max(fieldTap(uvw).a, 0.0) * uFieldGain.x;
}

void main() {
  // Camera-relative march — absolute metres on continental domains (~1e7)
  // lose float precision and warp / glitter the volume.
  vec3 cam = cameraPosition;
  vec3 ro = vec3(0.0);
  vec3 rd = normalize(vWorldPos - cam);
  vec3 boxMin = uBoxMin - cam;
  vec3 boxMax = uBoxMax - cam;

  float tNear, tFar;
  if (!intersectBox(ro, rd, boxMin, boxMax, tNear, tFar)) discard;
  tFar = groundDistance(ro + cam, rd, tFar);
  if (tFar <= tNear) discard;

  float cosT = dot(rd, uSunDir);
  float phase = dualLobe(cosT, uPhaseLiquid);
  // View–sun angle terms for highlight lobes (forward / side / back).
  float towardSun = pow(max(cosT, 0.0), 5.0);
  float sideSun = pow(clamp(1.0 - abs(cosT), 0.0, 1.0), 1.6);
  float withSun = pow(max(-cosT, 0.0), 2.5);

  float budget = uStepBudget < 1.0 ? float(MAX_STEPS) : clamp(uStepBudget, 64.0, float(MAX_STEPS));
  float dtFine = max(uStepSize, FINE_STEP);
  float t = tNear + dtFine * 0.5 * ign(gl_FragCoord.xy + vec2(uFrame));

  vec3 col = vec3(0.0);
  float T = 1.0;
  float boxH = max(1.0, uBoxMax.y - uBoxMin.y);
  // 0 = deep night / blue hour, 1 = full day — drives ambient floors.
  float dayAmt = smoothstep(-0.08, 0.28, uSunDir.y);
  bool night = uSunDir.y < -0.02;
  // Only rewind after a real empty skip — not on the first cloudy sample.
  bool fromSkip = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    if (float(i) >= budget || t >= tFar || T < 0.01) break;
    // Hard invariant: remaining steps must be able to finish the ray, so far
    // decks / shafts are never dropped just because near air burned the budget.
    float left = max(budget - float(i), 1.0);
    float must = (tFar - t) / left;
    // Fine near the camera, coarser with range — still at least must-cover.
    float lodMul = mix(1.0, 8.0, smoothstep(600.0, 18000.0, t));
    float dtLod = max(dtFine * lodMul, must);
    float dtEmpty = max(dtLod * COARSE_STEP_MUL, must);

    vec3 pRel = ro + rd * t;
    vec3 p = pRel + cam;
    vec3 uvw = (pRel - boxMin) / max(boxMax - boxMin, vec3(1.0));
    vec4 field = fieldTap(uvw);
    vec3 probe = max(field.rgb * uFieldGain, vec3(0.0));
    float hailHere = max(field.a * uFieldGain.x, 0.0);
    float rawSum = probe.x + probe.y + probe.z + hailHere;
    bool cloudy = rawSum >= 0.0003;

    if (!cloudy) {
      fromSkip = true;
      t += dtEmpty;
      continue;
    }

    // Hit density after a coarse skip: rewind and resume with lod step.
    if (fromSkip) {
      t = max(tNear, t - max(dtEmpty - dtLod, dtFine));
      fromSkip = false;
      continue;
    }

    // Same carve/detail at every distance — close-up look from afar.
    vec3 sig = sampleSigma(p, 1.0, 1.0);
    float cloudSig = sig.x + sig.y;
    float rainSig = sig.z;
    float hSig = hailHere * hailHere * 3.2;
    float sigT = cloudSig + rainSig + hSig;

    // Carved-away density: treat as clear so we do not stall within ~1 km.
    if (sigT <= 1e-5) {
      fromSkip = true;
      t += dtEmpty;
      continue;
    }

    float odSun, skyVis;
    bakedLight(uvw, odSun, skyVis);
    if (night) {
      // Soft night bake — do not force OD so high that crevice kills ambient.
      odSun = mix(odSun, 1.8, 0.85);
      skyVis = max(skyVis, 0.62);
    }
    skyVis = mix(0.28, 1.0, pow(clamp(skyVis, 0.0, 1.0), max(0.4, uAmbientAtten)));
    // Twilight/night: keep sky visibility high so decks stay lit by ambient.
    skyVis = max(skyVis, mix(0.7, 0.0, dayAmt));

    // Powder softens deep scatter — keep rim glow mild so sunlit faces stay grey-white.
    float powder = 1.0 - exp(-cloudSig * uPowderLength);
    powder = mix(1.0 - 0.4 * uPowder, 1.0, powder);

    float h = clamp((pRel.y - boxMin.y) / boxH * 1.25, 0.0, 1.0);
    // Daytime bases stay soft grey — do not crush dense cores to charcoal.
    float baseDark = mix(0.62, 1.0, smoothstep(0.03, 0.48, h));
    baseDark = mix(mix(0.7, 1.0, smoothstep(0.04, 0.45, h)), baseDark, dayAmt);
    float sunAmt = sunThrough(odSun);
    float crevice = pow(clamp(1.0 - sunAmt, 0.0, 1.0), 1.25) * dayAmt;
    vec3 cloudAlbedo = vec3(0.94, 0.96, 0.98);
    vec3 ambientBottom = uGroundColor * 0.85 + cloudAlbedo * 0.28;
    vec3 ambientTop = mix(cloudAlbedo * 0.72, uSkyColor * 0.42, 0.28);
    // Day still needs a strong ambient floor; dense towers rarely see direct sun.
    float ambBoost = mix(2.0, 1.55, dayAmt);
    vec3 ambient = mix(ambientBottom, ambientTop, h) * skyVis * uAmbientStrength * baseDark * ambBoost;
    ambient *= mix(1.0, 0.88, crevice);
    vec3 nightFill = cloudAlbedo * mix(0.14, 0.0, dayAmt) * (0.55 + 0.45 * skyVis);
    nightFill += uSkyColor * mix(0.3, 0.0, dayAmt);
    // Daytime fill so shadowed faces stay bright cumulus grey, not soot.
    vec3 dayFill = cloudAlbedo * (0.1 + 0.08 * skyVis) * dayAmt;

    // Multi-scatter fill scales with optical depth so close interiors stay lit
    // like the afar silhouette (Hillaire-style cheap approximation).
    float ms = clamp(sunThrough(odSun * 0.4), 0.0, 1.0);
    float deep = clamp(1.0 - sunAmt, 0.0, 1.0);
    vec3 coreFill = cloudAlbedo * (0.14 + 0.18 * ms) + uSunColor * 0.07 * ms;
    coreFill += (uSkyColor * 0.4 + cloudAlbedo * 0.55 + uSunColor * 0.18 * ms) * deep * 0.32;

    // Direct diffuse — phase already angle-dependent via dual HG lobe.
    float sunLit = min(sunAmt * phase * powder, 1.0);
    vec3 litFace = cloudAlbedo * uSunColor;
    vec3 cloudCol = litFace * sunLit * 0.82 + ambient * 1.18 + coreFill + nightFill + dayFill;

    // Angle-varying sun highlights (spotter realism):
    //  - towardSun: silver lining / glory on thin rims looking into the sun
    //  - sideSun: bright cauliflower faces when the sun is to the side
    //  - withSun: soft sheen when the sun is behind the camera
    float thinRim = exp(-cloudSig * 90.0);
    float litEdge = sunAmt * mix(0.35, 1.0, powder);
    float elevGlow = mix(0.55, 1.0, clamp(uSunDir.y * 1.2 + 0.15, 0.0, 1.0));
    float silverLining = towardSun * litEdge * mix(0.45, 1.35, thinRim) * dayAmt * elevGlow;
    float sideGlint = sideSun * sunAmt * powder * dayAmt * elevGlow;
    float backSheen = withSun * sunAmt * powder * 0.45 * dayAmt;
    // Warm sun highlight colour, slightly hotter than body albedo.
    vec3 hiCol = uSunColor * vec3(1.05, 1.0, 0.94);
    vec3 highlight =
      hiCol * (silverLining * 0.95 + sideGlint * 0.48 + backSheen * 0.28);
    // Extra forward bloom on very thin edges looking at the sun.
    highlight += hiCol * towardSun * thinRim * sunThrough(odSun * 0.5) * 0.55 * dayAmt;
    cloudCol += highlight;

    // Mild cool shift in shadow — keep daytime luminance up (no charcoal).
    cloudCol = mix(cloudCol, cloudCol * vec3(0.9, 0.93, 0.97), crevice * 0.28);
    cloudCol = min(cloudCol, mix(vec3(1.55), vec3(1.35, 1.36, 1.38), dayAmt * 0.25));

    // Rain shafts: grey curtains + angle-dependent sun streak.
    float rainGrey = dot(ambient, vec3(0.3, 0.5, 0.2));
    vec3 rainCol = vec3(rainGrey) * 1.05
                 + uSunColor * sunAmt * powder * 0.18
                 + coreFill * 0.4 + nightFill * 0.45 + dayFill * 0.6;
    rainCol += hiCol * (towardSun * 0.35 + sideSun * 0.18) * sunAmt * powder * dayAmt;
    rainCol *= mix(1.0, 0.9, crevice);

    vec3 flash = flashLight(p);
    cloudCol += flash;
    rainCol += flash * 0.45;

    vec3 S = mix(cloudCol, rainCol, rainSig / max(sigT, 1e-6));
    if (hSig > 1e-4) {
      vec3 hailCol =
        uSunColor * (sunAmt * 0.28) * vec3(0.78, 0.82, 0.88)
        + ambient * vec3(0.65, 0.7, 0.78)
        + vec3(0.02);
      S = mix(S, hailCol, clamp(hSig / max(sigT, 1e-4), 0.0, 0.92));
    }

    float midH = mix(ro.y, p.y, 0.5);
    S = aerialFog(S, rd, t, midH);

    float stepT = exp(-sigT * dtLod);
    float w = T * (1.0 - stepT);
    col += S * w;
    T *= stepT;

    t += dtLod;
  }

  float alpha = 1.0 - T;
  if (alpha < 0.001) discard;

  vec3 straight = col / max(1.0 - T, 1e-4);
  // Opacity stays; fog already washed colour toward haze along the ray.

  straight *= uExposure;
  // Soft photographic shoulder — daylight highlights compress before chalk.
  float flashPeak = max(max(straight.r, straight.g), straight.b);
  float shoulder = mix(0.85, 0.32, smoothstep(0.9, 3.5, flashPeak));
  straight = straight / (vec3(1.0) + straight * shoulder);
  straight = max(straight, vec3(0.0));

  gl_FragColor = vec4(straight, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb *= gl_FragColor.a;
}
`;
