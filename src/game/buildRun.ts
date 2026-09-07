// Where a real play/demo run actually gets its painting/mystery-item drop
// decisions from — P2, reworked for P5. DEMO is stakes:false by
// definition (no ticket, no wallet payout, no ledger write — see the top
// of DECISIONS.md's P0-P2 section), so it never touches the shared global
// counters either: rolling them for a run that can't bank anything would
// just spend a slot the real economy is tracking, for nothing.
//
// PLAY no longer rolls its own drops client-side (P5: the client never
// decides its own drops, or its own seed) — /api/play/start does that
// server-side and hands the results back in `preRolled`, alongside the
// seed. This function's job for PLAY is now just "construct the engine
// with what the server already decided," not "go decide it." The old
// client-rolling path only survives as the fallback for when Supabase
// isn't configured (local dev without env vars) — same degrade-gracefully
// behavior as everywhere else in this codebase.
import { HeistRun, ITEM_ORDER, type ItemKey } from './heistRun'
import { rollGlobalDrop } from './globalDrops'
import { isSupabaseConfigured } from '@/lib/supabase'

export type PreRolledDrops = { paintingHit: boolean; itemHits: Record<ItemKey, boolean> }

export async function buildRun(demo: boolean, seed?: number, preRolled?: PreRolledDrops): Promise<HeistRun> {
  if (preRolled) {
    return new HeistRun(seed, () => preRolled.paintingHit, false, (item) => preRolled.itemHits[item] ?? false)
  }
  if (demo || !isSupabaseConfigured()) return new HeistRun(seed)

  const [paintingHit, ...itemHits] = await Promise.all([
    rollGlobalDrop('painting'),
    ...ITEM_ORDER.map((key) => rollGlobalDrop(key)),
  ])
  const itemResults = new Map<ItemKey, boolean>(ITEM_ORDER.map((key, i) => [key, itemHits[i]]))

  return new HeistRun(seed, () => paintingHit, false, (item) => itemResults.get(item) ?? false)
}
