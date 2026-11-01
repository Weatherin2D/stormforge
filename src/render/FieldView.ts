import * as THREE from "three";
import {
  type OverlayField,
  FIELD_INFO,
  colormapTexture,
} from "./fields";
import {
  fieldVolumeVertex,
  fieldVolumeFragment,
  sliceFragment,
} from "./fieldShaders";
import { volumeDisplaySize } from "../sim/Grid3D";

/**
 * 3D scalar field overlay: translucent volume plus optional horizontal /
 * vertical slices (MeteoLAB fields.ts + shaders).
 */
export class FieldView {
  readonly group = new THREE.Group();
  private volumeMesh: THREE.Mesh | null = null;
  private sliceH: THREE.Mesh | null = null;
  private sliceV: THREE.Mesh | null = null;
  private fieldTex: THREE.Data3DTexture | null = null;
  private fieldData: Uint8Array | null = null;
  private colormap: THREE.DataTexture | null = null;
  private volumeMat: THREE.ShaderMaterial | null = null;
  private sliceMat: THREE.ShaderMaterial | null = null;
  private mode: OverlayField = "off";
  private boxMin = new THREE.Vector3();
  private boxMax = new THREE.Vector3();
  private nx = 0;
  private ny = 0;
  private nz = 0;
  private spanX = 1;
  private spanZ = 1;
  private groundY = 0;
  private height = 1;
  /** Horizontal slice height above ground, m. */
  sliceHeight = 2000;
  /** Vertical slice north position as normalised −0.5..0.5 (0 = centre). */
  sliceNorth = 0;
  volumeThreshold = 0.25;
  volumeDensity = 1;
  layerMode: "both" | "slices" | "volume" = "both";

  setGrid(
    nx: number,
    ny: number,
    nz: number,
    spanX: number,
    spanZ: number,
    groundY: number,
    height: number,
  ): void {
    this.disposeMeshes();
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.spanX = spanX;
    this.spanZ = spanZ;
    this.groundY = groundY;
    this.height = height;
    this.boxMin.set(-spanX / 2, groundY, -spanZ / 2);
    this.boxMax.set(spanX / 2, groundY + height, spanZ / 2);

    const d = volumeDisplaySize(nx, ny, nz);
    this.fieldData = new Uint8Array(d.nx * d.ny * d.nz * 4);
    // Same layout as cloud volume: width=nx (east), height=nz (up), depth=ny (N→S).
    this.fieldTex = new THREE.Data3DTexture(
      this.fieldData as unknown as BufferSource,
      d.nx,
      d.nz,
      d.ny,
    );
    this.fieldTex.format = THREE.RGBAFormat;
    this.fieldTex.type = THREE.UnsignedByteType;
    this.fieldTex.minFilter = this.fieldTex.magFilter = THREE.LinearFilter;
    this.fieldTex.unpackAlignment = 1;
    this.fieldTex.generateMipmaps = false;
    this.fieldTex.needsUpdate = true;

    const info = FIELD_INFO.updraft;
    this.colormap = colormapTexture(info.stops);

    const shared = {
      uBoxMin: { value: this.boxMin },
      uBoxMax: { value: this.boxMax },
      uField: { value: this.fieldTex },
      uColormap: { value: this.colormap },
      uDiverging: { value: 1 },
      uThreshold: { value: this.volumeThreshold },
      uDensity: { value: this.volumeDensity },
    };

    this.volumeMat = new THREE.ShaderMaterial({
      vertexShader: fieldVolumeVertex,
      fragmentShader: fieldVolumeFragment,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      premultipliedAlpha: true,
      toneMapped: false,
      uniforms: { ...shared },
    });
    const box = new THREE.BoxGeometry(spanX, height, spanZ);
    box.translate(0, groundY + height / 2, 0);
    this.volumeMesh = new THREE.Mesh(box, this.volumeMat);
    this.volumeMesh.renderOrder = 2;
    this.group.add(this.volumeMesh);

    this.sliceMat = new THREE.ShaderMaterial({
      vertexShader: fieldVolumeVertex,
      fragmentShader: sliceFragment,
      side: THREE.DoubleSide,
      toneMapped: false,
      uniforms: { ...shared },
    });
    const hGeo = new THREE.PlaneGeometry(spanX, spanZ);
    hGeo.rotateX(-Math.PI / 2);
    this.sliceH = new THREE.Mesh(hGeo, this.sliceMat);
    this.sliceH.renderOrder = 2.1;
    this.group.add(this.sliceH);

    const vGeo = new THREE.PlaneGeometry(spanX, height);
    vGeo.translate(0, height / 2, 0);
    this.sliceV = new THREE.Mesh(vGeo, this.sliceMat);
    this.sliceV.renderOrder = 2.1;
    this.group.add(this.sliceV);

    this.applyVisibility();
    this.placeSlices();
  }

  setMode(mode: OverlayField): void {
    this.mode = mode;
    if (mode !== "off" && this.colormap && this.volumeMat && this.sliceMat) {
      const info = FIELD_INFO[mode];
      this.colormap.dispose();
      this.colormap = colormapTexture(info.stops);
      this.volumeMat.uniforms.uColormap.value = this.colormap;
      this.sliceMat.uniforms.uColormap.value = this.colormap;
      this.volumeMat.uniforms.uDiverging.value = info.diverging ? 1 : 0;
      this.sliceMat.uniforms.uDiverging.value = info.diverging ? 1 : 0;
      this.volumeThreshold = info.threshold;
      this.volumeMat.uniforms.uThreshold.value = info.threshold;
    }
    this.applyVisibility();
  }

  getMode(): OverlayField {
    return this.mode;
  }

  /** Upload a packed RGBA field volume (display size). */
  update(pack: (out: Uint8Array) => void): void {
    if (!this.fieldData || !this.fieldTex || this.mode === "off") return;
    pack(this.fieldData);
    this.fieldTex.needsUpdate = true;
    this.placeSlices();
  }

  setSliceHeight(m: number): void {
    this.sliceHeight = m;
    this.placeSlices();
  }

  setSliceNorth(frac: number): void {
    this.sliceNorth = Math.max(-0.5, Math.min(0.5, frac));
    this.placeSlices();
  }

  setLayerMode(mode: "both" | "slices" | "volume"): void {
    this.layerMode = mode;
    this.applyVisibility();
  }

  private placeSlices(): void {
    if (this.sliceH) {
      this.sliceH.position.set(
        0,
        this.groundY + Math.min(this.height - 10, Math.max(10, this.sliceHeight)),
        0,
      );
    }
    if (this.sliceV) {
      this.sliceV.position.set(0, this.groundY, -this.sliceNorth * this.spanZ);
    }
  }

  private applyVisibility(): void {
    const on = this.mode !== "off";
    this.group.visible = on;
    if (!on) return;
    const vol = this.layerMode === "both" || this.layerMode === "volume";
    const slices = this.layerMode === "both" || this.layerMode === "slices";
    if (this.volumeMesh) this.volumeMesh.visible = vol;
    if (this.sliceH) this.sliceH.visible = slices;
    if (this.sliceV) this.sliceV.visible = slices;
  }

  private disposeMeshes(): void {
    if (this.volumeMesh) {
      this.group.remove(this.volumeMesh);
      this.volumeMesh.geometry.dispose();
      this.volumeMesh = null;
    }
    if (this.sliceH) {
      this.group.remove(this.sliceH);
      this.sliceH.geometry.dispose();
      this.sliceH = null;
    }
    if (this.sliceV) {
      this.group.remove(this.sliceV);
      this.sliceV.geometry.dispose();
      this.sliceV = null;
    }
    this.volumeMat?.dispose();
    this.sliceMat?.dispose();
    this.fieldTex?.dispose();
    this.colormap?.dispose();
    this.volumeMat = null;
    this.sliceMat = null;
    this.fieldTex = null;
    this.colormap = null;
    this.fieldData = null;
  }

  dispose(): void {
    this.disposeMeshes();
  }
}
