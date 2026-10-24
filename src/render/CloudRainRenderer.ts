import * as THREE from "three";
import { Grid3D, volumeDisplaySize } from "../sim/Grid3D";
import type { LightningKind } from "../sim/FluidSolver";
import {
  SurfaceWindSample,
  windSpeedScale,
} from "../sim/surfaceWinds";
import { upsampleRgba } from "./upsampleRgba";
import {
  applyLookdevPreset,
  LOOKDEV_PRESETS,
} from "./clouds/lookdevPresets";
import {
  createCloudMesh,
  DEFAULT_LOOK,
  VolumetricCloudMaterial,
} from "./clouds/VolumetricCloudMaterial";
import { computeSkyLighting } from "./clouds/sunLighting";
import { computeSky, SkyState, hazeExtinction, SUN_LEVELS, SUN_TOP, SKY_COLS, SKY_ROWS } from "./sky";
import { skyFragment, skyVertex } from "./clouds/skyShader";
import { course, brightness, type LightningCourse } from "./lightning";
import { SpriteView } from "./sprites";
import { PrecipitationParticles } from "./precipitation";

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
  vec4 c = texture(uTex, vUv);
  float a = max(c.a, 1e-4);
  vec3 lin = c.rgb / a;
  fragColor = vec4(pow(max(lin, vec3(0.0)), vec3(1.0 / 2.2)) * c.a, c.a);
}
`;

const presentFrag = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec3 lin = texture(uTex, vUv).rgb;
  fragColor = vec4(pow(max(lin, vec3(0.0)), vec3(1.0 / 2.2)), 1.0);
}
`;

const resolveFrag = /* glsl */ `
precision highp float;
uniform sampler2D uCurrent;
uniform sampler2D uHistory;
uniform sampler2D uDepth;
uniform mat4 uInvViewProj;
uniform mat4 uPrevViewProj;
uniform float uMix;
uniform float uValid;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 curr = texture(uCurrent, vUv);
  if (uValid < 0.5) {
    fragColor = curr;
    return;
  }
  float depth = texture(uDepth, vUv).r;
  vec4 ndc = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 world = uInvViewProj * ndc;
  world /= max(world.w, 1e-6);
  vec4 prev = uPrevViewProj * vec4(world.xyz, 1.0);
  prev /= max(prev.w, 1e-6);
  vec2 puv = prev.xy * 0.5 + 0.5;
  float inside = step(0.0, puv.x) * step(puv.x, 1.0) * step(0.0, puv.y) * step(puv.y, 1.0);
  float stable = inside * step(length(puv - vUv), 0.15);
  vec4 hist = texture(uHistory, puv);
  // When history is invalid, still blend slightly to avoid hard pop
  float blendMix = uValid > 0.5 ? uMix : 0.0;
  fragColor = mix(curr, mix(curr, hist, blendMix), stable);
}
`;

export class CloudRainRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private volumeTex: THREE.Data3DTexture | null = null;
  private volumeMesh: THREE.Mesh | null = null;
  private volumeData: Uint8Array | null = null;
  private cloudMat: VolumetricCloudMaterial | null = null;
  /** Empty string follows the sim sun. A preset name locks sun and look. */
  private lookdev: "" | keyof typeof LOOKDEV_PRESETS = "";
  /** Environmental wind, m/s. +east, +north. */
  private envEast = 1;
  private envNorth = 0;
  private radarTex: THREE.DataTexture | null = null;
  private radarMesh: THREE.Mesh | null = null;
  /** Native grid image, before the view-detail upsample. */
  private radarNative: Uint8Array | null = null;
  private radarData: Uint8Array | null = null;
  private radarNx = 0;
  private radarNy = 0;
  /** Display samples per grid cell. 1 keeps the cells blocky. */
  private radarScale = 2;
  private domainSpan = 2;
  /** Domain size in meters. X east, Z north-south (north is −Z), Y up. */
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
  private cloudHistory: THREE.WebGLRenderTarget | null = null;
  private cloudResolved: THREE.WebGLRenderTarget | null = null;
  private historyValid = false;
  private sceneTarget: THREE.WebGLRenderTarget | null = null;
  private presentScene = new THREE.Scene();
  private sceneBlit: THREE.Mesh;
  private resolveScene = new THREE.Scene();
  private resolveMesh: THREE.Mesh;
  private prevViewProj = new THREE.Matrix4();
  private currViewProj = new THREE.Matrix4();
  private invViewProj = new THREE.Matrix4();
  private tune = {
    gain: 1,
    sigmaLiquid: DEFAULT_LOOK.sigmaLiquid,
    sigmaRain: DEFAULT_LOOK.sigmaRain,
    erosionLiquid: DEFAULT_LOOK.erosionLiquid,
    erosionIce: DEFAULT_LOOK.erosionIce,
    mammatusDepth: DEFAULT_LOOK.mammatusDepth,
    mammatusCell: DEFAULT_LOOK.mammatusCell,
    shaftMax: DEFAULT_LOOK.shaftMax,
    freezing: DEFAULT_LOOK.freezing,
    shadowProbes: DEFAULT_LOOK.shadowProbes,
  };
  private sky: THREE.Mesh;
  /** CPU-computed atmospheric sky table (sky.ts), uploaded as a 2D texture. */
  private skyTexture: THREE.DataTexture | null = null;
  private skyState: SkyState | null = null;
  private sunElevationDeg = 45;
  private haze = 0.1;
  private blitMesh: THREE.Mesh;
  private sunFrac = 0;
  private sunDir = new THREE.Vector3(0.25, 0.75, 0.2);
  private cloudsOn = true;
  private volumeClear = false;
  private lastVolumeMs = 0;
  private clearScratch = new THREE.Color();
  private spriteView: SpriteView | null = null;
  /** Renderer-side rain/snow particles spawned from the packed volume. */
  private precipitation: PrecipitationParticles;
  private timeSeconds = 0;
  private liveBolts: {
    i: number;
    j: number;
    kind: LightningKind;
    x: number;
    y: number;
    z: number;
    age: number;
    life: number;
    seed: number;
    brightness: number;
    course: import("./lightning").LightningCourse;
    isCg: boolean;
  }[] = [];
  private groundFlashMesh: THREE.Mesh | null = null;
  private flashTint = new THREE.Color(0.75, 0.86, 1);
  private flashFar = new THREE.Color(1, 0.92, 0.55);
  private spriteTint = new THREE.Color(1, 0.28, 0.38);
  private flashLights: THREE.PointLight[] = [];
  private boltScene = new THREE.Scene();
  private boltRibbons: THREE.Mesh[] = [];
  private readonly boltPointCount = 28;
  private readonly boltScratch: THREE.Vector3[] = Array.from(
    { length: 28 },
    () => new THREE.Vector3(),
  );
  private readonly boltRight = new THREE.Vector3();
  private readonly boltTangent = new THREE.Vector3();
  private readonly boltToCam = new THREE.Vector3();

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor(0x9fb4c4, 1);
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
    this.sunLight = new THREE.DirectionalLight(0xfff2d6, 1.25);
    this.sunLight.position.set(80, 200, 40);
    this.scene.add(this.sunLight);
    for (let n = 0; n < 6; n++) {
      const light = new THREE.PointLight(0xdbe7ff, 0, 48000, 1.6);
      light.castShadow = false;
      this.flashLights.push(light);
      this.scene.add(light);
      const ribbon = this.makeBoltRibbon();
      this.boltRibbons.push(ribbon);
      this.boltScene.add(ribbon);
    }
    // Ground flash plane — lit additively during CG strikes
    const gfGeo = new THREE.PlaneGeometry(1, 1);
    const gfMat = new THREE.MeshBasicMaterial({
      color: 0xdbe7ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.groundFlashMesh = new THREE.Mesh(gfGeo, gfMat);
    this.groundFlashMesh.rotation.x = -Math.PI / 2;
    this.groundFlashMesh.position.y = -0.5;
    this.groundFlashMesh.frustumCulled = false;
    this.scene.add(this.groundFlashMesh);
    this.scene.fog = new THREE.FogExp2(0x9fb4c4, 0.0001);
    this.renderer.setClearColor(0x9fb4c4, 1);

    const groundGeo = new THREE.PlaneGeometry(4, 4);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x596d45,
      roughness: 0.96,
      metalness: 0,
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
        depthWrite: false,
      }),
    );
    this.scene.add(this.domainBox);

    // Atmospheric sky table (CPU-computed via sky.ts), uploaded as a texture.
    const skyData = new Uint16Array(SKY_COLS * SKY_ROWS * 4);
    this.skyTexture = new THREE.DataTexture(skyData, SKY_COLS, SKY_ROWS, THREE.RGBAFormat, THREE.HalfFloatType);
    this.skyTexture.minFilter = this.skyTexture.magFilter = THREE.LinearFilter;
    this.skyTexture.needsUpdate = true;

    const skyMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      uniforms: {
        uSky: { value: this.skyTexture },
        uSkyGain: { value: 1 },
        uSkyFloor: { value: new THREE.Color() },
        uCityGlow: { value: new THREE.Color() },
        uHaze: { value: 0.1 },
        uSunDir: { value: this.sunDir },
        uSunDisc: { value: new THREE.Color(1, 1, 1) },
        uGroundLight: { value: new THREE.Color() },
        uStars: { value: 0 },
        uWater: { value: 0 },
        uLab: { value: 0 },
      },
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    // Initial sky for the default sun direction.
    this.updateSkyFromSun();

    const blitMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: blitVert,
      fragmentShader: blitFrag,
      uniforms: { uTex: { value: null } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.blitMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMat);
    this.blitMesh.frustumCulled = false;
    this.overlay.add(this.blitMesh);

    const sceneBlitMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: blitVert,
      fragmentShader: presentFrag,
      uniforms: { uTex: { value: null } },
      depthTest: false,
      depthWrite: false,
    });
    this.sceneBlit = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sceneBlitMat);
    this.sceneBlit.frustumCulled = false;
    this.presentScene.add(this.sceneBlit);

    const resolveMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: blitVert,
      fragmentShader: resolveFrag,
      uniforms: {
        uCurrent: { value: null },
        uHistory: { value: null },
        uDepth: { value: null },
        uInvViewProj: { value: this.invViewProj },
        uPrevViewProj: { value: this.prevViewProj },
        uMix: { value: 0.85 },
        uValid: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.resolveMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), resolveMat);
    this.resolveMesh.frustumCulled = false;
    this.resolveScene.add(this.resolveMesh);

    this.spriteView = new SpriteView(this.scene);
    this.precipitation = new PrecipitationParticles();
    this.scene.add(this.precipitation.points);

    this.syncSky();

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
    if (!this.sceneTarget || this.sceneTarget.width !== bw || this.sceneTarget.height !== bh) {
      this.sceneTarget?.dispose();
      const depth = new THREE.DepthTexture(bw, bh);
      depth.format = THREE.DepthFormat;
      depth.type = THREE.UnsignedIntType;
      this.sceneTarget = new THREE.WebGLRenderTarget(bw, bh, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        depthTexture: depth,
        depthBuffer: true,
      });
      const present = this.sceneBlit.material as THREE.ShaderMaterial;
      present.uniforms.uTex.value = this.sceneTarget.texture;
    }
    const hw = Math.max(1, Math.floor(bw * 0.5));
    const hh = Math.max(1, Math.floor(bh * 0.5));
    if (
      !this.cloudTarget ||
      this.cloudTarget.width !== hw ||
      this.cloudTarget.height !== hh
    ) {
      this.cloudTarget?.dispose();
      this.cloudHistory?.dispose();
      this.cloudResolved?.dispose();
      const half = () =>
        new THREE.WebGLRenderTarget(hw, hh, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
          depthBuffer: false,
        });
      this.cloudTarget = half();
      this.cloudHistory = half();
      this.cloudResolved = half();
      this.historyValid = false;
    }
  }

  setVolumeVisible(on: boolean): void {
    this.cloudsOn = on;
    if (this.volumeMesh) this.volumeMesh.visible = on;
    this.precipitation.setVisible(on);
  }

  /** Height of the 0 °C level above the ground, in metres. */
  setFreezingLevel(zAboveGround: number | null): void {
    this.precipitation.setFreezingLevel(zAboveGround);
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
    this.sunFrac = f;
    // Better sky clear color blending for day/night
    const mix = (a: number, b: number, t: number) => a + (b - a) * t;
    let r = mix(8, 135, f);
    let g = mix(12, 175, f);
    let b = mix(24, 210, f);
    // Golden hour tint
    if (f < 0.3 && f > 0.05) {
      const g = mix(0, 1, (0.3 - f) / 0.25);
      r = mix(r, mix(160, 135, f), g * 0.4);
      b = mix(b, mix(80, 210, f), g * 0.3);
    }
    // Twilight/blue hour
    if (f < 0.05) {
      const t = mix(0, 1, f / 0.05);
      r = mix(15, mix(15, 12, 1-t), t);
      g = mix(22, mix(25, 12, 1-t), t);
      b = mix(45, mix(65, 24, 1-t), t);
    }
    const sky = ((Math.round(r) & 0xff) << 16) | ((Math.round(g) & 0xff) << 8) | (Math.round(b) & 0xff);
    this.renderer.setClearColor(sky, 1);
    if (this.scene.fog) {
      const fogColor = ((Math.round(r + 10) & 0xff) << 16) | ((Math.round(g + 15) & 0xff) << 8) | (Math.round(b + 25) & 0xff);
      this.scene.fog.color.set(fogColor);
    }
    this.hemi.intensity = mix(0.4, 1.0, f);
    this.hemi.color.setRGB(0.851, 0.937, 1.0);
    this.hemi.groundColor.setRGB(0.294, 0.267, 0.224);
    this.sunLight.intensity = mix(0.2, 1.0, f);
  }

  /** Daylight fraction plus the world sun direction (+X east, +Y up, −Z north). */
  setSun(frac: number, dir: { x: number; y: number; z: number }): void {
    this.setSunFrac(frac);
    this.sunDir.set(dir.x, dir.y, dir.z);
    if (this.sunDir.lengthSq() < 1e-8) this.sunDir.set(0, 1, 0);
    else this.sunDir.normalize();
    this.sunLight.position.copy(this.sunDir).multiplyScalar(400);
    const elev = this.sunDir.y;
    this.sunLight.color.set(1.0, 0.941, 0.824);
    this.updateSkyFromSun();
    this.applyCloudSun();
  }

  /** Recompute the atmospheric sky table from the current sun direction and upload it. */
  private updateSkyFromSun(): void {
    if (!this.skyTexture || !this.sky) return;
    const elev = this.sunDir.y;
    const elDeg = (Math.asin(Math.min(1, Math.max(-1, elev))) * 180) / Math.PI;
    this.sunElevationDeg = elDeg;
    // Haze from humidity-ish: midday clearer, evening hazier.
    const rh = 0.6 + 0.3 * Math.max(0, -elDeg / 15);
    const haze = hazeExtinction(rh);
    this.haze = haze;
    const state = computeSky(elDeg * Math.PI / 180, haze, 0.2);
    this.skyState = state;
    // Upload the sky table as an RGBA HalfFloat texture.
    const data = new Uint16Array(SKY_COLS * SKY_ROWS * 4);
    const toHalf = (THREE.DataUtils as any).toHalfFloat;
    const sky = state.sky;
    for (let i = 0; i < SKY_ROWS * SKY_COLS; i++) {
      const o = i * 4;
      data[o] = toHalf(sky[i * 3]);
      data[o + 1] = toHalf(sky[i * 3 + 1]);
      data[o + 2] = toHalf(sky[i * 3 + 2]);
      data[o + 3] = toHalf(1);
    }
    (this.skyTexture.image as unknown as { data: Uint16Array }).data = data;
    this.skyTexture.needsUpdate = true;

    // Sky material uniforms.
    const mat = this.sky.material as THREE.ShaderMaterial;
    const sunEl = Math.sin(elDeg * Math.PI / 180);
    const gain = 14 * (Math.max(0, sunEl) + 0.05);
    (mat.uniforms.uSkyGain as { value: number }).value = gain;
    (mat.uniforms.uHaze as { value: number }).value = haze;
    (mat.uniforms.uSunDir as { value: THREE.Vector3 }).value.copy(this.sunDir);
    (mat.uniforms.uStars as { value: number }).value = elDeg < -8 ? 1 : 0;
    const irr = state.skyIrradiance;
    (mat.uniforms.uGroundLight as { value: THREE.Color }).value.setRGB(irr[0], irr[1], irr[2]);
    const day = Math.min(1, Math.max(0, (elDeg + 8) / 20));
    (mat.uniforms.uSunDisc as { value: THREE.Color }).value.setScalar(40 * day);
  }

  /** Environmental wind in m/s. East is +X, north is +Y in the sim and −Z in the view. */
  setEnvironmentWind(east: number, north: number): void {
    this.envEast = east;
    this.envNorth = north;
    this.applyCloudWind();
    this.precipitation.setWind(east, north);
  }

  /**
   * Photo-matching look. Pass "" to follow the sim sun again.
   * A preset is reapplied each frame so a camera turn keeps the sun angle.
   */
  setCloudLook(name: string): void {
    if (name && name in LOOKDEV_PRESETS) {
      this.lookdev = name as keyof typeof LOOKDEV_PRESETS;
      if (this.cloudMat) {
        this.cloudMat.setLook({ ...DEFAULT_LOOK });
        applyLookdevPreset(this.cloudMat, this.camera, this.lookdev);
        this.captureTuneFromMaterial();
        this.cloudMat.setFieldGain(this.tune.gain);
      }
      return;
    }
    this.lookdev = "";
    this.tune.sigmaLiquid = DEFAULT_LOOK.sigmaLiquid;
    this.tune.sigmaRain = DEFAULT_LOOK.sigmaRain;
    this.tune.erosionLiquid = DEFAULT_LOOK.erosionLiquid;
    this.tune.erosionIce = DEFAULT_LOOK.erosionIce;
    if (this.cloudMat) {
      this.cloudMat.setLook({ ...DEFAULT_LOOK });
      this.applyTune();
    }
    this.applyCloudSun();
  }

  cloudTune(): { gain: number; sigmaLiquid: number; sigmaRain: number; erosionLiquid: number; erosionIce: number } {
    return { ...this.tune };
  }

  /** Live knobs. fieldGain is one multiplier for liquid, ice, and rain. */
  setCloudTune(partial: {
    gain?: number;
    sigmaLiquid?: number;
    sigmaRain?: number;
    erosionLiquid?: number;
    erosionIce?: number;
  }): void {
    if (partial.gain != null) this.tune.gain = partial.gain;
    if (partial.sigmaLiquid != null) this.tune.sigmaLiquid = partial.sigmaLiquid;
    if (partial.sigmaRain != null) this.tune.sigmaRain = partial.sigmaRain;
    if (partial.erosionLiquid != null) this.tune.erosionLiquid = partial.erosionLiquid;
    if (partial.erosionIce != null) this.tune.erosionIce = partial.erosionIce;
    this.applyTune();
  }

  private captureTuneFromMaterial(): void {
    if (!this.cloudMat) return;
    const s = this.cloudMat.lookSnapshot();
    this.tune.sigmaLiquid = s.sigmaLiquid;
    this.tune.sigmaRain = s.sigmaRain;
    this.tune.erosionLiquid = s.erosionLiquid;
    this.tune.erosionIce = s.erosionIce;
  }

  private applyTune(): void {
    if (!this.cloudMat) return;
    this.cloudMat.setFieldGain(this.tune.gain);
    this.cloudMat.setLook({
      sigmaLiquid: this.tune.sigmaLiquid,
      sigmaRain: this.tune.sigmaRain,
      erosionLiquid: this.tune.erosionLiquid,
      erosionIce: this.tune.erosionIce,
      mammatusDepth: this.tune.mammatusDepth,
      mammatusCell: this.tune.mammatusCell,
      shaftMax: this.tune.shaftMax,
      freezing: this.tune.freezing,
      shadowProbes: this.tune.shadowProbes,
    });
  }

  private syncSky(): void {
    // The atmospheric sky is fully managed by updateSkyFromSun() (called from setSun).
    // Keep the sun dir uniform in sync in case the camera-relative lookdev override moves it.
    const mat = this.sky.material as THREE.ShaderMaterial;
    (mat.uniforms.uSunDir as { value: THREE.Vector3 }).value.copy(this.sunDir);
  }

  private uploadFlashes(): void {
    if (!this.cloudMat) return;
    const flashes: {
      x: number;
      y: number;
      z: number;
      r: number;
      g: number;
      b: number;
      amount: number;
    }[] = [];
    for (const bolt of this.liveBolts) {
      if (flashes.length >= 4) break;
      if (bolt.kind === "sprite") continue;
      const alpha = Math.max(0, 1 - bolt.age / bolt.life);
      const pulse = alpha * alpha * bolt.brightness;
      const gain = 3 * (1 - 0.9 * this.sunFrac) / 10;
      this.boltTint(bolt.x, bolt.y, bolt.z);
      const pushAt = (x: number, y: number, z: number) => {
        if (flashes.length >= 4) return;
        flashes.push({
          x,
          y,
          z,
          r: this.flashTint.r,
          g: this.flashTint.g,
          b: this.flashTint.b,
          amount: pulse * gain,
        });
      };
      pushAt(bolt.x, bolt.y, bolt.z);
    }
    this.cloudMat.setFlashes(flashes);
  }

  private applyCloudSun(): void {
    if (!this.cloudMat || this.lookdev) return;
    const d = this.sunDir;
    const az = (Math.atan2(d.x, -d.z) * 180) / Math.PI;
    const el = (Math.asin(Math.min(1, Math.max(-1, d.y))) * 180) / Math.PI;
    // Use the atmospheric sky state for cloud lighting colors when available.
    if (this.skyState) {
      const sunEl = Math.sin(el * Math.PI / 180);
      const day = Math.min(1, Math.max(0, (el + 8) / 20));
      const irr = this.skyState.sunIrradiance;
      const sunCol = this.skyState.sunByHeight;
      // Approximate sun color from the top-of-atmosphere irradiance scaled by sun elevation.
      const sIdx = Math.min(SUN_LEVELS - 1, Math.max(0, Math.round(sunEl * (SUN_LEVELS - 1))));
      this.cloudMat.setSun(az, el);
      const cm = this.cloudMat.uniforms;
      (cm.uSunColor as { value: THREE.Vector3 }).value.set(sunCol[sIdx * 3], sunCol[sIdx * 3 + 1], sunCol[sIdx * 3 + 2]).multiplyScalar(1 + day);
      (cm.uSkyColor as { value: THREE.Vector3 }).value.set(irr[0], irr[1], irr[2]);
    } else {
      this.cloudMat.setSun(az, el);
    }
  }

  private applyCloudWind(): void {
    if (!this.cloudMat) return;
    const spd = Math.hypot(this.envEast, this.envNorth);
    if (spd < 0.05) this.cloudMat.setWind(1, 0, 0);
    else this.cloudMat.setWind(this.envEast, -this.envNorth, spd);
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
    if (this.groundFlashMesh) {
      this.groundFlashMesh.scale.set(sx * 1.12, sz * 1.12, 1);
      this.groundFlashMesh.position.y = this.groundY + 1;
    }
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
      this.cloudMat = null;
    }
    if (this.volumeTex) {
      this.volumeTex.dispose();
      this.volumeTex = null;
    }
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
    // Texture axes are the world box: X east, Y up, Z south.
    this.volumeTex = this.makeVolumeTexture(this.volumeData, disp.nx, disp.nz, disp.ny);
    this.precipitation.setBounds(sx, sz, this.groundY, height);
    this.precipitation.setVolume(this.volumeData, disp.nx, disp.ny, disp.nz);

    const boxMin = new THREE.Vector3(-sx / 2, this.groundY, -sz / 2);
    const boxMax = new THREE.Vector3(sx / 2, this.groundY + height, sz / 2);
    this.cloudMat = new VolumetricCloudMaterial({
      fields: this.volumeTex,
      boxMin,
      boxMax,
      fieldGain: new THREE.Vector3(this.tune.gain, this.tune.gain, this.tune.gain),
      quality: { maxSteps: 64 },
    });
    this.volumeMesh = createCloudMesh(this.cloudMat, boxMin, boxMax);
    this.volumeMesh.visible = this.cloudsOn;
    this.cloudScene.add(this.volumeMesh);
    this.volumeClear = false;
    this.lastVolumeMs = 0;
    this.applyCloudSun();
    this.applyCloudWind();
    if (this.lookdev) {
      this.cloudMat.setLook({ ...DEFAULT_LOOK });
      applyLookdevPreset(this.cloudMat, this.camera, this.lookdev);
      this.captureTuneFromMaterial();
    }
    this.applyTune();
    this.historyValid = false;

    // Radar composite plane (just above ground)
    this.radarNx = grid.nx;
    this.radarNy = grid.ny;
    this.radarNative = new Uint8Array(grid.nx * grid.ny * 4);
    this.radarData = null;
    this.radarTex = null;
    this.ensureRadarTexture();

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
    const gridMat = this.kmGrid.material;
    const mats = Array.isArray(gridMat) ? gridMat : [gridMat];
    for (const m of mats) m.depthWrite = false;
    this.scene.add(this.kmGrid);
  }

  updateVolume(
    pack: (out: Uint8Array) => void,
    cloudMax = 0,
    rainMax = 0,
    force = false,
  ): void {
    if (!this.volumeData || !this.volumeTex) return;
    const empty = cloudMax < 1e-6 && rainMax < 1e-6;
    const now = performance.now();
    if (!force) {
      if (empty && this.volumeClear) return;
      if (now - this.lastVolumeMs < 50) return;
    }
    this.lastVolumeMs = now;
    if (empty) {
      this.volumeData.fill(0);
      this.volumeClear = true;
    } else {
      pack(this.volumeData);
      this.volumeClear = false;
    }
    this.volumeTex.needsUpdate = true;
    // Wet ground: darken under active rain
    const wetness = Math.min(1, rainMax / 0.002);
    const groundMat = this.ground.material as THREE.MeshStandardMaterial;
    groundMat.color.setRGB(
      0.3 - wetness * 0.12,
      0.55 - wetness * 0.2,
      0.32 - wetness * 0.12,
    );
    groundMat.roughness = 0.95 - wetness * 0.35;

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

  /** 1×–4× display samples per grid cell. Does not change the simulation. */
  setRadarDetail(scale: number): void {
    const next = Math.max(1, Math.min(4, scale | 0));
    if (next === this.radarScale && this.radarTex) return;
    this.radarScale = next;
    this.ensureRadarTexture();
  }

  updateRadar(pack: (out: Uint8Array) => void): void {
    if (!this.radarNative) return;
    pack(this.radarNative);
    this.uploadRadar();
  }

  private ensureRadarTexture(): void {
    const f = this.radarScale;
    const w = this.radarNx * f;
    const h = this.radarNy * f;
    if (this.radarTex && this.radarData && this.radarData.length === w * h * 4) {
      this.uploadRadar();
      return;
    }
    this.radarData = new Uint8Array(w * h * 4);
    const tex = new THREE.DataTexture(
      this.radarData as unknown as BufferSource,
      w,
      h,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    const filter = f <= 1 ? THREE.NearestFilter : THREE.LinearFilter;
    tex.minFilter = filter;
    tex.magFilter = filter;
    tex.flipY = true;
    tex.needsUpdate = true;
    if ("colorSpace" in tex) tex.colorSpace = THREE.NoColorSpace;
    this.radarTex?.dispose();
    this.radarTex = tex;
    const mat = this.radarMesh?.material as THREE.MeshBasicMaterial | undefined;
    if (mat) {
      mat.map = tex;
      mat.needsUpdate = true;
    }
    this.uploadRadar();
  }

  private uploadRadar(): void {
    if (!this.radarNative || !this.radarData || !this.radarTex) return;
    const f = this.radarScale;
    if (f <= 1) this.radarData.set(this.radarNative);
    else upsampleRgba(this.radarNative, this.radarNx, this.radarNy, f, this.radarData);
    // No-echo is the opaque map background. On the 3D plane that color is
    // punched out so the ground still shows outside the echo.
    const data = this.radarData;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === 10 && data[i + 1] === 16 && data[i + 2] === 28) data[i + 3] = 0;
    }
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
        depthWrite: false,
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
      this.renderer.domElement.height < 2 ||
      !this.sceneTarget
    ) {
      this.resize();
    }
    if (!this.sceneTarget || !this.cloudTarget || !this.cloudHistory || !this.cloudResolved) {
      return;
    }

    this.camera.updateMatrixWorld();
    this.camera.updateProjectionMatrix();
    this.currViewProj.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse,
    );
    this.invViewProj.copy(this.currViewProj).invert();
    this.precipitation.update(performance.now());

    if (this.cloudMat) {
      this.cloudMat.update(performance.now() * 0.001);
      if (this.lookdev) {
        const preset = LOOKDEV_PRESETS[this.lookdev];
        this.cloudMat.setSunRelativeToCamera(
          this.camera,
          preset.sunRelativeAzimuthDeg,
          preset.sunElevationDeg,
        );
      }
      this.uploadFlashes();
      const depth = this.sceneTarget.depthTexture;
      if (depth) {
        this.cloudMat.setSceneDepth(
          depth,
          this.camera,
          new THREE.Vector2(this.cloudTarget.width, this.cloudTarget.height),
        );
      }
    }
    this.syncSky();

    this.sky.position.copy(this.camera.position);
    this.sky.scale.setScalar(this.camera.far * 0.9);
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);

    const drawClouds = this.cloudsOn && !!this.volumeMesh?.visible && !!this.cloudMat;
    if (drawClouds && this.cloudMat) {
      this.renderer.getClearColor(this.clearScratch);
      const prevA = this.renderer.getClearAlpha();
      this.renderer.setRenderTarget(this.cloudTarget);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear(true, false, false);
      this.renderer.render(this.cloudScene, this.camera);

      const resolve = this.resolveMesh.material as THREE.ShaderMaterial;
      resolve.uniforms.uCurrent.value = this.cloudTarget.texture;
      resolve.uniforms.uHistory.value = this.cloudHistory.texture;
      resolve.uniforms.uDepth.value = this.sceneTarget.depthTexture;
      resolve.uniforms.uValid.value = this.historyValid ? 1 : 0;
      resolve.uniforms.uMix.value = this.lightningMix();
      this.renderer.setRenderTarget(this.cloudResolved);
      this.renderer.clear(true, false, false);
      this.renderer.render(this.resolveScene, this.overlayCam);
      this.renderer.setClearColor(this.clearScratch, prevA);

      const blit = this.blitMesh.material as THREE.ShaderMaterial;
      blit.uniforms.uTex.value = this.cloudResolved.texture;
      this.blitMesh.visible = true;
      this.historyValid = true;
      const previous = this.cloudHistory;
      this.cloudHistory = this.cloudResolved;
      this.cloudResolved = previous;
    } else {
      this.blitMesh.visible = false;
      // Don't invalidate history — keep the last good frame so re-enabling clouds doesn't cold-start
    }

    this.renderer.setRenderTarget(null);
    this.renderer.autoClear = true;
    this.renderer.render(this.presentScene, this.overlayCam);
    if (this.blitMesh.visible) {
      this.renderer.autoClear = false;
      this.renderer.render(this.overlay, this.overlayCam);
    }
    if (this.boltRibbons.some((ribbon) => ribbon.visible)) {
      this.renderer.autoClear = false;
      this.renderer.render(this.boltScene, this.camera);
    }
    this.renderer.autoClear = true;
    this.prevViewProj.copy(this.currViewProj);
  }

  /** Reduce TAA blend while a bolt is bright so the flash isn't smeared, but never drop to 0. */
  private lightningMix(): number {
    for (const bolt of this.liveBolts) {
      if (bolt.kind === "sprite") continue;
      const b = brightness(bolt.course, bolt.isCg, bolt.age * 1000);
      if (b.main * bolt.brightness > 0.45) return 0.3;
    }
    return 0.88;
  }

  private makeBoltRibbon(): THREE.Mesh {
    const n = this.boltPointCount;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3),
    );
    const index: number[] = [];
    for (let s = 0; s < n - 1; s++) {
      const a = s * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(index);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf4f7ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = 10;
    return mesh;
  }

  /** A bolt inside a storm. World position is meters; i/j are grid columns. */
  addLightning(hit: {
    i: number;
    j: number;
    kind: LightningKind;
    x: number;
    y: number;
    z: number;
  }): void {
    const kind = hit.kind;
    let seed = Math.random() * 20;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed >>> 0) / 0xffffffff;
    };
    // Positive CG ~10% of the time; extent in km (domain scale, rough).
    const charge = Math.random() < 0.1 ? 1 : -1;
    const extentKm = 6;
    const c = course(kind, charge, extentKm, rng);
    const life = c.end / 1000;
    const isCg = kind === "cg";
    this.liveBolts.unshift({
      ...hit,
      age: 0,
      life,
      seed,
      course: c,
      isCg,
      brightness: isCg ? 0.7 + Math.random() * 0.5 : 0.8 + Math.random() * 0.4,
    });
    if (this.liveBolts.length > 6) this.liveBolts.length = 6;
    // TLE sprites/halos are emitted by the solver alongside strong CGs.
    if (kind === "sprite" && this.spriteView) {
      this.spriteView.add(
        Math.random() < 0.25 ? "halo" : "sprite",
        hit.x,
        hit.y,
        hit.z,
        this.timeSeconds + c.strokes[0].at / 1000,
      );
    }
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
    this.timeSeconds += dt;
    if (this.spriteView) {
      const dark = Math.max(0, 1 - this.sunFrac);
      this.spriteView.update(this.timeSeconds, dark, true);
    }
    this.syncBoltVisuals();
  }

  lightningMarks(): { i: number; j: number; alpha: number; kind: LightningKind }[] {
    return this.liveBolts.map((bolt) => ({
      i: bolt.i,
      j: bolt.j,
      kind: bolt.kind,
      alpha: Math.max(0, 1 - bolt.age / bolt.life),
    }));
  }

  private syncBoltVisuals(): void {
    this.camera.updateMatrixWorld();
    for (let n = 0; n < 6; n++) {
      const bolt = this.liveBolts[n];
      const light = this.flashLights[n];
      const ribbon = this.boltRibbons[n];
      if (!bolt || !light || !ribbon) {
        if (light) light.intensity = 0;
        if (ribbon) ribbon.visible = false;
        continue;
      }
      const t = bolt.age * 1000;
      const b = brightness(bolt.course, bolt.isCg, t);
      const alpha = b.reveal;
      const pulse = b.main * bolt.brightness;
      const sprite = bolt.kind === "sprite";
      if (sprite) {
        light.intensity = 0;
        ribbon.visible = false; // sprites are volumetric-only, never draw through clouds
        continue;
      } else {
        this.boltTint(bolt.x, bolt.y, bolt.z);
        light.color.copy(this.flashTint);
        const litY = bolt.kind === "cg" ? this.groundY + 700 : bolt.y;
        light.position.set(bolt.x, litY, bolt.z);
      // Day/night scale: night=1, day=0.1, smooth transition
        const dayScale = Math.max(0.15, 1 - 0.85 * this.sunFrac);
        light.intensity = 4.5e7 * pulse * dayScale / 20;
      }
      const count = this.fillBoltPoints(bolt, this.boltScratch);
      const pos = ribbon.geometry.getAttribute("position") as THREE.BufferAttribute;
      const half = bolt.kind === "sprite" ? 90 : 85;
      const eye = this.camera.position;
      for (let s = 0; s < count; s++) {
        const p = this.boltScratch[s];
        const prev = this.boltScratch[Math.max(0, s - 1)];
        const next = this.boltScratch[Math.min(count - 1, s + 1)];
        this.boltTangent.subVectors(next, prev);
        this.boltToCam.subVectors(eye, p);
        this.boltRight.crossVectors(this.boltTangent, this.boltToCam);
        if (this.boltRight.lengthSq() < 1) {
          this.boltRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
        }
        this.boltRight.normalize().multiplyScalar(half);
        pos.setXYZ(s * 2, p.x + this.boltRight.x, p.y + this.boltRight.y, p.z + this.boltRight.z);
        pos.setXYZ(s * 2 + 1, p.x - this.boltRight.x, p.y - this.boltRight.y, p.z - this.boltRight.z);
      }
      pos.needsUpdate = true;
      ribbon.geometry.setDrawRange(0, Math.max(0, (count - 1) * 6));
      const mat = ribbon.material as THREE.MeshBasicMaterial;
      if (sprite) mat.color.copy(this.spriteTint);
      else mat.color.copy(this.flashTint);
      mat.opacity = alpha * (sprite ? 0.7 : 0.9);
      ribbon.visible = alpha > 0.04 && count >= 2;
    }
    // Ground flash: brightest active CG bolt drives a 10-25% additive overlay
    let groundPulse = 0;
    for (const bolt of this.liveBolts) {
      if (bolt.kind !== "cg") continue;
      const b = brightness(bolt.course, bolt.isCg, bolt.age * 1000);
      groundPulse = Math.max(groundPulse, b.main * bolt.brightness);
    }
    if (this.groundFlashMesh) {
      const mat = this.groundFlashMesh.material as THREE.MeshBasicMaterial;
      mat.opacity = groundPulse * 0.044 / 20 * (1 - 0.9 * this.sunFrac);
      this.groundFlashMesh.visible = groundPulse > 0.01;
    }
  }

  /** Jagged channel. Writes world points and returns how many. */
  private fillBoltPoints(
    bolt: {
      kind: LightningKind;
      x: number;
      y: number;
      z: number;
      seed: number;
    },
    out: THREE.Vector3[],
  ): number {
    const seed = bolt.seed;
    const cap = Math.min(out.length, this.boltPointCount);
    if (bolt.kind === "sprite") return 0; // sprites are flash-only, no geometry
    const steps = Math.min(20, cap - 1);
    const isCg = bolt.kind === "cg";
    const drop = isCg ? Math.max(100, bolt.y - this.groundY) : 0;
    // Main channel. CGs step down to the ground; ICs crawl horizontally
    // through the cloud deck near the strike altitude.
    let px = bolt.x;
    let py = bolt.y;
    let pz = bolt.z;
    for (let s = 0; s <= steps; s++) {
      out[s].set(px, isCg && s === steps ? this.groundY + 2 : py, pz);
      if (isCg) {
        // Larger horizontal jag every ~3 steps (stepped leader) - more variation
        const jagFreq = s % 3 === 1 ? 320 : 160;
        const jag = jagFreq * (0.8 + 0.4 * Math.sin(seed + s * 1.3));
        px += Math.sin(seed + s * 2.17) * jag;
        pz += Math.cos(seed * 1.3 + s) * jag;
        py -= drop / steps;
      } else {
        // Roughly 4 km wide in-cloud channel with a gentle vertical wander.
        const jag = (s % 3 === 1 ? 340 : 180) * (0.7 + 0.5 * Math.sin(seed + s * 1.9));
        px += Math.sin(seed + s * 2.17) * jag;
        pz += Math.cos(seed * 1.3 + s) * jag;
        py += Math.sin(seed * 0.7 + s * 0.9) * 26;
      }
    }
    const mainCount = steps + 1;
    // One branch: splits off at ~40% along, runs 5 steps then fades.
    const branchStart = Math.floor(steps * 0.4);
    const branchPt = out[branchStart];
    const branchSteps = Math.min(6, cap - mainCount - 1);
    if (branchSteps >= 2 && mainCount + branchSteps < cap) {
      let bx = branchPt.x;
      let by = branchPt.y;
      let bz = branchPt.z;
      const bSeed = seed + 3.7;
      const bDrop = (drop / steps) * 1.1;
      for (let s = 0; s <= branchSteps; s++) {
        out[mainCount + s].set(bx, by, bz);
        bx += Math.sin(bSeed + s * 2.1) * (isCg ? 200 : 340);
        bz += Math.cos(bSeed * 1.8 + s) * (isCg ? 200 : 340);
        by += isCg ? -bDrop : Math.sin(bSeed + s * 1.5) * 110;
      }
      return mainCount + branchSteps + 1;
    }
    return mainCount;
  }

  /** Close bolts are blue-white. Distant ones shift toward yellow. */
  private boltTint(x: number, y: number, z: number): void {
    const cam = this.camera.position;
    const dist = Math.hypot(x - cam.x, y - cam.y, z - cam.z);
    const tint = Math.min(1, Math.max(0, (dist - 4000) / 24000));
    this.flashTint.setRGB(0.75, 0.86, 1).lerp(this.flashFar, tint);
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
    tex.generateMipmaps = false;
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
    this.precipitation.dispose();
    this.scene.remove(this.precipitation.points);
    if (this.volumeMesh) {
      this.cloudScene.remove(this.volumeMesh);
      this.volumeMesh.geometry.dispose();
      (this.volumeMesh.material as THREE.Material).dispose();
      this.volumeMesh = null;
      this.cloudMat = null;
    }
    this.cloudTarget?.dispose();
    this.cloudTarget = null;
    this.cloudHistory?.dispose();
    this.cloudHistory = null;
    this.cloudResolved?.dispose();
    this.cloudResolved = null;
    this.sceneTarget?.dispose();
    this.sceneTarget = null;
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.blitMesh.geometry.dispose();
    (this.blitMesh.material as THREE.Material).dispose();
    this.sceneBlit.geometry.dispose();
    (this.sceneBlit.material as THREE.Material).dispose();
    this.resolveMesh.geometry.dispose();
    (this.resolveMesh.material as THREE.Material).dispose();
    if (this.volumeTex) {
      this.volumeTex.dispose();
      this.volumeTex = null;
    }
    if (this.kmGrid) {
      this.scene.remove(this.kmGrid);
      this.kmGrid.geometry.dispose();
      (this.kmGrid.material as THREE.Material).dispose();
      this.kmGrid = null;
    }
    for (const ribbon of this.boltRibbons) {
      ribbon.geometry.dispose();
      (ribbon.material as THREE.Material).dispose();
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
