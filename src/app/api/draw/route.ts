// GET -> { pot, previous } for anyone (no session required — P8 wants
// this visible to a disconnected visitor too). `pot` is today's running
// total: the most recent settled day's rollover plus whatever's
// accumulated so far today (increment_draw_contribution, called from
// /api/play/finish). `previous` is the last settled day's result, if
// any, for "yesterday's winner" display.
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function GET() {
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Not configured on this deployment.' }, { status: 503 })

  const today = todayUTC()
  const [{ data: todayRow }, { data: lastSettled }] = await Promise.all([
    admin.from('draw_days').select('contributions').eq('day', today).maybeSingle(),
    admin.from('draw_days').select('*').not('ran_at', 'is', null).order('day', { ascending: false }).limit(1).maybeSingle(),
  ])

  const openingPot = Number(lastSettled?.rollover ?? 0)
  const contributions = Number(todayRow?.contributions ?? 0)

  return NextResponse.json({
    pot: openingPot + contributions,
    previous: lastSettled
      ? {
          day: lastSettled.day,
          winnerAddress: lastSettled.winner_address,
          payout: lastSettled.payout,
          totalTickets: lastSettled.total_tickets,
        }
      : null,
  })
}
