/**
 * Atmospheric sky shader for Stormforge.
 * Aligned to MeteoLAB sky look (table sampling + sun disc + stars).
 */

export const skyVertex = /* glsl */ `
out vec3 vDir;
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
in vec3 vDir;
out vec4 fragColor;

const float SKY_PI = 3.14159265;
const float SKY_COLS = 32.0;
const float SKY_ROWS = 32.0;
const float SUN_RADIUS = 0.00465;
const vec3 RAYLEIGH = vec3(5.802e-3, 13.558e-3, 33.1e-3);
const float RAYLEIGH_SCALE = 8.0;
const float HAZE_SCALE = 1.2;
const float HAZE_ALBEDO = 0.9;

vec3 skyAt(vec3 d){
  float el = asin(clamp(d.y, 0.0, 1.0)), v = sqrt(el / (0.5 * SKY_PI));
  vec2 sh = uSunDir.xz, dh = d.xz;
  float az = length(sh) < 1e-4 || length(dh) < 1e-4 ? 0.0 : acos(clamp(dot(normalize(dh), normalize(sh)), -1.0, 1.0));
  vec2 uv = vec2((az / SKY_PI * (SKY_COLS - 1.0) + 0.5) / SKY_COLS, (v * (SKY_ROWS - 1.0) + 0.5) / SKY_ROWS);
  return texture(uSky, uv).rgb * uSkyGain + uSkyFloor + uCityGlow * exp(-el * 10.0);
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
  vec3 d = normalize(vDir), ro = vec3(0.0, cameraPosition.y, 0.0), c;
  if(d.y >= 0.0){
    c = skyAt(d);
    float a = acos(clamp(dot(d, uSunDir), -1.0, 1.0)) / SUN_RADIUS;
    if(a < 1.0) c += uSunDisc * (1.0 - 0.6 * (1.0 - sqrt(1.0 - a * a)));
    if(uStars > 0.0){
      vec3 up = (RAYLEIGH * RAYLEIGH_SCALE + uHaze / HAZE_ALBEDO * HAZE_SCALE) / max(d.y, 0.02);
      c += stars(d) * uStars * exp(-up);
    }
  } else {
    float len = max(ro.y, 0.01) / -d.y;
    vec3 T = exp(-vec3(0.005, 0.008, 0.012) * len * 0.1);
    vec3 surface = uGroundLight;
    if(uWater > 0.5){
      float F = 0.02 + 0.98 * pow(max(1.0 + d.y, 0.0), 5.0);
      surface = surface * (1.0 - F) + skyAt(vec3(d.x, -d.y, d.z)) * F;
    } else {
      c = surface * T + skyAt(vec3(d.x, -d.y, d.z)) * (1.0 - T);
      c = mix(c, vec3(0.009, 0.026, 0.044), uLab);
      fragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }
    c = surface * T + skyAt(vec3(d.x, -d.y, d.z)) * (1.0 - T);
  }
  c = mix(c, vec3(0.009, 0.026, 0.044), uLab);
  fragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
