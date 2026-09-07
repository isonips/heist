// POST { ticket, actions } -> { result }. The one place a PLAY run's
// outcome becomes real — see DECISIONS.md P5. The client sends back the
// ticket /api/play/start issued plus its recorded action log; every fact
// this route trusts (seed, runId, which items/painting dropped, the
// player's address) comes from the ticket's *signature*, never from the
// request body directly. The outcome itself is computed here, by
// replay(seed, actions, ...) — the same pure engine function the
// determinism harness runs 200 seeds through — not read off anything the
// client reports about how its own run went.
import { NextResponse } from 'next/server'
import { replay, type ItemKey, type ReplayInput, type Result } from '@/game/heistRun'
import { BONUS_DECAY_PCT_PER_DAY, BONUS_MAX_PCT, BONUS_WIN_PCT, PLAY_PRICE_USDG } from '@/game/economy'
import { getSessionAddress } from '@/lib/requireSession'
import { verifyPlayTicket } from '@/lib/playTicket'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysBetweenUTC(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)
  return Math.max(0, Math.round(ms / 86400000))
}

function walletPayout(result: Result): number {
  if (result.hands !== 'wallet' && result.hands !== 'both') return 0
  if (result.walletOutcome === 'refund') return result.walletAmount
  if (result.walletOutcome === 'double') return result.walletAmount * 2
  return 0
}

export async function POST(req: Request) {
  const address = await getSessionAddress()
  if (!address) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Not configured on this deployment (SUPABASE_SERVICE_ROLE_KEY).' }, { status: 503 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 })
  }
  const { ticket, actions } = (body ?? {}) as { ticket?: unknown; actions?: unknown }
  if (typeof ticket !== 'string') return NextResponse.json({ error: 'ticket is required.' }, { status: 400 })
  if (!Array.isArray(actions)) return NextResponse.json({ error: 'actions is required.' }, { status: 400 })

  const decoded = verifyPlayTicket(ticket, address)
  if (!decoded) return NextResponse.json({ error: 'Invalid or expired ticket.' }, { status: 401 })

  // Idempotent: a retried finish() for the same run returns the
  // already-computed result instead of reprocessing it.
  const { data: cached } = await admin.from('play_results').select('result').eq('run_id', decoded.runId).maybeSingle()
  if (cached) return NextResponse.json({ result: cached.result })

  const result = replay(
    decoded.seed,
    actions as ReplayInput[],
    () => decoded.paintingHit,
    (item: ItemKey) => decoded.itemHits[item],
  )

  const won = result.mode === 'paid'
  const payout = walletPayout(result)

  // The 'play' ledger row IS the idempotency gate — its (reason, ref)
  // unique constraint is what actually stops a double-payout if two
  // finish() calls for the same run race each other; the play_results
  // check above is the fast path, not the guarantee.
  const { error: playLedgerErr } = await admin.from('ledger').insert({ address, delta: -PLAY_PRICE_USDG, reason: 'play', ref: decoded.runId })
  if (playLedgerErr) {
    if (playLedgerErr.code !== '23505') return NextResponse.json({ error: 'Could not record this run.' }, { status: 500 })
    // Unique-violation on (reason, ref) — another request already processed this runId.
    const { data: raced } = await admin.from('play_results').select('result').eq('run_id', decoded.runId).maybeSingle()
    if (raced) return NextResponse.json({ result: raced.result })
    return NextResponse.json({ error: 'This run was already processed.' }, { status: 409 })
  }

  if (payout > 0) {
    await admin.from('ledger').insert({ address, delta: payout, reason: 'loot', ref: decoded.runId })
  }

  // Haul (P6): the mystery item actually earned this run, if any, read
  // off the server-verified result — never a client claim. The engine's
  // own "one item per run" rule means this is 0 or 1 entries.
  const earnedItem = result.usedItemsThisRun[0] ?? result.heldItem
  if (earnedItem) {
    await admin.from('haul_items').upsert(
      { address, item_type: earnedItem, seed: decoded.seed, run_id: decoded.runId },
      { onConflict: 'run_id', ignoreDuplicates: true },
    )
  }

  // Ticket (P4): any win grants one, escape or held-to-end alike — see
  // heistRun.ts's own rule, unchanged, just recorded server-side now.
  const today = todayUTC()
  if (won) {
    const { data: existingTickets } = await admin.from('tickets_daily').select('count').eq('address', address).eq('day', today).maybeSingle()
    await admin.from('tickets_daily').upsert({ address, day: today, count: (existingTickets?.count ?? 0) + 1 })
  }

  // Stats + bonus (P4): decay since the last recorded play, then +10% if
  // this one was a win, floor 0 / cap 100.
  const { data: statsRow } = await admin.from('stats').select('*').eq('address', address).maybeSingle()
  const prevBonus = statsRow?.bonus_pct ?? 0
  const lastActiveDay = statsRow?.updated_at ? String(statsRow.updated_at).slice(0, 10) : today
  const daysSince = daysBetweenUTC(lastActiveDay, today)
  let bonus = Math.max(0, prevBonus - BONUS_DECAY_PCT_PER_DAY * daysSince)
  if (won) bonus = Math.min(BONUS_MAX_PCT, bonus + BONUS_WIN_PCT)

  const walletKept = won && (result.hands === 'wallet' || result.hands === 'both')
  const paintingKept = won && (result.hands === 'painting' || result.hands === 'both')
  const newStats = {
    gamesPlayed: (statsRow?.games_played ?? 0) + 1,
    gamesWon: (statsRow?.games_won ?? 0) + (won ? 1 : 0),
    totalCrossings: (statsRow?.total_crossings ?? 0) + result.crossed,
    walletsStolen: (statsRow?.wallets_stolen ?? 0) + (walletKept ? 1 : 0),
    walletWinningsTotal: (statsRow?.wallet_winnings_total ?? 0) + payout,
    paintingsStolen: (statsRow?.paintings_stolen ?? 0) + (paintingKept ? 1 : 0),
    bonusPct: bonus,
  }
  await admin.from('stats').upsert({
    address,
    games_played: newStats.gamesPlayed,
    games_won: newStats.gamesWon,
    total_crossings: newStats.totalCrossings,
    wallets_stolen: newStats.walletsStolen,
    wallet_winnings_total: newStats.walletWinningsTotal,
    paintings_stolen: newStats.paintingsStolen,
    bonus_pct: newStats.bonusPct,
    updated_at: new Date().toISOString(),
  })

  await admin.from('play_results').insert({ run_id: decoded.runId, address, seed: decoded.seed, result })

  const { data: ticketsRow } = await admin.from('tickets_daily').select('count').eq('address', address).eq('day', today).maybeSingle()

  return NextResponse.json({ result, stats: newStats, ticketsToday: ticketsRow?.count ?? 0 })
}
