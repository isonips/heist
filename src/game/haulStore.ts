// Local, per-browser count of mystery items ever picked up — DEMO's only
// record of them (DEMO has no address, nothing server-side to write) and
// a guest's pre-connect preview. The real, address-scoped, mint-ready
// record for a PLAY run is written server-side by /api/play/finish
// itself, from the replay-verified result — never from a client call —
// see DECISIONS.md P5/P6. This file never pushes to the server; it's
// local cache only, and never the reveal itself (this file never knows or
// claims rarity/effect beyond the ItemKey the game already showed this
// browser at pickup — the *sealed* haul, with no type exposed at all, is
// what /api/haul returns).
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

export function recordItemEarned(item: ItemKey): HaulCounts {
  const counts = getHaul()
  counts[item] += 1
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(counts)) } catch { /* storage unavailable */ }
  }
  return counts
}
