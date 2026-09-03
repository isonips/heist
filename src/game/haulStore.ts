// Local stand-in for "recorded on-chain against the player's address" (code
// brief section 4b / phase 3) — no wallet, no ledger yet, so this just keeps
// a per-browser count via localStorage. MY HAUL reads real numbers from
// here rather than showing a permanent "not earned" placeholder.
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
