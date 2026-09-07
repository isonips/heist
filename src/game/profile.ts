// Username + lifetime stats + ticket tracking, scoped to the connected
// identity when there is one (see identity.ts) and to an anonymous "guest"
// bucket otherwise. "Stolen" and "winnings" stats only count runs that
// actually kept the loot (survived with it) — matching the same rule as the
// loot itself: escaping forfeits it, so it was never really kept.
//
// P5: the server is the only thing that writes stats/tickets/bonus now —
// /api/play/finish computes and stores them from a replay-verified
// outcome (see DECISIONS.md P5), never from a client's own account of how
// its run went. This file's job shrank to match: it's a local read cache
// (instant UI, no round-trip to show your own stats) that gets written
// from a server response (applyPlayResult, called right after a
// successful /api/play/finish) or read from the server at connect time
// (reconcileIdentity) — it never originates a write to profiles/stats/
// tickets_daily itself anymore. Guests (no address) can't play PLAY at
// all (P1's wallet gate), so they never have real stats to begin with;
// what's here for them is vestigial display state only.
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
  bonusPct: number
}

function emptyStats(): ProfileStats {
  return { gamesPlayed: 0, gamesWon: 0, totalCrossings: 0, walletsStolen: 0, walletWinningsTotal: 0, paintingsStolen: 0, bonusPct: 0 }
}

/** Every read/write in this file goes through this — the guest bucket
 *  (no suffix, same keys this file always used) when nothing's connected,
 *  an address-scoped bucket once something is. Callers never see the
 *  difference: getStats()/etc. don't take an identity argument, they just
 *  read whichever bucket is currently active. */
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

/** Guest-only: unlimited, local-only renames — there's no server row to
 *  protect until an address is connected. Once connected, use
 *  claimUsername() instead, which is permanent by design (see P2). */
export function setUsername(name: string): void {
  if (typeof window === 'undefined') return
  if (getIdentity()) return // connected: this path is guest-only, see claimUsername()
  const trimmed = name.trim().slice(0, 20)
  if (!trimmed) return
  try { window.localStorage.setItem(scoped(USERNAME_BASE), trimmed) } catch { /* unavailable */ }
}

/** Connected-only: claims a permanent, unique username through the session
 *  API (see /api/auth/username) — the server is the only thing that can
 *  actually guarantee uniqueness (DB unique index) and permanence (rejects
 *  if this address already has one). Never call this for a guest. */
export async function claimUsername(name: string): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Enter a name.' }
  let res: Response
  try {
    res = await fetch('/api/auth/username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: trimmed }),
    })
  } catch {
    return { ok: false, error: 'Network error — try again.' }
  }
  const data = (await res.json().catch(() => ({}))) as { username?: string; error?: string }
  if (!res.ok || !data.username) return { ok: false, error: data.error ?? 'Could not set username.' }
  try { window.localStorage.setItem(scoped(USERNAME_BASE), data.username) } catch { /* unavailable */ }
  return { ok: true, username: data.username }
}

export function getStats(): ProfileStats {
  return { ...emptyStats(), ...(readJson<Partial<ProfileStats>>(scoped(STATS_BASE)) ?? {}) }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD, UTC
}

type TicketState = { date: string; count: number; bestDay: number }

function loadTickets(): TicketState {
  const parsed = readJson<Partial<TicketState>>(scoped(TICKETS_BASE))
  return { date: parsed?.date ?? todayKey(), count: parsed?.count ?? 0, bestDay: parsed?.bestDay ?? 0 }
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

/** Call right after a successful POST /api/play/finish — writes the
 *  server's authoritative stats/bonus/ticket count into the local cache
 *  so the UI updates instantly without a second round-trip. This is the
 *  *only* place stats/tickets get written locally anymore; there is no
 *  optimistic client-side increment path left (see file header, P5). */
export function applyPlayResult(stats: ProfileStats, ticketsToday: number): void {
  writeJson(scoped(STATS_BASE), stats)
  const today = todayKey()
  const bestDay = Math.max(getBestDay(), ticketsToday)
  writeJson(scoped(TICKETS_BASE), { date: today, count: ticketsToday, bestDay })
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
    bonusPct: Number(row.bonus_pct) || 0,
  }
}

/** Call right after a successful connect — pulls the server's record (if
 *  this address has one) into the local cache. Read-only: it never writes
 *  to the server (see file header — a guest's pre-connect local progress
 *  is never "claimed" onto a server row anymore, since PLAY itself now
 *  requires being connected, so there's no real pre-connect PLAY history
 *  to claim; a first-time address' local cache is just left as the guest
 *  snapshot for continuity, purely cosmetic until a real server-verified
 *  game writes something authoritative). No server configured: same
 *  fallback idea, local-only. */
export async function reconcileIdentity(identity: Identity, guestSnapshot: { username: string | null; stats: ProfileStats; tickets: TicketState }): Promise<void> {
  const suffix = `::${identity.address}`
  const supabase = getSupabase()

  if (!supabase) {
    const hasLocalRecord = readJson(STATS_BASE + suffix) !== null || readJson(TICKETS_BASE + suffix) !== null ||
      (typeof window !== 'undefined' && window.localStorage.getItem(USERNAME_BASE + suffix) !== null)
    if (hasLocalRecord) return
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

  // First-time connect: no server record yet (PLAY requires a connection,
  // so there's nothing real to have earned before this moment) — carry
  // the guest bucket's cosmetic local state over for continuity, but
  // don't write anything server-side. The first real /api/play/finish
  // creates the actual server row.
  writeJson(STATS_BASE + suffix, guestSnapshot.stats)
  writeJson(TICKETS_BASE + suffix, guestSnapshot.tickets)
}

/** Snapshot of whatever's active right now (guest or already-connected) —
 *  call this *before* switching identity, so reconcileIdentity() has the
 *  pre-connect state to copy in. */
export function snapshotActive(): { username: string | null; stats: ProfileStats; tickets: TicketState } {
  return { username: getUsername(), stats: getStats(), tickets: loadTickets() }
}
