// Server-only counterpart to src/game/globalDrops.ts — same atomic
// roll_global_drop() RPC, called from /api/play/start instead of the
// client (see DECISIONS.md P5: the client never decides its own drops).
// Uses the admin client rather than the anon one purely because we're
// already in a trusted server context with it available; the RPC itself
// is SECURITY DEFINER and safe to call either way (see DECISIONS.md P2).
import { getSupabaseAdmin } from './supabaseAdmin'
import { ITEM_ORDER, type ItemKey } from '@/game/heistRun'

export type DropKey = ItemKey | 'painting'

async function rollGlobalDropServer(key: DropKey): Promise<boolean> {
  const admin = getSupabaseAdmin()
  if (!admin) return false
  try {
    const { data, error } = await admin.rpc('roll_global_drop', { p_item_key: key })
    if (error) return false
    return Boolean(data)
  } catch {
    return false
  }
}

/** Rolls the painting and all five mystery items for one run, in
 *  parallel — same shape buildRun.ts used to roll client-side. */
export async function rollAllDropsServer(): Promise<{ paintingHit: boolean; itemHits: Record<ItemKey, boolean> }> {
  const [paintingHit, ...itemResults] = await Promise.all([
    rollGlobalDropServer('painting'),
    ...ITEM_ORDER.map((key) => rollGlobalDropServer(key)),
  ])
  const itemHits = Object.fromEntries(ITEM_ORDER.map((key, i) => [key, itemResults[i]])) as Record<ItemKey, boolean>
  return { paintingHit, itemHits }
}
