// GET -> { balance, deposits, withdrawals, onchainUsdg } for the
// session's address — see DECISIONS.md P5/P8. balance is sum(delta) over
// every ledger row for this address, computed here, never stored — the
// ledger itself is the only source of truth (see DECISIONS.md P5).
// deposits/withdrawals are broken out separately for the (currently
// greyed-out, P7) wallet UI to show; both are always 0 today since
// neither payment path is wired to a real contract yet. onchainUsdg is a
// different, real number: the address's actual USDG balance read live
// from Robinhood Chain (header wallet display) — null if the read fails
// (RPC hiccup, etc.), never 0 by default for a failure.
import { NextResponse } from 'next/server'
import { getOnchainUsdgBalance } from '@/lib/onchainUsdg'
import { getSessionAddress } from '@/lib/requireSession'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  const address = await getSessionAddress()
  if (!address) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Not configured on this deployment.' }, { status: 503 })

  const [ledgerResult, onchainUsdg] = await Promise.all([
    admin.from('ledger').select('delta, reason').eq('address', address),
    getOnchainUsdgBalance(address),
  ])
  const { data: rows, error } = ledgerResult
  if (error) return NextResponse.json({ error: 'Lookup failed.' }, { status: 500 })

  let balance = 0
  let deposits = 0
  let withdrawals = 0
  for (const row of rows ?? []) {
    const delta = Number(row.delta)
    balance += delta
    if (row.reason === 'deposit') deposits += delta
    if (row.reason === 'withdraw') withdrawals += Math.abs(delta)
  }

  return NextResponse.json({ balance, deposits, withdrawals, onchainUsdg })
}
