// Username + lifetime stats + ticket tracking, scoped to the connected
// identity when there is one (see identity.ts) and to an anonymous "guest"
// bucket otherwise. "Stolen" and "winnings" stats only count runs that
// actually kept the loot (survived with it) — matching the same rule as the
// loot itself: escaping forfeits it, so it was never really kept.
//
// P1: the server (Supabase, see DECISIONS.md P1) is authoritative once an
// address is connected. localStorage stays as the fast local cache reads
// always go through — reconcileIdentity() pulls the server's record into it
// once, at connect time ("réconcilié au chargement"), and every write here
// pushes to the server too (fire-and-forget — a slow/failed network call
// should never block the local write or the UI). Guests (no address) have
// nothing to key a server row by, so they stay local-only, same as always.
// When Supabase isn't configured (no env vars — local dev, or a deployment
// that hasn't set them), every push is a no-op and reconcileIdentity() falls
// back to the original local-only claim behavior — see getSupabase().
import { getSupabase } from '@/lib/supabase'
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

// ---------------------------------------------------------- server pushes
// Fire-and-forget: a swallowed rejection here means this write only made it
// as far as the local cache this time, which is exactly the point of a
// cache the server reconciles later rather than a strict two-phase commit.
function pushUsername(address: string, username: string) {
  const supabase = getSupabase()
  if (!supabase) return
  void supabase.from('profiles').upsert({ address, username, updated_at: new Date().toISOString() }).then(() => {})
}

function pushStats(address: string, stats: ProfileStats) {
  const supabase = getSupabase()
  if (!supabase) return
  void supabase.from('stats').upsert({
    address,
    games_played: stats.gamesPlayed,
    games_won: stats.gamesWon,
    total_crossings: stats.totalCrossings,
    wallets_stolen: stats.walletsStolen,
    wallet_winnings_total: stats.walletWinningsTotal,
    paintings_stolen: stats.paintingsStolen,
    updated_at: new Date().toISOString(),
  }).then(() => {})
}

function pushTicketsToday(address: string, day: string, count: number) {
  const supabase = getSupabase()
  if (!supabase) return
  void supabase.from('tickets_daily').upsert({ address, day, count }).then(() => {})
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
  const identity = getIdentity()
  if (identity) pushUsername(identity.address, trimmed)
}

export function getStats(): ProfileStats {
  return { ...emptyStats(), ...(readJson<Partial<ProfileStats>>(scoped(STATS_BASE)) ?? {}) }
}

function saveStats(stats: ProfileStats) {
  writeJson(scoped(STATS_BASE), stats)
  const identity = getIdentity()
  if (identity) pushStats(identity.address, stats)
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
  const today = todayKey()
  const count = state.date === today ? state.count + 1 : 1
  const bestDay = Math.max(state.bestDay, count)
  saveTickets({ date: today, count, bestDay })
  const identity = getIdentity()
  if (identity) pushTicketsToday(identity.address, today, count)
  return count
}

function writeUsernameLocal(suffix: string, username: string) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(USERNAME_BASE + suffix, username) } catch { /* unavailable */ }
}

function statsFromRow(row: Record<string, unknown>): ProfileStats {
  return {
    gamesPlayed: Number(row.games_played) || 0,
    gamesWon: Number(row.games_won) || 0,
    totalCrossings: Number(row.total_crossings) || 0,
    walletsStolen: Number(row.wallets_stolen) || 0,
    walletWinningsTotal: Number(row.wallet_winnings_total) || 0,
    paintingsStolen: Number(row.paintings_stolen) || 0,
  }
}

/** Call right after a successful connect. Server configured: the server is
 *  authoritative — a returning address's existing record (profile, stats,
 *  every daily ticket row) is pulled down and overwrites the local cache
 *  outright; a first-time address has nothing to pull, so the guest
 *  session's progress up to this moment is written to the server once
 *  (claiming it) as well as kept locally. No server configured: falls back
 *  to the original local-only behavior — a returning address's local
 *  record (if this browser has seen it before) wins over the guest bucket;
 *  otherwise the guest snapshot is copied in the same way. */
export async function reconcileIdentity(identity: Identity, guestSnapshot: { username: string | null; stats: ProfileStats; tickets: TicketState }): Promise<void> {
  const suffix = `::${identity.address}`
  const supabase = getSupabase()

  if (!supabase) {
    const hasLocalRecord = readJson(STATS_BASE + suffix) !== null || readJson(TICKETS_BASE + suffix) !== null ||
      (typeof window !== 'undefined' && window.localStorage.getItem(USERNAME_BASE + suffix) !== null)
    if (hasLocalRecord) return
    if (guestSnapshot.username) writeUsernameLocal(suffix, guestSnapshot.username)
    writeJson(STATS_BASE + suffix, guestSnapshot.stats)
    writeJson(TICKETS_BASE + suffix, guestSnapshot.tickets)
    return
  }

  const [{ data: profileRow }, { data: statsRow }, { data: ticketRows }] = await Promise.all([
    supabase.from('profiles').select('username').eq('address', identity.address).maybeSingle(),
    supabase.from('stats').select('*').eq('address', identity.address).maybeSingle(),
    supabase.from('tickets_daily').select('day,count').eq('address', identity.address),
  ])

  const hasServerRecord = profileRow !== null || statsRow !== null || Boolean(ticketRows?.length)
  if (hasServerRecord) {
    if (profileRow?.username) writeUsernameLocal(suffix, profileRow.username)
    writeJson(STATS_BASE + suffix, statsRow ? statsFromRow(statsRow) : emptyStats())
    const today = todayKey()
    const todayRow = ticketRows?.find((r) => r.day === today)
    const bestDay = ticketRows?.length ? Math.max(...ticketRows.map((r) => r.count)) : 0
    writeJson(TICKETS_BASE + suffix, { date: today, count: todayRow?.count ?? 0, bestDay })
    return
  }

  // First-time connect: claim the guest session's progress, locally and on the server.
  if (guestSnapshot.username) writeUsernameLocal(suffix, guestSnapshot.username)
  writeJson(STATS_BASE + suffix, guestSnapshot.stats)
  writeJson(TICKETS_BASE + suffix, guestSnapshot.tickets)
  await Promise.all([
    supabase.from('profiles').insert({ address: identity.address, username: guestSnapshot.username }),
    supabase.from('stats').insert({ address: identity.address, ...{
      games_played: guestSnapshot.stats.gamesPlayed,
      games_won: guestSnapshot.stats.gamesWon,
      total_crossings: guestSnapshot.stats.totalCrossings,
      wallets_stolen: guestSnapshot.stats.walletsStolen,
      wallet_winnings_total: guestSnapshot.stats.walletWinningsTotal,
      paintings_stolen: guestSnapshot.stats.paintingsStolen,
    } }),
    guestSnapshot.tickets.count > 0
      ? supabase.from('tickets_daily').insert({ address: identity.address, day: guestSnapshot.tickets.date, count: guestSnapshot.tickets.count })
      : Promise.resolve(null),
  ])
}

/** Snapshot of whatever's active right now (guest or already-connected) —
 *  call this *before* switching identity, so reconcileIdentity() has the
 *  pre-connect state to copy in. */
export function snapshotActive(): { username: string | null; stats: ProfileStats; tickets: TicketState } {
  return { username: getUsername(), stats: getStats(), tickets: loadTickets() }
}
