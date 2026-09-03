// Username + lifetime stats + today's ticket count. All local to this
// browser — there's no account system yet (phase 3: wallet-backed
// identity). "Stolen" and "winnings" stats only count runs that actually
// kept the loot (survived with it) — matching the same rule as the loot
// itself: escaping forfeits it, so it was never really kept.
const USERNAME_KEY = 'heist-username-v1'
const STATS_KEY = 'heist-stats-v1'
const TICKETS_KEY = 'heist-tickets-v1'

export type ProfileStats = {
  gamesPlayed: number
  totalCrossings: number
  walletsStolen: number
  walletWinningsTotal: number
  paintingsStolen: number
}

function emptyStats(): ProfileStats {
  return { gamesPlayed: 0, totalCrossings: 0, walletsStolen: 0, walletWinningsTotal: 0, paintingsStolen: 0 }
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
  crossings: number
  walletKept: boolean
  walletPayout: number
  paintingKept: boolean
}): ProfileStats {
  const stats = getStats()
  stats.gamesPlayed += 1
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

export function getTicketsToday(): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = window.localStorage.getItem(TICKETS_KEY)
    if (!raw) return 0
    const parsed = JSON.parse(raw) as { date: string; count: number }
    return parsed.date === todayKey() ? parsed.count : 0
  } catch {
    return 0
  }
}

export function recordTicketWon(): number {
  const count = getTicketsToday() + 1
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(TICKETS_KEY, JSON.stringify({ date: todayKey(), count })) } catch { /* unavailable */ }
  }
  return count
}
