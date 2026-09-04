// Where a real play/demo run actually gets its painting/mystery-item drop
// decisions from — P2. DEMO is stakes:false by definition (no ticket, no
// wallet payout, no ledger write — see the top of DECISIONS.md's P0-P2
// section), so it never touches the shared global counters either: rolling
// them for a run that can't bank anything would just spend a slot the real
// economy is tracking, for nothing. Same when Supabase isn't configured at
// all — HeistRun's own local defaults apply, exactly as before P1/P2.
import { HeistRun, ITEM_ORDER, type ItemKey } from './heistRun'
import { rollGlobalDrop } from './globalDrops'
import { isSupabaseConfigured } from '@/lib/supabase'

export async function buildRun(demo: boolean, seed?: number): Promise<HeistRun> {
  if (demo || !isSupabaseConfigured()) return new HeistRun(seed)

  const [paintingHit, ...itemHits] = await Promise.all([
    rollGlobalDrop('painting'),
    ...ITEM_ORDER.map((key) => rollGlobalDrop(key)),
  ])
  const itemResults = new Map<ItemKey, boolean>(ITEM_ORDER.map((key, i) => [key, itemHits[i]]))

  return new HeistRun(seed, () => paintingHit, false, (item) => itemResults.get(item) ?? false)
}
