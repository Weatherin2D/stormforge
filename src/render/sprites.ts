import * as THREE from "three";
import type { LightningKind } from "../sim/FluidSolver";

interface TleEvent {
  kind: "sprite" | "halo";
  at: number;      // seconds when first stroke happened
  life: number;    // seconds
  x: number; y: number; z: number;
  brightness: number;
  startHeightKm?: number;
}

export class SpriteView {
  private events: TleEvent[] = [];
  private spriteMeshes: THREE.Mesh[] = [];
  private haloMesh: THREE.Mesh | null = null;

  constructor(private scene: THREE.Scene) {
    // Create sprite billboards
    for (let i = 0; i < 4; i++) {
      const geo = new THREE.PlaneGeometry(2000, 4000);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff4a7a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.spriteMeshes.push(mesh);
      this.scene.add(mesh);
    }
    // Halo disc
    const haloGeo = new THREE.RingGeometry(8000, 12000, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x88aaff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.haloMesh = new THREE.Mesh(haloGeo, haloMat);
    this.haloMesh.rotation.x = -Math.PI / 2;
    this.haloMesh.visible = false;
    this.scene.add(this.haloMesh);
  }

  add(kind: "sprite" | "halo", x: number, y: number, z: number, atSeconds: number) {
    const life = kind === "halo" ? 0.08 : 0.15;
    this.events.unshift({ kind, at: atSeconds, life, x, y, z, brightness: kind === "halo" ? 0.5 : 0.9 });
    if (this.events.length > 4) this.events.length = 4;
  }

  update(time: number, dark: number, enabled: boolean) {
    // Fade old events
    this.events = this.events.filter(e => time - e.at < e.life);
    
    // Hide all
    for (const m of this.spriteMeshes) { m.visible = false; (m.material as THREE.MeshBasicMaterial).opacity = 0; }
    if (this.haloMesh) { this.haloMesh.visible = false; (this.haloMesh.material as THREE.MeshBasicMaterial).opacity = 0; }
    
    if (!enabled || dark < 0.3) return;
    
    let si = 0;
    for (const e of this.events) {
      const t = time - e.at;
      const lit = e.kind === "halo" ? 0.003 : 0.03;
      const fade = e.kind === "halo" ? 0.06 : 0.12;
      if (t < 0 || t > lit + fade) continue;
      let b = t < lit ? 1 : Math.exp(-3 * (t - lit) / fade);
      b *= e.brightness * dark;
      
      if (e.kind === "halo" && this.haloMesh) {
        this.haloMesh.position.set(e.x, 83000, e.z); // ~83 km
        (this.haloMesh.material as THREE.MeshBasicMaterial).opacity = b * 0.6;
        this.haloMesh.visible = b > 0.01;
      } else if (e.kind === "sprite" && si < this.spriteMeshes.length) {
        const m = this.spriteMeshes[si++];
        m.position.set(e.x + (Math.random() - 0.5) * 4000, 75000 + Math.random() * 10000, e.z + (Math.random() - 0.5) * 4000);
        m.lookAt(m.position.x, m.position.y, m.position.z + 1000);
        (m.material as THREE.MeshBasicMaterial).opacity = b;
        m.visible = b > 0.01;
      }
    }
  }

  dispose() {
    for (const m of this.spriteMeshes) { this.scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    if (this.haloMesh) { this.scene.remove(this.haloMesh); this.haloMesh.geometry.dispose(); (this.haloMesh.material as THREE.Material).dispose(); }
  }
}
