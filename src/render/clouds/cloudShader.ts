/**
 * Volumetric cloud shader — baked-light, cheap primary march.
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
#define MAX_STEPS 160
#endif
#ifndef FINE_STEP
#define FINE_STEP 32.0
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
    float core = exp(-d2 / (2500.0 * 2500.0));
    float mid = exp(-d2 / (6000.0 * 6000.0));
    float wide = exp(-d2 / (11000.0 * 11000.0));
    flash += uFlashColor[f] * amt * (core + 0.55 * mid + 0.18 * wide);
  }
  return flash;
}

bool intersectBox(vec3 ro, vec3 rd, out float tNear, out float tFar) {
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
vec3 octaves(vec3 x){ return textureLod(uShapeNoise, NOISE_TURN * x * 0.125, 0.0).rgb; }
float fbm(vec3 x){ return dot(octaves(x), vec3(0.55, 0.3, 0.15)); }

float billow(vec3 x){
  vec3 o = octaves(x);
  return abs(o.r * 2.0 - 1.0) * 0.6 + abs(o.g * 2.0 - 1.0) * 0.28 + o.b * 0.12;
}

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
  vec3 n = octaves(vec3(p.x * 0.0024, p.y * 0.00008 + uTime * 0.0009, p.z * 0.0024) + vec3(5.3, 0.0, 2.9));
  float streak = smoothstep(0.22, 0.7, n.g * 0.7 + n.b * 0.3);
  float gate = smoothstep(0.0, 0.4, rain * 55.0 + n.r * 0.35 - 0.08);
  float km = rain * uShaftMax * mix(0.35, 2.0, streak) * gate;
  return km * 0.001;
}

float sunThrough(float od){
  return max(exp(-od), 1.0 / (1.0 + 1.7 * od));
}

// Decode baked light: R encodes 1-exp(-od/8), G is sky visibility.
void bakedLight(vec3 uvw, out float odSun, out float skyVis) {
  vec4 L = textureLod(uLightVol, clamp(uvw, vec3(0.0), vec3(1.0)), 0.0);
  odSun = -LIGHT_OD_SCALE * log(max(1.0 - L.r, 1e-4));
  skyVis = clamp(L.g, 0.0, 1.0);
  // Unbaked / night volume (black): open-sky fallback so decks stay lit by ambient.
  if (L.r + L.g < 1e-4) {
    odSun = 0.15;
    skyVis = 0.72;
  }
}

// Extinction (liquid, ice, rain) at p. detail fades billow carve with distance.
vec3 sampleSigma(vec3 p, float detail) {
  vec3 uvw = (p - uBoxMin) / (uBoxMax - uBoxMin);
  vec3 f = max(fieldTap(uvw).rgb * uFieldGain, vec3(0.0));
  float liq = f.x;
  float ice = f.y;
  float rain = f.z;

  float anvilBase = 0.0, anvilPresence = 0.0;
  if (ice > 0.002 && uMammatusDepth > 1.0) {
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

  if (detail > 0.02 && (liq + ice) > 0.004) {
    vec3 pk = p * 0.001;
    float base = clamp(liq + ice, 0.0, 1.0);
    float vigor = smoothstep(0.05, 0.4, liq);
    float iceFrac = smoothstep(0.5, 0.95, ice / max(liq + ice, 1e-3));
    iceFrac *= 1.0 - vigor;
    float n = fbm(pk * 1.15 + vec3(0.0, -uTime * 0.0015, 0.0));
    if (vigor > 0.0) {
      float tower = min(1.0, risingBillow(pk, vigor * 0.02) * 1.5);
      n = mix(n, tower, vigor);
    }
    if (iceFrac > 0.0) {
      n = mix(n, fbm(pk * vec3(0.7, 1.6, 0.7) + vec3(uTime * 0.0004, 0.0, 0.0)), iceFrac);
    }
    float erode =
      mix(mix(0.18, 0.55, vigor), 0.22, iceFrac) *
      mix(uErosionIce, uErosionLiquid, 1.0 - iceFrac) *
      detail;
    erode *= mix(0.25, 1.0, smoothstep(0.06, 0.4, base));
    float d = base * 1.3 - (1.0 - n) * erode * (1.0 - base * 0.55);
    d = max(d, base * mix(0.82, 0.35, vigor));
    float carved = clamp(d * (1.0 + 3.5 * vigor) * mix(1.0, 0.88, iceFrac), 0.0, 1.0);
    float share = max(liq + ice, 1e-6);
    liq = carved * (liq / share);
    ice = carved * (ice / share);

    if (ice > 0.002 && anvilPresence > 0.02) {
      ice = max(ice, mammaDensity(p, anvilBase, anvilPresence) * 0.6);
    }
  }

  if (detail > 0.02 && rain > 0.0004) {
    float rainCore = smoothstep(0.002, 0.45, rain);
    vec3 sheared = p + uRainWindShear * (p.y - uBoxMin.y);
    vec3 pkR = sheared * 0.001;
    float streak = fbm(vec3(pkR.x * 1.8, pkR.y * 0.04 - uTime * 0.001 * uRainFallSpeed, pkR.z * 1.8));
    rain *= mix(1.0, mix(0.5, 1.35, streak), detail * 0.55);
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
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorldPos - ro);

  float tNear, tFar;
  if (!intersectBox(ro, rd, tNear, tFar)) discard;
  tFar = groundDistance(ro, rd, tFar);
  if (tFar <= tNear) discard;

  float cosT = dot(rd, uSunDir);
  float phase = dualLobe(cosT, uPhaseLiquid);

  float pathLen = max(tFar - tNear, 1.0);
  float budget = uStepBudget < 1.0 ? float(MAX_STEPS) : clamp(uStepBudget, 48.0, float(MAX_STEPS));
  // Uniform step across the whole ray — no coarse/fine empty-space skip, no
  // edge/length caps. Those systems punched holes and checkerboarded far decks.
  float dt = max(max(uStepSize, FINE_STEP), pathLen / budget);
  float t = tNear + dt * 0.5 * ign(gl_FragCoord.xy);

  vec3 col = vec3(0.0);
  float T = 1.0;
  float distAcc = 0.0;
  float weightAcc = 0.0;
  float boxH = max(1.0, uBoxMax.y - uBoxMin.y);
  bool night = uSunDir.y < -0.02;

  for (int i = 0; i < MAX_STEPS; i++) {
    if (float(i) >= budget || t >= tFar || T < 0.01) break;
    vec3 p = ro + rd * t;

    vec3 uvw = (p - uBoxMin) / (uBoxMax - uBoxMin);
    vec4 field = fieldTap(uvw);
    vec3 probe = max(field.rgb * uFieldGain, vec3(0.0));
    float hailHere = max(field.a * uFieldGain.x, 0.0);
    bool cloudy = (probe.x + probe.y + probe.z + hailHere) >= 0.0005;

    if (!cloudy) {
      t += dt;
      continue;
    }

    // Keep some billow at range so far decks do not collapse to voxels.
    float detail = max(0.45, 1.0 - smoothstep(uDetailFade.x, uDetailFade.y, t));
    vec3 sig = sampleSigma(p, detail);
    float cloudSig = sig.x + sig.y;
    float rainSig = sig.z;
    float hSig = hailHere * hailHere * 3.2;
    float sigT = cloudSig + rainSig + hSig;

    if (sigT > 1e-5) {
      float odSun, skyVis;
      bakedLight(uvw, odSun, skyVis);
      if (night) {
        odSun = 4.0;
        skyVis = mix(0.35, skyVis, 0.4);
      }
      skyVis = mix(0.28, 1.0, pow(clamp(skyVis, 0.0, 1.0), max(0.35, uAmbientAtten)));

      float powder = 1.0 - exp(-cloudSig * uPowderLength);
      powder = mix(1.0 - 0.45 * uPowder, 1.0, powder);

      float h = clamp((p.y - uBoxMin.y) / boxH * 1.25, 0.0, 1.0);
      // Spotter look: dark flat bases, brighter tops.
      float baseDark = mix(0.42, 1.0, smoothstep(0.08, 0.55, h));
      vec3 ambientBottom = uGroundColor * 0.85 + uSunColor * sunThrough(odSun) * 0.12;
      vec3 ambient = mix(ambientBottom, uSkyColor, h) * skyVis * uAmbientStrength * baseDark;
      vec3 coreFill = (uSkyColor * 0.5 + uGroundColor * 0.5) * 0.1;

      float sunLit = sunThrough(odSun) * phase;
      vec3 cloudCol = uSunColor * sunLit * powder * 0.7 + ambient * 0.95 + coreFill;

      // Cheap shaft colour — no rainbow lobes.
      vec3 rainCol = uSunColor * sunThrough(odSun) * 0.45
                   + mix(ambient, vec3(dot(ambient, vec3(0.3, 0.5, 0.2))), 0.45) * 0.85
                   + coreFill * 0.4;

      vec3 flash = flashLight(p);
      cloudCol += flash;
      rainCol += flash * 0.4;

      vec3 S = mix(cloudCol, rainCol, rainSig / max(sigT, 1e-6));
      if (hSig > 1e-4) {
        vec3 hailCol =
          uSunColor * (sunThrough(odSun) * 0.55) * vec3(0.80, 0.84, 0.90)
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

  float alpha = 1.0 - T;
  if (alpha < 0.001) discard;

  vec3 straight = col / max(1.0 - T, 1e-4);
  float avgDist = distAcc / max(weightAcc, 1e-4);
  float hazeScale = 22000.0 / max(uLodDistance, 4000.0);
  float haze = 1.0 - exp(-avgDist * uHazeDensity * hazeScale);
  straight = mix(straight, uHazeColor, haze) * uExposure;
  straight = straight / (vec3(1.0) + straight * 0.5);
  straight = max(straight, vec3(0.0));
  // No per-pixel dither here — the blit pass already dithers, and a second
  // layer stacked on IGN jitter read as a checkerboard on distant decks.

  gl_FragColor = vec4(straight, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb *= gl_FragColor.a;
}
`;
