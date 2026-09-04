// The cautious bot in bot.ts always escapes the instant it reaches
// ESCAPE_AT (the rational move for a bot that doesn't value loot) — which
// means its own crossings distribution is capped at 10 by construction and
// can't say anything about how far a run *could* go. This bot never
// escapes: it detours for loot/items when they're on a stop it's standing
// at, otherwise plays the same safe-crossing policy, and rides every run to
// its natural end (caught, out of lives, or the clock). Its ceiling against
// the cautious bot's median is what makes relativeGap mean something; it
// also drives lootPickupRate, since the cautious bot never goes near loot.
import { HeistRun, resultOf, type Dir, type Result } from '@/game/heistRun'
import { isSafe } from './bot'

const MAX_TICKS = Math.ceil(65000 / 110)
const W_BOUND_MIN = 2
const W_BOUND_MAX = 226 - 24

function decideGreedyMove(run: HeistRun): Dir | null {
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
  result: Result
}

export function runGreedyBotTrial(seed?: number, paintingRoll: () => boolean = () => false): GreedyTrialResult {
  const run = new HeistRun(seed, paintingRoll)
  const lootAvailable = Object.keys(run.lootPlan).length > 0
  let ticks = 0
  while (run.live() && ticks < MAX_TICKS) {
    const dir = decideGreedyMove(run)
    if (dir) run.onKey(dir)
    else if (!run.started) run.onKey('ArrowUp')
    if (run.state.heldItem) run.useItem() // a loot-seeking player wouldn't sit on a held item either
    run.advance()
    ticks++
  }
  const win = run.state.mode === 'paid'
  return {
    win,
    crossed: run.state.crossed,
    outcome: win ? 'survived' : run.state.outcome,
    ticks,
    seed: run.seed,
    lootAvailable,
    lootPickedUp: Object.keys(run.state.taken).length > 0,
    result: resultOf(run),
  }
}
