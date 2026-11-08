import * as THREE from "three";
import { Grid3D, volumeDisplaySize } from "../sim/Grid3D";
import type { LightningKind } from "../sim/FluidSolver";
import { isCgKind } from "../sim/FluidSolver";
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
import { computeSky, SkyState, hazeExtinction, SUN_LEVELS, SKY_COLS, SKY_ROWS, adaptation, ADAPT_MAX, luminance } from "./sky";
import { skyFragment, skyVertex } from "./clouds/skyShader";
import {
  course,
  brightness,
  buildChannel,
  type LightningCourse,
  type LightningChannel,
  type ChannelKind,
  LightningView,
  type Flash,
} from "./lightning";
import { SpriteView } from "./sprites";
import { PrecipitationParticles } from "./precipitation";
import { LightVolume, FlashVolume } from "./light";
import { groundSurfacePars, groundShadowPars } from "./groundShader";
import { noiseTexture } from "./noise";
import { FieldView } from "./FieldView";
import { GroundOverlays } from "./GroundOverlays";
import type { OverlayField } from "./fields";
import type { DrawnFront } from "../sim/synoptic";
import type { VortexLevel } from "../sim/fieldPack";

/**
 * Daylight gains (MeteoLAB view.ts). DirectionalLight intensity stays 1 —
 * SUN_GAIN scales cloud sun only; baking it into intensity too bleaches the ground.
 * SUN_DISC is below MeteoLAB's 40 so low-sun Mie + disc don't clip to white.
 */
const SUN_GAIN = 3, SKY_GAIN = 12, SUN_DISC = 16;
/** Soft ceiling on sky/disc gain so twilight adaptation can't blow the frame. */
const SKY_GAIN_CAP = 48;
const SUN_DISC_LUM_CAP = 6.5;
/** Sky dome / clear-color night floor (deep airglow). */
const NIGHT_SKY = [0.008, 0.012, 0.026] as const;
const NIGHT_GROUND = [0.1, 0.12, 0.18] as const;
/** Cloud ambient night floors (MeteoLAB NIGHT_TOP / NIGHT_BOTTOM) — brighter than the sky dome so clouds stay above the noise floor. */
const NIGHT_TOP = [0.1, 0.12, 0.2] as const;
const NIGHT_BOTTOM = [0.06, 0.07, 0.1] as const;
const CITY_SKY = [0.06, 0.036, 0.016] as const;

const blitVert = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Triangular dither → breaks 8-bit night banding on the final framebuffer. */
const ditherFn = /* glsl */ `
float triDither(vec2 p) {
  float n = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  float m = fract(sin(dot(p + 19.19, vec2(12.9898, 78.233))) * 43758.5453);
  return (n + m - 1.0) / 255.0;
}
`;

const blitFrag = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
in vec2 vUv;
out vec4 fragColor;
${ditherFn}
void main() {
  vec4 c = texture(uTex, vUv);
  float a = max(c.a, 1e-4);
  vec3 lin = c.rgb / a;
  // Cloud RT is already tonemapped/sRGB from the material chunks — do not gamma again.
  vec3 outc = max(lin, vec3(0.0)) + triDither(gl_FragCoord.xy);
  fragColor = vec4(outc * c.a, c.a);
}
`;

const presentFrag = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
in vec2 vUv;
out vec4 fragColor;
${ditherFn}
void main() {
  // Scene RT is already tonemapped/sRGB from materials — copy + dither only.
  vec3 c = texture(uTex, vUv).rgb + triDither(gl_FragCoord.xy);
  fragColor = vec4(max(c, vec3(0.0)), 1.0);
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
  // Clouds are drawn without writing depth. Reprojecting with the scene depth
  // (ground / far plane) smears cloud history into long horizon streaks —
  // especially when looking at sky or walking the camera. Far pixels get a
  // soft same-UV blend only; closer pixels may reproject with a tight gate.
  float depth = texture(uDepth, vUv).r;
  if (depth > 0.998) {
    vec4 hist = texture(uHistory, vUv);
    // Stronger sky blend than 0.25 — half-res march dither was left as a
    // checkerboard when history barely mixed in.
    fragColor = mix(curr, hist, uMix * 0.72);
    return;
  }
  vec4 ndc = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 world = uInvViewProj * ndc;
  world /= max(world.w, 1e-6);
  vec4 prev = uPrevViewProj * vec4(world.xyz, 1.0);
  prev /= max(prev.w, 1e-6);
  vec2 puv = prev.xy * 0.5 + 0.5;
  float inside = step(0.0, puv.x) * step(puv.x, 1.0) * step(0.0, puv.y) * step(puv.y, 1.0);
  float motion = length(puv - vUv);
  // Reject big camera moves (WASD) so history cannot drag into ribbons.
  float stable = inside * (1.0 - smoothstep(0.012, 0.055, motion));
  vec4 hist = texture(uHistory, clamp(puv, vec2(0.0), vec2(1.0)));
  float blendMix = uMix * stable;
  fragColor = mix(curr, hist, blendMix);
}
`;

function joinTreeGeometry(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  for (const part of parts) count += part.getAttribute("position").count;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  let offset = 0;
  for (const part of parts) {
    const pp = part.getAttribute("position").array as Float32Array;
    const nn = part.getAttribute("normal").array as Float32Array;
    pos.set(pp, offset);
    nrm.set(nn, offset);
    offset += pp.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  return geo;
}

export class CloudRainRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private volumeTex: THREE.Data3DTexture | null = null;
  private volumeTexPrev: THREE.Data3DTexture | null = null;
  private volumeMesh: THREE.Mesh | null = null;
  private volumeData: Uint8Array | null = null;
  private volumeDataPrev: Uint8Array | null = null;
  /** Wall-clock blend from the previous packed volume into the latest one. */
  private volumeBlendStart = 0;
  private volumeBlendDur = 1;
  private volumeBlendReady = false;
  /** Full march budget — no night/day throttle, no adaptive quality ladder. */
  private stepBudget = 160;
  /** EMA of frame time (ms); still used to defer heavy light-volume rebuilds. */
  private frameMsEma = 48;
  /** Full-resolution cloud pass — sub-res + edge caps caused holes and dither. */
  private cloudResScale = 1;
  /** Last shadow-adapt value pushed into the cloud material. */
  private lastPushedAdapt = -1;
  /** Wall time of the last shadow + light-volume rebuild. */
  private heavyAt = 0;
  private lastRenderMs = 0;
  /** Wall milliseconds the previous frame actually took. */
  private lastFrameDt = 16;
  private cloudMat: VolumetricCloudMaterial | null = null;
  /** Empty string follows the sim sun. A preset name locks sun and look. */
  private lookdev: "" | keyof typeof LOOKDEV_PRESETS = "";
  /** Environmental wind, m/s. +east, +north. */
  private envEast = 1;
  private envNorth = 0;
  private surfaceH: Float32Array | null = null;
  private surfaceW: Float32Array | null = null;
  private surfaceKind: Float32Array | null = null;
  private surfaceSoil: Float32Array | null = null;
  private surfaceVeg: Float32Array | null = null;
  private forest: THREE.Group | null = null;
  private surfaceNx = 0;
  private surfaceNy = 0;
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
  /** WASD + arrow held state for walking/flying the view. */
  private readonly moveKeys = {
    forward: false,
    back: false,
    left: false,
    right: false,
  };
  private moveLastMs = 0;
  private readonly moveFwd = new THREE.Vector3();
  private readonly moveRight = new THREE.Vector3();
  /**
   * Base horizontal move speed, m/s. Also scales with domain size so a
   * mesoscale/continental box stays traversable. Shift multiplies it.
   */
  private readonly walkSpeed = 280;
  private moveFast = false;
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
    stepSize: DEFAULT_LOOK.stepSize,
    lodDistance: DEFAULT_LOOK.lodDistance,
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
  /** Bumps when the 3D volume texture is rewritten — LightVolume cache key (not wall-clock). */
  private volumeRevision = 0;
  /** Packed display volume size (matches precipitation / Data3DTexture). */
  private volNx = 0;
  private volNy = 0;
  private volNz = 0;
  /**
   * Smoothed 0..1 “under the storm” factor from overhead cloud. Opens exposure and
   * dims open-sky lights so looking into a core isn’t a black void over neon ground.
   */
  private shadowAdapt = 0;
  private readonly shadowLook = new THREE.Vector3();
  private clearScratch = new THREE.Color();
  private spriteView: SpriteView | null = null;
  /** GPU light volume for cloud lighting (MeteoLAB). */
  private lightVolume: LightVolume | null = null;
  /** GPU flash volume for lightning lighting (MeteoLAB). */
  private flashVolume: FlashVolume | null = null;
  /** Shader-based lightning view (MeteoLAB). */
  private lightningView: LightningView | null = null;
  /** Shared uniforms for MeteoLAB shaders. */
  private sharedUniforms: Record<string, THREE.IUniform> = {};
  /** Ground state texture (rain wetness, snow depth, hail size, hail frequency). */
  private groundState: THREE.DataTexture | null = null;
  /** Wind texture over the ground. */
  private windTexture: THREE.DataTexture | null = null;
  /** Ground uniforms for surface shader. */
  private groundUniforms: Record<string, THREE.IUniform> = {};
  /** 2D cloud→ground shadow map (R = sun transmittance, G = sky visibility). */
  private cloudShadowData: Uint8Array | null = null;
  private cloudShadowTex: THREE.DataTexture | null = null;
  private readonly cloudShadowUniform: { value: THREE.Texture } = {
    value: null as unknown as THREE.Texture,
  };
  private shadowMapRevision = -1;
  private readonly shadowMapSun = new THREE.Vector3(NaN, NaN, NaN);
  /** MeteoLAB value-noise cube for land patterns / cloud detail. */
  private readonly noise = noiseTexture();
  /** Mean ground albedo colour (grass by default). */
  private readonly groundColor = new THREE.Color(0x596d45);
  /** 3D scalar field overlay (updraft / θ / RH / vorticity / cold pool). */
  private readonly fieldView = new FieldView();
  /** Rain swath, cold-pool shade, fronts, vortex rings. */
  private readonly groundOverlays = new GroundOverlays();
  /** Renderer-side rain/snow/hail, drawn after the clouds so flakes and stones stay visible. */
  private precipitation: PrecipitationParticles;
  private readonly precipScene = new THREE.Scene();
  private timeSeconds = 0;
  private liveBolts: {
    i: number;
    j: number;
    kind: LightningKind;
    polarity: 1 | -1;
    x: number;
    y: number;
    z: number;
    endX: number;
    endY: number;
    endZ: number;
    age: number;
    life: number;
    seed: number;
    brightness: number;
    course: LightningCourse;
    isCg: boolean;
    channel: LightningChannel;
  }[] = [];
  private groundFlashMesh: THREE.Mesh | null = null;
  private flashTint = new THREE.Color(0.75, 0.86, 1);
  private flashFar = new THREE.Color(1, 0.92, 0.55);
  private readonly boltCoreTint = new THREE.Color(1, 1, 1);
  private readonly boltWhite = new THREE.Color(1, 1, 1);
  private readonly kindTintPos = new THREE.Color(1, 0.96, 0.88);
  private readonly kindTintSpider = new THREE.Color(0.92, 0.95, 1);
  private readonly kindTintIc = new THREE.Color(0.7, 0.82, 1);
  private spriteTint = new THREE.Color(1, 0.28, 0.38);
  private flashLights: THREE.PointLight[] = [];
  private boltScene = new THREE.Scene();
  private boltGlows: THREE.Mesh[] = [];
  private boltCores: THREE.Mesh[] = [];
  /** Empty volume so bolt shaders compile before the sim grid exists. */
  private readonly boltFieldFallback = new THREE.Data3DTexture(new Uint8Array(4), 1, 1, 1);
  private readonly boltPointCount = 180;
  private readonly boltScratch: THREE.Vector3[] = Array.from(
    { length: 180 },
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
    this.renderer.toneMappingExposure = 1.05;
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
      // Shorter range + steeper decay so a flash lights nearby ground/cloud, not the whole domain.
      const light = new THREE.PointLight(0xdbe7ff, 0, 22000, 2.0);
      light.castShadow = false;
      this.flashLights.push(light);
      this.scene.add(light);
      const glow = this.makeBoltRibbon();
      const core = this.makeBoltRibbon();
      this.boltGlows.push(glow);
      this.boltCores.push(core);
      this.boltScene.add(glow);
      this.boltScene.add(core);
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

    const groundSeg = 128;
    const groundGeo = new THREE.PlaneGeometry(4, 4, groundSeg, groundSeg);
    const groundVerts = (groundSeg + 1) * (groundSeg + 1);
    const coverAttr = () => new THREE.BufferAttribute(new Float32Array(groundVerts), 1);
    groundGeo.setAttribute("aWater", coverAttr());
    groundGeo.setAttribute("aCover", coverAttr());
    groundGeo.setAttribute("aSoil", coverAttr());
    groundGeo.setAttribute("aVeg", coverAttr());
    groundGeo.setAttribute("aPaint", coverAttr());
    const groundColors = new Float32Array(groundVerts * 3);
    const base = this.groundColor;
    for (let i = 0; i < groundVerts; i++) {
      groundColors[i * 3] = base.r;
      groundColors[i * 3 + 1] = base.g;
      groundColors[i * 3 + 2] = base.b;
    }
    groundGeo.setAttribute("color", new THREE.BufferAttribute(groundColors, 3));
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.96,
      metalness: 0,
      vertexColors: true,
    });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.5;
    this.scene.add(this.ground);

    // Inject MeteoLAB land pattern + wetness + cloud shadows into the ground.
    // onBeforeCompile runs lazily on first render; shared/ground uniforms are
    // filled in setGrid() before then.
    groundMat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        ...this.sharedUniforms,
        ...this.groundUniforms,
        uNoise: { value: this.noise },
        uCloudShadow: this.cloudShadowUniform,
        uSky: { value: this.skyTexture },
        uSkyGain: { value: 1 },
        uSkyFloor: { value: new THREE.Color() },
        uCityGlow: { value: new THREE.Color() },
        uHaze: { value: 0.1 },
        uAirScale: { value: 0.5 },
      });
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vCloudWorld;\nattribute float aWater;\nattribute float aCover;\nattribute float aSoil;\nattribute float aVeg;\nattribute float aPaint;\nvarying float vWater;\nvarying float vCover;\nvarying float vSoil;\nvarying float vVeg;\nvarying float vPaint;",
        )
        .replace(
          "#include <project_vertex>",
          "#include <project_vertex>\nvCloudWorld=(modelMatrix*vec4(transformed,1.0)).xyz;\nvWater=aWater;\nvCover=aCover;\nvSoil=aSoil;\nvVeg=aVeg;\nvPaint=aPaint;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>\nvarying float vWater;\nvarying float vCover;\nvarying float vSoil;\nvarying float vVeg;\nvarying float vPaint;\n${groundSurfacePars}\n${groundShadowPars}`,
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
{
  // Land, snow and hail share earth coordinates, so a deposit stays on the
  // ground it fell on while the domain follows the storm.
  vec2 gScroll = groundAt(vCloudWorld);
  vec2 q = gScroll * uGroundSize;
  vec4 st = texture(uGround, gScroll);
  gWater = st.r * GROUND_WATER;
  gSnow = st.g;
  gHailDots = 0.0;
  float blur = min(length(dFdx(q)), length(dFdy(q)));
  if(abs(uSurface - 2.0) < 0.5){
    float U = texture(uWind, gScroll).r * WIND_SCALE / 1.15;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6), clamp(3.84e-6 * pow(U, 3.41), 0.0, 0.3));
    gSpec = 1.0;
  } else if(vPaint > 0.5){
    float n = texture(uNoise, vec3(q * 0.11, 0.22)).g;
    diffuseColor.rgb = vColor * diffuse * (0.9 + 0.14 * n);
    gSpec = step(0.5, vCover);
  } else {
    diffuseColor.rgb *= landPattern(q, blur);
    float urban = step(2.5, uSurface), steppe = step(0.5, uSurface) * (1.0 - urban);
    float wet = mix(mix(0.88, 0.7, steppe), 0.55, urban), pond = mix(mix(10.0, 5.0, steppe), 1.5, urban);
    float snowCover = smoothstep(0.04, 0.82, gSnow);
    diffuseColor.rgb *= mix(1.0, wet, smoothstep(0.0, 0.3, gWater) * (1.0 - snowCover));
    diffuseColor.rgb *= vColor;
    gSpec = smoothstep(pond, pond * 2.0, gWater) * (1.0 - snowCover);
  }
  float dust = smoothstep(0.0, 0.04, gSnow);
  float deep = smoothstep(0.02, 0.55, gSnow);
  vec3 snowCol = vec3(0.94, 0.96, 0.98);
  diffuseColor.rgb = mix(diffuseColor.rgb, snowCol, dust * 0.72);
  diffuseColor.rgb = mix(diffuseColor.rgb, snowCol, deep);
  gHailDots = hailStones(q, st.a, st.b);
  vec3 hailCol = mix(vec3(0.78, 0.81, 0.84), vec3(0.98, 0.99, 1.0), smoothstep(0.15, 0.85, st.b));
  diffuseColor.rgb = mix(diffuseColor.rgb, hailCol, gHailDots);
}`,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
if(abs(uSurface - 2.0) < 0.5){
  float U = texture(uWind, groundAt(vCloudWorld)).r * WIND_SCALE / 1.15;
  roughnessFactor = sqrt(sqrt(0.003 + 0.00512 * U));
} else roughnessFactor = mix(roughnessFactor, 0.15, gSpec);
if(vPaint > 0.5){
  float waterR = step(0.5, vCover);
  float landR = mix(0.72, 0.98, clamp(vVeg, 0.0, 1.0));
  roughnessFactor = mix(landR, 0.16, waterR);
}
float snowPack = smoothstep(0.08, 0.9, gSnow);
roughnessFactor = mix(roughnessFactor, 0.96, snowPack);
roughnessFactor = mix(roughnessFactor, 0.32, gHailDots);`,
        )
        .replace(
          "#include <lights_fragment_end>",
          "#include <lights_fragment_end>\n{vec3 s=cloudShade(vCloudWorld);reflectedLight.indirectDiffuse=reflectedLight.indirectDiffuse*s.y+reflectedLight.directDiffuse*s.z;reflectedLight.directDiffuse*=s.x;reflectedLight.directSpecular*=s.x;}",
        )
        .replace("#include <color_fragment>", "")
        .replace("#include <fog_fragment>", "");
    };
    // needsUpdate is set in setGrid() once shared/ground uniforms exist.

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

    // GLSL1 (no glslVersion: GLSL3) so tonemapping/colorspace chunks that write
    // gl_FragColor compile — the previous GLSL3 sky silently failed and left
    // only the flat clear-color "dark blue".
    const skyMat = new THREE.ShaderMaterial({
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
        uNoise: { value: this.noise },
        uGroundSize: { value: new THREE.Vector2(40, 40) },
        uSurface: { value: 0 },
      },
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
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

    // SpriteView now uses shader-based rendering, needs shared uniforms and density texture
    // Will initialize after cloud material is created
    this.spriteView = null;
    this.precipitation = new PrecipitationParticles();
    this.precipScene.add(this.precipitation.points);
    this.scene.add(this.fieldView.group);
    this.scene.add(this.groundOverlays.group);

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
      // Half-float keeps night sky gradients above the 8-bit posterization floor.
      this.sceneTarget = new THREE.WebGLRenderTarget(bw, bh, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
        depthTexture: depth,
        depthBuffer: true,
      });
      const present = this.sceneBlit.material as THREE.ShaderMaterial;
      present.uniforms.uTex.value = this.sceneTarget.texture;
    }
    // Full-resolution cloud buffer (no scale / edge caps).
    const hw = Math.max(1, Math.floor(bw * this.cloudResScale));
    const hh = Math.max(1, Math.floor(bh * this.cloudResScale));
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
          type: THREE.HalfFloatType,
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
  }

  setDropletsVisible(on: boolean): void {
    this.precipitation.setVisible(on);
    if (!on) this.precipitation.clear();
  }

  /** Height of the 0 °C level above the ground, in metres. */
  setFreezingLevel(zAboveGround: number | null): void {
    this.precipitation.setFreezingLevel(zAboveGround);
    const z = zAboveGround != null && Number.isFinite(zAboveGround)
      ? Math.max(0, zAboveGround)
      : DEFAULT_LOOK.freezing;
    this.tune.freezing = z;
    this.cloudMat?.setLook({ freezing: z });
  }

  setRadarVisible(on: boolean): void {
    if (this.radarMesh) this.radarMesh.visible = on;
  }

  setWindsVisible(on: boolean): void {
    this.windVisible = on;
    if (this.windMesh) this.windMesh.visible = on;
  }

  /**
   * Slide the ground texture/grid by how far the domain has travelled while
   * following the storm (MeteoLAB: uGroundOffset = frameOffset / domain size).
   */
  setGroundFrameOffset(eastM: number, northM: number): void {
    const ox = this.spanX > 0 ? eastM / this.spanX : 0;
    const oy = this.spanZ > 0 ? northM / this.spanZ : 0;
    const u = this.groundUniforms.uGroundOffset;
    if (u) (u.value as THREE.Vector2).set(ox, oy);
    if (this.kmGrid) {
      const step = Math.max(
        1000,
        this.spanX / Math.max(1, Math.round(this.spanX / 3000)),
      );
      const wrap = (m: number) => ((m % step) + step) % step;
      this.kmGrid.position.x = -wrap(eastM);
      this.kmGrid.position.z = wrap(northM);
    }
  }

  /** Terrain metres under a world position. Open ground and water are 0. */
  private terrainHeightAt(x: number, z: number): number {
    const h = this.surfaceH;
    const nx = this.surfaceNx;
    const ny = this.surfaceNy;
    if (!h || nx < 2 || ny < 2 || this.spanX <= 0 || this.spanZ <= 0) return 0;
    const u = x / this.spanX + 0.5;
    const v = 0.5 - z / this.spanZ;
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
    const gx = u * (nx - 1);
    const gy = v * (ny - 1);
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const x1 = Math.min(nx - 1, x0 + 1);
    const y1 = Math.min(ny - 1, y0 + 1);
    const tx = gx - x0;
    const ty = gy - y0;
    const at = (ix: number, iy: number) => h[ix + nx * iy] ?? 0;
    const a = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
    const b = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
    return Math.max(0, a * (1 - ty) + b * ty);
  }

  /** Lowest eye position: standing on the surface, not inside the hill. */
  private surfaceEyeY(x: number, z: number): number {
    return this.groundY + this.terrainHeightAt(x, z) + this.eyeM;
  }

  /**
   * Keep the eye above the local surface. followGround drops a walker
   * onto the downhill side; a camera already in the air only gets lifted.
   */
  private holdAboveSurface(x: number, y: number, z: number, followGround: boolean): number {
    const floor = this.surfaceEyeY(x, z);
    const top = this.groundY + Math.max(this.eyeM, this.spanY - 2);
    const next = followGround ? floor : y;
    return Math.min(top, Math.max(floor, next));
  }

  /**
   * Move the player. xn/yn are 0..1 across the domain (east, north).
   * Altitude is meters above the flat domain floor, and never below the surface.
   */
  teleportTo(xn: number, yn: number, altitudeM: number): void {
    const x = (Math.min(1, Math.max(0, xn)) - 0.5) * this.spanX;
    const z = -((Math.min(1, Math.max(0, yn)) - 0.5) * this.spanZ);
    const alt = Math.min(this.spanY - 2, Math.max(this.eyeM, altitudeM));
    const y = this.holdAboveSurface(x, this.groundY + alt, z, false);
    this.camera.position.set(x, y, z);
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
    const y = this.holdAboveSurface(0, this.groundY + this.eyeM, 0, true);
    this.camera.position.set(0, y, 0);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.camera.fov = 68;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Drag on the view to look. The cursor stays free so buttons and panels
   * still receive clicks. Scroll changes the field of view.
   * WASD / arrow keys walk on the horizontal plane (Shift = faster).
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
    const typingTarget = (t: EventTarget | null): boolean => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t.isContentEditable
      );
    };
    const setMoveKey = (code: string, downKey: boolean): boolean => {
      switch (code) {
        case "KeyW":
        case "ArrowUp":
          this.moveKeys.forward = downKey;
          return true;
        case "KeyS":
        case "ArrowDown":
          this.moveKeys.back = downKey;
          return true;
        case "KeyA":
        case "ArrowLeft":
          this.moveKeys.left = downKey;
          return true;
        case "KeyD":
        case "ArrowRight":
          this.moveKeys.right = downKey;
          return true;
        case "ShiftLeft":
        case "ShiftRight":
          this.moveFast = downKey;
          return false;
        default:
          return false;
      }
    };
    const keyDown = (e: KeyboardEvent) => {
      if (typingTarget(e.target)) return;
      if (setMoveKey(e.code, true)) e.preventDefault();
    };
    const keyUp = (e: KeyboardEvent) => {
      setMoveKey(e.code, false);
    };
    const blur = () => {
      this.moveKeys.forward = false;
      this.moveKeys.back = false;
      this.moveKeys.left = false;
      this.moveKeys.right = false;
      this.moveFast = false;
    };
    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    this.unbindLook = () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
    };
  }

  /** Apply WASD / arrow movement for this frame. */
  private applyKeyboardMove(): void {
    const now = performance.now();
    const last = this.moveLastMs || now;
    this.moveLastMs = now;
    let dt = (now - last) / 1000;
    if (!(dt > 0) || dt > 0.1) dt = 0.016;

    const k = this.moveKeys;
    let ax = 0;
    let az = 0;
    if (k.forward) az -= 1;
    if (k.back) az += 1;
    if (k.left) ax -= 1;
    if (k.right) ax += 1;
    if (ax === 0 && az === 0) return;

    // Horizontal basis from yaw: look north (−Z) at yaw 0.
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    this.moveFwd.set(-sy, 0, -cy);
    this.moveRight.set(cy, 0, -sy);
    const len = Math.hypot(ax, az) || 1;
    // ~0.5% of the shorter domain side per second (floored by walkSpeed) so
    // a 64 km box crosses in a couple of minutes; Shift for a quick sweep.
    const domainPace = Math.min(this.spanX, this.spanZ) * 0.005;
    const base = Math.max(this.walkSpeed, domainPace);
    const speed = base * (this.moveFast ? 4.5 : 1) * dt;
    const dx = ((this.moveRight.x * ax + this.moveFwd.x * az) / len) * speed;
    const dz = ((this.moveRight.z * ax + this.moveFwd.z * az) / len) * speed;

    const halfX = this.spanX * 0.48;
    const halfZ = this.spanZ * 0.48;
    const p = this.camera.position;
    const onGround = p.y <= this.surfaceEyeY(p.x, p.z) + 0.75;
    p.x = Math.min(halfX, Math.max(-halfX, p.x + dx));
    p.z = Math.min(halfZ, Math.max(-halfZ, p.z + dz));
    p.y = this.holdAboveSurface(p.x, p.y, p.z, onGround);
  }

  setSunFrac(frac: number): void {
    // Daylight fraction only — sky colour / lights come from updateSkyFromSun().
    this.sunFrac = Math.min(1, Math.max(0, frac));
  }

  /** Daylight fraction plus the world sun direction (+X east, +Y up, −Z north). */
  setSun(frac: number, dir: { x: number; y: number; z: number }): void {
    this.setSunFrac(frac);
    this.sunDir.set(dir.x, dir.y, dir.z);
    if (this.sunDir.lengthSq() < 1e-8) this.sunDir.set(0, 1, 0);
    else this.sunDir.normalize();
    this.sunLight.position.copy(this.sunDir).multiplyScalar(400);
    if (this.sharedUniforms.uSunDir) {
      (this.sharedUniforms.uSunDir.value as THREE.Vector3).copy(this.sunDir);
    }
    this.updateSkyFromSun();
    this.applyCloudSun();
  }

  /** Recompute the atmospheric sky table from the current sun direction and upload it (MeteoLAB view.ts updateSky). */
  private updateSkyFromSun(): void {
    if (!this.skyTexture || !this.sky) return;
    const elev = this.sunDir.y;
    const elDeg = (Math.asin(Math.min(1, Math.max(-1, elev))) * 180) / Math.PI;
    this.sunElevationDeg = elDeg;
    // Haze from humidity-ish: midday clearer, evening hazier.
    const rh = 0.6 + 0.3 * Math.max(0, -elDeg / 15);
    const haze = hazeExtinction(rh);
    this.haze = haze;
    const albedo = luminance([this.groundColor.r, this.groundColor.g, this.groundColor.b]);
    const state = computeSky((elDeg * Math.PI) / 180, haze, albedo);
    this.skyState = state;
    // Upload the sky table as an RGBA HalfFloat texture.
    const data = this.skyTexture.image.data as unknown as Uint16Array;
    const toHalf = THREE.DataUtils.toHalfFloat;
    const sky = state.sky;
    for (let i = 0; i < SKY_ROWS * SKY_COLS; i++) {
      const o = i * 4;
      data[o] = toHalf(sky[i * 3]);
      data[o + 1] = toHalf(sky[i * 3 + 1]);
      data[o + 2] = toHalf(sky[i * 3 + 2]);
      data[o + 3] = toHalf(1);
    }
    this.skyTexture.needsUpdate = true;

    const S = state.sunIrradiance;
    const E = state.skyIrradiance;
    const adapt = adaptation(luminance(S) + luminance(E));
    const night = (adapt / ADAPT_MAX) ** 2;
    const city = 0; // no city config yet
    const skyGain = Math.min(SKY_GAIN_CAP, SKY_GAIN * adapt);
    const groundGain = skyGain;
    const g = this.groundColor;
    // Low sun: keep colour, cut intensity so the ground isn't a white disc.
    const el = this.sunElevationDeg;
    const horizonLift = Math.max(0.35, Math.min(1, (el + 1) / 14));

    const mat = this.sky.material as THREE.ShaderMaterial;
    (mat.uniforms.uSkyGain as { value: number }).value = skyGain;
    (mat.uniforms.uHaze as { value: number }).value = haze;
    (mat.uniforms.uSunDir as { value: THREE.Vector3 }).value.copy(this.sunDir);
    (mat.uniforms.uStars as { value: number }).value = night * night;
    (mat.uniforms.uSkyFloor as { value: THREE.Color }).value.setRGB(
      NIGHT_SKY[0] * night,
      NIGHT_SKY[1] * night,
      NIGHT_SKY[2] * night,
    );
    (mat.uniforms.uCityGlow as { value: THREE.Color }).value.setRGB(
      CITY_SKY[0] * city,
      CITY_SKY[1] * city,
      CITY_SKY[2] * city,
    );
    // Ground beyond the domain, lit as the domain ground (Lambertian albedo/π × irradiance).
    (mat.uniforms.uGroundLight as { value: THREE.Color }).value.setRGB(
      (g.r / Math.PI) * ((S[0] + E[0]) * groundGain + NIGHT_GROUND[0] * night),
      (g.g / Math.PI) * ((S[1] + E[1]) * groundGain + NIGHT_GROUND[1] * night),
      (g.b / Math.PI) * ((S[2] + E[2]) * groundGain + NIGHT_GROUND[2] * night),
    );
    // Sun disc coloured by transmittance at ground level; luminance-capped for sunset.
    let dr = state.sunByHeight[0] * SUN_DISC * adapt;
    let dg = state.sunByHeight[1] * SUN_DISC * adapt;
    let db = state.sunByHeight[2] * SUN_DISC * adapt;
    const dLum = 0.2126 * dr + 0.7152 * dg + 0.0722 * db;
    if (dLum > SUN_DISC_LUM_CAP) {
      const s = SUN_DISC_LUM_CAP / dLum;
      dr *= s;
      dg *= s;
      db *= s;
    }
    (mat.uniforms.uSunDisc as { value: THREE.Color }).value.setRGB(dr, dg, db);

    // Match MeteoLAB: irradiance lives in the colour; intensity stays ~1.
    this.sunLight.color.setRGB(
      state.sunByHeight[0] * groundGain * horizonLift,
      state.sunByHeight[1] * groundGain * horizonLift,
      state.sunByHeight[2] * groundGain * horizonLift,
    );
    this.sunLight.intensity = 1;
    this.hemi.color.setRGB(
      E[0] * groundGain + NIGHT_GROUND[0] * night,
      E[1] * groundGain + NIGHT_GROUND[1] * night,
      E[2] * groundGain + NIGHT_GROUND[2] * night,
    );
    this.hemi.groundColor.setRGB(
      albedo * (S[0] + E[0]) * groundGain,
      albedo * (S[1] + E[1]) * groundGain,
      albedo * (S[2] + E[2]) * groundGain,
    );
    this.hemi.intensity = 1;

    // Soft clear colour under the sky dome (only briefly visible while resizing).
    const clearR = Math.min(1, sky[0] * skyGain + NIGHT_SKY[0] * night);
    const clearG = Math.min(1, sky[SKY_COLS * 3 + 1] * skyGain + NIGHT_SKY[1] * night);
    const clearB = Math.min(1, sky[SKY_COLS * 3 + 2] * skyGain + NIGHT_SKY[2] * night);
    this.renderer.setClearColor(new THREE.Color(clearR, clearG, clearB), 1);
    if (this.scene.fog) {
      this.scene.fog.color.setRGB(clearR, clearG, clearB);
    }
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

  cloudTune(): {
    gain: number;
    sigmaLiquid: number;
    sigmaRain: number;
    erosionLiquid: number;
    erosionIce: number;
    lodDistance: number;
  } {
    return {
      gain: this.tune.gain,
      sigmaLiquid: this.tune.sigmaLiquid,
      sigmaRain: this.tune.sigmaRain,
      erosionLiquid: this.tune.erosionLiquid,
      erosionIce: this.tune.erosionIce,
      lodDistance: this.tune.lodDistance,
    };
  }

  /** Live knobs. fieldGain is one multiplier for liquid, ice, and rain. */
  setCloudTune(partial: {
    gain?: number;
    sigmaLiquid?: number;
    sigmaRain?: number;
    erosionLiquid?: number;
    erosionIce?: number;
    lodDistance?: number;
  }): void {
    if (partial.gain != null) this.tune.gain = partial.gain;
    // Pre-MeteoLAB UI/saves used ~0.08 liquid / ~0.18 rain. Map those into
    // today's 1/m extinction so old presets do not blow out or ghost.
    if (partial.sigmaLiquid != null) {
      this.tune.sigmaLiquid =
        partial.sigmaLiquid > 0.01
          ? partial.sigmaLiquid * (0.007 / 0.08)
          : partial.sigmaLiquid;
    }
    if (partial.sigmaRain != null) {
      this.tune.sigmaRain =
        partial.sigmaRain > 0.02
          ? partial.sigmaRain * (0.0016 / 0.18)
          : partial.sigmaRain;
    }
    if (partial.erosionLiquid != null) this.tune.erosionLiquid = partial.erosionLiquid;
    if (partial.erosionIce != null) this.tune.erosionIce = partial.erosionIce;
    if (partial.lodDistance != null) {
      this.tune.lodDistance = Math.max(4000, partial.lodDistance);
      this.syncViewDistance();
    }
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
      sigmaRain: this.tune.sigmaRain * this.advRainShaft,
      erosionLiquid: this.tune.erosionLiquid * this.advSoftness,
      erosionIce: this.tune.erosionIce,
      mammatusDepth: this.tune.mammatusDepth,
      mammatusCell: this.tune.mammatusCell,
      shaftMax: this.tune.shaftMax * this.advRainShaft,
      freezing: this.tune.freezing,
      shadowProbes: 0,
      lodDistance: this.tune.lodDistance,
    });
  }

  /** Keep the camera far plane past the cloud view-distance slider. */
  private syncViewDistance(): void {
    const far = Math.max(8000, this.domainSpan * 3, this.tune.lodDistance * 1.35);
    if (Math.abs(this.camera.far - far) < 1) return;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
    this.sky.scale.setScalar(this.camera.far);
  }

  private advSoftness = 1;
  private advRainShaft = 1;
  private boltBrightScale = 1;
  private boltLifeScale = 1;
  private boltWidthScale = 1;
  private cloudTaaOn = true;
  private groundFlashOn = true;
  private spritesOn = true;

  /** Push advanced display / precip / lightning knobs into the live renderer. */
  applyAdvanced(
    s: {
      exposure: number;
      hazeDensity: number;
      ambientStrength: number;
      ambientAtten: number;
      powder: number;
      powderLength: number;
      stepSize: number;
      lodDistance: number;
      detailFadeNear: number;
      detailFadeFar: number;
      shadowProbes: number;
      sigmaIce: number;
      mammatusDepth: number;
      mammatusCell: number;
      shaftMax: number;
      iceStretchX: number;
      iceStretchY: number;
      iceStretchZ: number;
      phaseLiquidFwd: number;
      phaseLiquidBack: number;
      backWeight: number;
      multiScatterA: number;
      multiScatterB: number;
      multiScatterC: number;
      cloudSoftness: number;
      anvilOpacity: number;
      rainShaftOpacity: number;
      fogStrength: number;
      groundBrightness: number;
      precipSpawn: number;
      rainFallVisual: number;
      snowFallVisual: number;
      precipWindDrag: number;
      meltDepth: number;
      rainSize: number;
      snowSize: number;
      precipStreak: number;
      dropletOpacity: number;
      dropletSize: number;
      boltBrightness: number;
      boltDuration: number;
      boltThickness: number;
    },
    t?: {
      enableFog?: boolean;
      enableShadowProbes?: boolean;
      enablePowder?: boolean;
      enableGroundFlash?: boolean;
      enableCloudTAA?: boolean;
      enableDepthOcclusion?: boolean;
      enableSoftParticles?: boolean;
      enableSkyHaze?: boolean;
      enableMammatus?: boolean;
      enableRainShafts?: boolean;
      enableIceFibres?: boolean;
      enableMultiScatter?: boolean;
      enableAnvilHighlight?: boolean;
      enableRainParticles?: boolean;
      enableSnowParticles?: boolean;
      enableHailParticles?: boolean;
      enablePrecipWind?: boolean;
      enableVirga?: boolean;
      enableSprites?: boolean;
    },
  ): void {
    const tog = t ?? {};
    this.cloudTaaOn = tog.enableCloudTAA !== false;
    this.groundFlashOn = tog.enableGroundFlash !== false;
    this.spritesOn = tog.enableSprites !== false;
    if (!this.cloudTaaOn) this.historyValid = false;

    this.advSoftness = s.cloudSoftness;
    this.advRainShaft = s.rainShaftOpacity;
    this.boltBrightScale = s.boltBrightness;
    this.boltLifeScale = s.boltDuration;
    this.boltWidthScale = s.boltThickness;

    const mammatus = tog.enableMammatus === false ? 0 : s.mammatusDepth;
    const shafts = tog.enableRainShafts === false ? 0 : s.shaftMax;
    const powder = tog.enablePowder === false ? 0 : s.powder;
    const fogMul = tog.enableFog === false || tog.enableSkyHaze === false ? 0 : s.fogStrength;
    const iceStretch: [number, number, number] =
      tog.enableIceFibres === false
        ? [1, 1, 1]
        : [s.iceStretchX, s.iceStretchY, s.iceStretchZ];
    const anvil = tog.enableAnvilHighlight === false ? 0.55 : s.anvilOpacity;

    this.tune.mammatusDepth = mammatus;
    this.tune.mammatusCell = s.mammatusCell;
    this.tune.shaftMax = shafts;
    // Nested shadow probes removed — lighting comes from LightVolume.
    this.tune.shadowProbes = 0;
    this.tune.stepSize = s.stepSize;
    this.tune.lodDistance = s.lodDistance;
    this.syncViewDistance();
    this.precipitation.setTune({
      spawn: s.precipSpawn,
      rainFall: s.rainFallVisual,
      snowFall: s.snowFallVisual,
      windDrag: tog.enablePrecipWind === false ? 0 : s.precipWindDrag,
      meltDepth: tog.enableVirga === false ? 40 : s.meltDepth,
      rainSize: s.rainSize * s.dropletSize,
      snowSize: s.snowSize * s.dropletSize,
      streak: s.precipStreak,
      opacity: s.dropletOpacity,
      allowRain: tog.enableRainParticles !== false,
      allowSnow: tog.enableSnowParticles !== false,
      allowHail: tog.enableHailParticles !== false,
      softParticles: tog.enableSoftParticles !== false,
      depthOcclusion: tog.enableDepthOcclusion !== false,
    });
    this.cloudMat?.setLook({
      exposure: s.exposure,
      hazeDensity: s.hazeDensity * fogMul,
      ambientStrength: s.ambientStrength,
      ambientAtten: s.ambientAtten,
      powder,
      powderLength: s.powderLength,
      stepSize: s.stepSize,
      lodDistance: s.lodDistance,
      detailFade: [s.detailFadeNear, s.detailFadeFar],
      shadowProbes: 0,
      sigmaIce: s.sigmaIce * anvil,
      mammatusDepth: mammatus,
      mammatusCell: s.mammatusCell,
      shaftMax: shafts * s.rainShaftOpacity,
      iceStretch,
      phaseLiquid: [s.phaseLiquidFwd, s.phaseLiquidBack],
      backWeight: s.backWeight,
      erosionLiquid: this.tune.erosionLiquid * s.cloudSoftness,
      sigmaRain: this.tune.sigmaRain * s.rainShaftOpacity,
    });
    const groundMat = this.ground.material as THREE.MeshStandardMaterial;
    groundMat.color.setScalar(Math.max(0.2, Math.min(1.6, s.groundBrightness)));
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
      const night = Math.max(0.4, 1 - 0.5 * this.sunFrac);
    for (const bolt of this.liveBolts) {
      if (flashes.length >= 4) break;
      if (bolt.kind === "sprite") continue;
      const b = brightness(bolt.course, bolt.isCg, bolt.age * 1000);
      const pulse = b.main * bolt.brightness;
      if (pulse < 0.02) continue;
      const gain =
        (bolt.kind === "poscg"
          ? 9
          : bolt.kind === "negcg"
            ? 7
            : bolt.kind === "spider"
              ? 7
              : 8) * night;
      this.boltTint(bolt.x, bolt.y, bolt.z);
      const pushAt = (x: number, y: number, z: number, amt = pulse * gain) => {
        if (flashes.length >= 4) return;
        flashes.push({
          x,
          y,
          z,
          r: this.flashTint.r,
          g: this.flashTint.g,
          b: this.flashTint.b,
          amount: amt,
        });
      };
      pushAt(bolt.x, bolt.y, bolt.z);
      if (bolt.kind === "ic" || bolt.kind === "spider") {
        pushAt(
          (bolt.x + bolt.endX) * 0.5,
          (bolt.y + bolt.endY) * 0.5,
          (bolt.z + bolt.endZ) * 0.5,
          pulse * gain * 0.85,
        );
        pushAt(bolt.endX, bolt.endY, bolt.endZ, pulse * gain * 0.75);
      } else if (bolt.isCg && flashes.length < 4) {
        const midY = bolt.y * 0.55 + this.groundY * 0.45;
        pushAt(bolt.x, midY, bolt.z, pulse * gain * 0.45);
      }
    }
    this.cloudMat.setFlashes(flashes);
  }

  private applyCloudSun(): void {
    if (!this.cloudMat || this.lookdev) return;
    const d = this.sunDir;
    const az = (Math.atan2(d.x, -d.z) * 180) / Math.PI;
    const el = (Math.asin(Math.min(1, Math.max(-1, d.y))) * 180) / Math.PI;
    this.cloudMat.setSun(az, el);
    if (!this.skyState) return;
    const S = this.skyState.sunIrradiance;
    const E = this.skyState.skyIrradiance;
    const adapt = adaptation(luminance(S) + luminance(E));
    const night = (adapt / ADAPT_MAX) ** 2;
    const skyGain = Math.min(SKY_GAIN_CAP, SKY_GAIN * adapt);
    const sunCol = this.skyState.sunByHeight;
    const sunEl = Math.sin((el * Math.PI) / 180);
    const sIdx = Math.min(SUN_LEVELS - 1, Math.max(0, Math.round(Math.max(0, sunEl) * (SUN_LEVELS - 1))));
    const horizonLift = Math.max(0.4, Math.min(1, (el + 1) / 14));
    const cm = this.cloudMat.uniforms;
    (cm.uSunColor as { value: THREE.Vector3 }).value
      .set(sunCol[sIdx * 3], sunCol[sIdx * 3 + 1], sunCol[sIdx * 3 + 2])
      .multiplyScalar(SUN_GAIN * adapt * horizonLift);
    (cm.uSkyColor as { value: THREE.Vector3 }).value.set(
      E[0] / Math.PI * skyGain + NIGHT_TOP[0] * night,
      E[1] / Math.PI * skyGain + NIGHT_TOP[1] * night,
      E[2] / Math.PI * skyGain + NIGHT_TOP[2] * night,
    );
    const g = this.groundColor;
    (cm.uGroundColor as { value: THREE.Vector3 }).value.set(
      g.r * (E[0] / Math.PI * skyGain + NIGHT_BOTTOM[0] * night),
      g.g * (E[1] / Math.PI * skyGain + NIGHT_BOTTOM[1] * night),
      g.b * (E[2] / Math.PI * skyGain + NIGHT_BOTTOM[2] * night),
    );
    this.cloudMat.setLook({
      stepSize: this.tune.stepSize,
      lodDistance: this.tune.lodDistance,
      shadowProbes: 0,
    });
  }

  /** Allocate / replace the 2D ground shadow texture for the display grid. */
  private ensureCloudShadowMap(nx: number, ny: number): void {
    if (
      this.cloudShadowTex &&
      this.cloudShadowData &&
      this.cloudShadowTex.image.width === nx &&
      this.cloudShadowTex.image.height === ny
    ) {
      return;
    }
    if (this.cloudShadowTex) this.cloudShadowTex.dispose();
    this.cloudShadowData = new Uint8Array(nx * ny * 4);
    // Clear sky default (full sun + sky) until the first rebuild.
    for (let i = 0; i < nx * ny; i++) {
      this.cloudShadowData[i * 4] = 255;
      this.cloudShadowData[i * 4 + 1] = 255;
      this.cloudShadowData[i * 4 + 2] = 0;
      this.cloudShadowData[i * 4 + 3] = 255;
    }
    this.cloudShadowTex = new THREE.DataTexture(
      this.cloudShadowData as unknown as BufferSource,
      nx,
      ny,
      THREE.RGBAFormat,
    );
    this.cloudShadowTex.magFilter = this.cloudShadowTex.minFilter = THREE.LinearFilter;
    this.cloudShadowTex.wrapS = this.cloudShadowTex.wrapT = THREE.ClampToEdgeWrapping;
    this.cloudShadowTex.needsUpdate = true;
    this.cloudShadowUniform.value = this.cloudShadowTex;
    this.shadowMapRevision = -1;
  }

  /** 0 shows the previous packed volume, 1 the latest. */
  private volumeMixNow(): number {
    if (!this.volumeBlendReady || !(this.volumeBlendDur > 1)) return 1;
    const t = (performance.now() - this.volumeBlendStart) / this.volumeBlendDur;
    if (t >= 1) return 1;
    if (t <= 0) return 0;
    return t;
  }

  /**
   * True when another cloud upload is safe. A saturated frame skips the next
   * volume so the light rebuild and the two-texture blend cannot keep it there.
   * The first volume is always accepted so the storm is visible immediately.
   */
  volumeSettled(): boolean {
    // Only the blend itself holds the next upload. A slow frame must not
    // freeze the picture on the first, nearly empty volume.
    return this.volumeMixNow() >= 0.999;
  }

  private updateStepBudget(now: number): void {
    const dt = this.lastRenderMs > 0 ? now - this.lastRenderMs : 16;
    this.lastRenderMs = now;
    this.lastFrameDt = dt;
    if (dt > 0) {
      const sample = Math.min(dt, 80);
      this.frameMsEma = this.frameMsEma * 0.7 + sample * 0.3;
    }
    this.stepBudget = 160;
    if (dt > 120 && this.volumeBlendDur > 1) this.volumeBlendDur = 1;
  }

  private rebuildCloudShadowMap(force: boolean): void {
    const mix = this.volumeMixNow();
    // Hold the previous shadow until the cloud blend finishes, then rebuild once.
    const shown = mix >= 0.999 ? this.volumeRevision : this.volumeRevision - 1;
    const data =
      shown === this.volumeRevision || !this.volumeDataPrev
        ? this.volumeData
        : this.volumeDataPrev;
    const out = this.cloudShadowData;
    const tex = this.cloudShadowTex;
    const nx = this.volNx;
    const ny = this.volNy;
    const nz = this.volNz;
    if (!data || !out || !tex || nx < 1 || ny < 1 || nz < 1) return;

    // Below the horizon the sun channel is black. Ignore the sun wobbling
    // through the night (compressed diurnal clock) — that used to rebuild the
    // whole map every couple of frames and hitch the sim.
    const sunBelow = this.sunDir.y <= -0.02;
    const sunChanged =
      !sunBelow && this.shadowMapSun.distanceToSquared(this.sunDir) > 1e-6;
    if (!force && this.shadowMapRevision === shown && !sunChanged) {
      return;
    }
    this.shadowMapRevision = shown;
    this.shadowMapSun.copy(this.sunDir);

    if (this.volumeClear && shown === this.volumeRevision) {
      out.fill(255);
      for (let i = 0; i < nx * ny; i++) out[i * 4 + 2] = 0;
      tex.needsUpdate = true;
      return;
    }

    const dx = this.spanX / nx;
    const dy = this.spanY / Math.max(1, nz);
    const dz = this.spanZ / ny;
    // A saturated frame only needs a coarse shadow. Neighbours share one march.
    const stride = this.frameMsEma > 34 ? 2 : 1;
    const cell = Math.max(dx, dy, dz);
    const step = Math.max(cell * 0.65, 40);
    const maxDist = Math.max(this.spanX, this.spanZ, this.spanY) * 1.6;
    const steps = Math.min(96, Math.max(12, Math.ceil(maxDist / step)));

    // Match cloudShader extinctions (1/m) on packed 0..1 opacity.
    const sigL = 0.0022 * 1.15;
    const sigI = 0.00055 * 1.15;
    const sigR = 0.0010;
    const sunY = this.sunDir.y;
    const sx = this.sunDir.x;
    const sy = this.sunDir.y;
    const sz = this.sunDir.z;
    const halfX = this.spanX * 0.5;
    const halfZ = this.spanZ * 0.5;
    const y0 = this.groundY + dy * 0.5;
    const yTop = this.groundY + this.spanY;

    const sampleSigma = (i: number, j: number, k: number): number => {
      if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return 0;
      const row = k + nz * (ny - 1 - j);
      const o = (i + nx * row) * 4;
      return (
        (data[o] / 255) * sigL +
        (data[o + 1] / 255) * sigI +
        (data[o + 2] / 255) * sigR
      );
    };

    for (let j = 0; j < ny; j += stride) {
      for (let i = 0; i < nx; i += stride) {
        // Sky visibility: vertical optical depth above the column.
        let odUp = 0;
        for (let k = 0; k < nz; k += stride) odUp += sampleSigma(i, j, k) * dy * stride;
        const skyVis = Math.exp(-odUp * 0.55);

        // Direct sun: march from the ground cell toward the sun through the volume.
        let sunVis = 1;
        if (sunY > -0.02) {
          let x = ((i + 0.5) / nx) * this.spanX - halfX;
          let y = y0;
          let z = halfZ - ((j + 0.5) / ny) * this.spanZ;
          let odSun = 0;
          const sunSteps = stride > 1 ? Math.ceil(steps / 2) : steps;
          const sunStep = step * stride;
          for (let s = 0; s < sunSteps; s++) {
            x += sx * sunStep;
            y += sy * sunStep;
            z += sz * sunStep;
            if (y > yTop || y < this.groundY) break;
            if (x < -halfX || x > halfX || z < -halfZ || z > halfZ) break;
            const ii = Math.floor(((x + halfX) / this.spanX) * nx);
            const jj = Math.floor(((halfZ - z) / this.spanZ) * ny);
            const kk = Math.floor(((y - this.groundY) / this.spanY) * nz);
            odSun += sampleSigma(ii, jj, kk) * sunStep;
            if (odSun > 12) break;
          }
          sunVis = Math.exp(-odSun);
        } else {
          sunVis = 0;
        }

        const sunB = Math.min(255, Math.max(0, (sunVis * 255) | 0));
        const skyB = Math.min(255, Math.max(0, (skyVis * 255) | 0));
        const j1 = Math.min(ny, j + stride);
        const i1 = Math.min(nx, i + stride);
        for (let jj = j; jj < j1; jj++) {
          for (let ii = i; ii < i1; ii++) {
            const o = (ii + nx * jj) * 4;
            out[o] = sunB;
            out[o + 1] = skyB;
            out[o + 2] = 0;
            out[o + 3] = 255;
          }
        }
      }
    }
    tex.needsUpdate = true;
  }

  /**
   * How much cloud sits above a world XZ column, 0 = clear, 1 = deep core.
   * Uses the packed display volume (R liquid + G ice).
   */
  private columnShadow(worldX: number, worldZ: number, fromY: number): number {
    const data = this.volumeData;
    const nx = this.volNx;
    const ny = this.volNy;
    const nz = this.volNz;
    if (!data || nx < 1 || ny < 1 || nz < 1) return 0;
    const halfX = this.spanX * 0.5;
    const halfZ = this.spanZ * 0.5;
    let i = Math.floor(((worldX + halfX) / this.spanX) * nx);
    let j = Math.floor(((halfZ - worldZ) / this.spanZ) * ny);
    if (i < 0) i = 0;
    else if (i >= nx) i = nx - 1;
    if (j < 0) j = 0;
    else if (j >= ny) j = ny - 1;
    let k0 = Math.floor(((fromY - this.groundY) / Math.max(1, this.spanY)) * nz);
    if (k0 < 0) k0 = 0;
    if (k0 >= nz) return 0;
    let sum = 0;
    let n = 0;
    for (let k = k0; k < nz; k++) {
      const row = k + nz * (ny - 1 - j);
      const o = (i + nx * row) * 4;
      if (o + 1 >= data.length) break;
      sum += data[o] + data[o + 1];
      n++;
    }
    if (n < 1) return 0;
    // ~80 mean packed byte over the column → full shadow.
    return Math.min(1, sum / (n * 80));
  }

  /** Sample overhead + look-ahead so facing into a core also opens the iris. */
  private sampleOverheadShadow(): number {
    if (!this.volumeData || this.volumeClear) return 0;
    const cam = this.camera.position;
    this.camera.getWorldDirection(this.shadowLook);
    const aheadX = cam.x + this.shadowLook.x * 2800;
    const aheadZ = cam.z + this.shadowLook.z * 2800;
    const here = this.columnShadow(cam.x, cam.z, cam.y);
    const ahead = this.columnShadow(aheadX, aheadZ, cam.y);
    // Looking upward into base counts more — that’s the pure-black case.
    const upWeight = Math.max(0, this.shadowLook.y);
    return Math.min(1, Math.max(here, ahead * (0.65 + 0.35 * upWeight)));
  }

  /**
   * Eye adaptation under cloud: raise exposure / cloud ambient, dim open-sky
   * sun and hemi, and darken the ground albedo so it matches the shadowed air.
   */
  private applyLocalShadowAdapt(): void {
    const target = this.sampleOverheadShadow();
    // Slow iris — a 0.1 lerp tracked every volume pack and made the deck pulse.
    this.shadowAdapt += (target - this.shadowAdapt) * 0.035;
    const s = this.shadowAdapt;
    this.renderer.toneMappingExposure = 1.0 * (1 + s * 0.9);
    // Intensity baseline is 1 (gain is in sunLight.color); dim further under cloud.
    this.sunLight.intensity = Math.max(0.08, 1 - s * 0.9);
    this.hemi.intensity = Math.max(0.28, 1 - s * 0.62);
    const groundMat = this.ground.material as THREE.MeshStandardMaterial;
    // Mild global dim — spatial cloud shadows do the real work.
    groundMat.color.setScalar(1 - s * 0.22);
    if (this.cloudMat && Math.abs(s - this.lastPushedAdapt) > 0.012) {
      this.lastPushedAdapt = s;
      this.cloudMat.setLook({
        exposure: DEFAULT_LOOK.exposure * (1 + s * 1.45),
        ambientStrength: DEFAULT_LOOK.ambientStrength * (1 + s * 0.7),
      });
    }
  }

  private applyCloudWind(): void {
    if (!this.cloudMat) return;
    const spd = Math.hypot(this.envEast, this.envNorth);
    if (spd < 0.05) this.cloudMat.setWind(1, 0, 0);
    else this.cloudMat.setWind(this.envEast, -this.envNorth, spd);
  }

  /** Displace the ground mesh from the run's height field. Called once per run. */
  setSurface(
    height: Float32Array | null,
    water: Float32Array | null,
    nx: number,
    ny: number,
    cover?: { kind: Float32Array; soil: Float32Array; veg: Float32Array } | null,
  ): void {
    this.surfaceH = height;
    this.surfaceW = water;
    this.surfaceKind = cover?.kind ?? null;
    this.surfaceSoil = cover?.soil ?? null;
    this.surfaceVeg = cover?.veg ?? null;
    this.surfaceNx = nx;
    this.surfaceNy = ny;
    this.displaceGround();
  }

  private displaceGround(): void {
    const pos = this.ground.geometry.getAttribute("position") as THREE.BufferAttribute;
    const wet = this.ground.geometry.getAttribute("aWater") as THREE.BufferAttribute | undefined;
    const cover = this.ground.geometry.getAttribute("aCover") as THREE.BufferAttribute | undefined;
    const soil = this.ground.geometry.getAttribute("aSoil") as THREE.BufferAttribute | undefined;
    const veg = this.ground.geometry.getAttribute("aVeg") as THREE.BufferAttribute | undefined;
    const paint = this.ground.geometry.getAttribute("aPaint") as THREE.BufferAttribute | undefined;
    const color = this.ground.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
    if (!wet || !cover || !soil || !veg || !paint || !color) return;
    const sx = Math.max(1, this.spanX);
    const sz = Math.max(1, this.spanZ);
    const scaleX = this.ground.scale.x || 1;
    const scaleY = this.ground.scale.y || 1;
    const h = this.surfaceH;
    const w = this.surfaceW;
    const nx = this.surfaceNx;
    const ny = this.surfaceNy;
    const sample = (buf: Float32Array | null, u: number, v: number): number => {
      if (!buf || nx < 2 || ny < 2 || u < 0 || u > 1 || v < 0 || v > 1) return 0;
      const x = u * (nx - 1);
      const y = v * (ny - 1);
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const x1 = Math.min(nx - 1, x0 + 1);
      const y1 = Math.min(ny - 1, y0 + 1);
      const tx = x - x0;
      const ty = y - y0;
      const at = (ix: number, iy: number) => buf[ix + nx * iy];
      const a = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
      const b = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
      return a * (1 - ty) + b * ty;
    };
    const nearest = (buf: Float32Array | null, u: number, v: number): number => {
      if (!buf || nx < 1 || ny < 1 || u < 0 || u > 1 || v < 0 || v > 1) return 0;
      const ix = Math.max(0, Math.min(nx - 1, Math.round(u * (nx - 1))));
      const iy = Math.max(0, Math.min(ny - 1, Math.round(v * (ny - 1))));
      return buf[ix + nx * iy];
    };
    const painted = h != null || w != null || this.surfaceKind != null;
    for (let i = 0; i < pos.count; i++) {
      const worldX = pos.getX(i) * scaleX;
      const worldZ = -pos.getY(i) * scaleY;
      const u = worldX / sx + 0.5;
      const v = 0.5 - worldZ / sz;
      const inside = u >= 0 && u <= 1 && v >= 0 && v <= 1;
      const elev = sample(h, u, v);
      const edge = Math.min(u, v, 1 - u, 1 - v);
      const skirt = inside ? Math.min(1, edge / 0.025) : 0;
      pos.setZ(i, elev * skirt);
      wet.setX(i, sample(w, u, v));
      const kind = nearest(this.surfaceKind, u, v);
      const soilV = sample(this.surfaceSoil, u, v);
      const vegV = sample(this.surfaceVeg, u, v);
      cover.setX(i, kind);
      soil.setX(i, soilV);
      veg.setX(i, vegV);
      paint.setX(i, inside && painted ? 1 : 0);
      const rgb = this.coverColor(inside && painted, kind, soilV, vegV, elev * skirt);
      color.setXYZ(i, rgb[0], rgb[1], rgb[2]);
    }
    pos.needsUpdate = true;
    wet.needsUpdate = true;
    cover.needsUpdate = true;
    soil.needsUpdate = true;
    veg.needsUpdate = true;
    paint.needsUpdate = true;
    color.needsUpdate = true;
    this.writeGroundNormals(pos, scaleX, scaleY);
    this.rebuildForest();
    const eye = this.camera.position;
    eye.y = this.holdAboveSurface(eye.x, eye.y, eye.z, false);
  }

  /** Pines on vegetated land. A stand, not a canopy model. */
  private rebuildForest(): void {
    this.clearForest();
    const veg = this.surfaceVeg;
    const nx = this.surfaceNx;
    const ny = this.surfaceNy;
    if (!veg || nx < 2 || ny < 2) return;
    const sx = Math.max(1, this.spanX);
    const sz = Math.max(1, this.spanZ);
    const spacing = Math.max(260, Math.min(sx, sz) / 150);
    const cols = Math.max(1, Math.ceil(sx / spacing));
    const rows = Math.max(1, Math.ceil(sz / spacing));
    const hash = (i: number, j: number) => {
      const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
      return n - Math.floor(n);
    };
    const sample = (buf: Float32Array, u: number, v: number): number => {
      if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
      const x = u * (nx - 1);
      const y = v * (ny - 1);
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const x1 = Math.min(nx - 1, x0 + 1);
      const y1 = Math.min(ny - 1, y0 + 1);
      const tx = x - x0;
      const ty = y - y0;
      const at = (ix: number, iy: number) => buf[ix + nx * iy] ?? 0;
      const a = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
      const b = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
      return a * (1 - ty) + b * ty;
    };
    const kindAt = (u: number, v: number): number => {
      const kind = this.surfaceKind;
      if (!kind || u < 0 || u > 1 || v < 0 || v > 1) return 0;
      const ix = Math.max(0, Math.min(nx - 1, Math.round(u * (nx - 1))));
      const iy = Math.max(0, Math.min(ny - 1, Math.round(v * (ny - 1))));
      return kind[ix + nx * iy] ?? 0;
    };
    const spots: { x: number; z: number; y: number; s: number; yaw: number }[] = [];
    const consider = (worldX: number, worldZ: number, salt: number) => {
      const u = worldX / sx + 0.5;
      const v = 0.5 - worldZ / sz;
      if (u < 0.02 || u > 0.98 || v < 0.02 || v > 0.98) return;
      const cover = sample(veg, u, v);
      if (cover < 0.34 || kindAt(u, v) >= 0.5) return;
      if (hash(salt, salt + 19) > 0.2 + cover * 0.8) return;
      const elev = this.surfaceH ? sample(this.surfaceH, u, v) : 0;
      const h = hash(salt + 3, salt + 11);
      spots.push({
        x: worldX,
        z: worldZ,
        y: this.groundY + elev,
        s: (0.75 + cover * 0.85) * (0.82 + h * 0.45),
        yaw: hash(salt + 5, salt + 8) * Math.PI * 2,
      });
    };
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const jx = (hash(i, j) - 0.5) * spacing * 0.85;
        const jz = (hash(i + 4, j + 9) - 0.5) * spacing * 0.85;
        const worldX = -sx / 2 + (i + 0.5) * spacing + jx;
        const worldZ = -sz / 2 + (j + 0.5) * spacing + jz;
        consider(worldX, worldZ, i + cols * j);
        const coverU = worldX / sx + 0.5;
        const coverV = 0.5 - worldZ / sz;
        if (sample(veg, coverU, coverV) > 0.72) {
          consider(worldX + spacing * 0.42, worldZ - spacing * 0.33, i + cols * j + 9000);
        }
      }
    }
    // A hard cap used to stop the scan halfway across the domain. Thin evenly instead.
    const cap = 20000;
    if (spots.length > cap) {
      const stride = Math.ceil(spots.length / cap);
      const kept: typeof spots = [];
      for (let n = 0; n < spots.length; n += stride) kept.push(spots[n]);
      spots.length = 0;
      spots.push(...kept);
    }
    if (spots.length === 0) return;
    const trunkGeo = new THREE.CylinderGeometry(1.1, 1.6, 14, 5);
    trunkGeo.translate(0, 7, 0);
    const low = new THREE.ConeGeometry(12, 28, 7);
    low.translate(0, 24, 0);
    const high = new THREE.ConeGeometry(7.5, 20, 7);
    high.translate(0, 38, 0);
    const canopyGeo = joinTreeGeometry([low.toNonIndexed(), high.toNonIndexed()]);
    low.dispose();
    high.dispose();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4632, roughness: 0.92 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1f5a30, roughness: 0.82 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const leaves = new THREE.InstancedMesh(canopyGeo, leafMat, spots.length);
    const dummy = new THREE.Object3D();
    for (let n = 0; n < spots.length; n++) {
      const spot = spots[n];
      dummy.position.set(spot.x, spot.y, spot.z);
      dummy.rotation.set(0, spot.yaw, 0);
      dummy.scale.set(spot.s, spot.s, spot.s);
      dummy.updateMatrix();
      trunks.setMatrixAt(n, dummy.matrix);
      leaves.setMatrixAt(n, dummy.matrix);
    }
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    trunks.frustumCulled = false;
    leaves.frustumCulled = false;
    const group = new THREE.Group();
    group.add(trunks);
    group.add(leaves);
    this.forest = group;
    this.scene.add(group);
  }

  private clearForest(): void {
    if (!this.forest) return;
    this.scene.remove(this.forest);
    this.forest.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.forest = null;
  }

  /**
   * Normals from world-space positions. The plane is a few units across and
   * then scaled to kilometres, so a local-space normal turns a hillside into
   * a blown-out wedge.
   */
  private writeGroundNormals(
    pos: THREE.BufferAttribute,
    scaleX: number,
    scaleY: number,
  ): void {
    const geo = this.ground.geometry;
    const index = geo.getIndex();
    const normal = geo.getAttribute("normal") as THREE.BufferAttribute | undefined;
    if (!index || !normal) {
      geo.computeVertexNormals();
      return;
    }
    const acc = new Float32Array(pos.count * 3);
    const world = (i: number) => ({
      x: pos.getX(i) * scaleX,
      y: pos.getZ(i),
      z: -pos.getY(i) * scaleY,
    });
    for (let t = 0; t < index.count; t += 3) {
      const ia = index.getX(t);
      const ib = index.getX(t + 1);
      const ic = index.getX(t + 2);
      const a = world(ia);
      const b = world(ib);
      const c = world(ic);
      const ux = b.x - a.x;
      const uy = b.y - a.y;
      const uz = b.z - a.z;
      const vx = c.x - a.x;
      const vy = c.y - a.y;
      const vz = c.z - a.z;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      acc[ia * 3] += nx;
      acc[ia * 3 + 1] += ny;
      acc[ia * 3 + 2] += nz;
      acc[ib * 3] += nx;
      acc[ib * 3 + 1] += ny;
      acc[ib * 3 + 2] += nz;
      acc[ic * 3] += nx;
      acc[ic * 3 + 1] += ny;
      acc[ic * 3 + 2] += nz;
    }
    for (let i = 0; i < pos.count; i++) {
      const lx = acc[i * 3] * scaleX;
      const ly = -acc[i * 3 + 2];
      const lz = acc[i * 3 + 1] * scaleY;
      const len = Math.hypot(lx, ly, lz) || 1;
      normal.setXYZ(i, lx / len, ly / len, lz / len);
    }
    normal.needsUpdate = true;
  }

  /** Grass, rock, snow, forest, lake, and ocean. The skirt stays the base green. */
  private coverColor(
    painted: boolean,
    kind: number,
    soilV: number,
    vegV: number,
    elev: number,
  ): [number, number, number] {
    if (!painted) return [this.groundColor.r, this.groundColor.g, this.groundColor.b];
    if (kind >= 1.5) return [0.05, 0.2, 0.36];
    if (kind >= 0.5) return [0.18, 0.46, 0.58];
    const soil = Math.max(0, Math.min(1, soilV));
    const veg = Math.max(0, Math.min(1, vegV));
    const rock = Math.max(0, Math.min(1, (elev - 350) / 1800));
    const snow = Math.max(0, Math.min(1, (elev - 2800) / 1400));
    let r = 0.29 + (0.22 - 0.29) * soil;
    let g = 0.4 + (0.3 - 0.4) * soil;
    let b = 0.2 + (0.16 - 0.2) * soil;
    r += (0.1 - r) * veg;
    g += (0.28 - g) * veg;
    b += (0.12 - b) * veg;
    r += (0.48 - r) * rock;
    g += (0.44 - g) * rock;
    b += (0.4 - b) * rock;
    r += (0.86 - r) * snow;
    g += (0.88 - g) * snow;
    b += (0.9 - b) * snow;
    return [r, g, b];
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
    // PlaneGeometry is 4 units wide. Scale so the domain fills it, with a small skirt.
    this.ground.scale.set((sx * 1.12) / 4, (sz * 1.12) / 4, 1);
    this.ground.position.y = this.groundY;
    this.displaceGround();
    if (this.groundFlashMesh) {
      // Local patch under the strike — not a domain-wide wash.
      this.groundFlashMesh.scale.set(9000, 9000, 1);
      this.groundFlashMesh.position.y = this.groundY + 1;
    }
    this.syncViewDistance();
    const haze = Math.max(4000, this.domainSpan * 0.28);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = haze;
      this.scene.fog.far = haze * 3.2;
    }
    this.rebuildKmGrid(sx, sz);
    this.warnedEmpty = false;

    // Initialize ground state and wind textures
    const nx = grid.nx;
    const ny = grid.ny;
    
    // Ground cover: R rain wetness, G snow depth, B hail diameter, A hail frequency.
    this.groundState = new THREE.DataTexture(new Uint8Array(nx * ny * 4), nx, ny, THREE.RGBAFormat);
    this.groundState.magFilter = this.groundState.minFilter = THREE.LinearFilter;
    this.groundState.wrapS = this.groundState.wrapT = THREE.RepeatWrapping;
    this.groundState.colorSpace = THREE.NoColorSpace;
    this.groundState.needsUpdate = true;
    
    // Wind texture over the ground
    this.windTexture = new THREE.DataTexture(new Uint8Array(nx * ny), nx, ny, THREE.RedFormat);
    this.windTexture.magFilter = this.windTexture.minFilter = THREE.LinearFilter;
    this.windTexture.wrapS = this.windTexture.wrapT = THREE.RepeatWrapping;
    this.windTexture.needsUpdate = true;
    
    // Ground uniforms — uGroundSize is kilometres (landPattern fields are ~0.8×0.5 km).
    this.groundUniforms = {
      uGround: { value: this.groundState },
      uWind: { value: this.windTexture },
      uGroundOffset: { value: new THREE.Vector2() },
      uGroundSize: { value: new THREE.Vector2(sx / 1000, sz / 1000) },
      uSurface: { value: 0 }, // 0 = grass, 1 = dry, 2 = water, 3 = urban
    };
    const skyMat = this.sky.material as THREE.ShaderMaterial;
    if (skyMat.uniforms.uGroundSize) {
      (skyMat.uniforms.uGroundSize.value as THREE.Vector2).set(sx / 1000, sz / 1000);
    }

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
    if (this.volumeTexPrev) {
      this.volumeTexPrev.dispose();
      this.volumeTexPrev = null;
    }
    this.volumeBlendReady = false;
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
    this.volumeDataPrev = new Uint8Array(new ArrayBuffer(bytes));
    this.volNx = disp.nx;
    this.volNy = disp.ny;
    this.volNz = disp.nz;
    this.shadowAdapt = 0;
    this.lastPushedAdapt = -1;
    this.ensureCloudShadowMap(disp.nx, disp.ny);
    // Texture axes are the world box: X east, Y up, Z south.
    this.volumeTex = this.makeVolumeTexture(this.volumeData, disp.nx, disp.nz, disp.ny);
    const prevTex = this.makeVolumeTexture(
      this.volumeDataPrev,
      disp.nx,
      disp.nz,
      disp.ny,
    );
    this.volumeTexPrev = prevTex;
    this.precipitation.setBounds(sx, sz, this.groundY, height);
    this.precipitation.setVolume(this.volumeData, disp.nx, disp.ny, disp.nz);

    const boxMin = new THREE.Vector3(-sx / 2, this.groundY, -sz / 2);
    const boxMax = new THREE.Vector3(sx / 2, this.groundY + height, sz / 2);
    this.cloudMat = new VolumetricCloudMaterial({
      fields: this.volumeTex,
      boxMin,
      boxMax,
      fieldGain: new THREE.Vector3(this.tune.gain, this.tune.gain, this.tune.gain),
      quality: { maxSteps: 160 },
    });
    this.cloudMat.setFieldsPrev(prevTex);
    this.cloudMat.setVolumeMix(1);
    this.cloudMat.setStepBudget(this.stepBudget);
    this.volumeMesh = createCloudMesh(this.cloudMat, boxMin, boxMax);
    this.volumeMesh.visible = this.cloudsOn;
    this.cloudScene.add(this.volumeMesh);
    this.volumeClear = false;
    this.lastVolumeMs = 0;
    this.volumeBlendReady = false;
    this.volumeBlendDur = 1;
    this.applyCloudSun();
    this.applyCloudWind();
    if (this.lookdev) {
      this.cloudMat.setLook({ ...DEFAULT_LOOK });
      applyLookdevPreset(this.cloudMat, this.camera, this.lookdev);
      this.captureTuneFromMaterial();
    }
    this.applyTune();
    this.historyValid = false;

    // Initialize MeteoLAB components (box in metres; light volume shaders use the same).
    this.sharedUniforms = {
      uBoxMin: { value: boxMin },
      uBoxMax: { value: boxMax },
      uGrid: { value: new THREE.Vector3(disp.nx, disp.ny, disp.nz) },
      uHeight: { value: height },
      uExtinction: { value: 0.004 },
      uSunDir: { value: this.sunDir.clone() },
    };
    this.bindBoltVolume();

    // Baked sun OD + sky visibility — sampled by the cheap view march.
    this.lightVolume = new LightVolume(disp.nx, disp.ny, disp.nz, this.sharedUniforms, this.volumeTex);
    this.cloudMat.setLightVolume(this.lightVolume.texture);
    // Seed the bake once so the first day frame is not open-sky fallback.
    if (this.sunDir.y > -0.02) {
      this.lightVolume.update(this.renderer, this.volumeRevision, this.sunDir);
      this.heavyAt = performance.now();
    }
    // Force ground material to recompile with current shared + shadow uniforms.
    (this.ground.material as THREE.MeshStandardMaterial).needsUpdate = true;
    this.shadowMapRevision = -1;
    this.rebuildCloudShadowMap(true);

    // Initialize FlashVolume for GPU-based lightning lighting
    this.flashVolume = new FlashVolume(disp.nx, disp.ny, disp.nz, this.sharedUniforms, this.volumeTex);

    // Initialize SpriteView with shader-based rendering
    this.spriteView = new SpriteView(this.sharedUniforms, this.volumeTex);
    this.scene.add(this.spriteView.mesh);

    // Initialize LightningView (will need toWorld and channelShape functions)
    // For now, use placeholder functions - these need to be connected to the actual simulation
    const toWorld = (x: number, y: number, z: number) => [x * sx / disp.nx - sx/2, y * height / disp.nz + this.groundY, z * sz / disp.ny - sz/2] as const;
    const channelShape = (flash: Flash) => new Float64Array(flash.nodes.length * 3).fill(0); // Placeholder
    this.lightningView = new LightningView(toWorld, channelShape, this.sharedUniforms, this.volumeTex);
    this.scene.add(this.lightningView.mesh);

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

    this.fieldView.setGrid(grid.nx, grid.ny, grid.nz, sx, sz, this.groundY, height);
    this.groundOverlays.setGrid(grid.nx, grid.ny, sx, sz, this.groundY, height);

    this.spawnPlayer();
    this.resize();
  }

  setFieldMode(mode: OverlayField): void {
    this.fieldView.setMode(mode);
  }

  getFieldMode(): OverlayField {
    return this.fieldView.getMode();
  }

  updateField(pack: (out: Uint8Array) => void): void {
    this.fieldView.update(pack);
  }

  setShowSwath(on: boolean): void {
    this.groundOverlays.showSwath = on;
    this.groundOverlays.applyVisibility();
  }

  setShowColdPool(on: boolean): void {
    this.groundOverlays.showColdPool = on;
    this.groundOverlays.applyVisibility();
  }

  setShowFronts(on: boolean): void {
    this.groundOverlays.showFronts = on;
    this.groundOverlays.applyVisibility();
  }

  setShowVortex(on: boolean): void {
    this.groundOverlays.showVortex = on;
    this.groundOverlays.applyVisibility();
  }

  /** Rain wetness, snow depth, hail size and hail frequency, one texel per column. */
  updateGroundCover(bytes: Uint8Array): void {
    const image = this.groundState?.image as { data?: Uint8Array } | undefined;
    const data = image?.data;
    if (!data || bytes.length !== data.length) return;
    data.set(bytes);
    this.groundState!.needsUpdate = true;
  }

  updateSwath(pack: (out: Uint8Array) => void): void {
    this.groundOverlays.updateSwath(pack);
  }

  updateColdPool(pack: (out: Uint8Array) => void): void {
    this.groundOverlays.updateColdPool(pack);
  }

  updateFronts(fronts: DrawnFront[]): void {
    this.groundOverlays.updateFronts(fronts);
  }

  updateVortex(levels: VortexLevel[]): void {
    this.groundOverlays.updateVortex(levels);
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
    const gap = this.lastVolumeMs > 0 ? now - this.lastVolumeMs : 0;
    this.lastVolumeMs = now;
    // Keep the last upload so the shader can fade across the gap between packs.
    // Playback scrubs land on the new frame immediately (one render, no in-between).
    const blend =
      !force &&
      this.volumeBlendReady &&
      !!this.volumeDataPrev &&
      !!this.volumeTexPrev &&
      gap >= 40;
    if (blend && this.volumeDataPrev && this.volumeTexPrev) {
      this.volumeDataPrev.set(this.volumeData);
      this.volumeTexPrev.needsUpdate = true;
      // Keep the crossfade short — long blends read as the whole cloud pulsing.
      this.volumeBlendDur = Math.min(160, Math.max(40, gap * 0.45));
      this.volumeBlendStart = now;
    }
    if (empty) {
      this.volumeData.fill(0);
      this.volumeClear = true;
    } else {
      pack(this.volumeData);
      this.volumeClear = false;
    }
    this.volumeTex.needsUpdate = true;
    this.volumeRevision++;
    if (!blend && this.volumeDataPrev && this.volumeTexPrev) {
      this.volumeDataPrev.set(this.volumeData);
      this.volumeTexPrev.needsUpdate = true;
      this.volumeBlendReady = true;
      this.volumeBlendStart = now;
      this.volumeBlendDur = 1;
      this.cloudMat?.setVolumeMix(1);
    }
    const groundMat = this.ground.material as THREE.MeshStandardMaterial;
    groundMat.roughness = 0.96;

    if (!this.warnedEmpty && !empty) {
      let maxA = 0;
      const vol = this.volumeData;
      for (let i = 0; i < vol.length; i += 4) {
        const m = Math.max(vol[i], vol[i + 1], vol[i + 2], vol[i + 3]);
        if (m > maxA) maxA = m;
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

    const frameNow = performance.now();
    this.updateStepBudget(frameNow);
    this.applyKeyboardMove();
    this.camera.updateMatrixWorld();
    this.camera.updateProjectionMatrix();
    this.currViewProj.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse,
    );
    this.invViewProj.copy(this.currViewProj).invert();
    this.applyLocalShadowAdapt();
    if (this.precipitation.points.visible) {
      this.precipitation.setPixelScale(this.renderer.domElement.height);
      this.precipitation.update(performance.now());
    }

    // Ground cloud shadows + light volume when density or sun moved.
    // Both stay on the previous field until the blend finishes, then catch up once.
    // Skip that catch-up while the frame is already saturated — rebuilding the
    // light volume is a full extra march and was holding the clock at zero.
    // The light-volume pass is a second full march. While frames are long,
    // keep the last one instead of rebuilding on every upload.
    const night = this.sunDir.y <= -0.02 || this.sunFrac < 0.08;
    // Night skips the two-texture volume blend — cheaper march, no crossfade pulse.
    const volumeMix = night ? 1 : this.volumeMixNow();
    const sinceHeavy = frameNow - this.heavyAt;
    const heavyGap = night ? 6000 : 2500;
    const deferHeavy =
      this.heavyAt > 0 &&
      (night ||
        this.frameMsEma > 80 ||
        this.lastFrameDt > 70 ||
        sinceHeavy < heavyGap);
    if (!deferHeavy) this.rebuildCloudShadowMap(false);
    if (this.lightVolume && !deferHeavy && !night) {
      if (this.sharedUniforms.uSunDir) {
        (this.sharedUniforms.uSunDir.value as THREE.Vector3).copy(this.sunDir);
      }
      const lightRev =
        volumeMix >= 0.999 ? this.volumeRevision : Math.max(0, this.volumeRevision - 1);
      this.lightVolume.update(this.renderer, lightRev, this.sunDir);
    }
    if (!deferHeavy) this.heavyAt = frameNow;
    if (this.cloudMat && this.lightVolume) {
      this.cloudMat.setLightVolume(this.lightVolume.texture);
    }

    if (this.cloudMat) {
      this.cloudMat.setVolumeMix(volumeMix);
      this.cloudMat.setStepBudget(this.stepBudget);
      this.cloudMat.update(frameNow * 0.001);
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
    this.sky.scale.setScalar(this.camera.far);
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
      resolve.uniforms.uValid.value =
        this.cloudTaaOn && this.historyValid ? 1 : 0;
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

    // Weather that must be occluded by terrain/trees: draw into the scene RT
    // while its depth buffer is still live (the default FB has none).
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.autoClear = false;
    if (this.precipitation.points.visible) {
      this.renderer.render(this.precipScene, this.camera);
    }
    if (
      this.boltGlows.some((ribbon) => ribbon.visible) ||
      this.boltCores.some((ribbon) => ribbon.visible)
    ) {
      this.renderer.render(this.boltScene, this.camera);
    }
    if (this.lightningView?.mesh.visible) {
      this.renderer.render(this.lightningView.mesh, this.camera);
    }
    if (this.spriteView) {
      const dark = Math.max(0, 1 - this.sunFrac);
      this.spriteView.update(this.timeSeconds, dark, this.cloudsOn);
      if (this.spriteView.mesh.visible) {
        this.renderer.render(this.spriteView.mesh, this.camera);
      }
    }

    this.renderer.setRenderTarget(null);
    this.renderer.autoClear = true;
    this.renderer.render(this.presentScene, this.overlayCam);
    if (this.blitMesh.visible) {
      this.renderer.autoClear = false;
      this.renderer.render(this.overlay, this.overlayCam);
    }

    this.renderer.autoClear = true;
    this.prevViewProj.copy(this.currViewProj);
  }

  /**
   * Temporal mix for the cloud resolve. Lower while walking or a bolt is bright
   * so history cannot stretch into ribbons.
   */
  private lightningMix(): number {
    for (const bolt of this.liveBolts) {
      if (bolt.kind === "sprite") continue;
      const b = brightness(bolt.course, bolt.isCg, bolt.age * 1000);
      if (b.main * bolt.brightness > 0.25) return 0.08;
    }
    const k = this.moveKeys;
    const walking = k.forward || k.back || k.left || k.right || this.draggingLook;
    return walking ? 0.28 : 0.62;
  }

  /** Point bolt shaders at the live cloud/rain volume so thick media hides the channel. */
  private bindBoltVolume(): void {
    if (!this.volumeTex || !this.sharedUniforms) return;
    const boxMin = this.sharedUniforms.uBoxMin.value as THREE.Vector3;
    const boxMax = this.sharedUniforms.uBoxMax.value as THREE.Vector3;
    for (const mesh of [...this.boltGlows, ...this.boltCores]) {
      const mat = mesh.material as THREE.ShaderMaterial;
      mat.uniforms.uFields.value = this.volumeTex;
      (mat.uniforms.uBoxMin.value as THREE.Vector3).copy(boxMin);
      (mat.uniforms.uBoxMax.value as THREE.Vector3).copy(boxMax);
    }
  }

  private makeBoltRibbon(): THREE.Mesh {
    const n = this.boltPointCount;
    const geo = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3);
    pos.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", pos);
    const index = new THREE.BufferAttribute(new Uint16Array((n - 1) * 6), 1);
    index.setUsage(THREE.DynamicDrawUsage);
    geo.setIndex(index);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
      fog: false,
      vertexShader: boltRibbonVertex,
      fragmentShader: boltRibbonFragment,
      uniforms: {
        uFields: { value: this.volumeTex ?? this.boltFieldFallback },
        uBoxMin: { value: new THREE.Vector3() },
        uBoxMax: { value: new THREE.Vector3(1, 1, 1) },
        uColor: { value: new THREE.Color(0xf4f7ff) },
        uOpacity: { value: 0 },
        uOcclude: { value: 0 },
      },
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
    polarity?: 1 | -1;
    x: number;
    y: number;
    z: number;
    endX?: number;
    endY?: number;
    endZ?: number;
  }): void {
    const kind = hit.kind;
    const polarity = hit.polarity ?? (kind === "negcg" ? -1 : 1);
    let seed = Math.random() * 20;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed >>> 0) / 0xffffffff;
    };
    const endX = hit.endX ?? hit.x;
    const endY = hit.endY ?? (isCgKind(kind) ? this.groundY + 2 : hit.y);
    const endZ = hit.endZ ?? hit.z;
    const channelKind: ChannelKind =
      kind === "negcg" || kind === "poscg" || kind === "spider" || kind === "ic"
        ? kind
        : "ic";
    const to =
      kind === "negcg" || kind === "poscg"
        ? {
            x: endX + (rng() - 0.5) * (kind === "poscg" ? 1600 : 200),
            y: this.groundY + 2,
            z: endZ + (rng() - 0.5) * (kind === "poscg" ? 1600 : 200),
          }
        : { x: endX, y: endY, z: endZ };
    const channel =
      kind === "sprite"
        ? { points: [], spans: [], extentKm: 0.5 }
        : buildChannel(
            channelKind,
            { x: hit.x, y: hit.y, z: hit.z },
            to,
            this.groundY,
            rng,
            this.boltPointCount,
          );
    const flashKind: Flash["kind"] =
      kind === "spider" ? "SPIDER" : isCgKind(kind) ? "CG" : "IC";
    const flash: Flash = {
      kind: flashKind,
      charge: polarity,
      time: this.timeSeconds * 1000,
      start: Math.floor(this.timeSeconds * 10),
      nodes: [0, 1, 2, 3, 4],
      parent: [-1, 0, 1, 2, 3],
      ground: 4,
    };
    const c = course(flash, rng, channel.extentKm);
    const life = c.end / 1000;
    const isCg = isCgKind(kind);
    this.liveBolts.unshift({
      ...hit,
      polarity,
      endX,
      endY: to.y,
      endZ,
      age: 0,
      life: life * this.boltLifeScale,
      seed,
      course: c,
      isCg,
      channel,
      brightness:
        (kind === "poscg"
          ? 1.05 + Math.random() * 0.35
          : kind === "spider"
            ? 1.0 + Math.random() * 0.3
            : kind === "ic"
              ? 1.05 + Math.random() * 0.35
              : 0.7 + Math.random() * 0.5) * this.boltBrightScale,
    });
    if (this.liveBolts.length > 6) this.liveBolts.length = 6;
    if (kind === "sprite" && this.spritesOn && this.spriteView) {
      this.spriteView.add(
        Math.random() < 0.25 ? "halo" : "sprite",
        hit.x,
        hit.y,
        hit.z,
        this.timeSeconds + c.strokes[0].at / 1000,
        0.9,
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
    const occlude = this.cloudsOn && this.volumeTex ? 1 : 0;
    for (const mesh of [...this.boltGlows, ...this.boltCores]) {
      (mesh.material as THREE.ShaderMaterial).uniforms.uOcclude.value = occlude;
    }
    for (let n = 0; n < 6; n++) {
      const bolt = this.liveBolts[n];
      const light = this.flashLights[n];
      const glow = this.boltGlows[n];
      const core = this.boltCores[n];
      if (!bolt || !light || !glow || !core) {
        if (light) light.intensity = 0;
        if (glow) glow.visible = false;
        if (core) core.visible = false;
        continue;
      }
      const t = bolt.age * 1000;
      const b = brightness(bolt.course, bolt.isCg, t);
      const pulse = b.main * bolt.brightness;
      if (bolt.kind === "sprite") {
        light.intensity = 0;
        glow.visible = false;
        core.visible = false;
        continue;
      }
      this.boltTint(bolt.x, bolt.y, bolt.z);
      this.applyKindTint(bolt.kind);
      light.color.copy(this.flashTint);
      const litY = bolt.isCg ? bolt.y * 0.4 + this.groundY * 0.6 : bolt.y;
      light.position.set(bolt.x, litY, bolt.z);
      const dayScale = Math.max(0.35, 1 - 0.55 * this.sunFrac);
      const energy =
        bolt.kind === "poscg"
          ? 9e7
          : bolt.kind === "negcg"
            ? 5.5e7
            : bolt.kind === "spider"
              ? 5e7
              : 5.5e7;
      light.intensity = energy * pulse * dayScale;

      const packed = this.clipChannel(
        bolt.channel,
        b.reveal,
        b.reveal < 1 ? b.reveal : 1,
        b.main,
        b.branch,
      );
      const widths = this.kindWidths(bolt.kind);
      const glowOn = this.writeRibbon(
        glow,
        packed,
        widths.glow,
        Math.min(0.55, 0.16 + 0.42 * pulse),
        this.flashTint,
      );
      const coreColor = this.boltCoreTint.copy(this.flashTint).lerp(this.boltWhite, 0.55);
      const coreOn = this.writeRibbon(
        core,
        packed,
        widths.core,
        Math.min(1, 0.5 + 0.55 * pulse),
        coreColor,
      );
      glow.visible = glowOn;
      core.visible = coreOn;
    }
    let groundPulse = 0;
    let groundX = 0;
    let groundZ = 0;
    for (const bolt of this.liveBolts) {
      if (!bolt.isCg) continue;
      const b = brightness(bolt.course, true, bolt.age * 1000);
      const pulse = b.main * bolt.brightness;
      if (pulse >= groundPulse) {
        groundPulse = pulse;
        groundX = bolt.endX;
        groundZ = bolt.endZ;
      }
    }
    const night = Math.max(0.35, 1 - 0.55 * this.sunFrac);
    if (this.groundFlashMesh) {
      const mat = this.groundFlashMesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.min(0.28, groundPulse * 0.16 * night);
      this.groundFlashMesh.position.x = groundX;
      this.groundFlashMesh.position.z = groundZ;
      this.groundFlashMesh.visible =
        this.groundFlashOn && groundPulse > 0.02;
    }
    const groundMat = this.ground.material as THREE.MeshStandardMaterial;
    groundMat.emissive.copy(this.flashTint).multiplyScalar(groundPulse * 0.06 * night);
  }

  private kindWidths(kind: LightningKind): { core: number; glow: number } {
    const s = this.boltWidthScale;
    if (kind === "poscg") return { core: 22 * s, glow: 130 * s };
    if (kind === "negcg") return { core: 12 * s, glow: 70 * s };
    if (kind === "spider") return { core: 14 * s, glow: 90 * s };
    return { core: 13 * s, glow: 85 * s };
  }

  private applyKindTint(kind: LightningKind): void {
    if (kind === "poscg") this.flashTint.lerp(this.kindTintPos, 0.35);
    else if (kind === "spider") this.flashTint.lerp(this.kindTintSpider, 0.4);
    else if (kind === "ic") this.flashTint.lerp(this.kindTintIc, 0.25);
  }

  private clipChannel(
    channel: LightningChannel,
    reveal: number,
    branchReveal: number,
    mainPulse: number,
    branchPulse: number,
  ): { count: number; spans: { start: number; count: number; branch: boolean }[] } {
    const spans: { start: number; count: number; branch: boolean }[] = [];
    let used = 0;
    const cap = this.boltScratch.length;
    for (const span of channel.spans) {
      const pulse = span.branch ? branchPulse : mainPulse;
      const clip = span.branch ? branchReveal : reveal;
      if (pulse < 0.03) continue;
      const start = used;
      let n = 0;
      for (let i = 0; i < span.count; i++) {
        const p = channel.points[span.start + i];
        if (!p || p.order > clip) continue;
        if (used >= cap) break;
        this.boltScratch[used++].set(p.x, p.y, p.z);
        n++;
      }
      if (n >= 2) spans.push({ start, count: n, branch: span.branch });
      else used = start;
    }
    return { count: used, spans };
  }

  private writeRibbon(
    mesh: THREE.Mesh,
    packed: { count: number; spans: { start: number; count: number; branch: boolean }[] },
    half: number,
    opacity: number,
    color: THREE.Color,
  ): boolean {
    if (packed.count < 2) {
      mesh.visible = false;
      return false;
    }
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const idx = mesh.geometry.getIndex() as THREE.BufferAttribute;
    const eye = this.camera.position;
    for (const span of packed.spans) {
      const w = span.branch ? half * 0.55 : half;
      for (let s = 0; s < span.count; s++) {
        const i = span.start + s;
        const p = this.boltScratch[i];
        const prev = this.boltScratch[span.start + Math.max(0, s - 1)];
        const next = this.boltScratch[span.start + Math.min(span.count - 1, s + 1)];
        this.boltTangent.subVectors(next, prev);
        this.boltToCam.subVectors(eye, p);
        this.boltRight.crossVectors(this.boltTangent, this.boltToCam);
        if (this.boltRight.lengthSq() < 1) {
          this.boltRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
        }
        this.boltRight.normalize().multiplyScalar(w);
        pos.setXYZ(i * 2, p.x + this.boltRight.x, p.y + this.boltRight.y, p.z + this.boltRight.z);
        pos.setXYZ(i * 2 + 1, p.x - this.boltRight.x, p.y - this.boltRight.y, p.z - this.boltRight.z);
      }
    }
    pos.needsUpdate = true;
    let q = 0;
    for (const span of packed.spans) {
      for (let s = 0; s < span.count - 1; s++) {
        const a = (span.start + s) * 2;
        idx.setX(q++, a);
        idx.setX(q++, a + 1);
        idx.setX(q++, a + 2);
        idx.setX(q++, a + 1);
        idx.setX(q++, a + 3);
        idx.setX(q++, a + 2);
      }
    }
    idx.needsUpdate = true;
    mesh.geometry.setDrawRange(0, q);
    const mat = mesh.material as THREE.ShaderMaterial;
    (mat.uniforms.uColor.value as THREE.Color).copy(color);
    mat.uniforms.uOpacity.value = opacity;
    return q > 0;
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
    tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
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
    this.boltFieldFallback.dispose();
    this.precipitation.dispose();
    this.precipScene.remove(this.precipitation.points);

    // Dispose MeteoLAB components
    if (this.lightVolume) {
      this.lightVolume.dispose();
      this.lightVolume = null;
    }
    if (this.flashVolume) {
      this.flashVolume.dispose();
      this.flashVolume = null;
    }
    if (this.lightningView) {
      this.lightningView.dispose();
      this.scene.remove(this.lightningView.mesh);
      this.lightningView = null;
    }
    if (this.spriteView) {
      this.spriteView.dispose();
      this.scene.remove(this.spriteView.mesh);
      this.spriteView = null;
    }

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
    this.noise.dispose();
    this.skyTexture?.dispose();
    this.groundState?.dispose();
    this.windTexture?.dispose();
    this.cloudShadowTex?.dispose();
    this.cloudShadowTex = null;
    this.cloudShadowData = null;
    this.fieldView.dispose();
    this.groundOverlays.dispose();
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
    if (this.volumeTexPrev) {
      this.volumeTexPrev.dispose();
      this.volumeTexPrev = null;
    }
    if (this.kmGrid) {
      this.scene.remove(this.kmGrid);
      this.kmGrid.geometry.dispose();
      (this.kmGrid.material as THREE.Material).dispose();
      this.kmGrid = null;
    }
    for (const ribbon of [...this.boltGlows, ...this.boltCores]) {
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

/** Hide a channel where the view ray crosses really thick cloud or rain. */
const boltRibbonVertex = /* glsl */ `
uniform sampler3D uFields;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uOcclude;
varying vec3 vColor;
varying float vSeen;

float boltSeen(vec3 p) {
  if (uOcclude < 0.5) return 1.0;
  vec3 rd = cameraPosition - p;
  float far = length(rd);
  if (far < 2.0) return 1.0;
  rd /= far;
  vec3 inv = 1.0 / rd;
  vec3 t0 = (uBoxMin - p) * inv;
  vec3 t1 = (uBoxMax - p) * inv;
  vec3 lo = min(t0, t1);
  vec3 hi = max(t0, t1);
  float a = max(max(max(lo.x, lo.y), lo.z), 0.0);
  float b = min(min(min(hi.x, hi.y), hi.z), far);
  if (b <= a + 1.0) return 1.0;
  float span = b - a;
  float steps = clamp(ceil(span / 350.0), 6.0, 40.0);
  float ds = span / steps;
  float od = 0.0;
  for (int i = 0; i < 40; i++) {
    if (float(i) < steps) {
      vec3 q = p + rd * (a + ds * (float(i) + 0.5));
      vec3 uvw = clamp((q - uBoxMin) / max(uBoxMax - uBoxMin, vec3(1.0)), 0.0, 1.0);
      vec4 f = textureLod(uFields, uvw, 0.0);
      float cloud = max(max(f.r, f.g), f.a);
      float rain = f.b;
      float block = smoothstep(0.32, 0.72, cloud) + smoothstep(0.45, 0.85, rain);
      od += block * ds;
    }
  }
  return exp(-od * 0.006);
}

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vSeen = boltSeen(wp.xyz);
  vColor = uColor * uOpacity * vSeen;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const boltRibbonFragment = /* glsl */ `
varying vec3 vColor;
varying float vSeen;

void main() {
  if (vSeen < 0.02) discard;
  gl_FragColor = vec4(vColor, 1.0);
}
`;
