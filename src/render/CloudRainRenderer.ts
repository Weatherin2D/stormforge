import * as THREE from "three";
import { Grid3D, volumeDisplaySize } from "../sim/Grid3D";
import {
  SurfaceWindSample,
  windSpeedScale,
} from "../sim/surfaceWinds";

const volumeVert = /* glsl */ `
out vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Back faces: the camera lives inside the domain, so each pixel is an exit wall.
const volumeFrag = /* glsl */ `
precision highp float;
precision highp sampler3D;
uniform sampler3D uVolume;
uniform sampler3D uVolumePrev;
uniform float uFade;
uniform vec3 uCameraPos;
uniform float uOpacity;
uniform float uStep;
in vec3 vPos;
out vec4 fragColor;

uniform vec3 uSunWorld;
uniform vec3 uScale;
uniform vec3 uFlashLocal;
uniform float uFlash;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Physics: i + nx*(j + ny*k), k = height, +j = north.
// Display: flip j like 2D mapPix so north sits on −Z (viewed from +Z).
// R = softened cloud, G = rain, B = shaft hung below the rain.
vec3 sampleMass(vec3 p) {
  vec3 uv = vec3(p.x + 0.5, 1.0 - (p.z + 0.5), p.y + 0.5);
  if (any(lessThan(uv, vec3(0.0))) || any(greaterThan(uv, vec3(1.0)))) {
    return vec3(0.0);
  }
  return mix(texture(uVolumePrev, uv).rgb, texture(uVolume, uv).rgb, uFade);
}

vec3 safeInv(vec3 d) {
  return vec3(
    abs(d.x) < 1e-5 ? 1e6 : 1.0 / d.x,
    abs(d.y) < 1e-5 ? 1e6 : 1.0 / d.y,
    abs(d.z) < 1e-5 ? 1e6 : 1.0 / d.z
  );
}

void main() {
  vec3 cam = uCameraPos;
  vec3 rayDir = normalize(vPos - cam);
  vec3 boxMin = vec3(-0.5);
  vec3 boxMax = vec3(0.5);
  bool inside = all(greaterThan(cam, boxMin)) && all(lessThan(cam, boxMax));
  vec3 pos = cam;
  if (!inside) {
    vec3 inv = safeInv(rayDir);
    vec3 t0 = (boxMin - cam) * inv;
    vec3 t1 = (boxMax - cam) * inv;
    vec3 tNear = min(t0, t1);
    float tEnter = max(max(tNear.x, tNear.y), tNear.z);
    pos = cam + rayDir * max(tEnter, 0.0);
  }
  vec3 worldRay = normalize(rayDir * uScale);
  vec3 sunLocal = uSunWorld / max(uScale, vec3(1.0));
  float sunLen = length(sunLocal);
  sunLocal = sunLen > 1e-5 ? sunLocal / sunLen : vec3(0.0, 1.0, 0.0);
  float mu = dot(worldRay, normalize(uSunWorld));
  float phase = 0.55 + 0.85 * pow(max(mu, 0.0), 4.0);
  float elev = uSunWorld.y;
  float day = smoothstep(-0.02, 0.30, elev);
  float sunVis = smoothstep(-0.04, 0.16, elev);
  float warm = smoothstep(-0.12, 0.0, elev) * (1.0 - smoothstep(0.02, 0.2, elev));
  vec3 sunCol = mix(vec3(1.0, 0.97, 0.93), vec3(1.0, 0.70, 0.40), warm);
  vec3 amb = mix(vec3(0.09, 0.10, 0.13), vec3(0.74, 0.80, 0.88), day);
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  pos += rayDir * uStep * jitter * 0.12;
  vec4 acc = vec4(0.0);

  for (int i = 0; i < 56; i++) {
    vec2 xz = pos.xz * uScale.xz;
    float yb = pos.y * 7.5;
    float n = noise2(xz * 0.0005 + vec2(yb, -yb * 0.6));
    float n2 = noise2(xz * 0.00135 + vec2(yb * 1.8, yb * 0.7) + 9.0);
    vec3 sp = pos + vec3((n - 0.5) * 0.03, (n - 0.5) * 0.04 + (n2 - 0.5) * 0.055, (n2 - 0.5) * 0.03);
    float puff = noise2(vec2(pos.x * 13.0 + pos.y * 17.0, pos.z * 13.0 - pos.y * 15.0));
    float puffB = noise2(vec2(pos.x * 6.5 - pos.y * 8.0, pos.z * 6.5 + pos.y * 7.0) + 4.2);
    vec3 mass = sampleMass(sp);
    float qc = mass.r;
    float fbm = puff * 0.62 + puffB * 0.38;
    float cloud = max(0.0, qc * (0.22 + fbm) - 0.03);
    cloud *= smoothstep(0.0, 0.12, cloud);
    // Same lumps as the cloud, and the shaft stays partly present inside it
    // so the base fades into the rain instead of ending on a line.
    float shaft = mass.b * (0.4 + 0.6 * fbm);
    shaft *= mix(0.5, 1.0, 1.0 - smoothstep(0.04, 0.7, cloud));
    float d = cloud + shaft * 0.5;
    float stepLen = d > 0.045 ? uStep * 0.75 : (d > 0.008 ? uStep : uStep * 2.6);
    if (d > 0.008) {
      float shadow = sampleMass(sp + sunLocal * (uStep * 3.2)).r;
      float light = exp(-shadow * 1.05);
      float wet = smoothstep(0.0, 0.55, shaft / max(cloud + shaft, 0.04));
      vec3 dry = mix(vec3(0.60, 0.64, 0.70), vec3(1.0, 0.99, 0.97), light);
      vec3 damp = mix(vec3(0.52, 0.56, 0.62), vec3(0.74, 0.78, 0.84), light * 0.65 + 0.35);
      vec3 albedo = mix(dry, damp, wet);
      vec3 lit = mix(vec3(0.50, 0.53, 0.60), albedo, sunVis);
      float sunAmt = sunVis * mix(1.0, 0.45, wet);
      vec3 col = lit * (amb + sunCol * light * phase * sunAmt);
      float flashDist = length((sp - uFlashLocal) * uScale);
      float glow = uFlash * exp(-flashDist * flashDist / (2200.0 * 2200.0));
      col += vec3(0.75, 0.84, 1.0) * glow * 1.6;
      float ext = mix(8.0, 2.4, wet);
      float a = 1.0 - exp(-d * ext * stepLen / max(uStep, 1e-4));
      a = clamp(a, 0.0, mix(1.0, 0.4, wet));
      acc.rgb += (1.0 - acc.a) * col * a;
      acc.a += (1.0 - acc.a) * a;
    }
    if (acc.a > 0.96) break;
    pos += rayDir * stepLen;
    if (pos.y < -0.5 || any(greaterThan(abs(pos), vec3(0.52)))) break;
  }

  if (acc.a < 0.01) discard;
  fragColor = acc;
}
`;

const skyVert = /* glsl */ `
out vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w;
}
`;

const skyFrag = /* glsl */ `
precision highp float;
in vec3 vDir;
uniform vec3 uSunDir;
out vec4 fragColor;

void main() {
  vec3 dir = normalize(vDir);
  float day = smoothstep(-0.05, 0.25, uSunDir.y);
  vec3 zenith = mix(vec3(0.015, 0.02, 0.06), vec3(0.16, 0.42, 0.86), day);
  vec3 horiz = mix(vec3(0.04, 0.05, 0.10), vec3(0.78, 0.84, 0.90), day);
  float up = pow(clamp(dir.y, 0.0, 1.0), 0.42);
  vec3 col = mix(horiz, zenith, up);
  col = mix(col * vec3(0.45, 0.5, 0.55), col, smoothstep(-0.2, 0.02, dir.y));
  vec3 sun = normalize(uSunDir);
  float sunDot = dot(dir, sun);
  float disc = smoothstep(0.9985, 0.9995, sunDot);
  float glare = pow(max(sunDot, 0.0), 8.0);
  float wide = pow(max(sunDot, 0.0), 2.0);
  vec3 sunCol = mix(vec3(1.0, 0.40, 0.16), vec3(1.0, 0.98, 0.92), day);
  float vis = smoothstep(-0.04, 0.12, sun.y);
  col += sunCol * (disc * 3.2 + glare * 0.65 + wide * 0.16) * vis;
  fragColor = vec4(col, 1.0);
}
`;

const blitVert = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const blitFrag = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
in vec2 vUv;
out vec4 fragColor;
void main() {
  fragColor = texture(uTex, vUv);
}
`;

export class CloudRainRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private volumeTex: THREE.Data3DTexture | null = null;
  private volumePrevTex: THREE.Data3DTexture | null = null;
  private volumeMesh: THREE.Mesh | null = null;
  private volumeData: Uint8Array | null = null;
  private volumePrevData: Uint8Array | null = null;
  private radarTex: THREE.DataTexture | null = null;
  private radarMesh: THREE.Mesh | null = null;
  private radarData: Uint8Array | null = null;
  private radarNx = 0;
  private radarNy = 0;
  private domainSpan = 2;
  /** Domain size in meters. X east, Z north-south (north is −Z), Y up. */
  private volNx = 1;
  private volNy = 1;
  private volNz = 1;
  private spanX = 1000;
  private spanZ = 1000;
  private spanY = 1000;
  private groundY = -500;
  private eyeM = 2;
  private ground: THREE.Mesh;
  private kmGrid: THREE.GridHelper | null = null;
  private hemi: THREE.HemisphereLight;
  private sunLight: THREE.DirectionalLight;
  private draggingLook = false;
  private lookX = 0;
  private lookY = 0;
  private yaw = 0;
  private pitch = -0.22;
  private readonly fovWide = 80;
  private readonly fovTight = 18;
  private unbindLook: (() => void) | null = null;
  private domainBox: THREE.LineSegments;
  private windMesh: THREE.InstancedMesh | null = null;
  private windDummy = new THREE.Object3D();
  private windVisible = false;
  private windNx = 0;
  private windNy = 0;
  private windSx = 1;
  private windSz = 1;
  private windY = -0.48;
  private warnedEmpty = false;
  private ro: ResizeObserver | null = null;
  private cloudScene = new THREE.Scene();
  private overlay = new THREE.Scene();
  private overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private cloudTarget: THREE.WebGLRenderTarget | null = null;
  private sky: THREE.Mesh;
  private blitMesh: THREE.Mesh;
  private sunDir = new THREE.Vector3(0.25, 0.75, 0.2);
  private cloudsOn = true;
  private volumeClear = false;
  private lastVolumeMs = 0;
  private clearScratch = new THREE.Color();
  private cloudScratch: Uint8Array | null = null;
  private cloudScratchB: Uint8Array | null = null;
  /** Columns that need the cloud/rain blur. Empty sky is left alone. */
  private colLive: Uint8Array | null = null;
  private colSeed: Uint8Array | null = null;
  private liveBolts: {
    i: number;
    j: number;
    x: number;
    y: number;
    z: number;
    age: number;
    life: number;
    seed: number;
  }[] = [];
  private flashLights: THREE.PointLight[] = [];
  private boltLines: THREE.Line[] = [];

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    this.renderer.setClearColor(0x0a1424, 1);
    const canvas = this.renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    this.container.appendChild(canvas);

    this.scene = new THREE.Scene();

    // Meters. Near is about a pace; far covers the whole domain.
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.4, 250000);
    this.camera.rotation.order = "YXZ";
    this.camera.position.set(0, this.eyeM, 0);

    if (document.pointerLockElement) document.exitPointerLock();
    this.bindLook(canvas);

    this.hemi = new THREE.HemisphereLight(0xc5ddff, 0x2a4a28, 0.95);
    this.scene.add(this.hemi);
    this.sunLight = new THREE.DirectionalLight(0xfff2d6, 1.15);
    this.sunLight.position.set(80, 200, 40);
    this.scene.add(this.sunLight);
    for (let n = 0; n < 3; n++) {
      const light = new THREE.PointLight(0xdbe7ff, 0, 8000, 2);
      light.castShadow = false;
      this.flashLights.push(light);
      this.scene.add(light);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(6 * 3), 3),
      );
      const bolt = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
          color: 0xf3f7ff,
          transparent: true,
          opacity: 0,
          fog: false,
        }),
      );
      bolt.visible = false;
      bolt.frustumCulled = false;
      this.boltLines.push(bolt);
      this.scene.add(bolt);
    }
    this.scene.fog = new THREE.Fog(0x8fb4d4, 18000, 70000);
    this.renderer.setClearColor(0x8fb4d4, 1);

    const groundGeo = new THREE.PlaneGeometry(4, 4);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x3c7a45,
      roughness: 0.95,
    });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.5;
    this.scene.add(this.ground);

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.EdgesGeometry(boxGeo);
    this.domainBox = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({
        color: 0x3a5070,
        transparent: true,
        opacity: 0.55,
      }),
    );
    this.scene.add(this.domainBox);

    const skyMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: { uSunDir: { value: this.sunDir } },
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 18), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    const blitMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: blitVert,
      fragmentShader: blitFrag,
      uniforms: { uTex: { value: null } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.blitMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMat);
    this.blitMesh.frustumCulled = false;
    this.overlay.add(this.blitMesh);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.container);
    this.resize();
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, true);
    const bw = Math.max(1, this.renderer.domElement.width);
    const bh = Math.max(1, this.renderer.domElement.height);
    const hw = Math.max(1, Math.floor(bw * 0.5));
    const hh = Math.max(1, Math.floor(bh * 0.5));
    if (
      !this.cloudTarget ||
      this.cloudTarget.width !== hw ||
      this.cloudTarget.height !== hh
    ) {
      this.cloudTarget?.dispose();
      this.cloudTarget = new THREE.WebGLRenderTarget(hw, hh, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        depthBuffer: false,
      });
      const blit = this.blitMesh.material as THREE.ShaderMaterial;
      blit.uniforms.uTex.value = this.cloudTarget.texture;
    }
  }

  setVolumeVisible(on: boolean): void {
    this.cloudsOn = on;
    if (this.volumeMesh) this.volumeMesh.visible = on;
  }

  setRadarVisible(on: boolean): void {
    if (this.radarMesh) this.radarMesh.visible = on;
  }

  setWindsVisible(on: boolean): void {
    this.windVisible = on;
    if (this.windMesh) this.windMesh.visible = on;
  }

  /**
   * Move the player. xn/yn are 0..1 across the domain (east, north).
   * Altitude is meters above the ground.
   */
  teleportTo(xn: number, yn: number, altitudeM: number): void {
    const x = (Math.min(1, Math.max(0, xn)) - 0.5) * this.spanX;
    const z = -((Math.min(1, Math.max(0, yn)) - 0.5) * this.spanZ);
    const alt = Math.min(this.spanY - 2, Math.max(this.eyeM, altitudeM));
    this.camera.position.set(x, this.groundY + alt, z);
  }

  playerState(): {
    xn: number;
    yn: number;
    altitudeM: number;
    eastM: number;
    northM: number;
  } {
    const xn = this.spanX > 0 ? this.camera.position.x / this.spanX + 0.5 : 0.5;
    const yn = this.spanZ > 0 ? -this.camera.position.z / this.spanZ + 0.5 : 0.5;
    return {
      xn: Math.min(1, Math.max(0, xn)),
      yn: Math.min(1, Math.max(0, yn)),
      altitudeM: this.camera.position.y - this.groundY,
      eastM: this.camera.position.x,
      northM: -this.camera.position.z,
    };
  }

  /** Stand in the horizontal center, eye height, looking north and slightly up. */
  private spawnPlayer(): void {
    this.yaw = 0;
    this.pitch = -0.22;
    this.camera.position.set(0, this.groundY + this.eyeM, 0);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.camera.fov = 68;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Drag on the view to look. The cursor stays free so buttons and panels
   * still receive clicks. Scroll changes the field of view.
   */
  private bindLook(canvas: HTMLCanvasElement): void {
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      this.draggingLook = true;
      this.lookX = e.clientX;
      this.lookY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!this.draggingLook) return;
      const dx = e.clientX - this.lookX;
      const dy = e.clientY - this.lookY;
      this.lookX = e.clientX;
      this.lookY = e.clientY;
      const sens = 0.0022;
      this.yaw -= dx * sens;
      this.pitch += dy * sens;
      const limit = Math.PI / 2 - 0.04;
      if (this.pitch > limit) this.pitch = limit;
      if (this.pitch < -limit) this.pitch = -limit;
      this.camera.rotation.set(this.pitch, this.yaw, 0);
    };
    const up = (e: PointerEvent) => {
      if (!this.draggingLook) return;
      this.draggingLook = false;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      canvas.style.cursor = "grab";
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = e.deltaY > 0 ? 3 : -3;
      this.camera.fov = Math.min(
        this.fovWide,
        Math.max(this.fovTight, this.camera.fov + step),
      );
      this.camera.updateProjectionMatrix();
    };
    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    this.unbindLook = () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
    };
  }

  setSunFrac(frac: number): void {
    const f = Math.min(1, Math.max(0, frac));
    const mix = (a: number, b: number) => Math.round(a + (b - a) * f);
    const sky = (mix(10, 143) << 16) | (mix(16, 180) << 8) | mix(28, 214);
    this.renderer.setClearColor(sky, 1);
    if (this.scene.fog) this.scene.fog.color.set(sky);
    this.hemi.intensity = 0.22 + 0.8 * f;
    this.sunLight.intensity = 0.15 + 1.05 * f;
  }

  /** Daylight fraction plus the world sun direction (+X east, +Y up, −Z north). */
  setSun(frac: number, dir: { x: number; y: number; z: number }): void {
    this.setSunFrac(frac);
    this.sunDir.set(dir.x, dir.y, dir.z);
    if (this.sunDir.lengthSq() < 1e-8) this.sunDir.set(0, 1, 0);
    else this.sunDir.normalize();
    this.sunLight.position.copy(this.sunDir).multiplyScalar(400);
    const elev = this.sunDir.y;
    const up = Math.min(1, Math.max(0, (elev + 0.02) / 0.28));
    const warm = Math.min(1, Math.max(0, 1 - Math.abs(elev) / 0.16)) * (1 - up);
    this.sunLight.color.setRGB(
      0.55 + up * 0.45 + warm * 0.15,
      0.62 + up * 0.34,
      Math.max(0.25, 0.78 + up * 0.14 - warm * 0.4),
    );
  }

  setGrid(grid: Grid3D): void {
    const height = Math.max(1, grid.zTop);
    const sx = Math.max(1, grid.xExtent);
    const sz = Math.max(1, grid.yExtent);
    this.spanX = sx;
    this.spanZ = sz;
    this.spanY = height;
    this.groundY = -height / 2;
    this.domainSpan = Math.max(sx, sz);
    this.domainBox.scale.set(sx, height, sz);
    this.ground.scale.set(sx * 1.12, sz * 1.12, 1);
    this.ground.position.y = this.groundY;
    this.camera.far = Math.max(8000, this.domainSpan * 3);
    this.camera.updateProjectionMatrix();
    const haze = Math.max(4000, this.domainSpan * 0.28);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = haze;
      this.scene.fog.far = haze * 3.2;
    }
    this.rebuildKmGrid(sx, sz);
    this.warnedEmpty = false;

    if (this.volumeMesh) {
      this.cloudScene.remove(this.volumeMesh);
      this.volumeMesh.geometry.dispose();
      (this.volumeMesh.material as THREE.Material).dispose();
      this.volumeMesh = null;
    }
    if (this.volumeTex) {
      this.volumeTex.dispose();
      this.volumeTex = null;
    }
    if (this.volumePrevTex) {
      this.volumePrevTex.dispose();
      this.volumePrevTex = null;
    }
    this.volumePrevData = null;
    this.disposeRadar();
    this.disposeWinds();

    this.windNx = grid.nx;
    this.windNy = grid.ny;
    this.windSx = sx;
    this.windSz = sz;
    this.windY = this.groundY + 6;

    const disp = volumeDisplaySize(grid.nx, grid.ny, grid.nz);
    const bytes = disp.nx * disp.ny * disp.nz * 4;
    this.volumeData = new Uint8Array(new ArrayBuffer(bytes));
    this.volumePrevData = new Uint8Array(new ArrayBuffer(bytes));
    this.volumeTex = this.makeVolumeTexture(this.volumeData, disp.nx, disp.ny, disp.nz);
    this.volumePrevTex = this.makeVolumeTexture(
      this.volumePrevData,
      disp.nx,
      disp.ny,
      disp.nz,
    );

    const step = Math.min(0.012, Math.max(0.004, 0.55 / Math.max(disp.nz, 16)));

    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: volumeVert,
      fragmentShader: volumeFrag,
      uniforms: {
        uVolume: { value: this.volumeTex },
        uVolumePrev: { value: this.volumePrevTex },
        uFade: { value: 1 },
        uCameraPos: { value: new THREE.Vector3() },
        uStep: { value: step },
        uSunWorld: { value: this.sunDir.clone() },
        uScale: { value: new THREE.Vector3(sx, height, sz) },
        uFlashLocal: { value: new THREE.Vector3(0, -2, 0) },
        uFlash: { value: 0 },
      },
      transparent: true,
      blending: THREE.NoBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.BackSide,
      fog: false,
    });

    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.volumeMesh = new THREE.Mesh(geo, mat);
    this.volumeMesh.scale.set(sx, height, sz);
    this.volumeMesh.frustumCulled = false;
    this.volumeMesh.visible = this.cloudsOn;
    this.cloudScene.add(this.volumeMesh);
    this.volumeClear = false;
    this.lastVolumeMs = 0;
    this.volNx = disp.nx;
    this.volNy = disp.ny;
    this.volNz = disp.nz;

    // Radar composite plane (just above ground)
    this.radarNx = grid.nx;
    this.radarNy = grid.ny;
    this.radarData = new Uint8Array(new ArrayBuffer(grid.nx * grid.ny * 4));
    this.radarTex = new THREE.DataTexture(
      this.radarData as unknown as BufferSource,
      grid.nx,
      grid.ny,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    this.radarTex.minFilter = THREE.NearestFilter;
    this.radarTex.magFilter = THREE.NearestFilter;
    // mapPix packs north in row 0 (same as 2D maps). flipY puts that on +Z
    // after the plane rotation so volume + radar stay north-aligned.
    this.radarTex.flipY = true;
    this.radarTex.needsUpdate = true;
    if ("colorSpace" in this.radarTex) {
      (this.radarTex as THREE.DataTexture).colorSpace = THREE.NoColorSpace;
    }

    const radarMat = new THREE.MeshBasicMaterial({
      map: this.radarTex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const radarGeo = new THREE.PlaneGeometry(1, 1);
    this.radarMesh = new THREE.Mesh(radarGeo, radarMat);
    this.radarMesh.rotation.x = -Math.PI / 2;
    this.radarMesh.position.y = this.groundY + 4;
    this.radarMesh.scale.set(sx, sz, 1);
    this.radarMesh.visible = false;
    this.radarMesh.frustumCulled = false;
    this.scene.add(this.radarMesh);

    this.spawnPlayer();
    this.resize();
  }

  private rebuildKmGrid(sx: number, sz: number): void {
    if (this.kmGrid) {
      this.scene.remove(this.kmGrid);
      this.kmGrid.geometry.dispose();
      (this.kmGrid.material as THREE.Material).dispose();
      this.kmGrid = null;
    }
    const span = Math.max(sx, sz);
    const divisions = Math.max(4, Math.round(span / 5000));
    this.kmGrid = new THREE.GridHelper(span, divisions, 0x8fbf9a, 0x3f6a4c);
    this.kmGrid.position.y = this.groundY + 1.5;
    this.scene.add(this.kmGrid);
  }

  updateVolume(
    pack: (out: Uint8Array) => void,
    cloudMax = 0,
    rainMax = 0,
    force = false,
  ): void {
    if (!this.volumeData || !this.volumeTex || !this.volumePrevData || !this.volumePrevTex) {
      return;
    }
    const empty = cloudMax < 1e-6 && rainMax < 1e-6;
    const now = performance.now();
    if (!force) {
      if (empty && this.volumeClear) return;
      if (now - this.lastVolumeMs < 125) return;
    }
    this.volumePrevData.set(this.volumeData);
    this.volumePrevTex.needsUpdate = true;
    this.lastVolumeMs = now;
    if (empty) {
      this.volumeData.fill(0);
      this.volumeClear = true;
    } else {
      pack(this.volumeData);
      this.shapeVolume(this.volumeData, this.volNx, this.volNy, this.volNz);
      this.volumeClear = false;
    }
    this.volumeTex.needsUpdate = true;

    if (!this.warnedEmpty && !empty) {
      let maxA = 0;
      for (let i = 3; i < this.volumeData.length; i += 4) {
        if (this.volumeData[i] > maxA) maxA = this.volumeData[i];
      }
      if (maxA === 0) {
        console.warn(
          "Stormforge: cloudMax > 0 but packed volume alpha is 0 — check pack gains.",
        );
        this.warnedEmpty = true;
      }
    }
  }

  /**
   * Soften the coarse cloud slabs, then hang rain down the column and
   * spread it in the lowest levels so shafts and the downburst foot show.
   */
  private shapeVolume(data: Uint8Array, nx: number, ny: number, nz: number): void {
    if (nx < 2 || ny < 2 || nz < 2) return;
    const n = nx * ny * nz;
    if (!this.cloudScratch || this.cloudScratch.length < n) {
      this.cloudScratch = new Uint8Array(n);
      this.cloudScratchB = new Uint8Array(n);
    }
    const a = this.cloudScratch;
    const b = this.cloudScratchB!;
    const nxy = nx * ny;
    if (!this.colLive || this.colLive.length < nxy) {
      this.colLive = new Uint8Array(nxy);
      this.colSeed = new Uint8Array(nxy);
    }
    const live = this.colLive;
    const seed = this.colSeed!;
    seed.fill(0);
    const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const ij = i + nx * j;
        for (let k = 0; k < nz; k++) {
          const o = at(i, j, k) * 4;
          if (data[o] > 0 || data[o + 1] > 0) {
            seed[ij] = 1;
            break;
          }
        }
      }
    }
    // Blur kernels reach 4 cells past a cloudy column.
    live.set(seed);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (!seed[i + nx * j]) continue;
        for (let dj = -4; dj <= 4; dj++) {
          const jj = j + dj;
          if (jj < 0 || jj >= ny) continue;
          const row = jj * nx;
          const i0 = i - 4 < 0 ? 0 : i - 4;
          const i1 = i + 4 >= nx ? nx - 1 : i + 4;
          for (let ii = i0; ii <= i1; ii++) live[row + ii] = 1;
        }
      }
    }
    a.fill(0);
    b.fill(0);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (live[i + nx * j]) continue;
        for (let k = 0; k < nz; k++) data[at(i, j, k) * 4 + 2] = 0;
      }
    }
    const wz = [1, 2, 4, 7, 4, 2, 1];

    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (!live[i + nx * j]) continue;
          let acc = 0;
          let wt = 0;
          for (let dk = -3; dk <= 3; dk++) {
            const kk = k + dk;
            if (kk < 0 || kk >= nz) continue;
            const ww = wz[dk + 3];
            acc += data[at(i, j, kk) * 4] * ww;
            wt += ww;
          }
          a[at(i, j, k)] = (acc / wt + 0.5) | 0;
        }
      }
    }
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (!live[i + nx * j]) continue;
          let acc = a[at(i, j, k)] * 4;
          let wt = 4;
          if (i > 0) {
            acc += a[at(i - 1, j, k)] * 2;
            wt += 2;
          }
          if (i > 1) {
            acc += a[at(i - 2, j, k)];
            wt++;
          }
          if (i + 1 < nx) {
            acc += a[at(i + 1, j, k)] * 2;
            wt += 2;
          }
          if (i + 2 < nx) {
            acc += a[at(i + 2, j, k)];
            wt++;
          }
          b[at(i, j, k)] = (acc / wt + 0.5) | 0;
        }
      }
    }
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (!live[i + nx * j]) continue;
          let acc = b[at(i, j, k)] * 4;
          let wt = 4;
          if (j > 0) {
            acc += b[at(i, j - 1, k)] * 2;
            wt += 2;
          }
          if (j > 1) {
            acc += b[at(i, j - 2, k)];
            wt++;
          }
          if (j + 1 < ny) {
            acc += b[at(i, j + 1, k)] * 2;
            wt += 2;
          }
          if (j + 2 < ny) {
            acc += b[at(i, j + 2, k)];
            wt++;
          }
          data[at(i, j, k) * 4] = (acc / wt + 0.5) | 0;
        }
      }
    }

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (!live[i + nx * j]) continue;
        let fall = 0;
        for (let k = nz - 1; k >= 0; k--) {
          const qr = data[at(i, j, k) * 4 + 1];
          fall = qr > 8 ? Math.max(qr * 0.8, fall * 0.982) : fall * 0.965;
          data[at(i, j, k) * 4 + 2] = Math.min(255, fall) | 0;
        }
      }
    }

    const shaftW = [1, 3, 5, 3, 1];
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (!live[i + nx * j]) continue;
          let acc = 0;
          let wt = 0;
          for (let dk = -2; dk <= 2; dk++) {
            const kk = k + dk;
            if (kk < 0 || kk >= nz) continue;
            const ww = shaftW[dk + 2];
            acc += data[at(i, j, kk) * 4 + 2] * ww;
            wt += ww;
          }
          b[at(i, j, k)] = (acc / wt + 0.5) | 0;
        }
      }
    }
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (!live[i + nx * j]) continue;
          data[at(i, j, k) * 4 + 2] = b[at(i, j, k)];
        }
      }
    }

    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (!live[i + nx * j]) continue;
          let acc = data[at(i, j, k) * 4 + 2] * 2;
          let wt = 2;
          if (i > 0) {
            acc += data[at(i - 1, j, k) * 4 + 2];
            wt++;
          }
          if (i + 1 < nx) {
            acc += data[at(i + 1, j, k) * 4 + 2];
            wt++;
          }
          if (j > 0) {
            acc += data[at(i, j - 1, k) * 4 + 2];
            wt++;
          }
          if (j + 1 < ny) {
            acc += data[at(i, j + 1, k) * 4 + 2];
            wt++;
          }
          a[at(i, j, k)] = (acc / wt + 0.5) | 0;
        }
      }
    }

    const kFoot = Math.max(1, (nz * 0.12) | 0);
    for (let k = 0; k <= kFoot; k++) {
      const rad = k === 0 ? 2 : 1;
      const spread = k === 0 ? 0.72 : 0.55;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (!live[i + nx * j]) continue;
          let m = 0;
          for (let dj = -rad; dj <= rad; dj++) {
            const jj = j + dj;
            if (jj < 0 || jj >= ny) continue;
            for (let di = -rad; di <= rad; di++) {
              const ii = i + di;
              if (ii < 0 || ii >= nx) continue;
              const v = a[at(ii, jj, k)];
              if (v > m) m = v;
            }
          }
          const core = a[at(i, j, k)];
          b[at(i, j, k)] = Math.max(core, (m * spread) | 0);
        }
      }
    }
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (!live[i + nx * j]) continue;
          const id = at(i, j, k);
          data[id * 4 + 2] = k <= kFoot ? b[id] : a[id];
        }
      }
    }
  }

  updateRadar(pack: (out: Uint8Array) => void): void {
    if (!this.radarData || !this.radarTex) return;
    pack(this.radarData);
    this.radarTex.needsUpdate = true;
  }

  /**
   * Place surface wind arrows on the ground plane.
   * Physics: +u east (+X), +v north (−Z after j-flip).
   */
  updateWinds(samples: SurfaceWindSample[]): void {
    if (this.windNx < 1 || samples.length === 0) {
      if (this.windMesh) this.windMesh.visible = false;
      return;
    }
    if (!this.windMesh || this.windMesh.count < samples.length) {
      this.disposeWinds();
      const geo = makeWindArrowGeometry();
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffe08a,
        emissive: 0x3a2a10,
        emissiveIntensity: 0.35,
        roughness: 0.55,
        metalness: 0.05,
      });
      this.windMesh = new THREE.InstancedMesh(geo, mat, samples.length);
      this.windMesh.frustumCulled = false;
      this.windMesh.visible = this.windVisible;
      this.scene.add(this.windMesh);
    }

    const nx = this.windNx;
    const ny = this.windNy;
    const sx = this.windSx;
    const sz = this.windSz;
    const spdScale = windSpeedScale(samples);
    const baseLen = Math.min(sx / nx, sz / ny) * 0.85;
    const dummy = this.windDummy;
    const mesh = this.windMesh;

    for (let n = 0; n < samples.length; n++) {
      const s = samples[n];
      const x = ((s.i + 0.5) / nx - 0.5) * sx;
      // North (−Z): high j → negative world Z
      const z = -((s.j + 0.5) / ny - 0.5) * sz;
      const len =
        baseLen * (0.35 + 0.65 * Math.min(1, s.spd / Math.max(1e-3, spdScale)));
      dummy.position.set(x, this.windY, z);
      // Local +X forward → world (u, 0, −v)
      dummy.rotation.set(0, Math.atan2(s.v, s.u || 1e-6), 0);
      const thin = Math.min(18, Math.max(4, baseLen * 0.04));
      dummy.scale.set(Math.max(len, baseLen * 0.2), thin, thin);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
    }
    // Hide unused instances if buffer larger than sample count
    for (let n = samples.length; n < mesh.count; n++) {
      dummy.position.set(0, -10, 0);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = this.windVisible;
  }

  render(): void {
    if (
      this.renderer.domElement.width < 2 ||
      this.renderer.domElement.height < 2
    ) {
      this.resize();
    }
    this.sky.position.copy(this.camera.position);
    this.sky.scale.setScalar(this.camera.far * 0.9);
    this.renderer.setRenderTarget(null);
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);

    const drawClouds =
      this.cloudsOn && this.volumeMesh?.visible && this.cloudTarget;
    if (drawClouds && this.volumeMesh && this.cloudTarget) {
      const mat = this.volumeMesh.material as THREE.ShaderMaterial;
      mat.uniforms.uCameraPos.value.copy(
        this.volumeMesh.worldToLocal(this.camera.position.clone()),
      );
      (mat.uniforms.uSunWorld.value as THREE.Vector3).copy(this.sunDir);
      (mat.uniforms.uScale.value as THREE.Vector3).set(
        this.spanX,
        this.spanY,
        this.spanZ,
      );
      const fade = Math.min(1, (performance.now() - this.lastVolumeMs) / 125);
      mat.uniforms.uFade.value = this.lastVolumeMs > 0 ? fade : 1;
      this.applyFlashUniforms(mat);
      this.renderer.getClearColor(this.clearScratch);
      const prevA = this.renderer.getClearAlpha();
      this.renderer.setRenderTarget(this.cloudTarget);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear(true, false, false);
      this.renderer.render(this.cloudScene, this.camera);
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(this.clearScratch, prevA);
      this.blitMesh.visible = true;
    } else {
      this.blitMesh.visible = false;
    }

    if (this.blitMesh.visible) {
      this.renderer.autoClear = false;
      this.renderer.render(this.overlay, this.overlayCam);
      this.renderer.autoClear = true;
    }
  }

  /** A bolt inside a storm. World position is meters; i/j are grid columns. */
  addLightning(hit: { i: number; j: number; x: number; y: number; z: number }): void {
    this.liveBolts.unshift({
      ...hit,
      age: 0,
      life: 0.45,
      seed: Math.random() * 20,
    });
    if (this.liveBolts.length > 3) this.liveBolts.length = 3;
  }

  clearLightning(): void {
    this.liveBolts.length = 0;
    this.syncBoltVisuals();
  }

  tickLightning(dt: number): void {
    if (dt > 0) {
      for (const bolt of this.liveBolts) bolt.age += dt;
      this.liveBolts = this.liveBolts.filter((bolt) => bolt.age < bolt.life);
    }
    this.syncBoltVisuals();
  }

  lightningMarks(): { i: number; j: number; alpha: number }[] {
    return this.liveBolts.map((bolt) => ({
      i: bolt.i,
      j: bolt.j,
      alpha: Math.max(0, 1 - bolt.age / bolt.life),
    }));
  }

  private syncBoltVisuals(): void {
    for (let n = 0; n < 3; n++) {
      const bolt = this.liveBolts[n];
      const light = this.flashLights[n];
      const line = this.boltLines[n];
      if (!bolt || !light || !line) {
        if (light) light.intensity = 0;
        if (line) line.visible = false;
        continue;
      }
      const alpha = Math.max(0, 1 - bolt.age / bolt.life);
      const pulse = alpha * alpha;
      light.position.set(bolt.x, bolt.y - 600, bolt.z);
      light.intensity = 6e6 * pulse;
      const pos = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      let px = bolt.x;
      let py = bolt.y;
      let pz = bolt.z;
      for (let s = 0; s < 6; s++) {
        pos.setXYZ(s, px, py, pz);
        px += Math.sin(bolt.seed + s * 2.17) * 90;
        pz += Math.cos(bolt.seed * 1.3 + s) * 90;
        py -= 240;
      }
      pos.needsUpdate = true;
      const mat = line.material as THREE.LineBasicMaterial;
      mat.opacity = alpha;
      line.visible = alpha > 0.04;
    }
  }

  private applyFlashUniforms(mat: THREE.ShaderMaterial): void {
    const lead = this.liveBolts[0];
    if (!lead || !this.volumeMesh) {
      mat.uniforms.uFlash.value = 0;
      return;
    }
    const alpha = Math.max(0, 1 - lead.age / lead.life);
    mat.uniforms.uFlash.value = alpha * alpha;
    const local = this.volumeMesh.worldToLocal(
      new THREE.Vector3(lead.x, lead.y, lead.z),
    );
    (mat.uniforms.uFlashLocal.value as THREE.Vector3).copy(local);
  }

  private makeVolumeTexture(
    data: Uint8Array,
    nx: number,
    ny: number,
    nz: number,
  ): THREE.Data3DTexture {
    const tex = new THREE.Data3DTexture(
      data as unknown as BufferSource,
      nx,
      ny,
      nz,
    );
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.UnsignedByteType;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.unpackAlignment = 1;
    tex.flipY = false;
    if ("colorSpace" in tex) tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  private disposeRadar(): void {
    if (this.radarMesh) {
      this.scene.remove(this.radarMesh);
      this.radarMesh.geometry.dispose();
      (this.radarMesh.material as THREE.Material).dispose();
      this.radarMesh = null;
    }
    if (this.radarTex) {
      this.radarTex.dispose();
      this.radarTex = null;
    }
    this.radarData = null;
    this.radarNx = 0;
    this.radarNy = 0;
  }

  private disposeWinds(): void {
    if (this.windMesh) {
      this.scene.remove(this.windMesh);
      this.windMesh.geometry.dispose();
      (this.windMesh.material as THREE.Material).dispose();
      this.windMesh = null;
    }
  }

  dispose(): void {
    this.ro?.disconnect();
    this.ro = null;
    this.disposeRadar();
    this.disposeWinds();
    if (this.volumeMesh) {
      this.cloudScene.remove(this.volumeMesh);
      this.volumeMesh.geometry.dispose();
      (this.volumeMesh.material as THREE.Material).dispose();
      this.volumeMesh = null;
    }
    this.cloudTarget?.dispose();
    this.cloudTarget = null;
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.blitMesh.geometry.dispose();
    (this.blitMesh.material as THREE.Material).dispose();
    if (this.volumeTex) {
      this.volumeTex.dispose();
      this.volumeTex = null;
    }
    if (this.volumePrevTex) {
      this.volumePrevTex.dispose();
      this.volumePrevTex = null;
    }
    this.volumePrevData = null;
    if (this.kmGrid) {
      this.scene.remove(this.kmGrid);
      this.kmGrid.geometry.dispose();
      (this.kmGrid.material as THREE.Material).dispose();
      this.kmGrid = null;
    }
    this.unbindLook?.();
    this.unbindLook = null;
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

/** Unit arrow along +X: shaft [0..0.65] + head [0.55..1]. */
function makeWindArrowGeometry(): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(0.045, 0.045, 0.62, 5);
  shaft.rotateZ(-Math.PI / 2);
  shaft.translate(0.31, 0, 0);
  const head = new THREE.ConeGeometry(0.13, 0.38, 6);
  head.rotateZ(-Math.PI / 2);
  head.translate(0.81, 0, 0);

  const sPos = shaft.attributes.position.array as Float32Array;
  const hPos = head.attributes.position.array as Float32Array;
  const sNorm = shaft.attributes.normal.array as Float32Array;
  const hNorm = head.attributes.normal.array as Float32Array;
  const sIdx = shaft.index!.array;
  const hIdx = head.index!.array;
  const sCount = sPos.length / 3;

  const positions = new Float32Array(sPos.length + hPos.length);
  const normals = new Float32Array(sNorm.length + hNorm.length);
  positions.set(sPos, 0);
  positions.set(hPos, sPos.length);
  normals.set(sNorm, 0);
  normals.set(hNorm, sNorm.length);

  const indices = new Uint32Array(sIdx.length + hIdx.length);
  indices.set(sIdx, 0);
  for (let i = 0; i < hIdx.length; i++) {
    indices[sIdx.length + i] = hIdx[i] + sCount;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  shaft.dispose();
  head.dispose();
  return geo;
}
