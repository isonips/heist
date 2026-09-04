// The cautious bot in bot.ts always escapes the instant it reaches
// ESCAPE_AT (the rational move for a bot that doesn't value loot) — which
// means it never goes near loot and can't say anything about whether loot
// is reachable at all. This bot never escapes: it detours for loot/items
// when they're on a stop it's standing at, otherwise plays the same
// safe-crossing policy, and rides every run to its natural end (caught, out
// of lives, or the clock). That's what makes it useful for lootPickupRate.
// (It was also used for relativeGap, since removed as a metric — see
// CALIBRATION.md's "relativeGap: dropped" section.)
import { ESCAPE_AT, HeistRun, TICK_MS, resultOf, type Dir, type Result } from '@/game/heistRun'
import { isSafe } from './bot'

const MAX_TICKS = Math.ceil(65000 / 110)
const W_BOUND_MIN = 2
const W_BOUND_MAX = 226 - 24

// Exported so rationalBot.ts can reuse the exact same "detour for loot,
// otherwise cross when it's safe" movement policy rather than a second
// copy of it — the two bots only need to differ on the escape decision.
export function decideGreedyMove(run: HeistRun): Dir | null {
  if (run.hopTo !== null) return null
  const band = run.bands[run.bi]
  if (band.k === 'stop') {
    const loot = run.lootAt(run.bi)
    const item = run.itemAt(run.bi)
    // Same pickup-radius math as HeistRun.pickUp(): target tx such that
    // (tx+11) lands within 14px of (targetX+4) — aim for the centre of
    // that window rather than its edge.
    const targetX = loot ? run.lootX(run.bi) - 7 : item ? run.itemX(run.bi) - 7 : null
    if (targetX !== null && Math.abs(run.tx - targetX) > 3) {
      const goRight = targetX > run.tx
      const nx = goRight ? run.tx + 6 : run.tx - 6
      if (nx >= W_BOUND_MIN && nx <= W_BOUND_MAX) return goRight ? 'ArrowRight' : 'ArrowLeft'
    }
  }
  const forwardTicks = 4
  if (isSafe(run, run.bi, run.tx, forwardTicks) && isSafe(run, run.bi + 1, run.tx, forwardTicks + 2)) {
    return 'ArrowUp'
  }
  const left = run.tx - 6
  const right = run.tx + 6
  const leftOk = left >= W_BOUND_MIN && isSafe(run, run.bi, left, forwardTicks)
  const rightOk = right <= W_BOUND_MAX && isSafe(run, run.bi, right, forwardTicks)
  if (leftOk && rightOk) return Math.random() < 0.5 ? 'ArrowLeft' : 'ArrowRight'
  if (leftOk) return 'ArrowLeft'
  if (rightOk) return 'ArrowRight'
  return null
}

export type GreedyTrialResult = {
  win: boolean
  crossed: number
  outcome: 'collared' | 'flattened' | 'timeout' | 'survived'
  ticks: number
  seed: number
  lootAvailable: boolean
  lootPickedUp: boolean
  lootKept: boolean
  // This bot never presses Escape, so reaching the window (mode 'armed')
  // always lapses into 'committed' unless the run ends first (caught / out
  // of lives) — which makes it the right vehicle for the window-balance
  // sweep: reachedTenth/tickAtTenth answer "how often, how fast do players
  // even get the decision", and reachedCommitted + win together answer
  // "of those who let it lapse, how many hold to the end" — see
  // sweepWindow.ts.
  reachedTenth: boolean
  tickAtTenth: number | null
  reachedCommitted: boolean
  result: Result
}

export function runGreedyBotTrial(seed?: number, paintingRoll: () => boolean = () => false): GreedyTrialResult {
  const run = new HeistRun(seed, paintingRoll)
  run.soundOn = false // headless in Node; when run live in a browser (e.g. /stats), this stops it from opening a real AudioContext per trial
  run.setSprinting(true) // always sprint when possible — the greedy baseline for pace, same as a player mashing the fastest option
  const lootAvailable = Object.keys(run.lootPlan).length > 0
  let ticks = 0
  let tickAtTenth: number | null = null
  let reachedCommitted = false
  while (run.live() && ticks < MAX_TICKS) {
    const dir = decideGreedyMove(run)
    if (dir) run.onKey(dir)
    else if (!run.started) run.onKey('ArrowUp')
    if (run.state.heldItem) run.useItem() // a loot-seeking player wouldn't sit on a held item either
    run.advance()
    ticks++
    if (tickAtTenth === null && run.state.crossed >= ESCAPE_AT) tickAtTenth = run.tick
    if (!reachedCommitted && run.state.mode === 'committed') reachedCommitted = true
  }
  const win = run.state.mode === 'paid'
  return {
    win,
    crossed: run.state.crossed,
    outcome: win ? 'survived' : run.state.outcome,
    ticks,
    seed: run.seed,
    lootAvailable,
    // pickedUpLootEver (not state.taken, which an early escape or a loss
    // short of the window still clears — see heistRun.ts) so this stays
    // "was it ever picked up" regardless of whether it was later kept.
    lootPickedUp: run.pickedUpLootEver,
    lootKept: win && run.state.hands !== 'ticket',
    reachedTenth: tickAtTenth !== null,
    tickAtTenth,
    reachedCommitted,
    result: resultOf(run),
  }
}

/** tickAtTenth in seconds — convenience for the sweep/measure scripts. */
export function secsAtTenth(r: GreedyTrialResult): number | null {
  return r.tickAtTenth === null ? null : (r.tickAtTenth * TICK_MS) / 1000
}
