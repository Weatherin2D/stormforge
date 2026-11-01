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
import { computeSky, SkyState, hazeExtinction, SUN_LEVELS, SKY_COLS, SKY_ROWS, adaptation, ADAPT_MAX, luminance } from "./sky";
import { skyFragment, skyVertex } from "./clouds/skyShader";
import { course, brightness, type LightningCourse, LightningView, type Flash } from "./lightning";
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
const GROUND_WATER_MM = 16;

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
  /** Horizontal move speed, m/s. Shift triples it. */
  private readonly walkSpeed = 55;
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
  /** Ground state texture (water, hail per ground column). */
  private groundState: THREE.DataTexture | null = null;
  /** Wind texture over the ground. */
  private windTexture: THREE.DataTexture | null = null;
  /** Ground uniforms for surface shader. */
  private groundUniforms: Record<string, THREE.IUniform> = {};
  /** Water and hail data per ground column. */
  private water: Float32Array | null = null;
  private hailCover: Float32Array | null = null;
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
  private readonly boltPointCount = 80;
  private readonly boltScratch: THREE.Vector3[] = Array.from(
    { length: 80 },
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
      color: this.groundColor,
      roughness: 0.96,
      metalness: 0,
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
        .replace("#include <common>", "#include <common>\nvarying vec3 vCloudWorld;")
        .replace(
          "#include <project_vertex>",
          "#include <project_vertex>\nvCloudWorld=(modelMatrix*vec4(transformed,1.0)).xyz;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>\n${groundSurfacePars}\n${groundShadowPars}`,
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
{
  vec2 g = groundAt(vCloudWorld), q = g * uGroundSize;
  vec4 st = texture(uGround, g);
  gWater = st.r * GROUND_WATER; gHail = st.g;
  float blur = min(length(dFdx(q)), length(dFdy(q)));
  if(abs(uSurface - 2.0) < 0.5){
    float U = texture(uWind, groundAt(vCloudWorld)).r * WIND_SCALE / 1.15;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6), clamp(3.84e-6 * pow(U, 3.41), 0.0, 0.3));
    gSpec = 1.0;
  } else {
    diffuseColor.rgb *= landPattern(q, blur);
    float urban = step(2.5, uSurface), steppe = step(0.5, uSurface) * (1.0 - urban);
    float wet = mix(mix(0.88, 0.7, steppe), 0.55, urban), pond = mix(mix(10.0, 5.0, steppe), 1.5, urban);
    diffuseColor.rgb *= mix(1.0, wet, smoothstep(0.0, 0.3, gWater));
    gSpec = smoothstep(pond, pond * 2.0, gWater);
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.75, 0.78), gHail);
}`,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
if(abs(uSurface - 2.0) < 0.5){
  float U = texture(uWind, groundAt(vCloudWorld)).r * WIND_SCALE / 1.15;
  roughnessFactor = sqrt(sqrt(0.003 + 0.00512 * U));
} else roughnessFactor = mix(roughnessFactor, 0.15, gSpec);`,
        )
        .replace(
          "#include <lights_fragment_end>",
          "#include <lights_fragment_end>\n{vec3 s=cloudShade(vCloudWorld);reflectedLight.indirectDiffuse=reflectedLight.indirectDiffuse*s.y+reflectedLight.directDiffuse*s.z;reflectedLight.directDiffuse*=s.x;reflectedLight.directSpecular*=s.x;}",
        )
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
    this.scene.add(this.precipitation.points);
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
    const speed = this.walkSpeed * (this.moveFast ? 3.2 : 1) * dt;
    const dx = ((this.moveRight.x * ax + this.moveFwd.x * az) / len) * speed;
    const dz = ((this.moveRight.z * ax + this.moveFwd.z * az) / len) * speed;

    const halfX = this.spanX * 0.48;
    const halfZ = this.spanZ * 0.48;
    const p = this.camera.position;
    p.x = Math.min(halfX, Math.max(-halfX, p.x + dx));
    p.z = Math.min(halfZ, Math.max(-halfZ, p.z + dz));
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
      const night = Math.max(0.4, 1 - 0.5 * this.sunFrac);
    for (const bolt of this.liveBolts) {
      if (flashes.length >= 4) break;
      if (bolt.kind === "sprite") continue;
      const b = brightness(bolt.course, bolt.isCg, bolt.age * 1000);
      const pulse = b.main * bolt.brightness;
      if (pulse < 0.02) continue;
      // Kept below MeteoLAB FLASH_GAIN-scale so clouds don't white-out.
      const gain = (bolt.isCg ? 7 : 4.5) * night;
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
      if (bolt.isCg) {
        const midY = bolt.y * 0.55 + this.groundY * 0.45;
        pushAt(bolt.x, midY, bolt.z, pulse * gain * 0.45);
        pushAt(bolt.x, this.groundY + 250, bolt.z, pulse * gain * 0.28);
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
    // Night: coarser march (fewer steps) — translucent night clouds were burning max steps.
    const nightStep = night > 0.55 ? 1.6 : night > 0.25 ? 1.25 : 1.0;
    this.cloudMat.setLook({
      stepSize: DEFAULT_LOOK.stepSize * nightStep,
      shadowProbes: night > 0.7 ? 0 : this.tune.shadowProbes,
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

  /**
   * March the packed volume toward the sun for each ground column and write
   * sun/sky transmittance into uCloudShadow. Stormforge density is Y-up metres;
   * this is the reliable ground-shadow path (the MeteoLAB 3D light volume is not).
   */
  private rebuildCloudShadowMap(force: boolean): void {
    const data = this.volumeData;
    const out = this.cloudShadowData;
    const tex = this.cloudShadowTex;
    const nx = this.volNx;
    const ny = this.volNy;
    const nz = this.volNz;
    if (!data || !out || !tex || nx < 1 || ny < 1 || nz < 1) return;

    const sunChanged = this.shadowMapSun.distanceToSquared(this.sunDir) > 1e-8;
    if (!force && this.shadowMapRevision === this.volumeRevision && !sunChanged) {
      return;
    }
    this.shadowMapRevision = this.volumeRevision;
    this.shadowMapSun.copy(this.sunDir);

    if (this.volumeClear) {
      out.fill(255);
      for (let i = 0; i < nx * ny; i++) out[i * 4 + 2] = 0;
      tex.needsUpdate = true;
      return;
    }

    const dx = this.spanX / nx;
    const dy = this.spanY / Math.max(1, nz);
    const dz = this.spanZ / ny;
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

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        // Sky visibility: vertical optical depth above the column.
        let odUp = 0;
        for (let k = 0; k < nz; k++) odUp += sampleSigma(i, j, k) * dy;
        const skyVis = Math.exp(-odUp * 0.55);

        // Direct sun: march from the ground cell toward the sun through the volume.
        let sunVis = 1;
        if (sunY > -0.02) {
          let x = ((i + 0.5) / nx) * this.spanX - halfX;
          let y = y0;
          let z = halfZ - ((j + 0.5) / ny) * this.spanZ;
          let odSun = 0;
          for (let s = 0; s < steps; s++) {
            x += sx * step;
            y += sy * step;
            z += sz * step;
            if (y > yTop || y < this.groundY) break;
            if (x < -halfX || x > halfX || z < -halfZ || z > halfZ) break;
            const ii = Math.floor(((x + halfX) / this.spanX) * nx);
            const jj = Math.floor(((halfZ - z) / this.spanZ) * ny);
            const kk = Math.floor(((y - this.groundY) / this.spanY) * nz);
            odSun += sampleSigma(ii, jj, kk) * step;
            if (odSun > 12) break;
          }
          sunVis = Math.exp(-odSun);
        } else {
          sunVis = 0;
        }

        const o = (i + nx * j) * 4;
        out[o] = Math.min(255, Math.max(0, (sunVis * 255) | 0));
        out[o + 1] = Math.min(255, Math.max(0, (skyVis * 255) | 0));
        out[o + 2] = 0;
        out[o + 3] = 255;
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
    this.shadowAdapt += (target - this.shadowAdapt) * 0.1;
    const s = this.shadowAdapt;
    this.renderer.toneMappingExposure = 1.0 * (1 + s * 0.9);
    // Intensity baseline is 1 (gain is in sunLight.color); dim further under cloud.
    this.sunLight.intensity = Math.max(0.08, 1 - s * 0.9);
    this.hemi.intensity = Math.max(0.28, 1 - s * 0.62);
    const groundMat = this.ground.material as THREE.MeshStandardMaterial;
    // Mild global dim — spatial cloud shadows do the real work.
    groundMat.color.copy(this.groundColor).multiplyScalar(1 - s * 0.22);
    if (this.cloudMat) {
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
      // Local patch under the strike — not a domain-wide wash.
      this.groundFlashMesh.scale.set(9000, 9000, 1);
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

    // Initialize ground state and wind textures
    const nx = grid.nx;
    const ny = grid.ny;
    
    // Ground state texture (water, hail per ground column)
    this.water = new Float32Array(nx * ny).fill(0);
    this.hailCover = new Float32Array(nx * ny).fill(0);
    this.groundState = new THREE.DataTexture(new Uint8Array(nx * ny * 4), nx, ny, THREE.RGBAFormat);
    this.groundState.magFilter = this.groundState.minFilter = THREE.LinearFilter;
    this.groundState.wrapS = this.groundState.wrapT = THREE.RepeatWrapping;
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
    this.volNx = disp.nx;
    this.volNy = disp.ny;
    this.volNz = disp.nz;
    this.shadowAdapt = 0;
    this.ensureCloudShadowMap(disp.nx, disp.ny);
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

    // Initialize MeteoLAB components (box in metres; light volume shaders use the same).
    this.sharedUniforms = {
      uBoxMin: { value: boxMin },
      uBoxMax: { value: boxMax },
      uGrid: { value: new THREE.Vector3(disp.nx, disp.ny, disp.nz) },
      uHeight: { value: height },
      uExtinction: { value: 0.0022 },
      uSunDir: { value: this.sunDir.clone() },
    };

    // Initialize LightVolume for GPU-based cloud lighting (volumetric / flash path).
    this.lightVolume = new LightVolume(disp.nx, disp.ny, disp.nz, this.sharedUniforms, this.volumeTex);
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
    this.lastVolumeMs = now;
    if (empty) {
      this.volumeData.fill(0);
      this.volumeClear = true;
    } else {
      pack(this.volumeData);
      this.volumeClear = false;
    }
    this.volumeTex.needsUpdate = true;
    this.volumeRevision++;
    // Wet ground via MeteoLAB ground-state texture (water mm in R, hail cover in G).
    if (this.water && this.groundState && this.groundState.image) {
      const wetMm = Math.min(GROUND_WATER_MM, (rainMax / 0.002) * GROUND_WATER_MM);
      const data = this.groundState.image.data as Uint8Array;
      const n = this.water.length;
      for (let i = 0; i < n; i++) {
        // Soft temporal blend toward current rain so wetness persists briefly.
        this.water[i] = this.water[i] * 0.92 + wetMm * 0.08;
        data[i * 4] = Math.min(255, (this.water[i] / GROUND_WATER_MM) * 255) | 0;
        data[i * 4 + 1] = Math.min(255, this.hailCover![i] * 255) | 0;
        data[i * 4 + 2] = 0;
        data[i * 4 + 3] = 255;
      }
      this.groundState.needsUpdate = true;
    }
    const groundMat = this.ground.material as THREE.MeshStandardMaterial;
    groundMat.color.copy(this.groundColor);
    groundMat.roughness = 0.96;

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
    this.rebuildCloudShadowMap(false);
    if (this.lightVolume) {
      if (this.sharedUniforms.uSunDir) {
        (this.sharedUniforms.uSunDir.value as THREE.Vector3).copy(this.sunDir);
      }
      this.lightVolume.update(this.renderer, this.volumeRevision, this.sunDir);
    }

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

    // Render MeteoLAB components
    if (this.lightningView) {
      this.renderer.autoClear = false;
      this.renderer.render(this.lightningView.mesh, this.camera);
    }
    if (this.spriteView) {
      const dark = Math.max(0, 1 - this.sunFrac);
      this.spriteView.update(this.timeSeconds, dark, this.cloudsOn);
      if (this.spriteView.mesh.visible) {
        this.renderer.autoClear = false;
        this.renderer.render(this.spriteView.mesh, this.camera);
      }
    }

    this.renderer.autoClear = true;
    this.prevViewProj.copy(this.currViewProj);
  }

  /** Reduce TAA blend while a bolt is bright so the flash isn't smeared, but never drop to 0. */
  private lightningMix(): number {
    for (const bolt of this.liveBolts) {
      if (bolt.kind === "sprite") continue;
      const b = brightness(bolt.course, bolt.isCg, bolt.age * 1000);
      if (b.main * bolt.brightness > 0.25) return 0.12;
    }
    return 0.88;
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
    // Create a Flash object for the new course function
    const flash: Flash = {
      kind: kind === 'cg' ? 'CG' : 'IC',
      charge,
      time: this.timeSeconds * 1000,
      start: Math.floor(this.timeSeconds * 10),
      nodes: [0, 1, 2, 3, 4], // Simplified node structure for compatibility
      parent: [-1, 0, 1, 2, 3],
      ground: 4,
    };
    const c = course(flash, rng, extentKm);
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
        0.9, // brightness
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
      const pulse = b.main * bolt.brightness;
      const sprite = bolt.kind === "sprite";
      if (sprite) {
        light.intensity = 0;
        ribbon.visible = false; // sprites are volumetric-only, never draw through clouds
        continue;
      } else {
        this.boltTint(bolt.x, bolt.y, bolt.z);
        light.color.copy(this.flashTint);
        const litY = bolt.kind === "cg" ? bolt.y * 0.4 + this.groundY * 0.6 : bolt.y;
        light.position.set(bolt.x, litY, bolt.z);
        const dayScale = Math.max(0.35, 1 - 0.55 * this.sunFrac);
        light.intensity = (bolt.isCg ? 5.5e7 : 3.0e7) * pulse * dayScale;
      }
      const packed = this.fillBoltPoints(bolt, this.boltScratch);
      const pos = ribbon.geometry.getAttribute("position") as THREE.BufferAttribute;
      const idx = ribbon.geometry.getIndex() as THREE.BufferAttribute;
      const half = 85;
      const eye = this.camera.position;
      for (let s = 0; s < packed.count; s++) {
        const p = this.boltScratch[s];
        const prev = this.boltScratch[Math.max(0, s - 1)];
        const next = this.boltScratch[Math.min(packed.count - 1, s + 1)];
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
      ribbon.geometry.setDrawRange(0, q);
      const mat = ribbon.material as THREE.MeshBasicMaterial;
      mat.color.copy(this.flashTint);
      mat.opacity = Math.min(1, 0.45 + 0.7 * pulse);
      ribbon.visible = pulse > 0.03 && packed.count >= 2;
    }
    let groundPulse = 0;
    let groundX = 0;
    let groundZ = 0;
    for (const bolt of this.liveBolts) {
      if (bolt.kind !== "cg") continue;
      const b = brightness(bolt.course, bolt.isCg, bolt.age * 1000);
      const pulse = b.main * bolt.brightness;
      if (pulse >= groundPulse) {
        groundPulse = pulse;
        groundX = bolt.x;
        groundZ = bolt.z;
      }
    }
    const night = Math.max(0.35, 1 - 0.55 * this.sunFrac);
    if (this.groundFlashMesh) {
      const mat = this.groundFlashMesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.min(0.22, groundPulse * 0.14 * night);
      this.groundFlashMesh.position.x = groundX;
      this.groundFlashMesh.position.z = groundZ;
      this.groundFlashMesh.visible = groundPulse > 0.02;
    }
    // Soft global tint only — local brightness comes from the PointLight + flash patch.
    const groundMat = this.ground.material as THREE.MeshStandardMaterial;
    groundMat.emissive.copy(this.flashTint).multiplyScalar(groundPulse * 0.06 * night);
  }

  /** Jagged channel plus side branches. Writes packed world points and span list. */
  private fillBoltPoints(
    bolt: {
      kind: LightningKind;
      x: number;
      y: number;
      z: number;
      seed: number;
    },
    out: THREE.Vector3[],
  ): { count: number; spans: { start: number; count: number }[] } {
    const seed = bolt.seed;
    const cap = Math.min(out.length, this.boltPointCount);
    const spans: { start: number; count: number }[] = [];
    if (bolt.kind === "sprite") return { count: 0, spans };
    const isCg = bolt.kind === "cg";
    const steps = Math.min(isCg ? 22 : 18, cap - 1);
    const drop = isCg ? Math.max(100, bolt.y - this.groundY) : 0;
    let px = bolt.x;
    let py = bolt.y;
    let pz = bolt.z;
    for (let s = 0; s <= steps; s++) {
      out[s].set(px, isCg && s === steps ? this.groundY + 2 : py, pz);
      if (isCg) {
        const jag = (s % 3 === 1 ? 300 : 150) * (0.8 + 0.4 * Math.sin(seed + s * 1.3));
        px += Math.sin(seed + s * 2.17) * jag;
        pz += Math.cos(seed * 1.3 + s) * jag;
        py -= drop / steps;
      } else {
        const jag = (s % 3 === 1 ? 340 : 180) * (0.7 + 0.5 * Math.sin(seed + s * 1.9));
        px += Math.sin(seed + s * 2.17) * jag;
        pz += Math.cos(seed * 1.3 + s) * jag;
        py += Math.sin(seed * 0.7 + s * 0.9) * 26;
      }
    }
    let used = steps + 1;
    spans.push({ start: 0, count: used });

    const forks = isCg
      ? [
          { along: 0.28, len: 8, side: 1, drop: 0.9 },
          { along: 0.46, len: 7, side: -1, drop: 0.75 },
          { along: 0.64, len: 6, side: 1, drop: 0.55 },
        ]
      : [{ along: 0.4, len: 5, side: 1, drop: 0 }];
    for (let f = 0; f < forks.length; f++) {
      const fork = forks[f];
      const from = Math.max(1, Math.min(steps - 2, Math.floor(steps * fork.along)));
      const n = Math.min(fork.len, cap - used - 1);
      if (n < 3) break;
      const origin = out[from];
      let bx = origin.x;
      let by = origin.y;
      let bz = origin.z;
      const bSeed = seed + 4.1 * (f + 1);
      const heading = seed * 1.7 + f * 2.2 + fork.side * 0.9;
      const stepH = isCg ? 210 + f * 40 : 300;
      const stepV = isCg ? (drop / steps) * fork.drop : 0;
      const start = used;
      for (let s = 0; s <= n; s++) {
        out[used++].set(bx, Math.max(this.groundY + 4, by), bz);
        const jag = 0.65 + 0.35 * Math.sin(bSeed + s * 1.8);
        bx += Math.cos(heading + s * 0.18) * stepH * jag * fork.side;
        bz += Math.sin(heading + s * 0.21) * stepH * jag;
        by += isCg ? -stepV : Math.sin(bSeed + s * 1.5) * 90;
      }
      spans.push({ start, count: n + 1 });
    }
    return { count: used, spans };
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
