// GET -> aggregate stats for the /admin panel. Session-gated (a signed-in
// address) AND allowlist-gated (isAdminAddress) — the panel itself hides
// non-admins client-side too, but the data has to be denied server-side
// regardless, since a client-side-only gate is trivial to bypass by
// hitting this route directly.
import { NextResponse } from 'next/server'
import { isAdminAddress } from '@/lib/adminAuth'
import { PLAY_PRICE_USDG, TREASURY_PCT } from '@/game/economy'
import { getSessionAddress } from '@/lib/requireSession'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function GET() {
  const address = await getSessionAddress()
  if (!address || !isAdminAddress(address)) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Not configured on this deployment.' }, { status: 503 })

  const today = todayUTC()
  const [playRows, redistRows, drawToday, drawSettled, bestResult] = await Promise.all([
    admin.from('ledger').select('address').eq('reason', 'play'),
    admin.from('ledger').select('delta').in('reason', ['loot', 'prize']),
    admin.from('draw_days').select('contributions').eq('day', today).maybeSingle(),
    admin.from('draw_days').select('rollover').not('ran_at', 'is', null).order('day', { ascending: false }).limit(1).maybeSingle(),
    // A real DB-side "order by the JSON field, take the top one" — not a
    // client-side scan over a page of rows, which would quietly give the
    // wrong answer once play_results outgrows whatever page size was
    // fetched. See the admin_best_player_rpc migration.
    admin.rpc('admin_best_player'),
  ])

  const gamesPlayed = playRows.data?.length ?? 0
  const uniquePlayers = new Set((playRows.data ?? []).map((r) => r.address)).size
  const totalRedistributed = (redistRows.data ?? []).reduce((sum, r) => sum + Number(r.delta), 0)
  const pot = Number(drawSettled.data?.rollover ?? 0) + Number(drawToday.data?.contributions ?? 0)
  // Not tracked per-transaction anywhere yet — HeistPlay.sol's treasury
  // cut only exists once the contract is actually deployed and play()
  // calls happen on-chain; this is a projection from today's config, not
  // a real recorded figure, and reads 0 while PLAY_PRICE_USDG is.
  const projectedFees = gamesPlayed * PLAY_PRICE_USDG * TREASURY_PCT

  const bestRow = (bestResult.data as { address: string; crossed: number }[] | null)?.[0] ?? null
  const bestPlayer = bestRow ? { address: bestRow.address, crossed: bestRow.crossed } : null
  let bestPlayerUsername: string | null = null
  if (bestPlayer) {
    const { data: profile } = await admin.from('profiles').select('username').eq('address', bestPlayer.address).maybeSingle()
    bestPlayerUsername = profile?.username ?? null
  }

  return NextResponse.json({
    gamesPlayed,
    uniquePlayers,
    pot,
    totalRedistributed,
    projectedFees,
    bestPlayer: bestPlayer ? { address: bestPlayer.address, username: bestPlayerUsername, crossed: bestPlayer.crossed } : null,
  })
}
