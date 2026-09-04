// A close port of the working prototype's game logic from
// `HEIST - PLAY.dc.html` (the Claude Design handoff) — same world model,
// same constants, same feel. Not the seed-deterministic engine in
// src/engine/ (that's the separate Solidity-portable track from the code
// brief); this is what actually drives the Play/Demo canvas, because that
// prototype is the approved reference and must not be redesigned.
import { COPS, COP_W, ENV, HANDS as HAND_STATE, HELD, ICONS, PAL, POSES, VEHICLES } from '@/design/sprite-data'
import { rollPaintingDrop } from './paintingStore'
import { deriveStream, nextChance, nextFloat, nextInt, nextRange, shuffle, type RngState } from './rng'

// Domain tags for deriveStream() — one independent RNG stream per gameplay
// concern (DECISIONS.md #1). Values are arbitrary but must stay stable: a
// stored replay's inputs are only reproducible against the domain split
// that produced them.
const STREAM = {
  map: 1, // buildWorld()'s lane/truck/direction rolls, plus the police head start
  traffic: 2, // buildWorld()'s per-lane phase offset
  loot: 3, // rollLoot() + the wallet outcome/amount roll at pickup
  items: 4, // rollItem()
  furniture: 5, // rollFurniture()
  presentation: 6, // drawBag() flavour-text pick — cosmetic, but still seeded so a replay reads identically, not just plays identically
} as const

export const SCALE = 3
export const W = 226
export const H = 196
const SPACING = { car: 152, truck: 200 }
const SAFE: Record<string, boolean> = { pave: true, stop: true }

export const TRAFFIC_PX = 4
export const POLICE_MAX_LEAD_S = 26
export const REIN_FROM = 7
export const REIN_LEAD_S = 11
export const POLICE_PX = 4.0
export const POLICE_HEAD_START_S: [number, number] = [5, 7]
export const TICK_MS = 110
export const ESCAPE_AT = 10
export const LOOT_FROM = 6
export const LIVES_MAX = 3
export const DURATION_S = 60
export const CAR_COLOURS = [
  { body: 'B', shade: 'S', light: 'C' }, { body: 'R', shade: 'b', light: 'A' },
  { body: 'C', shade: 's', light: 'P' }, { body: 'V', shade: 'K', light: 'l' },
  { body: 'G', shade: 'a', light: 'W' }, { body: 'P', shade: 'C', light: 'W' },
]
const THIEF_X = 100
const THIEF_SCREEN_Y = 118
const BOTTOM_INSET = 2
const HOP_STEP = 12

export type ItemKey = 'oldMan' | 'pileUp' | 'shortcut' | 'safe' | 'haul'

// Per-run drop odds, straight from the prototype's own ODDS table (design
// brief section 9's rarity tiers, made concrete). No global counter exists
// yet — see haulStore.ts — so this is a local stand-in: an independent roll
// per run, not "one per N crossings across every player".
export const ITEM_ODDS: Record<ItemKey, number> = {
  oldMan: 1 / 12,
  pileUp: 1 / 16,
  shortcut: 1 / 90,
  safe: 1 / 120,
  haul: 1 / 2400,
}
export const ITEM_ORDER: ItemKey[] = ['oldMan', 'pileUp', 'shortcut', 'safe', 'haul']

export type Band = { k: string; h: number; dir?: number; spacing?: number; phase?: number; bottom: number; top: number; permanentBlock?: boolean }
export type Vehicle = { x: number; w: number; kind: string; colour: { body: string; shade: string; light: string } }
export type Mode = 'run' | 'police' | 'hit' | 'armed' | 'caught' | 'paid' | 'lost' | 'mobile'
export type Hands = 'ticket' | 'wallet' | 'painting' | 'both' | 'empty'
export type Dir = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'

export type RunState = {
  mode: Mode
  hands: Hands
  crossed: number
  taken: Record<string, boolean>
  lives: number
  blink: number
  timeLeft: number
  outcome: 'collared' | 'flattened' | 'timeout'
  heldItem: ItemKey | null
  // Rolled the moment the wallet is picked up, revealed only at the end of
  // the run (design brief: "contents revealed only at the end"). Nominal
  // play-money points, not a real amount — there is no payment system yet.
  walletOutcome: 'nothing' | 'refund' | 'double' | null
  walletAmount: number
}

export type AlertInfo = { text: string | null; level: number; critical: boolean }

/** Fresh six-section world, tiled endlessly — see buildWorld() below. */
export type LoggedInput = { tick: number; key: string; atMs: number }

/** Every player-controllable action, in order, tagged with the tick it
 *  landed on — the complete record replay(seed, actions) needs to reproduce
 *  a run bit-for-bit. Movement reuses Dir; Escape/UseItem cover the other
 *  two buttons a player can press. */
export type ReplayAction = Dir | 'Escape' | 'UseItem'
export type ReplayInput = [tick: number, action: ReplayAction]

export type Result = {
  mode: Mode
  outcome: RunState['outcome']
  crossed: number
  lives: number
  hands: Hands
  ticks: number
  walletOutcome: RunState['walletOutcome']
  walletAmount: number
  heldItem: ItemKey | null
}

export class HeistRun {
  state: RunState = { mode: 'run', hands: 'ticket', crossed: 0, taken: {}, lives: 3, blink: 0, timeLeft: 60, outcome: 'collared', heldItem: null, walletOutcome: null, walletAmount: 0 }
  // The seed this run's world and every roll in it derive from — see
  // DECISIONS.md #1. Passed explicitly for a replay; otherwise picked here
  // so ordinary play still gets a fresh, recorded, verifiable world.
  seed: number
  private mapRng: RngState = 0
  private trafficRng: RngState = 0
  private lootRng: RngState = 0
  private itemRng: RngState = 0
  private furnRng: RngState = 0
  private presentationRng: RngState = 0
  // The painting drop is a stand-in for a global, cross-player counter (see
  // paintingStore.ts) — state that lives outside any single run's seed, so
  // it can't be folded into a domain stream without breaking that counter's
  // own contract. Injected so replay()/tests can pin it instead of touching
  // shared localStorage.
  private paintingRoll: () => boolean
  // Solver-only: ignores collisions and the police catch trigger while
  // still running every other tick of real logic (traffic, hopping,
  // pickups) unchanged — this is what "perfect play, ignoring lives and
  // police" (impossibleShare) means, without a second copy of step()/
  // buildWorld() to drift out of sync with the real one. Never set true by
  // anything a player's browser runs. See DECISIONS.md #2.
  invincible: boolean
  // runId identifies a run for telemetry/export purposes only, not for
  // replay — the seed is what makes a run reproducible.
  runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  startedAtMs = Date.now()
  inputLog: LoggedInput[] = []
  actionLog: ReplayInput[] = []
  tick = 0
  bands: Band[] = []
  world = 0
  wy = 0
  policeWy = 0
  tx = THIEF_X
  bi = 0
  lap = 0
  hopTo: number | null = null
  dirV = 1
  pendingBi = 0
  pendingLap = 0
  trafficOff = 0
  clearTicks = 99
  wasCovered = false
  started = false
  ms = 0
  headStart = 0
  lootPlan: Record<number, string> = {}
  itemPlan: { index: number; item: ItemKey } | null = null
  trafficFrozenUntilTick = -1
  itemEffectBanner: { item: ItemKey; untilTick: number } | null = null
  usedItemsThisRun: ItemKey[] = []
  furn: Record<number, { kind: string; x: number }[]> = {}
  rein: { t: number; x: number; wy: number; phase: 'in' | 'stop' | 'out' } | null = null
  reinDone = false
  reinBanner = 0
  lostAt = -1
  alertMsg: string | null = null
  alertLevel = -1
  critical = false
  soundOn = true
  private alertBags: Record<string, string[]> = {}
  private ac: AudioContext | null | undefined

  constructor(seed?: number, paintingRoll: () => boolean = rollPaintingDrop, invincible = false) {
    // >>> 0 folds a negative/float/out-of-range caller value into a valid
    // uint32 the same way rngFromSeed does, so this.seed always matches what
    // the domain streams were actually derived from.
    this.seed = seed !== undefined ? seed >>> 0 : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
    this.paintingRoll = paintingRoll
    this.invincible = invincible
    this.newRun()
  }

  live(): boolean {
    const m = this.state.mode
    return m === 'run' || m === 'police' || m === 'armed' || m === 'mobile'
  }

  lives(): number {
    return this.state.mode === 'lost' ? 0 : this.state.mode === 'hit' ? 2 : this.state.lives
  }

  toggleSound(): void {
    this.soundOn = !this.soundOn
    if (!this.soundOn && this.ac) { this.ac.close(); this.ac = undefined }
  }

  // --------------------------------------------------------------- sound
  // Everything is synthesised, no audio files — same as the prototype. The
  // context is created lazily on the first tone, which always lands after a
  // user gesture (a keypress), so autoplay is never blocked.
  private audio(): AudioContext | null {
    if (!this.soundOn) return null
    if (typeof window === 'undefined') return null // headless (e.g. the calibration harness)
    if (!this.ac) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) { this.ac = null; return null }
      this.ac = new AC()
    }
    if (this.ac.state === 'suspended') this.ac.resume().catch(() => {})
    return this.ac
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
    const ac = this.audio()
    if (!ac) return
    const t0 = ac.currentTime + delay
    const osc = ac.createOscillator(), g = ac.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01)
    g.gain.linearRampToValueAtTime(0, t0 + dur)
    osc.connect(g); g.connect(ac.destination)
    osc.start(t0); osc.stop(t0 + dur + 0.02)
  }

  private bend(f0: number, f1: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
    const ac = this.audio()
    if (!ac) return
    const t0 = ac.currentTime + delay
    const osc = ac.createOscillator(), g = ac.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(f0, t0)
    osc.frequency.linearRampToValueAtTime(f1, t0 + dur)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(gain, t0 + 0.02)
    g.gain.linearRampToValueAtTime(0, t0 + dur)
    osc.connect(g); g.connect(ac.destination)
    osc.start(t0); osc.stop(t0 + dur + 0.02)
  }

  private loserTune() {
    ;[392, 349, 311].forEach((hz, i) => this.tone(hz, 0.16, 'triangle', 0.09, i * 0.22))
    this.bend(294, 150, 0.95, 'triangle', 0.11, 0.68)
  }

  private barsSlam() {
    this.tone(1400, 0.04, 'square', 0.05, 0)
    this.bend(220, 70, 0.5, 'square', 0.12, 0.05)
    this.tone(58, 0.5, 'triangle', 0.12, 0.1)
    ;[0.6, 1.0, 1.4].forEach((d) => {
      this.tone(700, 0.24, 'square', 0.09, d)
      this.tone(930, 0.24, 'square', 0.09, d + 0.26)
    })
  }

  private siren() {
    const s = this.secsToArrest()
    if (s > 18) return
    const near = Math.max(0, Math.min(1, 1 - s / 18))
    const g = 0.025 + near * 0.085
    this.tone(620 + near * 120, 0.26, 'square', g, 0)
    this.tone(840 + near * 130, 0.26, 'square', g, 0.28)
  }

  private laugh() {
    ;[420, 350, 300].forEach((hz, i) => this.tone(hz, 0.09, 'triangle', 0.07, i * 0.12))
  }

  // -------------------------------------------------------------- world
  private buildWorld(): void {
    const out: Band[] = [{ k: 'pave', h: 28, bottom: 0, top: 0 }]
    for (let s = 0; s < 6; s++) {
      let lanes: number
      ;[lanes, this.mapRng] = nextRange(this.mapRng, 1, 4)
      let truckRoll: boolean
      ;[truckRoll, this.mapRng] = nextChance(this.mapRng, 0.45)
      let truckAt = -1
      if (truckRoll) { [truckAt, this.mapRng] = nextInt(this.mapRng, lanes) }
      let dirRoll: boolean
      ;[dirRoll, this.mapRng] = nextChance(this.mapRng, 0.5)
      const d0 = dirRoll ? 1 : -1
      const wider = 1 + 0.1 * (lanes - 1)
      for (let n = 0; n < lanes; n++) {
        const isTruck = n === truckAt
        const spacing = Math.round((isTruck ? SPACING.truck : SPACING.car) * wider)
        let phase: number
        ;[phase, this.trafficRng] = nextRange(this.trafficRng, 0, spacing)
        out.push({
          k: isTruck ? 'truck' : 'car',
          h: isTruck ? 32 : 24,
          dir: n % 2 === 0 ? d0 : -d0,
          spacing,
          phase,
          bottom: 0,
          top: 0,
        })
      }
      if (s < 5) out.push({ k: s % 2 === 0 ? 'stop' : 'pave', h: 28, bottom: 0, top: 0 })
    }
    let acc = 0
    out.forEach((b) => { b.bottom = acc; acc += b.h; b.top = acc })
    this.bands = out
    this.world = acc
  }

  newRun(): void {
    // Every domain gets an independent stream derived fresh from the seed —
    // calling newRun() again on the same instance (as the determinism test
    // does) reproduces the exact same world and rolls, every time.
    this.mapRng = deriveStream(this.seed, STREAM.map)
    this.trafficRng = deriveStream(this.seed, STREAM.traffic)
    this.lootRng = deriveStream(this.seed, STREAM.loot)
    this.itemRng = deriveStream(this.seed, STREAM.items)
    this.furnRng = deriveStream(this.seed, STREAM.furniture)
    this.presentationRng = deriveStream(this.seed, STREAM.presentation)
    this.buildWorld()
    this.rollLoot()
    this.rollItem()
    this.rollFurniture()
    this.trafficFrozenUntilTick = -1
    this.itemEffectBanner = null
    this.usedItemsThisRun = []
    this.rein = null
    this.reinDone = false
    this.reinBanner = 0
    this.wy = this.bands[0].bottom
    this.bi = 0
    this.lap = 0
    this.tx = THIEF_X
    this.alertBags = {}
    this.alertMsg = null
    this.alertLevel = -1
    this.critical = false
    let headFrac: number
    ;[headFrac, this.mapRng] = nextFloat(this.mapRng)
    const head = POLICE_HEAD_START_S[0] + headFrac * (POLICE_HEAD_START_S[1] - POLICE_HEAD_START_S[0])
    this.headStart = head
    this.policeWy = this.bands[0].bottom - (head * (POLICE_PX * 1000 / TICK_MS) + 26)
    this.hopTo = null
    this.trafficOff = 0
    this.wasCovered = false
    this.clearTicks = 99
    this.started = false
    this.ms = 0
    this.lostAt = -1
    this.tick = 0
    this.inputLog = []
    this.actionLog = []
    this.state = { mode: 'run', hands: 'ticket', crossed: 0, taken: {}, lives: 3, blink: 0, timeLeft: 60, outcome: 'collared', heldItem: null, walletOutcome: null, walletAmount: 0 }
  }

  stopX(index: number): number { return ((index * 67) % (W - 80)) + 8 }
  lootX(index: number): number { return this.stopX(index) + 44 }

  private rollLoot(): void {
    const stops = this.bands.map((b, i) => (b.k === 'stop' ? i : -1)).filter((i) => i >= 0)
    const plan: Record<number, string> = {}
    let walletRoll: boolean
    ;[walletRoll, this.lootRng] = nextChance(this.lootRng, 0.55)
    if (walletRoll && stops.length) {
      let pick: number
      ;[pick, this.lootRng] = nextInt(this.lootRng, stops.length)
      const idx = stops.splice(pick, 1)[0]
      plan[idx] = 'wallet'
    }
    // The painting is the NFT drop — rare on purpose, see paintingStore.ts.
    // Its own odds live outside this run's seed (a cross-run counter), so
    // this draw doesn't touch lootRng — see the paintingRoll field.
    if (stops.length && this.paintingRoll()) {
      let pick: number
      ;[pick, this.lootRng] = nextInt(this.lootRng, stops.length)
      const idx = stops.splice(pick, 1)[0]
      plan[idx] = 'painting'
    }
    this.lootPlan = plan
  }

  /** Stand-in for the real drop mechanic (a global counter across every
   *  player's crossings — needs the phase-3 backend this app doesn't have
   *  yet). One independent roll per run, same odds as the prototype's own
   *  ODDS table, checked rarest-last so a legendary roll doesn't get
   *  silently overwritten by a common one rolling true in the same run. */
  private rollItem(): void {
    const stops = this.bands.map((b, i) => (b.k === 'stop' ? i : -1)).filter((i) => i >= 0)
    if (!stops.length) { this.itemPlan = null; return }
    const preferred = stops.filter((i) => !(i in this.lootPlan))
    const pool = preferred.length ? preferred : stops
    for (let k = ITEM_ORDER.length - 1; k >= 0; k--) {
      const item = ITEM_ORDER[k]
      let hit: boolean
      ;[hit, this.itemRng] = nextChance(this.itemRng, ITEM_ODDS[item])
      if (hit) {
        let pick: number
        ;[pick, this.itemRng] = nextInt(this.itemRng, pool.length)
        this.itemPlan = { index: pool[pick], item }
        return
      }
    }
    this.itemPlan = null
  }

  private rollFurniture(): void {
    const KINDS = ['tree', 'tree', 'bin', 'bollard', 'busStop']
    const f: Record<number, { kind: string; x: number }[]> = {}
    this.bands.forEach((band, i) => {
      if (band.k !== 'pave' && band.k !== 'stop') return
      const list: { kind: string; x: number }[] = []
      let slots: number[]
      ;[slots, this.furnRng] = shuffle(this.furnRng, [4, 58, 112, 164])
      let countRoll: boolean
      ;[countRoll, this.furnRng] = nextChance(this.furnRng, 0.65)
      const count = band.k === 'stop' ? 1 : (countRoll ? 2 : 1)
      for (let s = 0; s < count; s++) {
        let kindIdx: number
        ;[kindIdx, this.furnRng] = nextInt(this.furnRng, KINDS.length)
        let kind = KINDS[kindIdx]
        if (band.k === 'stop' && kind === 'busStop') kind = 'bin'
        const art = ENV[kind as keyof typeof ENV]
        if (art.h > band.h + 8) continue
        let xOff: number
        ;[xOff, this.furnRng] = nextInt(this.furnRng, 14)
        const x = slots[s] + xOff
        if (x + art.w > W - 2) continue
        if (band.k === 'stop') {
          const sx = this.stopX(i)
          if (x + art.w > sx - 4 && x < sx + ENV.busStop.w + 26) continue
        }
        list.push({ kind, x })
      }
      f[i] = list
    })
    this.furn = f
  }

  lootAt(index: number): string | null {
    const item = this.lootPlan[index]
    if (!item || this.state.crossed < LOOT_FROM || this.state.taken[item]) return null
    return item
  }

  itemX(index: number): number { return Math.max(2, this.stopX(index) - 20) }

  itemAt(index: number): ItemKey | null {
    if (!this.itemPlan || this.itemPlan.index !== index) return null
    if (this.state.heldItem || this.usedItemsThisRun.length) return null // one per run, same as the loot rule
    return this.itemPlan.item
  }

  private pickUp(): void {
    const band = this.bands[this.bi]
    if (band.k !== 'stop') return
    const loot = this.lootAt(this.bi)
    if (loot && Math.abs((this.tx + 11) - (this.lootX(this.bi) + 4)) <= 14) {
      this.laugh()
      const taken = { ...this.state.taken, [loot]: true }
      const has = (n: string) => taken[n]
      const hands: Hands = has('wallet') && has('painting') ? 'both' : has('wallet') ? 'wallet' : 'painting'
      let { walletOutcome, walletAmount } = this.state
      if (loot === 'wallet') {
        // Rolled now, revealed only at the end of the run.
        let roll: number
        ;[roll, this.lootRng] = nextFloat(this.lootRng)
        walletOutcome = roll < 0.45 ? 'nothing' : roll < 0.88 ? 'refund' : 'double'
        let amountRoll: number
        ;[amountRoll, this.lootRng] = nextInt(this.lootRng, 41)
        walletAmount = 10 + amountRoll // 10-50, nominal points
      }
      this.state = { ...this.state, taken, hands, walletOutcome, walletAmount }
    }
    const item = this.itemAt(this.bi)
    if (item && Math.abs((this.tx + 11) - (this.itemX(this.bi) + 4)) <= 14) {
      this.laugh()
      this.state = { ...this.state, heldItem: item }
    }
  }

  /** Fires the held item's effect immediately. Once per item, same spirit as
   *  the wallet/painting rule: it's a decision, not automatic. */
  useItem(): void {
    const item = this.state.heldItem
    if (!item || !this.live()) return
    this.laugh()
    if (item === 'oldMan') {
      this.trafficFrozenUntilTick = this.tick + Math.round(8000 / TICK_MS)
    } else if (item === 'pileUp') {
      const target = this.bands.findIndex((b, i) => i > this.bi && (b.k === 'car' || b.k === 'truck') && !b.permanentBlock)
      if (target >= 0) this.bands[target].permanentBlock = true
    } else if (item === 'shortcut') {
      this.policeWy -= 5 * (POLICE_PX * 1000 / TICK_MS)
    }
    // safe / haul: no mechanical effect yet — there is no bonus system to
    // freeze or raise the cap of (see MyHaulTab). Still collectible.
    this.itemEffectBanner = { item, untilTick: this.tick + Math.round(1800 / TICK_MS) }
    this.usedItemsThisRun.push(item)
    this.actionLog.push([this.tick, 'UseItem'])
    this.state = { ...this.state, heldItem: null }
  }

  // ------------------------------------------------------------- traffic
  trafficPx(): number { return TRAFFIC_PX + Math.min(3, Math.floor(this.state.crossed / 3)) }

  vehiclesIn(index: number): Vehicle[] {
    const band = this.bands[index]
    if (band.k !== 'car' && band.k !== 'truck') return []
    if (this.tick < this.trafficFrozenUntilTick) return [] // The Old Man: traffic stopped dead
    if (band.permanentBlock) {
      // The Pile-Up: a static wreck spanning the lane, wall to wall — this
      // is map data for the rest of the run, not scrolling traffic.
      const w = 48
      const crashColour = CAR_COLOURS[1]
      const out: Vehicle[] = []
      for (let x = -8; x < W + 8; x += w - 4) out.push({ x, w, kind: 'car', colour: crashColour })
      return out
    }
    const sp = band.spacing || SPACING[band.k as 'car' | 'truck']
    const w = band.k === 'car' ? 48 : 68
    const off = (band.phase || 0) + this.trafficOff * (band.dir ?? 1)
    const out: Vehicle[] = []
    const nMin = Math.ceil((-80 - off) / sp)
    const nMax = Math.floor((W + 80 - off) / sp)
    for (let n = nMin; n <= nMax; n++) {
      const id = ((index * 5 + n) % CAR_COLOURS.length + CAR_COLOURS.length) % CAR_COLOURS.length
      out.push({ x: off + n * sp, w, kind: band.k, colour: CAR_COLOURS[id] })
    }
    return out
  }

  private covered(): boolean {
    const band = this.bands[this.bi]
    if (band.k !== 'car' && band.k !== 'truck') return false
    const lo = this.tx + 2, hi = this.tx + 20
    return this.vehiclesIn(this.bi).some((v) => v.x < hi && v.x + v.w > lo)
  }

  // --------------------------------------------------------------- input
  onKey(key: string): void {
    if (!this.live()) return
    if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowRight') return
    this.started = true
    // Recorded even when the move below turns out to be a no-op (e.g. mid-hop) —
    // per the code brief, an input is logged whether or not it changes anything.
    this.inputLog.push({ tick: this.tick, key, atMs: Date.now() - this.startedAtMs })
    this.actionLog.push([this.tick, key as Dir])
    if (key === 'ArrowLeft') { this.tx = Math.max(2, this.tx - 6); return }
    if (key === 'ArrowRight') { this.tx = Math.min(W - 24, this.tx + 6); return }
    if (this.hopTo !== null) return
    if (key === 'ArrowUp') {
      this.dirV = 1
      this.hopTo = this.lap + this.bands[this.bi].top
    } else {
      const first = this.bi === 0
      const prev = first ? this.bands.length - 1 : this.bi - 1
      this.dirV = -1
      this.pendingBi = prev
      this.pendingLap = first ? this.lap - this.world : this.lap
      this.hopTo = this.wy - this.bands[prev].h
    }
  }

  /** Escaping keeps the ticket and forfeits everything carried (both briefs agree on this) —
   *  loot, any held item, and credit for items already used this run. */
  escapeNow(): void {
    if (this.state.crossed >= ESCAPE_AT && this.live()) {
      this.usedItemsThisRun = []
      this.actionLog.push([this.tick, 'Escape'])
      this.state = { ...this.state, mode: 'paid', taken: {}, hands: 'ticket', heldItem: null, walletOutcome: null, walletAmount: 0 }
    }
  }

  // ------------------------------------------------------------ per-tick
  private step(): void {
    if (this.hopTo === null) { this.pickUp(); return }
    this.wy += this.dirV * HOP_STEP
    if (this.dirV > 0 && this.wy >= this.hopTo) {
      this.wy = this.hopTo
      this.hopTo = null
      const left = this.bands[this.bi].k
      if (this.bi === this.bands.length - 1) { this.bi = 0; this.lap += this.world }
      else this.bi += 1
      if (SAFE[this.bands[this.bi].k] && !SAFE[left]) this.state = { ...this.state, crossed: this.state.crossed + 1 }
      this.pickUp()
    } else if (this.dirV < 0 && this.wy <= this.hopTo) {
      this.wy = this.hopTo
      this.hopTo = null
      const left = this.bands[this.bi].k
      this.bi = this.pendingBi
      this.lap = this.pendingLap
      if (SAFE[this.bands[this.bi].k] && !SAFE[left]) this.state = { ...this.state, crossed: Math.max(0, this.state.crossed - 1) }
    }
  }

  private collide(): void {
    if (this.invincible) return
    const cov = this.covered()
    if (!cov) this.clearTicks += 1
    if (cov && this.clearTicks >= 3) {
      this.clearTicks = 0
      const lives = Math.max(0, this.state.lives - 1)
      const next: Partial<RunState> = { lives, blink: 10 }
      if (lives === 0) { next.mode = 'lost'; next.outcome = 'flattened'; this.loserTune() }
      this.state = { ...this.state, ...next }
    }
    if (cov) this.clearTicks = 0
    this.wasCovered = cov
    if (this.state.blink > 0 && this.state.lives > 0 && this.state.mode !== 'lost') {
      this.state = { ...this.state, blink: Math.max(0, this.state.blink - 1) }
    }
  }

  secsToArrest(): number {
    const perSec = POLICE_PX * 1000 / TICK_MS
    return Math.max(0, (this.wy - this.policeWy - 26) / perSec)
  }

  private law(): void {
    if (!this.live() || !this.started) return
    const lead = this.secsToArrest()
    const push = lead > POLICE_MAX_LEAD_S ? 2.6 : lead > 18 ? 1.6 : 1
    this.policeWy += POLICE_PX * push
    if (!this.invincible && this.policeWy + 26 >= this.wy) {
      this.barsSlam()
      this.state = { ...this.state, mode: 'caught', outcome: 'collared' }
      this.lostAt = this.tick + Math.round(1600 / TICK_MS)
    }
  }

  private reinforce(): void {
    if (!this.live() || !this.started) return
    const r = this.rein
    if (!r) {
      if (this.reinDone || this.state.crossed < REIN_FROM) return
      if (this.secsToArrest() <= REIN_LEAD_S) return
      const scroll = this.wy - (H - THIEF_SCREEN_Y)
      this.rein = { t: 0, x: -70, wy: scroll + 22, phase: 'in' }
      return
    }
    r.t++
    if (r.phase === 'in') {
      r.x = Math.min(72, r.x + 16)
      if (r.x >= 72) { r.phase = 'stop'; r.t = 0 }
    } else if (r.phase === 'stop' && r.t > 12) {
      r.phase = 'out'
      this.policeWy = r.wy
      this.reinDone = true
      this.reinBanner = 26
      this.laugh()
    }
  }

  private clock(): void {
    if (!this.live() || !this.started) return
    this.ms += TICK_MS
    if (this.ms < 1000) return
    this.ms -= 1000
    const t = this.state.timeLeft - 1
    if (t > 0) { this.state = { ...this.state, timeLeft: t }; return }
    // Surviving the clock only pays out with the goal met — both briefs
    // agree ten crossings is what secures the ticket, not just outlasting
    // the 60s. Short of that it's a loss, same shape as being caught.
    if (this.state.crossed >= ESCAPE_AT) {
      this.state = { ...this.state, timeLeft: 0, mode: 'paid' }
    } else {
      this.loserTune()
      this.state = { ...this.state, timeLeft: 0, mode: 'lost', outcome: 'timeout' }
    }
  }

  private drawBag(band: 'far' | 'mid' | 'near' | 'relief' | 'critical'): string {
    const ALERTS: Record<string, string[]> = {
      far: ['YOU CAN HEAR THE SIRENS', "THEY'RE ON YOUR TRAIL", 'THE POLICE ARE BACK THERE SOMEWHERE', 'SIRENS, A COUPLE OF STREETS BACK', 'THE COPS HAVE YOUR SCENT', 'SOMETHING BLUE IN THE MIRROR'],
      mid: ['THE GAP IS CLOSING', 'THE SIRENS ARE GETTING LOUDER', 'THE COPS ARE CLOSING THE GAP', 'THE POLICE ARE CLOSING IN', 'THEY ARE GAINING ON YOU', 'THAT SIREN IS NOT GETTING QUIETER', 'THEY ARE COMING UP FAST'],
      near: ['THE POLICE ARE ALMOST ON YOU', 'THE COPS ARE SECONDS AWAY', 'ONLY A FEW METRES NOW', 'YOU CAN SEE THE LIGHTS ON THE ROAD', 'MOVE. THEY ARE ON YOU'],
      relief: ["YOU'RE PULLING AWAY", 'THE COPS ARE FALLING BEHIND', "YOU'VE GOT SOME DISTANCE", 'THE GAP IS OPENING'],
      critical: ["THEY'RE RIGHT BEHIND YOU", 'THEY ARE ON YOUR HEELS', 'HANDS OFF THE ROAD, THEY HAVE YOU IN SIGHT'],
    }
    if (!this.alertBags[band] || !this.alertBags[band].length) this.alertBags[band] = ALERTS[band].slice()
    const bag = this.alertBags[band]
    let pick: number
    ;[pick, this.presentationRng] = nextInt(this.presentationRng, bag.length)
    return bag.splice(pick, 1)[0]
  }

  private alerts(): void {
    if (!this.live() || !this.started) { this.alertMsg = null; this.alertLevel = -1; this.critical = false; return }
    const s = this.secsToArrest()
    if (this.reinBanner > 0) {
      // Counts down on its own — without this it never releases and the
      // critical red wash it forces stays on for the rest of the run.
      this.reinBanner--
      this.alertMsg = 'A CRUISER JUST CUT IN'
      this.alertLevel = 4
      this.critical = true
      return
    }
    this.critical = s <= 3.4
    const level = s <= 6.5 ? 3 : s <= 13 ? 2 : 1
    this.alertLevel = level
    if (this.tick % 20 === 0 || !this.alertMsg) {
      const band = this.critical ? 'critical' : level === 3 ? 'near' : level === 2 ? 'mid' : 'far'
      this.alertMsg = this.drawBag(band)
    }
  }

  /** One full tick: input has already been applied via onKey(). */
  advance(): void {
    this.tick++
    this.step()
    if (this.live()) this.collide()
    this.trafficOff += this.trafficPx()
    this.law()
    this.reinforce()
    this.clock()
    this.alerts()
    if (this.live() && this.started) {
      const s2a = this.secsToArrest()
      if (this.tick % (s2a < 6 ? 4 : 6) === 0) this.siren()
    }
    if (this.state.mode === 'caught' && this.lostAt >= 0 && this.tick >= this.lostAt) {
      this.state = { ...this.state, mode: 'lost' }
      this.lostAt = -1
    }
  }

  // -------------------------------------------------------------- draw
  private cell(ctx: CanvasRenderingContext2D, rows: string[], px: number, py: number, opts?: { body?: string; shade?: string; light?: string; flip?: boolean; mode?: 'flash' }) {
    const o = opts || {}
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        let ch = rows[y][x]
        if (ch === '.' || ch === ' ') continue
        if (o.body && ch === 'A') ch = o.body
        else if (o.shade && ch === 'a') ch = o.shade
        else if (ch === 'L') ch = o.light || (o.body ? o.body : 'L')
        let hex = PAL[ch]
        if (!hex) continue
        if (o.mode === 'flash') hex = (ch === 'W' || ch === 'P' || ch === 'G') ? PAL.K : PAL.P
        const dx = o.flip ? (rows[y].length - 1 - x) : x
        ctx.fillStyle = hex
        ctx.fillRect(px + dx, py + y, 1, 1)
      }
    }
  }

  private shadow(ctx: CanvasRenderingContext2D, x: number, w: number, groundY: number, kind: 'solid' | 'dither50') {
    ctx.fillStyle = PAL.K
    if (kind === 'solid') { ctx.fillRect(x + 1, groundY - 1, w - 2, 2); return }
    for (let yy = 0; yy < 2; yy++) for (let xx = 1; xx < w - 1; xx++) {
      if ((xx + yy) % 2) continue
      ctx.fillRect(x + xx, groundY - 1 + yy, 1, 1)
    }
  }

  private thiefRows(poseOverride?: string): string[] {
    const m = this.state.mode
    const cycle = this.hopTo !== null ? (['tuck', 'splay', 'tuck', 'walk2'] as const)[this.tick % 4] : 'stand'
    const pose = poseOverride || ((m === 'caught' || m === 'lost') ? 'caught' : m === 'hit' ? 'hit' : cycle)
    const rows = POSES[pose].map((r) => r.split(''))
    const hands: Hands = (m === 'lost' || pose === 'hit') ? 'empty' : this.state.hands
    ;(HAND_STATE[hands] || []).forEach((n: string) => {
      const layer = HELD[n as keyof typeof HELD]
      for (let y = 0; y < layer.length; y++) for (let x = 0; x < layer[y].length; x++) {
        if (layer[y][x] !== '.') rows[y][x] = layer[y][x]
      }
    })
    return rows.map((r) => r.join(''))
  }

  private asphalt(ctx: CanvasRenderingContext2D, y: number, h: number, wb: number) {
    ctx.fillStyle = PAL.T; ctx.fillRect(-40, y, W + 80, h)
    ctx.fillStyle = PAL.j
    for (let i = 0; i < 3; i++) {
      const pw = 18 + ((wb + i * 7) % 26)
      const ph = Math.max(3, Math.min(h - 5, 4 + ((wb * 3 + i) % 6)))
      const px = ((wb * 37 + i * 613) % (W + 40)) - 40
      const py = y + 2 + ((wb * 5 + i * 11) % Math.max(1, h - ph - 4))
      ctx.fillRect(px, py, pw, ph)
    }
    ctx.fillStyle = PAL.n
    for (let yy = 1; yy < h - 2; yy += 3) {
      const off = ((wb + yy) * 7) % 9
      for (let x = -40 + off; x < W + 40; x += 9) ctx.fillRect(x, y + yy, 1, 1)
    }
  }

  private pavement(ctx: CanvasRenderingContext2D, y: number, h: number) {
    ctx.fillStyle = PAL.C; ctx.fillRect(-40, y, W + 80, h)
    ctx.fillStyle = PAL.d
    for (let x = -40; x < W + 40; x += 16) ctx.fillRect(x, y + 6, 1, h - 6)
    ctx.fillStyle = PAL.e
    for (let x = -40; x < W + 40; x += 16) ctx.fillRect(x + 1, y + 6, 1, h - 6)
    ctx.fillStyle = PAL.d; ctx.fillRect(-40, y + 6 + Math.floor((h - 6) / 2), W + 80, 1)
    ctx.fillStyle = PAL.s; ctx.fillRect(-40, y, W + 80, 4)
    ctx.fillStyle = PAL.e; ctx.fillRect(-40, y + 4, W + 80, 2)
    ctx.fillStyle = PAL.K; ctx.fillRect(-40, y, W + 80, 1)
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = PAL.T; ctx.fillRect(-40, 0, W + 80, H)

    const scroll = this.wy - (H - THIEF_SCREEN_Y)
    const screenTop = (worldY: number) => H - (worldY - scroll)
    const pad = (rows: string[], w: number) => rows.map((r) => r + '.'.repeat(Math.max(0, w - r.length)))

    const base = Math.floor(scroll / this.world)
    for (let m = base; m <= base + 2; m++) {
      this.bands.forEach((band, i) => {
        const bottom = band.bottom + m * this.world
        const y = screenTop(bottom + band.h)
        if (y > H || y + band.h < 0) return

        if (band.k === 'pave' || band.k === 'stop') this.pavement(ctx, y, band.h)
        else this.asphalt(ctx, y, band.h, band.bottom)

        const below = this.bands[(i - 1 + this.bands.length) % this.bands.length]
        const roadRoad = (band.k === 'car' || band.k === 'truck') && (below.k === 'car' || below.k === 'truck')
        const gy = y + band.h - 1
        if (roadRoad) {
          ctx.fillStyle = PAL.C
          for (let x = -40; x < W + 40; x += 12) ctx.fillRect(x, gy - 1, 6, 2)
        } else {
          ctx.fillStyle = PAL.P; ctx.fillRect(-40, gy - 1, W + 80, 2)
        }

        if (band.k === 'stop') {
          const sx = this.stopX(i)
          this.cell(ctx, pad(ENV.busStop.rows, ENV.busStop.w), sx, y + band.h - ENV.busStop.h)
          this.cell(ctx, pad(ENV.bystander.rows, ENV.bystander.w), sx + 30, y + band.h - ENV.bystander.h)
          const loot = this.lootAt(i)
          if (loot) {
            const lx = this.lootX(i), ly = y + band.h - 10
            ctx.fillStyle = PAL.K; ctx.fillRect(lx - 1, ly - 1, 10, 10)
            this.cell(ctx, ICONS[loot as keyof typeof ICONS], lx, ly)
            if (this.tick % 2 === 0) { ctx.fillStyle = PAL.W; ctx.fillRect(lx + 8, ly - 1, 1, 1) }
          }
          const item = this.itemAt(i)
          if (item) {
            const ix = this.itemX(i), iy = y + band.h - 10
            ctx.fillStyle = PAL.b; ctx.fillRect(ix - 1, iy - 1, 10, 10)
            this.cell(ctx, ICONS[item], ix, iy)
            if (this.tick % 2 === 0) { ctx.fillStyle = PAL.G; ctx.fillRect(ix + 8, iy - 1, 1, 1) }
          }
        }
        ;(this.furn[i] || []).forEach((p) => {
          const art = ENV[p.kind as keyof typeof ENV]
          this.cell(ctx, pad(art.rows, art.w), p.x, y + band.h - art.h)
        })

        this.vehiclesIn(i).forEach((v) => {
          const veh = VEHICLES[v.kind as keyof typeof VEHICLES]
          const ground = y + band.h - BOTTOM_INSET
          this.shadow(ctx, v.x, veh.w, ground, 'solid')
          this.cell(ctx, veh.rows, v.x, ground - veh.h, { body: v.colour.body, shade: v.colour.shade, light: v.colour.light, flip: (band.dir ?? 1) < 0 })
        })
      })
    }

    const py = screenTop(this.policeWy)
    if (py > -30 && py < H + 30) {
      ;[40, 116].forEach((px, i) => {
        this.shadow(ctx, px, COP_W, py, 'dither50')
        this.cell(ctx, COPS[(this.tick + i) % 2], px, py - 22)
      })
    }

    if (this.rein) {
      const car = VEHICLES[this.tick % 2 ? 'police_a' : 'police_b']
      const ry = screenTop(this.rein.wy)
      if (ry > -40 && ry < H + 40) {
        this.shadow(ctx, this.rein.x, car.w, ry, 'solid')
        this.cell(ctx, car.rows, this.rein.x, ry - car.h, { light: 'W' })
      }
    }

    if (this.live() && this.started && this.alertLevel > 0 && this.alertLevel < 4) {
      const th2 = [0, 3, 5, 8][this.alertLevel]
      ctx.fillStyle = this.tick % 2 ? PAL.B : PAL.R
      for (let x = -40; x < W + 40; x += 16) ctx.fillRect(x, H - th2, 8, th2)
    }

    const feet = screenTop(this.wy)
    this.shadow(ctx, this.tx + 4, 14, feet, 'dither50')
    const flash = ((this.state.mode === 'hit' || this.state.blink > 0) && this.tick % 2 === 0) ? 'flash' : undefined
    this.cell(ctx, this.thiefRows(), this.tx, feet - 24, { mode: flash })

    if (this.critical && this.live()) {
      ctx.fillStyle = PAL.R
      ctx.fillRect(-40, H - 10, W + 80, 10)
      if (this.tick % 2 === 0) {
        for (let y = 0; y < H; y++) for (let x = -40; x < W + 40; x++) {
          if ((x * 3 + y * 5) % 11) continue
          ctx.fillRect(x, y, 1, 1)
        }
      }
    }

    if (this.state.mode === 'caught') {
      ctx.fillStyle = this.tick % 2 ? PAL.R : PAL.b
      for (let y = 0; y < H; y++) for (let x = -40; x < W + 40; x++) {
        if ((x + y) % 2) continue
        ctx.fillRect(x, y, 1, 1)
      }
    }
  }
}

const MAX_REPLAY_TICKS = Math.ceil(65000 / TICK_MS) // hard stop past the 60s run clock, safety margin — matches the harness bot

/** Pure, DOM-free replay: same seed and the same recorded actions always
 *  reach the same Result. No canvas, no audio, no localStorage — this is
 *  what the determinism test and any future server-side verification call.
 *  `paintingRoll` defaults to false (never drops) because the real one
 *  reads/writes a shared localStorage counter that has no meaning outside a
 *  browser and no place in a pure function — see DECISIONS.md #1. */
export function replay(seed: number, actions: ReplayInput[], paintingRoll: () => boolean = () => false): Result {
  const run = new HeistRun(seed, paintingRoll)
  let ai = 0
  for (let t = 0; t < MAX_REPLAY_TICKS && run.live(); t++) {
    while (ai < actions.length && actions[ai][0] === run.tick) {
      const [, action] = actions[ai]
      if (action === 'Escape') run.escapeNow()
      else if (action === 'UseItem') run.useItem()
      else run.onKey(action)
      ai++
    }
    // A bot/player that just escaped stops right there — the source loop
    // this mirrors (src/harness/bot.ts) breaks immediately after
    // escapeNow() without a further advance(). Calling advance() here
    // regardless used to add one extra tick no live play ever took.
    if (!run.live()) break
    run.advance()
  }
  return {
    mode: run.state.mode,
    outcome: run.state.outcome,
    crossed: run.state.crossed,
    lives: run.lives(),
    hands: run.state.hands,
    ticks: run.tick,
    walletOutcome: run.state.walletOutcome,
    walletAmount: run.state.walletAmount,
    heldItem: run.state.heldItem,
  }
}

/** The same summary shape replay() returns, read off a live/finished run —
 *  so a bot trial and a replay of that same trial can be compared directly. */
export function resultOf(run: HeistRun): Result {
  return {
    mode: run.state.mode,
    outcome: run.state.outcome,
    crossed: run.state.crossed,
    lives: run.lives(),
    hands: run.state.hands,
    ticks: run.tick,
    walletOutcome: run.state.walletOutcome,
    walletAmount: run.state.walletAmount,
    heldItem: run.state.heldItem,
  }
}
