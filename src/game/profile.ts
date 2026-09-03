// Username + lifetime stats + ticket tracking. All local to this browser —
// there's no account system yet (phase 3: wallet-backed identity). "Stolen"
// and "winnings" stats only count runs that actually kept the loot
// (survived with it) — matching the same rule as the loot itself: escaping
// forfeits it, so it was never really kept.
const USERNAME_KEY = 'heist-username-v1'
const STATS_KEY = 'heist-stats-v1'
const TICKETS_KEY = 'heist-tickets-v1'

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

export function getUsername(): string | null {
  if (typeof window === 'undefined') return null
  try { return window.localStorage.getItem(USERNAME_KEY) } catch { return null }
}

export function setUsername(name: string): void {
  if (typeof window === 'undefined') return
  const trimmed = name.trim().slice(0, 20)
  if (!trimmed) return
  try { window.localStorage.setItem(USERNAME_KEY, trimmed) } catch { /* unavailable */ }
}

export function getStats(): ProfileStats {
  if (typeof window === 'undefined') return emptyStats()
  try {
    const raw = window.localStorage.getItem(STATS_KEY)
    return raw ? { ...emptyStats(), ...(JSON.parse(raw) as Partial<ProfileStats>) } : emptyStats()
  } catch {
    return emptyStats()
  }
}

function saveStats(stats: ProfileStats) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(STATS_KEY, JSON.stringify(stats)) } catch { /* unavailable */ }
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
  if (typeof window === 'undefined') return { date: todayKey(), count: 0, bestDay: 0 }
  try {
    const raw = window.localStorage.getItem(TICKETS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TicketState>
      return { date: parsed.date ?? todayKey(), count: parsed.count ?? 0, bestDay: parsed.bestDay ?? 0 }
    }
  } catch {
    // fall through
  }
  return { date: todayKey(), count: 0, bestDay: 0 }
}

function saveTickets(state: TicketState) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(TICKETS_KEY, JSON.stringify(state)) } catch { /* unavailable */ }
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
