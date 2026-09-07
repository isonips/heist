// POST { code } -> { ok, unlocked, linked? }. Redeems a code for the
// session's address — see DECISIONS.md P4. A 'manual' code unlocks
// immediately (lifetime_unlocked + bonus starts at 50%, see
// src/game/economy.ts). A 'ten_wins'/'referral' code instead links
// referred_by to the code's issuer; the actual unlock for that address
// fires later, automatically, once its own volume crosses
// REFERRAL_VOLUME_USDG (see /api/play/finish).
import { NextResponse } from 'next/server'
import { BONUS_START_WITH_CODE_PCT } from '@/game/economy'
import { getSessionAddress } from '@/lib/requireSession'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

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
  const { code } = (body ?? {}) as { code?: unknown }
  if (typeof code !== 'string' || !code.trim()) return NextResponse.json({ error: 'code is required.' }, { status: 400 })
  const normalized = code.trim().toUpperCase()

  const { data: profileRow } = await admin.from('profiles').select('lifetime_unlocked').eq('address', address).maybeSingle()
  if (profileRow?.lifetime_unlocked) return NextResponse.json({ error: 'Already unlocked.' }, { status: 409 })

  const { data: codeRow } = await admin.from('codes').select('*').eq('code', normalized).maybeSingle()
  if (!codeRow) return NextResponse.json({ error: 'Invalid code.' }, { status: 404 })
  if (codeRow.redeemed_by) return NextResponse.json({ error: 'This code has already been used.' }, { status: 409 })
  if (codeRow.issuer_address === address) return NextResponse.json({ error: 'You cannot redeem your own code.' }, { status: 400 })

  // Claim it — the `.is('redeemed_by', null)` guard makes this the
  // idempotency gate under a race (two redeem attempts for the same code
  // at once): only one update actually matches a row.
  const { data: claimed } = await admin
    .from('codes')
    .update({ redeemed_by: address, redeemed_at: new Date().toISOString() })
    .eq('code', normalized)
    .is('redeemed_by', null)
    .select()
    .maybeSingle()
  if (!claimed) return NextResponse.json({ error: 'This code has already been used.' }, { status: 409 })

  if (codeRow.source === 'manual') {
    await admin.from('profiles').upsert({ address, lifetime_unlocked: true })
    const { data: statsRow } = await admin.from('stats').select('bonus_pct').eq('address', address).maybeSingle()
    await admin.from('stats').upsert({ address, bonus_pct: Math.max(statsRow?.bonus_pct ?? 0, BONUS_START_WITH_CODE_PCT) })
    return NextResponse.json({ ok: true, unlocked: true })
  }

  await admin.from('profiles').upsert({ address, referred_by: codeRow.issuer_address })
  return NextResponse.json({ ok: true, unlocked: false, linked: true })
}
