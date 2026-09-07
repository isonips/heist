// Pure, DB-free daily-draw logic — same "pure function, tested separately
// from the DB/API glue" pattern as replay() in heistRun.ts. See
// DECISIONS.md P4. /api/draw/run is the only caller that matters in
// production; this file exists so the actual selection math can be
// reasoned about (and unit-tested) without a database in the loop.
import { nextInt, rngFromSeed } from './rng'

export type TicketEntry = { address: string; count: number }

export type DrawPick = {
  winnerAddress: string | null // null only if there were zero tickets that day
  winnerIndex: number | null
  totalTickets: number
}

/** Deterministic, seeded, weighted-by-ticket-count winner pick — same
 *  seed and same ticket list always reach the same winner ("rejouable:
 *  même graine, même gagnant"). Entries with more tickets are
 *  proportionally more likely, exactly like a raffle with that many
 *  physical tickets in the drum. */
export function pickDrawWinner(seed: number, entries: TicketEntry[]): DrawPick {
  const totalTickets = entries.reduce((sum, e) => sum + e.count, 0)
  if (totalTickets <= 0) return { winnerAddress: null, winnerIndex: null, totalTickets: 0 }
  const [pick] = nextInt(rngFromSeed(seed), totalTickets)
  let cursor = 0
  for (const entry of entries) {
    cursor += entry.count
    if (pick < cursor) return { winnerAddress: entry.address, winnerIndex: pick, totalTickets }
  }
  /* istanbul ignore next -- unreachable if entries/totalTickets agree */
  return { winnerAddress: null, winnerIndex: null, totalTickets }
}

/** The day's draw seed is derived from the date string alone — nothing
 *  about who played or how many tickets exist. FNV-1a: not a security
 *  boundary (the date is public), just a cheap, deterministic,
 *  well-distributed hash so "same day -> same seed" needs no storage
 *  round-trip to reproduce. */
export function seedForDrawDay(day: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < day.length; i++) {
    hash ^= day.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** The winner's bonus (0-100%) multiplies what they actually collect from
 *  the pot; whatever they don't collect rolls into tomorrow's pot. A
 *  winner without a lifetime-unlock code is additionally capped at half
 *  the pot regardless of bonus — see DECISIONS.md P4 for why
 *  `hasLifetimeCode` is hardcoded false at every call site today (the
 *  codes system itself isn't built yet, so nobody can have one; this is
 *  the brief's own stated fallback behavior, not a workaround). */
export function payoutForWinner(pot: number, bonusPct: number, hasLifetimeCode: boolean): { payout: number; rollover: number } {
  const bonusFraction = Math.max(0, Math.min(100, bonusPct)) / 100
  const cap = hasLifetimeCode ? pot : pot / 2
  const payout = Math.min(pot * bonusFraction, cap)
  return { payout, rollover: pot - payout }
}
