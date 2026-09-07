// GET -> { lifetimeUnlocked, issuedCode } for the session's address.
// issuedCode is the ten_wins code this address earned (if any) and
// hasn't been redeemed by someone else yet — the one thing worth showing
// them to share.
import { NextResponse } from 'next/server'
import { getSessionAddress } from '@/lib/requireSession'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  const address = await getSessionAddress()
  if (!address) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Not configured on this deployment.' }, { status: 503 })

  const [{ data: profileRow }, { data: codeRow }] = await Promise.all([
    admin.from('profiles').select('lifetime_unlocked').eq('address', address).maybeSingle(),
    admin.from('codes').select('code').eq('issuer_address', address).eq('source', 'ten_wins').is('redeemed_by', null).maybeSingle(),
  ])

  return NextResponse.json({
    lifetimeUnlocked: profileRow?.lifetime_unlocked ?? false,
    issuedCode: codeRow?.code ?? null,
  })
}
