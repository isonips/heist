// POST -> settles yesterday's (UTC) draw, if it hasn't been already.
// Triggered by Vercel Cron (see vercel.json — daily, no manual step) and
// guarded by CRON_SECRET, which Vercel automatically sends as
// `Authorization: Bearer <CRON_SECRET>` on a scheduled invocation when
// that env var is set (see .env.example). Settling is idempotent: a day
// with `ran_at` already set is returned as-is, never reprocessed or
// re-paid — see DECISIONS.md P4 for the distinction between that
// idempotence and "rejouable" (pickDrawWinner() itself is a pure
// function anyone can re-run against the same seed/tickets and get the
// identical answer, for audit, independent of whether it's ever paid out
// again).
import { NextResponse } from 'next/server'
import { payoutForWinner, pickDrawWinner, seedForDrawDay, type TicketEntry } from '@/game/draw'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

function yesterdayUTC(): string {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10)
}

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'Not configured on this deployment (CRON_SECRET).' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Not configured on this deployment (SUPABASE_SERVICE_ROLE_KEY).' }, { status: 503 })

  const day = yesterdayUTC()

  const { data: existing } = await admin.from('draw_days').select('*').eq('day', day).maybeSingle()
  if (existing?.ran_at) return NextResponse.json({ day, alreadyRan: true, result: existing })

  // Rollover in: the most recent previously-settled day's leftover pot.
  // A gap of unplayed days (no draw_days row at all) just means 0 rolled
  // in, same as day one ever.
  const { data: lastSettled } = await admin
    .from('draw_days')
    .select('rollover')
    .not('ran_at', 'is', null)
    .lt('day', day)
    .order('day', { ascending: false })
    .limit(1)
    .maybeSingle()
  const openingPot = Number(lastSettled?.rollover ?? 0)
  const contributions = Number(existing?.contributions ?? 0)
  const pot = openingPot + contributions

  const { data: ticketRows } = await admin.from('tickets_daily').select('address, count').eq('day', day)
  const entries: TicketEntry[] = (ticketRows ?? []).map((r) => ({ address: r.address, count: r.count }))

  const seed = seedForDrawDay(day)
  const pick = pickDrawWinner(seed, entries)

  let winnerBonusPct = 0
  let payout = 0
  let rollover = pot

  if (pick.winnerAddress) {
    const { data: winnerStats } = await admin.from('stats').select('bonus_pct').eq('address', pick.winnerAddress).maybeSingle()
    winnerBonusPct = winnerStats?.bonus_pct ?? 0
    // No lifetime-unlock code system exists yet (P4) — every winner is
    // capped at half the pot today, per the brief's own stated fallback
    // for a winner without one. Not a workaround; wire a real lookup
    // here once codes exist.
    const hasLifetimeCode = false
    ;({ payout, rollover } = payoutForWinner(pot, winnerBonusPct, hasLifetimeCode))

    if (payout > 0) {
      await admin.from('ledger').insert({ address: pick.winnerAddress, delta: payout, reason: 'prize', ref: `draw:${day}` })
    }
  }

  const { data: settled } = await admin
    .from('draw_days')
    .upsert({
      day,
      seed,
      contributions,
      opening_pot: openingPot,
      total_tickets: pick.totalTickets,
      winner_address: pick.winnerAddress,
      winner_bonus_pct: winnerBonusPct,
      payout,
      rollover,
      ran_at: new Date().toISOString(),
    })
    .select()
    .single()

  return NextResponse.json({ day, alreadyRan: false, result: settled })
}
