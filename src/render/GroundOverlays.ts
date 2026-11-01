import * as THREE from "three";
import type { DrawnFront } from "../sim/synoptic";
import type { VortexLevel } from "../sim/fieldPack";

/**
 * Ground-plane overlays from MeteoLAB: rain swath, cold-pool shade, synoptic
 * front lines, and a simplified mesocyclone vortex column.
 */
export class GroundOverlays {
  readonly group = new THREE.Group();
  private swath: THREE.Mesh | null = null;
  private swathData: Uint8Array | null = null;
  private swathTex: THREE.DataTexture | null = null;
  private cold: THREE.Mesh | null = null;
  private coldData: Uint8Array | null = null;
  private coldTex: THREE.DataTexture | null = null;
  private fronts: THREE.LineSegments | null = null;
  private vortex: THREE.LineSegments | null = null;
  private nx = 0;
  private ny = 0;
  private spanX = 1;
  private spanZ = 1;
  private groundY = 0;
  private height = 1;
  showSwath = false;
  showColdPool = false;
  showFronts = true;
  showVortex = false;

  setGrid(nx: number, ny: number, spanX: number, spanZ: number, groundY: number, height: number): void {
    this.disposeMeshes();
    this.nx = nx;
    this.ny = ny;
    this.spanX = spanX;
    this.spanZ = spanZ;
    this.groundY = groundY;
    this.height = height;

    this.swathData = new Uint8Array(nx * ny * 4);
    this.swathTex = new THREE.DataTexture(
      this.swathData as unknown as BufferSource,
      nx,
      ny,
      THREE.RGBAFormat,
    );
    this.swathTex.magFilter = this.swathTex.minFilter = THREE.LinearFilter;
    this.swathTex.needsUpdate = true;
    this.swath = new THREE.Mesh(
      new THREE.PlaneGeometry(spanX, spanZ),
      new THREE.MeshBasicMaterial({
        map: this.swathTex,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.swath.rotation.x = -Math.PI / 2;
    this.swath.position.y = groundY + 2;
    this.swath.visible = false;
    this.swath.renderOrder = 1;
    this.group.add(this.swath);

    this.coldData = new Uint8Array(nx * ny * 4);
    this.coldTex = new THREE.DataTexture(
      this.coldData as unknown as BufferSource,
      nx,
      ny,
      THREE.RGBAFormat,
    );
    this.coldTex.magFilter = this.coldTex.minFilter = THREE.LinearFilter;
    this.coldTex.needsUpdate = true;
    this.cold = new THREE.Mesh(
      new THREE.PlaneGeometry(spanX, spanZ),
      new THREE.MeshBasicMaterial({
        map: this.coldTex,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.cold.rotation.x = -Math.PI / 2;
    this.cold.position.y = groundY + 1.5;
    this.cold.visible = false;
    this.cold.renderOrder = 1;
    this.group.add(this.cold);

    this.fronts = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      }),
    );
    this.fronts.renderOrder = 3;
    this.fronts.frustumCulled = false;
    this.group.add(this.fronts);

    this.vortex = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    this.vortex.renderOrder = 3;
    this.vortex.frustumCulled = false;
    this.vortex.visible = false;
    this.group.add(this.vortex);

    this.applyVisibility();
  }

  updateSwath(pack: (out: Uint8Array) => void): void {
    if (!this.swathData || !this.swathTex || !this.showSwath) return;
    pack(this.swathData);
    this.swathTex.needsUpdate = true;
  }

  updateColdPool(pack: (out: Uint8Array) => void): void {
    if (!this.coldData || !this.coldTex || !this.showColdPool) return;
    pack(this.coldData);
    this.coldTex.needsUpdate = true;
  }

  /**
   * Draw synoptic fronts. Points are normalised 0..1 domain coords
   * (x east, y north) as in DrawnFront.
   */
  updateFronts(fronts: DrawnFront[]): void {
    if (!this.fronts) return;
    const positions: number[] = [];
    const colors: number[] = [];
    const toWorld = (xn: number, yn: number) => {
      const x = (xn - 0.5) * this.spanX;
      const z = -(yn - 0.5) * this.spanZ;
      return [x, this.groundY + 4, z] as const;
    };
    for (const f of fronts) {
      if (!f.enabled || f.points.length < 2) continue;
      const col =
        f.kind === "warm"
          ? [0.88, 0.34, 0.31]
          : f.kind === "cold"
            ? [0.31, 0.56, 0.88]
            : [0.55, 0.45, 0.75];
      for (let i = 0; i < f.points.length - 1; i++) {
        const a = toWorld(f.points[i].x, f.points[i].y);
        const b = toWorld(f.points[i + 1].x, f.points[i + 1].y);
        positions.push(...a, ...b);
        colors.push(...col, ...col);
      }
    }
    const geo = this.fronts.geometry as THREE.BufferGeometry;
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeBoundingSphere();
    this.fronts.visible = this.showFronts && positions.length > 0;
  }

  updateVortex(levels: VortexLevel[]): void {
    if (!this.vortex) return;
    this.vortex.visible = this.showVortex && levels.length > 1;
    if (!this.vortex.visible) return;

    const SEGMENTS = 28;
    const positions: number[] = [];
    const colors: number[] = [];
    const weak = new THREE.Color(0xf3e3a2);
    const strong = new THREE.Color(0xe2493f);
    const c = new THREE.Color();
    const ZETA_STRONG = 0.025;
    const ZETA_MIN = 0.008;
    const toWorld = (x: number, y: number, z: number) =>
      [
        x - this.spanX / 2,
        this.groundY + z,
        -(y - this.spanZ / 2),
      ] as const;

    let ringAt = -Infinity;
    const RING_EVERY = 450;
    levels.forEach((l, k) => {
      const t = Math.min(1, (l.zeta - ZETA_MIN) / (ZETA_STRONG - ZETA_MIN));
      c.lerpColors(weak, strong, t);
      const ring = l.z - ringAt >= RING_EVERY || k === levels.length - 1;
      if (ring) {
        ringAt = l.z;
        for (let s = 0; s < SEGMENTS; s++) {
          const a = (s / SEGMENTS) * Math.PI * 2;
          const b = ((s + 1) / SEGMENTS) * Math.PI * 2;
          positions.push(
            ...toWorld(l.x + l.radius * Math.cos(a), l.y + l.radius * Math.sin(a), l.z),
            ...toWorld(l.x + l.radius * Math.cos(b), l.y + l.radius * Math.sin(b), l.z),
          );
          colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
        }
      }
      if (k) {
        const p = levels[k - 1];
        positions.push(...toWorld(p.x, p.y, p.z), ...toWorld(l.x, l.y, l.z));
        colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    });

    const geo = this.vortex.geometry as THREE.BufferGeometry;
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeBoundingSphere();
  }

  applyVisibility(): void {
    if (this.swath) this.swath.visible = this.showSwath;
    if (this.cold) this.cold.visible = this.showColdPool;
    if (this.fronts) this.fronts.visible = this.showFronts && this.fronts.visible;
    if (this.vortex) this.vortex.visible = this.showVortex && this.vortex.visible;
  }

  private disposeMeshes(): void {
    for (const m of [this.swath, this.cold, this.fronts, this.vortex]) {
      if (!m) continue;
      this.group.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.swathTex?.dispose();
    this.coldTex?.dispose();
    this.swath = this.cold = this.fronts = this.vortex = null;
    this.swathTex = this.coldTex = null;
    this.swathData = this.coldData = null;
  }

  dispose(): void {
    this.disposeMeshes();
  }
}
