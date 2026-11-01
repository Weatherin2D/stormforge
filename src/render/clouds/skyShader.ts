/**
 * Atmospheric sky dome — GLSL1 (MeteoLAB), so Three's tonemapping / colorspace
 * chunks that write gl_FragColor compile correctly.
 *
 * Stormforge world units are metres; MeteoLAB's aerial path expects km, so the
 * below-horizon branch converts camera/ground positions with * 0.001.
 */

export const skyVertex = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
}
`;

export const skyFragment = /* glsl */ `
precision highp float;
uniform sampler2D uSky;
uniform float uSkyGain;
uniform vec3 uSkyFloor;
uniform vec3 uCityGlow;
uniform float uHaze;
uniform vec3 uSunDisc;
uniform vec3 uGroundLight;
uniform float uStars;
uniform float uWater;
uniform vec3 uSunDir;
uniform float uLab;
uniform sampler3D uNoise;
uniform vec2 uGroundSize;
uniform float uSurface;
varying vec3 vDir;

const float SKY_PI = 3.14159265;
const float SKY_COLS = 32.0;
const float SKY_ROWS = 32.0;
const float SUN_RADIUS = 0.00465;
const vec3 RAYLEIGH = vec3(5.802e-3, 13.558e-3, 33.1e-3);
const float RAYLEIGH_SCALE = 8.0;
const float HAZE_SCALE = 1.2;
const float HAZE_ALBEDO = 0.9;

float hash2(vec2 k){ return fract(sin(dot(k, vec2(127.1, 311.7))) * 43758.5453); }

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

vec3 skyAt(vec3 d){
  float el = asin(clamp(d.y, 0.0, 1.0)), v = sqrt(el / (0.5 * SKY_PI));
  vec2 sh = uSunDir.xz, dh = d.xz;
  float az = length(sh) < 1e-4 || length(dh) < 1e-4 ? 0.0 : acos(clamp(dot(normalize(dh), normalize(sh)), -1.0, 1.0));
  vec2 uv = vec2((az / SKY_PI * (SKY_COLS - 1.0) + 0.5) / SKY_COLS, (v * (SKY_ROWS - 1.0) + 0.5) / SKY_ROWS);
  return texture2D(uSky, uv).rgb * uSkyGain + uSkyFloor + uCityGlow * exp(-el * 10.0);
}

float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

vec3 stars(vec3 d){
  vec3 q = d * 300.0, cell = floor(q);
  float r = hash3(cell);
  if(r < 0.996) return vec3(0.0);
  vec3 at = cell + 0.5 + 0.3 * (vec3(hash3(cell + 1.7), hash3(cell + 3.1), hash3(cell + 5.3)) - 0.5);
  float b = pow(hash3(cell + 9.2), 6.0) * 2.5 + 0.08;
  vec3 tint = mix(vec3(1.0, 0.82, 0.65), vec3(0.75, 0.85, 1.0), hash3(cell + 7.7));
  return tint * b * (1.0 - smoothstep(0.08, 0.22, length(q - at)));
}

void main(){
  vec3 d = normalize(vDir), c;
  // Metres → km for atmosphere path lengths (MeteoLAB tables are in km).
  float camYkm = max(cameraPosition.y * 0.001, 0.002);
  if(d.y >= 0.0){
    c = skyAt(d);
    float a = acos(clamp(dot(d, uSunDir), -1.0, 1.0)) / SUN_RADIUS;
    // Soft limb: keep a readable disc without a hard white core.
    if(a < 1.0) c += uSunDisc * (0.55 * (1.0 - 0.65 * (1.0 - sqrt(1.0 - a * a))));
    if(uStars > 0.0){
      vec3 up = (RAYLEIGH * RAYLEIGH_SCALE + uHaze / HAZE_ALBEDO * HAZE_SCALE) / max(d.y, 0.02);
      c += stars(d) * uStars * exp(-up);
    }
  } else {
    float len = camYkm / -d.y;
    // Simple Beer–Lambert haze toward the horizon (km path).
    vec3 od = RAYLEIGH * RAYLEIGH_SCALE * (1.0 - exp(-camYkm / RAYLEIGH_SCALE)) / max(camYkm, 1e-3) * len
            + (uHaze / HAZE_ALBEDO) * HAZE_SCALE * (1.0 - exp(-camYkm / HAZE_SCALE)) / max(camYkm, 1e-3) * len;
    od = min(od, vec3(8.0));
    vec3 T = exp(-od);
    vec3 inscatter = skyAt(vec3(d.x, max(-d.y, 0.02), d.z)) * (1.0 - T);
    vec3 surface = uGroundLight;
    if(uWater < 0.5){
      vec3 P = cameraPosition + d * (len / 0.001);
      vec2 q = P.xz * 0.001;
      // Tile the land pattern in km.
      surface *= landPattern(q, max(len * 0.002, 0.01));
    } else {
      float F = 0.02 + 0.98 * pow(max(1.0 + d.y, 0.0), 5.0);
      surface = surface * (1.0 - F) + skyAt(vec3(d.x, -d.y, d.z)) * F;
    }
    c = surface * T + inscatter;
  }
  c = mix(c, vec3(0.009, 0.026, 0.044), uLab);
  // Soft highlight roll-off before ACES — low-sun Mie glow + disc used to bleach half the sky.
  c = c / (vec3(1.0) + c * 0.18);
  // Triangular dither before 8-bit display / tonemap — kills night sky banding.
  float dn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float dm = fract(sin(dot(gl_FragCoord.xy + 19.19, vec2(12.9898, 78.233))) * 43758.5453);
  c += (dn + dm - 1.0) / 255.0;
  gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
