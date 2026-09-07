// GET -> the session address's kept mystery items, sealed: date and
// mint-batch status only, never itemType/rarity/effect (see DECISIONS.md
// P6 — "ne révèle ni type, ni rareté, ni effet"). This is enforced at the
// API layer, not just hidden in the UI, so there's no client-side leak to
// audit for later.
import { NextResponse } from 'next/server'
import { getSessionAddress } from '@/lib/requireSession'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  const address = await getSessionAddress()
  if (!address) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Not configured on this deployment (SUPABASE_SERVICE_ROLE_KEY).' }, { status: 503 })

  const { data, error } = await admin
    .from('haul_items')
    .select('ts, on_chain_batch')
    .eq('address', address)
    .order('ts', { ascending: false })
  if (error) return NextResponse.json({ error: 'Lookup failed.' }, { status: 500 })

  const items = (data ?? []).map((row) => ({ ts: row.ts as string, revealed: row.on_chain_batch !== null }))
  return NextResponse.json({ items })
}
