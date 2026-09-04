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
//
// SAFE_LEAD_S defaults to 0 — i.e. no proactive mid-push bailout — and
// that default is itself a finding, not an assumption: an earlier version
// of this bot used 13s (the game's own far/mid alert boundary) as an
// interrupt threshold, re-evaluated every tick, and it masked
// LOOT_ESCAPE_AT's effect almost entirely (lootKeptRate ~0% for every
// value 11-16 tested — see CALIBRATION.md's P0 follow-up). The reason: a
// fixed threshold calibrated for the OLD open-ended "survive to the
// clock" goal fires on the very first tick after arming regardless of how
// close LOOT_ESCAPE_AT is, because median lead is already below 13s by
// crossing 10. That's not rational caution for a BOUNDED goal of one to a
// few more crossings — bailing early there doesn't meaningfully reduce
// risk (both paths take a similar number of ticks to actually reach
// safety), it just forfeits loot for certain in runs that would often
// have succeeded anyway. A genuinely rational bot commits once it decides
// the bounded push is worth it (hasPendingValue) and doesn't second-guess
// every tick afterward — same principle as not aborting a short sprint
// halfway because of a stitch. This isn't a full Bellman-optimal solve of
// the underlying MDP either (that needs its own P(survive | lead, ticks
// left) study), but it's the more defensible reading of "rational" for
// this specific bounded-goal shape, and the parameter stays overridable
// for exactly this kind of sensitivity check.
import { ESCAPE_AT, HeistRun, LOOT_ESCAPE_AT, TICK_MS, resultOf, type Result } from '@/game/heistRun'
import { decideGreedyMove } from './greedyBot'

const MAX_TICKS = Math.ceil(65000 / TICK_MS)
const SAFE_LEAD_S = 0

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
  secsLeftAtTenth: number | null
  result: Result
}

// lootEscapeAt mirrors LOOT_ESCAPE_AT exactly by default — it exists as a
// parameter only so the sweep script (measure.ts / a one-off script) can
// try other values without re-editing heistRun.ts by hand for each one.
// It must always be passed the same value HeistRun's own escapeNow()/
// clock() are using (LOOT_ESCAPE_AT itself, unless that constant is also
// temporarily overridden the same way for the sweep), or the bot's
// decision and the actual game rule it's being measured against drift
// apart — see CALIBRATION.md's P0 sweep for how this was actually run.
export function runRationalBotTrial(seed?: number, paintingRoll: () => boolean = () => false, lootEscapeAt: number = LOOT_ESCAPE_AT, safeLeadS: number = SAFE_LEAD_S): RationalTrialResult {
  const run = new HeistRun(seed, paintingRoll)
  run.soundOn = false // headless in Node; when run live in a browser (e.g. /stats), this stops it from opening a real AudioContext per trial
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
      if (run.state.crossed >= lootEscapeAt) {
        // The bounded goal is met — loot's secured the instant you escape
        // from here, so there's no reason left to keep risking the ticket.
        run.escapeNow()
        break
      }
      if (run.secsToArrest() <= safeLeadS) {
        // Off (safeLeadS=0) by default — see the file comment. Kept as an
        // override point for the sensitivity sweep, and for the pathological
        // case of a non-zero threshold that's already this close to being
        // caught outright regardless of choice.
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
    lootPickedUp: run.pickedUpLootEver,
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
