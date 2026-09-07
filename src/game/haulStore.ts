// Local stand-in for "recorded on-chain against the player's address" (code
// brief section 4b / phase 3) — no wallet, no ledger yet, so this just keeps
// a per-browser count via localStorage. MY HAUL reads real numbers from
// here rather than showing a permanent "not earned" placeholder.
//
// P6: once an address is connected, recordItemEarned() also pushes to
// /api/haul/record — the real, address-scoped, mint-ready record (see
// DECISIONS.md P6). This local count stays as-is for guests and as an
// always-available fallback; it's never the reveal itself (this file never
// knows or claims rarity/effect beyond the ItemKey the game already
// revealed to this browser at pickup — the *sealed* haul, with no type
// exposed at all, is what /api/haul returns).
import { getIdentity } from './identity'
import type { ItemKey } from './heistRun'

const STORAGE_KEY = 'heist-haul-v1'

export type HaulCounts = Record<ItemKey, number>

function emptyCounts(): HaulCounts {
  return { oldMan: 0, pileUp: 0, shortcut: 0, safe: 0, haul: 0 }
}

export function getHaul(): HaulCounts {
  if (typeof window === 'undefined') return emptyCounts()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? { ...emptyCounts(), ...(JSON.parse(raw) as Partial<HaulCounts>) } : emptyCounts()
  } catch {
    return emptyCounts()
  }
}

export function recordItemEarned(item: ItemKey, seed?: number, runId?: string): HaulCounts {
  const counts = getHaul()
  counts[item] += 1
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(counts)) } catch { /* storage unavailable */ }
  }
  const identity = getIdentity()
  if (identity && seed !== undefined && runId) {
    // Fire-and-forget, same pattern as profile.ts's server pushes — a
    // failed/slow call here only means this pickup missed the mint-ready
    // ledger this time, never that the local count (or the game) breaks.
    void fetch('/api/haul/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemType: item, seed, runId }),
    }).catch(() => {})
  }
  return counts
}
