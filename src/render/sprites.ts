import * as THREE from 'three'
import { spriteVertex, spriteFragment } from './shaders_meteolab'

const COLUMNS = 4

export class SpriteView {
  readonly mesh: THREE.Mesh
  private readonly geometry = new THREE.BufferGeometry(); private readonly material: THREE.ShaderMaterial
  private events: { kind: 'sprite' | 'halo'; at: number; life: number; x: number; y: number; z: number; brightness: number }[] = []
  private readonly bright: number[] = Array(COLUMNS).fill(0)

  constructor(shared: Record<string, THREE.IUniform>, density: THREE.Texture) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: spriteVertex, fragmentShader: spriteFragment, side: THREE.DoubleSide, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { ...shared, uDensity: { value: density }, uSprite: { value: new Array(COLUMNS).fill(0) } },
    })
    this.mesh = new THREE.Mesh(this.geometry, this.material); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.visible = false
  }

  add(kind: 'sprite' | 'halo', x: number, y: number, z: number, at: number, brightness: number) {
    this.events.unshift({ kind, at, life: kind === 'halo' ? .08 : .15, x, y, z, brightness })
    if (this.events.length > COLUMNS) this.events.length = COLUMNS
  }

  update(now: number, dark: number, enabled: boolean) {
    this.events = this.events.filter(e => now - e.at < e.life)
    const a: number[] = [], base: number[] = [], shape: number[] = [], corner: number[] = [], head: number[] = []
    let si = 0
    for (const e of this.events) {
      const t = now - e.at, lit = e.kind === 'halo' ? .003 : .03, fade = e.kind === 'halo' ? .06 : .12
      if (t < 0 || t > lit + fade) continue
      const b = (t < lit ? 1 : Math.exp(-3 * (t - lit) / fade)) * e.brightness * dark
      if (b < .01) continue
      this.bright[si] = b
      const slot = si++
      const w = e.kind === 'halo' ? 4000 : 2000, h = e.kind === 'halo' ? 4000 : 8000
      for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        base.push(e.x, e.y, e.z); shape.push(slot, w, h, e.kind === 'halo' ? 1 : 0); corner.push(cx, cy); head.push(e.kind === 'halo' ? 0 : e.y - h / 2)
        a.push(...base.slice(base.length - 3))
      }
    }
    const g = this.geometry
    g.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 3)); g.setAttribute('aShape', new THREE.Float32BufferAttribute(shape, 4))
    g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2)); g.setAttribute('aHead', new THREE.Float32BufferAttribute(head, 1)); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3))
    g.setIndex(Array.from({ length: a.length / 3 }, (_, i) => i))
    this.mesh.visible = enabled && si > 0
    const u = this.material.uniforms.uSprite.value as number[]
    for (let i = 0; i < COLUMNS; i++) u[i] = this.bright[i]
    return enabled ? Math.max(...this.bright.slice(0, si)) : 0
  }

  dispose() { this.geometry.dispose(); this.material.dispose() }
}
