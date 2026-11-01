/**
 * 3D scalar-field volume and slice shaders adapted from MeteoLAB.
 * World units are metres (Stormforge); toTex matches the cloud volume layout.
 */

export const fieldVolumeVertex = /* glsl */ `
varying vec3 vWorld;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const fieldCommon = /* glsl */ `
precision highp sampler3D;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform sampler3D uField;
uniform sampler2D uColormap;
uniform float uDiverging;
uniform float uThreshold;
uniform float uDensity;

// Matches cloud volume packing: Data3DTexture(nx, nz, ny) → (east, up, N→S).
vec3 toFieldTex(vec3 p){
  vec3 s = uBoxMax - uBoxMin;
  return vec3(
    (p.x - uBoxMin.x) / s.x,
    (p.y - uBoxMin.y) / s.y,
    (uBoxMax.z - p.z) / s.z
  );
}

float fieldValue(vec3 p){
  vec3 t = toFieldTex(p);
  if(t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0 || t.z < 0.0 || t.z > 1.0) return 0.5;
  return texture(uField, t).r;
}

vec3 fieldColor(float s){
  return texture2D(uColormap, vec2(s, 0.5)).rgb;
}

vec2 boxHit(vec3 ro, vec3 rd){
  vec3 inv = 1.0 / rd;
  vec3 t0 = (uBoxMin - ro) * inv;
  vec3 t1 = (uBoxMax - ro) * inv;
  vec3 lo = min(t0, t1), hi = max(t0, t1);
  return vec2(max(max(lo.x, lo.y), lo.z), min(min(hi.x, hi.y), hi.z));
}
`;

export const fieldVolumeFragment = /* glsl */ `
precision highp float;
${fieldCommon}
varying vec3 vWorld;
const int STEPS = 72;

void main(){
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - cameraPosition);
  vec2 t = boxHit(ro, rd);
  t.x = max(t.x, 0.0);
  if(t.y <= t.x) discard;

  float dt = (t.y - t.x) / float(STEPS);
  float tt = t.x + dt * 0.5;
  float T = 1.0;
  vec3 col = vec3(0.0);

  for(int i = 0; i < STEPS; i++){
    if(T < 0.03) break;
    float s = fieldValue(ro + rd * tt);
    float strength = uDiverging > 0.5 ? abs(s * 2.0 - 1.0) : s;
    float sigma = smoothstep(uThreshold, 1.0, strength) * 0.9 * uDensity;
    if(sigma > 1e-4){
      float a = exp(-sigma * dt * 0.001);
      col += T * (1.0 - a) * fieldColor(s);
      T *= a;
    }
    tt += dt;
  }

  float alpha = 1.0 - T;
  if(alpha < 0.003) discard;
  gl_FragColor = vec4(col / max(alpha, 1e-4), alpha);
  #include <colorspace_fragment>
  gl_FragColor.rgb *= gl_FragColor.a;
}
`;

export const sliceFragment = /* glsl */ `
precision highp float;
${fieldCommon}
varying vec3 vWorld;

void main(){
  float s = fieldValue(vWorld);
  vec3 col = fieldColor(s);
  float c = s * 10.0;
  float line = 1.0 - min(abs(fract(c - 0.5) - 0.5) / fwidth(c), 1.0);
  float zero = uDiverging > 0.5 ? 1.0 - min(abs(s - 0.5) * 10.0 / fwidth(c), 1.0) : 0.0;
  col = mix(col, col * 0.55, line * 0.55);
  col = mix(col, vec3(0.1, 0.12, 0.14), zero * 0.8);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;
