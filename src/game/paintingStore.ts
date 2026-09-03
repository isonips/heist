// Real rarity for the painting (the NFT drop) needs a counter shared across
// every player's games — phase-3 backend territory, same story as the
// mystery items. Local stand-in: this browser's own play tally stands in
// for "everyone", with a fresh random threshold (50-150 games) each time
// one drops, matching the requested rarity band.
const STORAGE_KEY = 'heist-painting-drop-v1'

type DropState = { count: number; threshold: number }

function randomThreshold(): number {
  return 50 + Math.floor(Math.random() * 101) // 50-150 inclusive
}

function load(): DropState {
  if (typeof window === 'undefined') return { count: 0, threshold: randomThreshold() }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as DropState
  } catch {
    // fall through to a fresh state
  }
  return { count: 0, threshold: randomThreshold() }
}

function save(state: DropState) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* unavailable */ }
}

/** Call once per new run. Returns true on the run a painting should exist. */
export function rollPaintingDrop(): boolean {
  const state = load()
  state.count += 1
  if (state.count >= state.threshold) {
    save({ count: 0, threshold: randomThreshold() })
    return true
  }
  save(state)
  return false
}
