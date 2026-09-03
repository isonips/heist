// The one source of truth for where things are in a lane, in ticks and FP
// units only. Used by map generation (reachability check), the solver, the
// live simulation, and — later — the renderer, so collision and rendering
// can never disagree about where a car is.
import { COLS, FP, HIT } from './constants'
import type { Lane } from './types'

export function mod(a: number, b: number): number {
  return ((a % b) + b) % b
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b !== 0) {
    ;[a, b] = [b, a % b]
  }
  return a || 1
}

export function stripLenFP(lane: Lane): number {
  const t = lane.traffic!
  return t.slots * t.period * FP
}

/** Ticks after which a road lane's occupancy pattern repeats exactly. */
export function cycleTicks(lane: Lane): number {
  const t = lane.traffic!
  const ring = stripLenFP(lane)
  return ring / gcd(ring, t.speedFpPerTick)
}

/** True if column `col` (0..COLS-1) is blocked in `lane` at tick `t`. Integer-only. */
export function isColumnBlocked(lane: Lane, col: number, t: number): boolean {
  if (lane.kind === 'road') {
    const traffic = lane.traffic
    if (!traffic) return false
    const ring = stripLenFP(lane)
    const scrollFP = mod(t * traffic.speedFpPerTick, ring)
    const posFP = mod(col * FP + FP / 2 + scrollFP, ring)
    for (let i = 0; i < traffic.slots; i++) {
      if (!traffic.occupied[i]) continue
      const centerFP = i * traffic.period * FP + FP / 2
      let d = Math.abs(posFP - centerFP)
      d = Math.min(d, ring - d)
      if (d < HIT) return true
    }
    return false
  }
  // verge / start
  return lane.obstacles ? lane.obstacles[col] : false
}

/** How many consecutive ticks starting at `t` column `col` stays clear, capped at `cap`. */
export function clearRunTicks(lane: Lane, col: number, t: number, cap: number): number {
  let n = 0
  while (n < cap && !isColumnBlocked(lane, col, t + n)) n++
  return n
}

/**
 * Precomputes blocked/clear for ticks [0, ticks) x all columns, so a
 * generation-time check that probes the same lane many times over a bounded
 * horizon can do array lookups instead of recomputing the traffic formula
 * on every probe. `isColumnBlocked` stays the single source of truth this
 * is built from.
 */
export function buildOccupancyTable(lane: Lane, ticks: number): Uint8Array {
  const table = new Uint8Array(ticks * COLS)
  for (let t = 0; t < ticks; t++) {
    for (let c = 0; c < COLS; c++) {
      table[t * COLS + c] = isColumnBlocked(lane, c, t) ? 1 : 0
    }
  }
  return table
}

export function tableClearRun(table: Uint8Array, ticks: number, col: number, t: number, cap: number): number {
  let n = 0
  while (n < cap && t + n < ticks && table[(t + n) * COLS + col] === 0) n++
  return n
}

export function clampCol(c: number): number {
  return Math.max(0, Math.min(COLS - 1, c))
}
