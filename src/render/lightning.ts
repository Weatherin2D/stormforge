import * as THREE from 'three'
import { lightningVertex, lightningFragment } from './shaders_meteolab'
import { FLASH_POINTS } from './light'

export interface Flash {
  kind: 'CG' | 'IC' | 'SPIDER'
  charge: number
  time: number
  start: number
  nodes: number[]
  parent: number[]
  ground: number
  tle?: { kind: 'sprite' | 'halo'; ratio: number; height: number }
}

export interface Course { leader: number; strokes: { at: number; peak: number; cc: number; ccLength: number; path: 0 | 1 }[]; end: number }

// Export LightningCourse for compatibility with existing code
export type LightningCourse = Course

const SLOTS = 8, QUEUE_WAIT = 2000
const ROUGHNESS = .12, KINK_STEP = .05
const KINK_SPREAD = .22
const NEW_CONTACT = .2
const CRAWL_MS_PER_KM = 10, CRAWL_MAX = 600

export function course(flash: Flash, rng: () => number, extent = 0): Course {
  const crawl = Math.min(CRAWL_MAX, extent * CRAWL_MS_PER_KM)
  if (flash.kind === 'SPIDER') {
    const leader = Math.max(220 + rng() * 380, Math.min(CRAWL_MAX, Math.max(180, extent * 22)))
    const end = leader + 80 + rng() * 220
    const n = 1 + Math.floor(rng() * 3)
    const strokes = Array.from({ length: n }, (_, k) => ({
      at: k ? leader + rng() * (end - leader) : leader,
      peak: .45 + rng() * .35,
      cc: 0,
      ccLength: 0,
      path: 0 as const,
    })).sort((a, b) => a.at - b.at)
    return { leader, strokes, end: end + 80 }
  }
  if (flash.kind === 'IC') {
    const leader = Math.max(60 + rng() * 90, crawl)
    const end = Math.max(200 + rng() * 300, leader + 150 + rng() * 300)
    const n = 3 + Math.floor(rng() * 8)
    const strokes = Array.from({ length: n }, (_, k) => ({ at: k ? leader + rng() * (end - leader) : leader, peak: .4 + rng() * .35, cc: 0, ccLength: 0, path: 0 as const })).sort((a, b) => a.at - b.at)
    return { leader, strokes, end: end + 120 }
  }
  const positive = flash.charge > 0
  const leader = positive ? Math.max(100 + rng() * 100, crawl) : 20 + rng() * 15
  const counts = [.18, .15, .17, .16, .12, .09, .07, .06]
  let n = 1
  if (!positive) { let r = rng(); for (n = 1; n < counts.length && r > counts[n - 1]; n++) r -= counts[n - 1] }
  const strokes: Course['strokes'] = []
  let at = leader, forked = false
  for (let k = 0; k < n; k++) {
    if (k) at += Math.min(300, Math.max(5, 60 * Math.exp(.8 * normal(rng))))
    const cc = positive ? .35 : k && rng() < .11 ? .25 : 0, ccLength = positive ? 100 + rng() * 150 : cc ? 40 + rng() * 110 : 0
    let path: 0 | 1 = 0
    if (k && !forked && rng() < NEW_CONTACT) { path = 1; forked = true } else if (k && forked && rng() < .6) path = 1
    strokes.push({ at, peak: k ? .6 + rng() * .3 : 1, cc, ccLength, path })
    at += ccLength
  }
  return { leader, strokes, end: at + 220 }
}

const normal = (rng: () => number) => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng())

export function brightness(c: Course, cg: boolean, t: number, slow = false) {
  const reveal = Math.min(1, t / c.leader), fade = slow ? 3 : 25
  let main = t < c.leader ? slow ? .35 : c.leader > 60 ? .22 : .12 : 0, branch = main, old = main, fork = 0
  for (const [k, s] of c.strokes.entries()) {
    if (t < s.at) continue
    const after = t - s.at, now = Math.max(s.peak * Math.exp(-after / fade), after < s.ccLength ? s.cc : s.cc * Math.exp(-(after - s.ccLength) / 30))
    main = Math.max(main, now)
    if (s.path) fork = Math.max(fork, now); else old = Math.max(old, now)
    if (!cg) branch = main
    else if (k === 0) branch = Math.max(branch, .5 * Math.exp(-after / (slow ? 2 : 15)))
  }
  if (!cg && t >= c.leader) main = branch = old = Math.max(main, .18)
  return { main, branch, reveal, old, fork }
}

interface Shown { flash: Flash; course: Course; start: number; rate: number; slot: number }

export class LightningView {
  readonly mesh: THREE.Mesh
  private readonly geometry = new THREE.BufferGeometry(); private readonly material: THREE.ShaderMaterial
  private readonly shown: (Shown | null)[] = Array(SLOTS).fill(null)
  private readonly queue: { flash: Flash; at: number; rate?: number }[] = []
  private seen = 0; private drawn = 0; private lastArrival = 0
  freeze: number | null = null
  onEvent?: (flash: Flash, at: number, rate: number) => void
  forceEvent?: { kind: 'sprite' | 'halo'; ratio: number; height: number }
  readonly points: (Float32Array | null)[] = Array(SLOTS).fill(null)
  readonly changed: boolean[] = Array(SLOTS).fill(true)
  readonly bright: number[] = Array(SLOTS).fill(0)
  private readonly pointsOf: (Shown | null)[] = Array(SLOTS).fill(null)
  private readonly forkGround: (number[] | null)[] = Array(SLOTS).fill(null)
  strike: { x: number; y: number; z: number; bright: number } | null = null
  private readonly rng = mulberry32(17)
  private readonly toWorld: (x: number, y: number, z: number) => readonly [number, number, number]
  private readonly channelShape: (flash: Flash) => Float64Array

  constructor(toWorld: (x: number, y: number, z: number) => readonly [number, number, number], channelShape: (flash: Flash) => Float64Array, shared: Record<string, THREE.IUniform>, density: THREE.Texture) {
    this.toWorld = toWorld
    this.channelShape = channelShape
    this.material = new THREE.ShaderMaterial({
      vertexShader: lightningVertex, fragmentShader: lightningFragment, side: THREE.DoubleSide, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { ...shared, uDensity: { value: density }, uFlash: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4()) }, uPaths: { value: Array.from({ length: SLOTS }, () => new THREE.Vector4()) }, uRes: { value: new THREE.Vector2(1, 1) }, uPx: { value: 1 } },
    })
    this.mesh = new THREE.Mesh(this.geometry, this.material); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.mesh.visible = false
  }

  update(now: number, enabled: boolean, flashes: Flash[], resolution: THREE.Vector2, px: number) {
    const total = flashes.length
    if (total < this.seen) { this.queue.length = 0; this.shown.fill(null); this.rebuild() }
    if (now - this.drawn > 500) this.seen = total
    this.drawn = now
    const fresh = Math.min(Math.max(0, total - this.seen), flashes.length, 12)
    if (fresh && !this.shown.some(s => s && s.rate < 1)) {
      const spread = Math.min(1500, now - this.lastArrival)
      for (const flash of flashes.slice(flashes.length - fresh)) this.queue.push({ flash, at: now + this.rng() * spread })
      this.queue.sort((a, b) => a.at - b.at); this.lastArrival = now
    }
    this.seen = total
    let changed = false
    const clock = (s: Shown) => this.freeze ?? (now - s.start) * s.rate
    for (const [i, s] of this.shown.entries()) if (s && this.freeze === null && clock(s) > s.course.end) { this.shown[i] = null; changed = true }
    while (this.queue.length && this.queue[0].at <= now) {
      const q = this.queue.shift()!, slot = this.shown.indexOf(null)
      if (now - q.at > QUEUE_WAIT) continue
      if (slot < 0) { this.queue.unshift(q); break }
      this.shown[slot] = { flash: q.flash, course: this.courseOf(q.flash), start: now, rate: q.rate ?? 1, slot }; changed = true
      const tle = q.flash.tle ?? (q.flash.kind === 'CG' ? this.forceEvent : undefined)
      if (tle) this.onEvent?.({ ...q.flash, tle }, now + this.shown[slot]!.course.strokes[0].at / (q.rate ?? 1), q.rate ?? 1)
    }
    if (changed) this.rebuild()
    let glow = 0
    const flashesU = this.material.uniforms.uFlash.value as THREE.Vector4[], paths = this.material.uniforms.uPaths.value as THREE.Vector4[]
    this.strike = null
    for (let i = 0; i < SLOTS; i++) {
      const s = this.shown[i]
      if (!s) { flashesU[i].set(0, 0, 0, 0); this.bright[i] = 0; continue }
      const cg = s.flash.kind === 'CG', b = brightness(s.course, cg, clock(s), s.rate < 1)
      const beads = cg && clock(s) > s.course.strokes[0].at ? Math.min(1, Math.max(0, (.35 - b.main) / .3)) : 0
      flashesU[i].set(b.main, b.branch, b.reveal, cg ? 1 : 0); paths[i].set(b.old, b.fork, beads, 0)
      this.bright[i] = enabled ? b.main * (b.reveal < 1 ? s.course.leader > 60 ? .6 : .3 : 1) : 0
      glow = Math.max(glow, this.bright[i])
      const p = this.points[i]
      const q = b.fork > b.old && this.forkGround[i] ? this.forkGround[i]! : p
      if (cg && q && enabled && b.reveal >= 1 && b.main > (this.strike?.bright ?? 0)) this.strike = { x: q[0], y: q[1], z: q[2], bright: b.main }
    }
    this.mesh.visible = enabled && this.shown.some(s => s)
    this.material.uniforms.uRes.value.copy(resolution); this.material.uniforms.uPx.value = px
    return enabled ? Math.min(1, glow) : 0
  }

  replay(rate = 1, which?: Flash) {
    if (!which) return false
    this.shown.fill(null); this.queue.length = 0; this.queue.push({ flash: which, at: performance.now(), rate })
    return true
  }

  courseOf(flash: Flash) { return course(flash, mulberry32(Math.round(flash.time * 10) + flash.start), this.extent(flash)) }

  private extent(flash: Flash) {
    const shape = this.channelShape(flash)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const i of flash.nodes) { const c = i % 48, x = (c % 48) * 1000, y = Math.floor(c / 48) * 1000; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
    return Math.hypot(x1 - x0, y1 - y0) / 1000
  }

  private lightPoints(f: Flash) {
    let path: number[] = []
    if (f.kind === 'CG') { let c = f.nodes.indexOf(f.ground); while (c >= 0) { path.push(c); c = f.parent[c] } }
    else path = Array.from(f.nodes, (_, c) => c)
    const shape = this.channelShape(f), n = Math.min(FLASH_POINTS, path.length), out = new Float32Array(n * 3)
    for (let k = 0; k < n; k++) { const c = path[Math.floor(k * (path.length - 1) / Math.max(1, n - 1))]; out.set(this.toWorld(shape[c * 3], shape[c * 3 + 1], shape[c * 3 + 2]), k * 3) }
    return out
  }

  taken() { this.changed.fill(false) }

  private rebuild() {
    for (let i = 0; i < SLOTS; i++) {
      const s = this.shown[i]
      if (!s) { if (this.points[i]) { this.points[i] = null; this.pointsOf[i] = null; this.changed[i] = true } continue }
      if (this.pointsOf[i] === s) continue
      this.points[i] = this.lightPoints(s.flash); this.pointsOf[i] = s; this.changed[i] = true
    }
    const a: number[] = [], b: number[] = [], side: number[] = [], end: number[] = [], info: number[] = [], arc: number[] = [], index: number[] = []
    let along = 0
    const run = (points: number[][], kind: number, order: number, w: number, slot: number) => {
      along += 7.3
      for (let j = 0; j + 1 < points.length; j++) {
        const base = side.length, len = Math.hypot(points[j + 1][0] - points[j][0], points[j + 1][1] - points[j][1], points[j + 1][2] - points[j][2])
        for (const [e, sd] of [[0, -1], [0, 1], [1, -1], [1, 1]]) { a.push(...points[j]); b.push(...points[j + 1]); side.push(sd); end.push(e); info.push(slot, kind, order, w); arc.push(along, along + len) }
        index.push(base, base + 1, base + 2, base, base + 2, base + 1)
        along += len
      }
    }
    for (const s of this.shown) {
      if (!s) continue
      const f = s.flash, shape = this.channelShape(f), rng = mulberry32(Math.round(f.time * 10) + f.start + 1)
      const main = new Uint8Array(f.nodes.length), path: number[] = []
      if (f.kind === 'CG') { let c = f.nodes.indexOf(f.ground); while (c > 0) { main[c] = 1; path.push(c); c = f.parent[c] } }
      else main.fill(1)
      this.forkGround[s.slot] = null
      if (f.kind === 'CG' && s.course.strokes.some(k => k.path)) {
        const at = (c: number) => this.toWorld(shape[c * 3], shape[c * 3 + 1], shape[c * 3 + 2]), height = 1 + 1.5 * rng()
        const k = path.findIndex(c => at(c)[1] >= height), forkNode = k < 0 ? path[path.length - 1] : path[k]
        for (let j = 0; j < (k < 0 ? path.length - 1 : k); j++) main[path[j]] = 3
        const from = at(forkNode), d = Math.min(5, Math.max(.5, 1.5 * Math.exp(.6 * normal(rng)))), turn = rng() * Math.PI * 2, ground = [from[0] + d * Math.cos(turn), 0, from[2] + d * Math.sin(turn)]
        this.forkGround[s.slot] = ground
        run(this.refine(from, ground, rng), 2, 0, 1, s.slot)
      }
      for (let c = 1; c < f.nodes.length; c++) {
        const p = f.parent[c], from = [shape[p * 3], shape[p * 3 + 1], shape[p * 3 + 2]], to = [shape[c * 3], shape[c * 3 + 1], shape[c * 3 + 2]]
        if (Math.abs(from[0] - to[0]) > 24000 || Math.abs(from[1] - to[1]) > 24000) continue
        const points = this.refine(this.toWorld(from[0], from[1], from[2]), this.toWorld(to[0], to[1], to[2]), rng)
        const order = c / f.nodes.length, w = f.kind === 'IC' ? .6 : main[c] ? 1 : .45
        run(points, main[c], order, w, s.slot)
      }
    }
    const g = this.geometry
    g.setAttribute('aA', new THREE.Float32BufferAttribute(a, 3)); g.setAttribute('aB', new THREE.Float32BufferAttribute(b, 3))
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1)); g.setAttribute('aEnd', new THREE.Float32BufferAttribute(end, 1))
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4)); g.setAttribute('aArc', new THREE.Float32BufferAttribute(arc, 2)); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3))
    g.setIndex(index)
  }

  dispose() { this.geometry.dispose(); this.material.dispose() }

  private refine(from: readonly number[], to: readonly number[], rng: () => number) {
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]], len = Math.hypot(d[0], d[1], d[2])
    const side = this.across(d, rng), amount = len * ROUGHNESS * (rng() * 2 - 1)
    const mid = [(from[0] + to[0]) / 2 + side[0] * amount, Math.max(0, (from[1] + to[1]) / 2 + side[1] * amount), (from[2] + to[2]) / 2 + side[2] * amount]
    return [...tortuous(from, mid, rng), ...tortuous(mid, to, rng).slice(1)]
  }

  private across(d: readonly number[], rng: () => number) {
    const len = Math.hypot(d[0], d[1], d[2]) || 1
    for (;;) {
      const r = [rng() - .5, rng() - .5, rng() - .5], along = (r[0] * d[0] + r[1] * d[1] + r[2] * d[2]) / (len * len)
      const c = [r[0] - along * d[0], r[1] - along * d[1], r[2] - along * d[2]], cl = Math.hypot(c[0], c[1], c[2])
      if (cl > 1e-3) return [c[0] / cl, c[1] / cl, c[2] / cl]
    }
  }
}

/** Simple seeded RNG (Mulberry32). */
function mulberry32(a: number): () => number {
  return () => {
    let t = a += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

/** A tortuous channel from `from` to `to` (world km). */
function tortuous(from: readonly number[], to: readonly number[], rng: () => number, step = KINK_STEP) {
  const out: number[][] = [[...from]], total = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]), n = Math.max(1, Math.round(total / step))
  let p = [...from], dir: number[] | null = null
  for (let k = 0; k < n - 1; k++) {
    const rem = [to[0] - p[0], to[1] - p[1], to[2] - p[2]], rl = Math.hypot(rem[0], rem[1], rem[2])
    if (rl < 1e-6) break
    const want = rem.map(v => v / rl), base: number[] = dir ?? want, axis = across(base, rng), a = normal(rng) * KINK_SPREAD
    let next: number[] = base.map((v, j) => v * Math.cos(a) + axis[j] * Math.sin(a))
    next = next.map((v, j) => v * .75 + want[j] * .25)
    const nl = Math.hypot(next[0], next[1], next[2])
    dir = next.map(v => v / nl)
    const s = rl / (n - k) * (.6 + .8 * rng())
    p = [p[0] + dir[0] * s, Math.max(0, p[1] + dir[1] * s), p[2] + dir[2] * s]
    out.push(p)
  }
  out.push([...to])
  return out
}

function across(d: readonly number[], rng: () => number) {
  const len = Math.hypot(d[0], d[1], d[2]) || 1
  for (;;) {
    const r = [rng() - .5, rng() - .5, rng() - .5], along = (r[0] * d[0] + r[1] * d[1] + r[2] * d[2]) / (len * len)
    const c = [r[0] - along * d[0], r[1] - along * d[1], r[2] - along * d[2]], cl = Math.hypot(c[0], c[1], c[2])
    if (cl > 1e-3) return [c[0] / cl, c[1] / cl, c[2] / cl]
  }
}

export type ChannelKind = 'negcg' | 'poscg' | 'spider' | 'ic'

export interface ChannelSpan {
  start: number
  count: number
  branch: boolean
}

export interface ChannelPoint {
  x: number
  y: number
  z: number
  order: number
  branch: boolean
}

export interface LightningChannel {
  points: ChannelPoint[]
  spans: ChannelSpan[]
  extentKm: number
}

const STEP_M = 100
const ROUGH_M = 0.14
const SPREAD_M = 0.28

function tortuousM(
  from: readonly number[],
  to: readonly number[],
  rng: () => number,
  groundY: number,
  step = STEP_M,
): number[][] {
  const out: number[][] = [[from[0], from[1], from[2]]]
  const total = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])
  const n = Math.max(1, Math.round(total / step))
  let p = [from[0], from[1], from[2]]
  let dirX = 0
  let dirY = 0
  let dirZ = 0
  let hasDir = false
  for (let k = 0; k < n - 1; k++) {
    const remX = to[0] - p[0]
    const remY = to[1] - p[1]
    const remZ = to[2] - p[2]
    const rl = Math.hypot(remX, remY, remZ)
    if (rl < 1e-6) break
    const wantX = remX / rl
    const wantY = remY / rl
    const wantZ = remZ / rl
    const base: number[] = hasDir ? [dirX, dirY, dirZ] : [wantX, wantY, wantZ]
    const axis = across(base, rng)
    const a = normal(rng) * SPREAD_M
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    let nextX = base[0] * ca + axis[0] * sa
    let nextY = base[1] * ca + axis[1] * sa
    let nextZ = base[2] * ca + axis[2] * sa
    nextX = nextX * 0.75 + wantX * 0.25
    nextY = nextY * 0.75 + wantY * 0.25
    nextZ = nextZ * 0.75 + wantZ * 0.25
    const nl = Math.hypot(nextX, nextY, nextZ) || 1
    dirX = nextX / nl
    dirY = nextY / nl
    dirZ = nextZ / nl
    hasDir = true
    const s = (rl / (n - k)) * (0.6 + 0.8 * rng())
    p = [
      p[0] + dirX * s,
      Math.max(groundY + 2, p[1] + dirY * s),
      p[2] + dirZ * s,
    ]
    out.push(p)
  }
  out.push([to[0], Math.max(groundY + 2, to[1]), to[2]])
  return out
}

function refineM(
  from: readonly number[],
  to: readonly number[],
  rng: () => number,
  groundY: number,
): number[][] {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
  const len = Math.hypot(d[0], d[1], d[2])
  const side = across(d, rng)
  const amount = len * ROUGH_M * (rng() * 2 - 1)
  const mid = [
    (from[0] + to[0]) / 2 + side[0] * amount,
    Math.max(groundY + 2, (from[1] + to[1]) / 2 + side[1] * amount),
    (from[2] + to[2]) / 2 + side[2] * amount,
  ]
  return [...tortuousM(from, mid, rng, groundY), ...tortuousM(mid, to, rng, groundY).slice(1)]
}

function decimate(pts: number[][], maxPts: number): number[][] {
  if (pts.length <= maxPts) return pts
  const out: number[][] = []
  const last = pts.length - 1
  for (let i = 0; i < maxPts; i++) {
    out.push(pts[Math.round((i * last) / (maxPts - 1))])
  }
  return out
}

function forkPlan(
  kind: ChannelKind,
  rng: () => number,
): { along: number; len: number; drop: number }[] {
  if (kind === 'negcg') {
    const extra = rng() < 0.5 ? [{ along: 0.72, len: 220 + rng() * 120, drop: 60 + rng() * 80 }] : []
    return [
      { along: 0.25 + rng() * 0.08, len: 400 + rng() * 350, drop: 200 + rng() * 400 },
      { along: 0.42 + rng() * 0.08, len: 350 + rng() * 300, drop: 150 + rng() * 300 },
      { along: 0.58 + rng() * 0.1, len: 280 + rng() * 250, drop: 80 + rng() * 220 },
      ...extra,
    ]
  }
  if (kind === 'poscg') {
    const extra = rng() < 0.55 ? [{ along: 0.55 + rng() * 0.1, len: 700 + rng() * 500, drop: 400 + rng() * 400 }] : []
    return [
      { along: 0.28 + rng() * 0.1, len: 900 + rng() * 700, drop: 500 + rng() * 700 },
      ...extra,
    ]
  }
  if (kind === 'spider') {
    const n = 6 + Math.floor(rng() * 5)
    return Array.from({ length: n }, (_, i) => ({
      along: 0.12 + (i * 0.75) / n + rng() * 0.04,
      len: 600 + rng() * 1400,
      drop: (rng() - 0.5) * 220,
    }))
  }
  return [
    { along: 0.22 + rng() * 0.06, len: 900 + rng() * 800, drop: (rng() - 0.35) * 400 },
    { along: 0.42 + rng() * 0.06, len: 800 + rng() * 700, drop: (rng() - 0.45) * 350 },
    { along: 0.62 + rng() * 0.08, len: 700 + rng() * 600, drop: (rng() - 0.4) * 300 },
    { along: 0.78 + rng() * 0.06, len: 500 + rng() * 400, drop: (rng() - 0.5) * 220 },
  ]
}

function stretchEnd(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  minLen: number,
  rng: () => number,
): { x: number; y: number; z: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const len = Math.hypot(dx, dy, dz)
  if (len >= minLen) return to
  const ang = rng() * Math.PI * 2
  const need = minLen - len
  return {
    x: to.x + Math.cos(ang) * need,
    y: to.y,
    z: to.z + Math.sin(ang) * need,
  }
}

/** Metre-scale branched channel with per-point growth order. */
export function buildChannel(
  kind: ChannelKind,
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  groundY: number,
  rng: () => number,
  cap: number,
): LightningChannel {
  const points: ChannelPoint[] = []
  const spans: ChannelSpan[] = []
  const minLen = kind === 'spider' ? 8000 : kind === 'ic' ? 4500 : kind === 'poscg' ? 2500 : 0
  to = stretchEnd(from, to, minLen, rng)
  const mainBudget =
    kind === 'spider' ? Math.min(90, cap - 24) : kind === 'ic' ? Math.min(56, cap - 20) : Math.min(36, cap - 16)
  const raw = refineM([from.x, from.y, from.z], [to.x, to.y, to.z], rng, groundY)
  const main = decimate(raw, Math.max(8, mainBudget))
  const start = points.length
  for (let i = 0; i < main.length; i++) {
    points.push({
      x: main[i][0],
      y: main[i][1],
      z: main[i][2],
      order: i / Math.max(1, main.length - 1),
      branch: false,
    })
  }
  spans.push({ start, count: main.length, branch: false })

  for (const fork of forkPlan(kind, rng)) {
    if (points.length + 6 > cap) break
    const along = Math.max(1, Math.min(main.length - 2, Math.floor((main.length - 1) * fork.along)))
    const origin = main[along]
    const heading = rng() * Math.PI * 2
    const dest = [
      origin[0] + Math.cos(heading) * fork.len,
      Math.max(groundY + 4, origin[1] - fork.drop),
      origin[2] + Math.sin(heading) * fork.len,
    ]
    const br = refineM(origin, dest, rng, groundY)
    const n = Math.min(br.length, cap - points.length)
    if (n < 2) break
    const bstart = points.length
    const order0 = along / Math.max(1, main.length - 1)
    for (let i = 0; i < n; i++) {
      points.push({
        x: br[i][0],
        y: br[i][1],
        z: br[i][2],
        order: order0 + (1 - order0) * (i / Math.max(1, n - 1)) * 0.55,
        branch: true,
      })
    }
    spans.push({ start: bstart, count: n, branch: true })
  }

  let extent = 0
  for (let i = 1; i < main.length; i++) {
    extent += Math.hypot(
      main[i][0] - main[i - 1][0],
      main[i][1] - main[i - 1][1],
      main[i][2] - main[i - 1][2],
    )
  }
  return { points, spans, extentKm: Math.max(0.4, extent / 1000) }
}
