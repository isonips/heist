// POST { itemType, seed, runId } -> records one kept mystery item against
// the session's address (see DECISIONS.md P6). Idempotent on runId (a run
// can earn at most one item, same as the game's own "one per run" rule —
// see heistRun.ts's itemAt()), so a retried/duplicate client call is a
// no-op, not a double-count. onChainBatch stays null: nothing is minted
// yet, this table just makes the eventual retroactive mint possible.
import { NextResponse } from 'next/server'
import { ITEM_ORDER, type ItemKey } from '@/game/heistRun'
import { getSessionAddress } from '@/lib/requireSession'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

const VALID_ITEMS = new Set<string>(ITEM_ORDER)

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
  const { itemType, seed, runId } = (body ?? {}) as { itemType?: unknown; seed?: unknown; runId?: unknown }
  if (typeof itemType !== 'string' || !VALID_ITEMS.has(itemType)) {
    return NextResponse.json({ error: 'itemType is invalid.' }, { status: 400 })
  }
  if (typeof seed !== 'number' || !Number.isFinite(seed)) {
    return NextResponse.json({ error: 'seed is required.' }, { status: 400 })
  }
  if (typeof runId !== 'string' || !runId) {
    return NextResponse.json({ error: 'runId is required.' }, { status: 400 })
  }

  const { error } = await admin
    .from('haul_items')
    .upsert({ address, item_type: itemType as ItemKey, seed, run_id: runId }, { onConflict: 'run_id', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: 'Could not record.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
