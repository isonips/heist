// Username + lifetime stats + ticket tracking, scoped to the connected
// identity when there is one (see identity.ts) and to an anonymous "guest"
// bucket otherwise. "Stolen" and "winnings" stats only count runs that
// actually kept the loot (survived with it) — matching the same rule as the
// loot itself: escaping forfeits it, so it was never really kept.
//
// There's no backend yet (see DECISIONS.md #4), so "the server" below is
// standing in for one: address-scoped localStorage keys play the role a
// database row keyed by address will play later. What's real regardless of
// backend is the *shape* — address is the primary key, and connecting
// reconciles a pre-existing guest session into that address exactly once
// (first connect claims local progress; a returning address's own record,
// once it exists, always wins over whatever's sitting in the guest bucket).
import { getIdentity, type Identity } from './identity'

const USERNAME_BASE = 'heist-username-v1'
const STATS_BASE = 'heist-stats-v1'
const TICKETS_BASE = 'heist-tickets-v1'

// Nominal — no payment system exists yet. "Total staked" is gamesPlayed x
// this, a projection of what it will cost once entries are real, not money
// that has actually moved.
export const ENTRY_FEE_USDG = 10

export type ProfileStats = {
  gamesPlayed: number
  gamesWon: number
  totalCrossings: number
  walletsStolen: number
  walletWinningsTotal: number
  paintingsStolen: number
}

function emptyStats(): ProfileStats {
  return { gamesPlayed: 0, gamesWon: 0, totalCrossings: 0, walletsStolen: 0, walletWinningsTotal: 0, paintingsStolen: 0 }
}

/** Every read/write in this file goes through this — the guest bucket
 *  (no suffix, same keys this file always used) when nothing's connected,
 *  an address-scoped bucket once something is. Callers never see the
 *  difference: getStats()/recordGameResult()/etc. don't take an identity
 *  argument, they just read whichever bucket is currently active. */
function scoped(base: string): string {
  const identity = getIdentity()
  return identity ? `${base}::${identity.address}` : base
}

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* unavailable */ }
}

export function getUsername(): string | null {
  if (typeof window === 'undefined') return null
  try { return window.localStorage.getItem(scoped(USERNAME_BASE)) } catch { return null }
}

export function setUsername(name: string): void {
  if (typeof window === 'undefined') return
  const trimmed = name.trim().slice(0, 20)
  if (!trimmed) return
  try { window.localStorage.setItem(scoped(USERNAME_BASE), trimmed) } catch { /* unavailable */ }
}

export function getStats(): ProfileStats {
  return { ...emptyStats(), ...(readJson<Partial<ProfileStats>>(scoped(STATS_BASE)) ?? {}) }
}

function saveStats(stats: ProfileStats) {
  writeJson(scoped(STATS_BASE), stats)
}

export function recordGameResult(opts: {
  won: boolean
  crossings: number
  walletKept: boolean
  walletPayout: number
  paintingKept: boolean
}): ProfileStats {
  const stats = getStats()
  stats.gamesPlayed += 1
  if (opts.won) stats.gamesWon += 1
  stats.totalCrossings += opts.crossings
  if (opts.walletKept) {
    stats.walletsStolen += 1
    stats.walletWinningsTotal += opts.walletPayout
  }
  if (opts.paintingKept) stats.paintingsStolen += 1
  saveStats(stats)
  return stats
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD, UTC
}

type TicketState = { date: string; count: number; bestDay: number }

function loadTickets(): TicketState {
  const parsed = readJson<Partial<TicketState>>(scoped(TICKETS_BASE))
  return { date: parsed?.date ?? todayKey(), count: parsed?.count ?? 0, bestDay: parsed?.bestDay ?? 0 }
}

function saveTickets(state: TicketState) {
  writeJson(scoped(TICKETS_BASE), state)
}

/** Tickets earned today (the nightly draw resets it — 0 once the date rolls over). */
export function getTicketsToday(): number {
  const state = loadTickets()
  return state.date === todayKey() ? state.count : 0
}

/** The most tickets ever earned in a single day, regardless of today's count. */
export function getBestDay(): number {
  return loadTickets().bestDay
}

export function recordTicketWon(): number {
  const state = loadTickets()
  const count = state.date === todayKey() ? state.count + 1 : 1
  const bestDay = Math.max(state.bestDay, count)
  saveTickets({ date: todayKey(), count, bestDay })
  return count
}

/** Call right after a successful connect. If this address already has a
 *  record (a returning wallet), that record wins untouched — it's the
 *  authoritative one now, whatever the guest bucket says. If it doesn't (a
 *  first-time connect), the guest session's progress up to this moment is
 *  copied in once, so connecting a wallet claims what was already played
 *  rather than starting over at zero. */
export function reconcileIdentity(identity: Identity, guestSnapshot: { username: string | null; stats: ProfileStats; tickets: TicketState }): void {
  const suffix = `::${identity.address}`
  const hasRecord = readJson(STATS_BASE + suffix) !== null || readJson(TICKETS_BASE + suffix) !== null || (typeof window !== 'undefined' && window.localStorage.getItem(USERNAME_BASE + suffix) !== null)
  if (hasRecord) return
  if (guestSnapshot.username) { try { window.localStorage.setItem(USERNAME_BASE + suffix, guestSnapshot.username) } catch { /* unavailable */ } }
  writeJson(STATS_BASE + suffix, guestSnapshot.stats)
  writeJson(TICKETS_BASE + suffix, guestSnapshot.tickets)
}

/** Snapshot of whatever's active right now (guest or already-connected) —
 *  call this *before* switching identity, so reconcileIdentity() has the
 *  pre-connect state to copy in. */
export function snapshotActive(): { username: string | null; stats: ProfileStats; tickets: TicketState } {
  return { username: getUsername(), stats: getStats(), tickets: loadTickets() }
}
