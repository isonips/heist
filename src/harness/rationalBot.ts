// Is the loot actually playable, for a bot that plays to maximize expected
// value rather than distance? The cautious bot (bot.ts) always escapes the
// instant the window opens — it never holds anything, so it can't answer
// this. The greedy bot (greedyBot.ts) never escapes voluntarily — it
// answers a different question (how far can a run go, how often is the
// window even reached and held). This bot is the one that faces the real
// decision a player holding something faces once the window opens:
// escaping locks in the ticket and forfeits whatever's in hand; letting the
// window lapse commits the ticket *and* the loot to surviving to the 60s
// clock's end.
//
// The decision only exists while mode === 'armed' — that's the WINDOW_S
// seconds after reaching ESCAPE_AT. Once it lapses into 'committed' there's
// nothing left to decide (see heistRun.ts's escapeNow()), so this bot's
// logic only has to run once, at the moment the window opens (loot picked
// up after that, mid-window, is folded into that same read since
// hasPendingValue() is checked every tick the window is still open, not
// just once): if there's nothing worth protecting, take the ticket-only
// exit immediately rather than gamble it for zero additional upside; if
// there is, hold — this game has no priced-in EV model for loot yet (no
// real point values), so "hold whenever there's something to lose" is the
// more defensible read of "rational" than trying to fake a threshold
// against an unpriced payoff.
import { ESCAPE_AT, HeistRun, TICK_MS, resultOf, type Result } from '@/game/heistRun'
import { decideGreedyMove } from './greedyBot'

const MAX_TICKS = Math.ceil(65000 / TICK_MS)

function hasPendingValue(run: HeistRun): boolean {
  if (run.state.hands !== 'ticket') return true // already holding a wallet/painting/both
  if (run.state.heldItem) return true // already holding a mystery item
  const lootPending = Object.values(run.lootPlan).some((v) => !run.state.taken[v])
  const itemPending = Boolean(run.itemPlan) && run.usedItemsThisRun.length === 0 && !run.state.heldItem
  return lootPending || itemPending
}

export type RationalTrialResult = {
  seed: number
  ticketed: boolean // mode === 'paid', regardless of what (if anything) came with it
  lootAvailable: boolean
  lootPickedUp: boolean // ever picked up this run, regardless of whether it was kept
  lootKept: boolean // loot was available AND banked (ticketed with hands !== 'ticket')
  crossed: number
  outcome: string
  ticks: number
  reachedTenth: boolean
  tickAtTenth: number | null
  reachedCommitted: boolean
  result: Result
}

export function runRationalBotTrial(seed?: number, paintingRoll: () => boolean = () => false): RationalTrialResult {
  const run = new HeistRun(seed, paintingRoll)
  run.soundOn = false // headless in Node; when run live in a browser (e.g. /stats), this stops it from opening a real AudioContext per trial
  const lootAvailable = Object.keys(run.lootPlan).length > 0
  let ticks = 0
  let tickAtTenth: number | null = null
  let reachedCommitted = false

  while (run.live() && ticks < MAX_TICKS) {
    if (tickAtTenth === null && run.state.crossed >= ESCAPE_AT) tickAtTenth = run.tick
    if (!reachedCommitted && run.state.mode === 'committed') reachedCommitted = true
    if (run.state.mode === 'armed' && !hasPendingValue(run)) {
      // Nothing worth protecting — lock in the ticket now rather than risk
      // it for zero additional upside.
      run.escapeNow()
      break
    }
    const dir = decideGreedyMove(run)
    if (dir) run.onKey(dir)
    else if (!run.started) run.onKey('ArrowUp')
    if (run.state.heldItem) run.useItem()
    run.advance()
    ticks++
  }

  const ticketed = run.state.mode === 'paid'
  return {
    seed: run.seed,
    ticketed,
    lootAvailable,
    lootPickedUp: run.pickedUpLootEver,
    lootKept: ticketed && run.state.hands !== 'ticket',
    crossed: run.state.crossed,
    outcome: ticketed ? 'ticketed' : run.state.outcome,
    ticks,
    reachedTenth: tickAtTenth !== null,
    tickAtTenth,
    reachedCommitted,
    result: resultOf(run),
  }
}
