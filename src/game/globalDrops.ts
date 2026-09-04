// P2: the painting and each of the five mystery items each have a global
// counter across every game, on the server (see DECISIONS.md P2 and the
// roll_global_drop() function in the Supabase migration) — never a
// per-run local roll based on one player's own performance.
//
// This only calls the server; there's no local fallback logic in here on
// purpose. When Supabase isn't configured, or a run is a stakes-free DEMO,
// the caller (HeistGame.tsx) simply doesn't call this at all and lets
// HeistRun fall back to its own built-in local defaults (the seeded
// per-run roll for items, the local counter stand-in for the painting) —
// exactly the behavior this codebase already had before a backend existed.
import { getSupabase } from '@/lib/supabase'
import type { ItemKey } from './heistRun'

export type DropKey = ItemKey | 'painting'

/** Resolves false (no drop, safe default) if the call fails for any
 *  reason — a network hiccup should never block starting a run, and a
 *  missed roll here just means that game's counters don't advance, not
 *  that anything crashes. */
export async function rollGlobalDrop(key: DropKey): Promise<boolean> {
  const supabase = getSupabase()
  if (!supabase) return false
  try {
    const { data, error } = await supabase.rpc('roll_global_drop', { p_item_key: key })
    if (error) return false
    return Boolean(data)
  } catch {
    return false
  }
}
