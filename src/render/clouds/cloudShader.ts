/**
 * Volumetric cloud shader, for THREE.ShaderMaterial on a WebGL2 renderer.
 * Written GLSL1-style (varying / gl_FragColor); Three converts it to GLSL ES 3.00, so sampler3D and textureLod are available.
 *
 * Draw it on a box that covers the sim domain, with side = BackSide. The fragment shader
 * raymarches from the camera through the box in world space.
 *
 * Inputs
 *   uFields       sim volume, spanning exactly [uBoxMin, uBoxMax]. R = cloud liquid, G = cloud ice, B = rain.
 *                 uFieldGain scales each channel so that "very dense" is about 1.0.
 *   uShapeNoise   64^3 tileable Perlin-Worley (R) + Worley billows (GBA)
 *   uDetailNoise  32^3 tileable Worley billows (RGB)
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
    flash += uFlashColor[f] * amt * exp(-dot(d, d) / (2200.0 * 2200.0));
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

// ---------------------------------------------------------------- medium

// Extinction per species at world position p, in 1/m: (liquid, ice, rain).
// detail in 0..1 blends the noise erosion in (0 = raw sim field, used for cheap light/ambient samples).
vec3 sampleSigma(vec3 p, float detail) {
  vec3 uvw = (p - uBoxMin) / (uBoxMax - uBoxMin);
  vec3 f = max(textureLod(uFields, uvw, 0.0).rgb * uFieldGain, vec3(0.0));
  float liq = f.x;
  float ice = f.y;
  float rain = f.z;

  if (detail > 0.01 && (liq + ice + rain) > 0.002) {
    vec3 rel = p + uNoiseOffset;
    vec4 sh = textureLod(uShapeNoise, rel * uShapeFreq, 0.0);

    // Liquid: round billows (cauliflower). Where the billow noise is low the sim density is eroded away.
    if (liq > 0.002) {
      float billowLow = sh.g * 0.625 + sh.b * 0.25 + sh.a * 0.125;
      vec4 dt = textureLod(uDetailNoise, rel * uDetailFreq, 0.0);
      float billowHigh = dt.r * 0.625 + dt.g * 0.25 + dt.b * 0.125;
      float bill = mix(billowLow, billowHigh, 0.5 * detail);
      float thr = (1.0 - bill) * uErosionLiquid * detail;
      liq = clamp((liq - thr) / max(1.0 - thr, 1e-3), 0.0, 1.0);
    }

    // Ice: stretched along the wind, so it reads as smooth fibres and streaks instead of lumps.
    if (ice > 0.002) {
      vec3 perp = vec3(-uWindDir.z, 0.0, uWindDir.x);
      vec3 q = vec3(dot(rel, uWindDir), rel.y, dot(rel, perp)) * uShapeFreq * uIceStretch;
      q += (sh.rgb - 0.5) * 0.3; // slight domain warp so the streaks wander
      vec4 fi = textureLod(uShapeNoise, q, 0.0);
      float fibre = fi.g * 0.5 + fi.b * 0.3 + fi.a * 0.2;
      float thrI = (1.0 - fibre) * uErosionIce * detail;
      ice = clamp((ice - thrI) / max(1.0 - thrI, 1e-3), 0.0, 1.0);
    }

    // Rain: vertical streaks (noise squashed along Y).
    if (rain > 0.002) {
      vec3 qr = vec3(rel.x, rel.y * 0.05, rel.z) * uShapeFreq * 2.0;
      float streak = textureLod(uShapeNoise, qr, 0.0).g;
      rain *= mix(1.0, mix(0.45, 1.3, streak), detail);
    }
  }

  return vec3(liq, ice, rain) * uSigma;
}

// ---------------------------------------------------------------- lighting

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
    od += (s.x + s.y + s.z) * len;
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
      odUp += (s.x + s.y + s.z) * uAmbientStep;
    }
    if (dn.y > uBoxMin.y) {
      vec3 s = sampleSigma(dn, 0.0);
      odDown += (s.x + s.y + s.z) * uAmbientStep;
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

  float pathLen = tFar - tNear;
  float baseStep = max(uStepSize, pathLen / float(MAX_STEPS));
  float t = tNear + baseStep * ign(gl_FragCoord.xy + uFrame * 5.588238);

  // The powder (dark edge) effect is only visible looking away from the sun, so fade it out toward the sun.
  float powderAmt = uPowder * (0.5 - 0.5 * cosT);

  vec3 col = vec3(0.0);
  float T = 1.0;
  float distAcc = 0.0;

  for (int i = 0; i < MAX_STEPS; i++) {
    if (t >= tFar || T < 0.01) break;

    float dt = baseStep * (1.0 + t / uLodDistance);
    vec3 p = ro + rd * t;

    // cheap empty-space probe: one fetch of the raw field, no noise
    vec3 uvw = (p - uBoxMin) / (uBoxMax - uBoxMin);
    vec3 probe = textureLod(uFields, uvw, 0.0).rgb * uFieldGain;
    if (probe.x + probe.y + probe.z < 0.003) {
      t += dt * 2.0;
      continue;
    }

    float detail = 1.0 - smoothstep(uDetailFade.x, uDetailFade.y, t);
    vec3 sig = sampleSigma(p, detail);
    float sigT = sig.x + sig.y + sig.z;

    if (sigT > 1e-5) {
      // scattering coefficient (rain scatters less than cloud) and blended phase asymmetry
      float sigS = sig.x + sig.y + 0.5 * sig.z;
      vec2 g = (sig.x * uPhaseLiquid + sig.y * uPhaseIce + sig.z * uPhaseRain) / sigT;

      // direct sun, with multiple scattering approximated by octaves that
      // flatten the phase function and thin the extinction (Wrenninge)
      float odSun = sunOpticalDepth(p);
      float a = 1.0, b = 1.0, c = 1.0;
      float sunTerm = 0.0;
      for (int n = 0; n < MS_OCTAVES; n++) {
        sunTerm += a * dualLobe(cosT, g, c) * exp(-odSun * b);
        a *= uMultiScatter.x;
        b *= uMultiScatter.y;
        c *= uMultiScatter.z;
      }
      float powder = 1.0 - exp(-sigT * uPowderLength);
      sunTerm *= mix(1.0, powder, powderAmt);

      // ambient: sky from above, bounce from below, both dimmed by the cloud between
      float odUp, odDown;
      ambientDepth(p, odUp, odDown);
      vec3 ambient = (uSkyColor * exp(-odUp * uAmbientAtten) +
                      uGroundColor * exp(-odDown * uAmbientAtten)) * uAmbientStrength;

      vec3 S = (uSunColor * sunTerm + ambient + flashLight(p) * 1.6) * sigS;

      // energy-conserving integration over the step
      float stepT = exp(-sigT * dt);
      vec3 Sint = (S - S * stepT) / max(sigT, 1e-6);
      col += T * Sint;
      distAcc += T * (1.0 - stepT) * t;
      T *= stepT;
    }

    t += dt;
  }

  float alpha = 1.0 - T;
  if (alpha < 0.003) discard;

  // Aerial perspective: distant cloud fades toward the haze colour.
  vec3 straight = col / alpha;
  float avgDist = distAcc / alpha;
  float haze = 1.0 - exp(-avgDist * uHazeDensity);
  straight = mix(straight, uHazeColor, haze) * uExposure;

  gl_FragColor = vec4(straight, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb *= gl_FragColor.a; // premultiply for blending
}
`;
