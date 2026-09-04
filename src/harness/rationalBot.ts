// P0: is the loot actually playable, for a bot that plays to maximize
// expected value rather than distance? The cautious bot (bot.ts) always
// escapes the instant it's armed — it never holds anything, so it can't
// answer this. The greedy bot (greedyBot.ts) never escapes voluntarily — it
// answers a different question (how far can a run go at all). This bot is
// the one that actually faces the real decision a player holding loot
// faces: escaping locks in the ticket and forfeits whatever's in hand;
// staying risks the ticket *and* the loot for a chance to bank both.
//
// Escaping without the ticket already secured (crossed < ESCAPE_AT) is
// never in play — the door isn't armed yet, there's nothing to decide.
// Once armed, the exit rule below is a threshold policy, not a full
// Bellman-optimal solve of the underlying MDP (that would need estimating
// P(survive to the clock | lead, ticks left), which needs its own separate
// simulation study to do honestly) — but it's not an arbitrary number
// either: SAFE_LEAD_S reuses the exact boundary the shipped game's own
// alerts() already treats as "no longer comfortably safe" (the far/mid
// split at 13s — see heistRun.ts). A rational player has no better signal
// than what the game actually shows them, so the bot uses the same one.
import { ESCAPE_AT, HeistRun, TICK_MS, resultOf, type Result } from '@/game/heistRun'
import { decideGreedyMove } from './greedyBot'

const MAX_TICKS = Math.ceil(65000 / TICK_MS)
const SAFE_LEAD_S = 13

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
  lootKept: boolean // loot was available AND banked (ticketed with hands !== 'ticket')
  crossed: number
  outcome: string
  ticks: number
  reachedTenth: boolean
  tickAtTenth: number | null
  secsLeftAtTenth: number | null
  result: Result
}

export function runRationalBotTrial(seed?: number, paintingRoll: () => boolean = () => false): RationalTrialResult {
  const run = new HeistRun(seed, paintingRoll)
  const lootAvailable = Object.keys(run.lootPlan).length > 0
  let ticks = 0
  let tickAtTenth: number | null = null
  let secsLeftAtTenth: number | null = null

  while (run.live() && ticks < MAX_TICKS) {
    if (tickAtTenth === null && run.state.crossed >= ESCAPE_AT) {
      tickAtTenth = run.tick
      secsLeftAtTenth = run.state.timeLeft
    }
    if (run.state.crossed >= ESCAPE_AT) {
      if (!hasPendingValue(run)) {
        // Nothing ever spawned this run, or whatever did is already
        // resolved — no upside left to risking the ticket at all.
        run.escapeNow()
        break
      }
      if (run.secsToArrest() <= SAFE_LEAD_S) {
        // The trade stops being worth it the moment it's no longer
        // comfortably safe — cash out rather than gamble further.
        run.escapeNow()
        break
      }
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
    lootKept: ticketed && run.state.hands !== 'ticket',
    crossed: run.state.crossed,
    outcome: ticketed ? 'ticketed' : run.state.outcome,
    ticks,
    reachedTenth: tickAtTenth !== null,
    tickAtTenth,
    secsLeftAtTenth,
    result: resultOf(run),
  }
}
