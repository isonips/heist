// The calibration bot for the LIVE game (src/game/heistRun.ts) — the port of
// the approved prototype that Play/Demo actually run. This does not touch
// src/engine/ (the separate seed-deterministic track from the code brief,
// not currently wired to the game); see CALIBRATION.md for why.
//
// heistRun.ts has no density/speedMul config surface (the prototype's world
// is a fixed rule set, randomised per run via Math.random()), so there is no
// grid to sweep — this runs many independent trials of that one rule set.
import { HeistRun, REIN_FROM, TICK_MS, resultOf, type ReplayInput, type Result, type Vehicle } from '@/game/heistRun'

const MAX_TICKS = Math.ceil(65000 / TICK_MS) // hard stop past the 60s run clock, safety margin

// Exported so both the greedy/loot-seeking bot (greedyBot.ts) and the
// reachability solver (solver.ts) can reuse the exact same "is this lane
// safe to be in N ticks from now" and "cross if it's safe, else dodge"
// reasoning — rather than a second copy of it that could quietly drift.
export function isSafe(run: HeistRun, bandIndex: number, tx: number, lookaheadTicks: number): boolean {
  const band = run.bands[(bandIndex % run.bands.length + run.bands.length) % run.bands.length]
  if (band.k !== 'car' && band.k !== 'truck') return true
  const savedOff = run.trafficOff
  const step = run.trafficPx()
  const lo = tx + 2, hi = tx + 20
  let safe = true
  for (let k = 0; k <= lookaheadTicks && safe; k++) {
    run.trafficOff = savedOff + step * k
    const vehicles: Vehicle[] = run.vehiclesIn(bandIndex)
    if (vehicles.some((v) => v.x < hi && v.x + v.w > lo)) safe = false
  }
  run.trafficOff = savedOff
  return safe
}

/** Greedy policy: advance when it's safe now and stays safe long enough to
 * clear the band; otherwise sidestep toward whichever side looks clearer.
 * Not required to be optimal — only to approximate a scripted player's ceiling. */
export function decideMove(run: HeistRun): 'ArrowUp' | 'ArrowLeft' | 'ArrowRight' | null {
  if (run.hopTo !== null) return null
  const W_BOUND_MIN = 2, W_BOUND_MAX = 226 - 24

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

export type BotTrialResult = {
  win: boolean
  crossed: number
  outcome: 'collared' | 'flattened' | 'timeout' | 'escaped'
  heartsLost: number
  reinforcementFired: boolean
  leadAtSeventhS: number | null
  ticks: number
  seed: number
  actions: ReplayInput[]
  result: Result
}

/** seed is optional (the harness's usual bulk sweeps don't care), but always
 *  present on the returned trial — every trial is a recorded, replayable
 *  run, not just a statistic. paintingRoll defaults to "never" so a trial
 *  never touches localStorage's shared drop counter from a headless
 *  process; pass the real rollPaintingDrop explicitly if that's ever
 *  actually wanted here. */
export function runBotTrial(seed?: number, paintingRoll: () => boolean = () => false): BotTrialResult {
  const run = new HeistRun(seed, paintingRoll)
  run.soundOn = false // headless in Node; when run live in a browser (e.g. /stats), this stops it from opening a real AudioContext per trial
  let leadAtSeventhS: number | null = null
  let ticks = 0

  while (run.live() && ticks < MAX_TICKS) {
    // The rational move for a bot that doesn't value loot: take the
    // ticket-only exit the instant the decision window opens. Waiting out
    // the window only adds risk for nothing it cares about.
    if (run.state.mode === 'armed') { run.escapeNow(); break }
    const dir = decideMove(run)
    if (dir) run.onKey(dir)
    else if (!run.started) run.onKey('ArrowUp') // first move only: get the run started
    const prevCrossed = run.state.crossed
    run.advance()
    ticks++
    if (prevCrossed < REIN_FROM && run.state.crossed >= REIN_FROM && leadAtSeventhS === null) {
      leadAtSeventhS = run.secsToArrest()
    }
  }

  const win = run.state.mode === 'paid'
  return {
    win,
    crossed: run.state.crossed,
    outcome: win ? 'escaped' : run.state.outcome,
    heartsLost: 3 - run.lives(),
    reinforcementFired: run.reinDone,
    leadAtSeventhS,
    ticks,
    seed: run.seed,
    actions: run.actionLog,
    result: resultOf(run),
  }
}
