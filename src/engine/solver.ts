// One greedy policy, two jobs:
//  1. buildMap()'s generation-time perfect-play check — ignoring lives and
//     police, fastest legal path, to derive maxCrossingsAchievable /
//     tickAtTenthCrossing for the impossible-share calibration.
//  2. the harness's bot player — driving real `simulate()` runs (lives and
//     police fully in effect) to estimate the scripted-player ceiling.
import { COLS, DURATION_TICKS, TICKS_PER_MOVE } from './constants'
import { clampCol, clearRunTicks, isColumnBlocked } from './laneGeometry'
import type { Dir, Lane, MapData } from './types'
import { DIR_LEFT, DIR_RIGHT, DIR_UP } from './types'

const ADVANCE_NEEDED = TICKS_PER_MOVE + 5

/**
 * Greedy policy: advance if the current column is clear long enough to hop
 * into the next lane; otherwise sidestep toward the nearest column (within
 * 3) that stays clear long enough to reach and then safely advance from.
 * Returns null if no safe move exists this tick (the policy holds).
 */
export function planMove(lane: Lane, nextLane: Lane | undefined, col: number, tick: number): Dir | null {
  if (
    clearRunTicks(lane, col, tick, ADVANCE_NEEDED) >= ADVANCE_NEEDED &&
    (!nextLane || !isColumnBlocked(nextLane, col, tick))
  ) {
    return DIR_UP
  }
  for (let dist = 1; dist <= 3; dist++) {
    const needed = (dist + 1) * TICKS_PER_MOVE + 5
    for (const dc of [dist, -dist]) {
      const c2 = col + dc
      if (c2 < 0 || c2 >= COLS) continue
      if (clearRunTicks(lane, c2, tick, needed) >= needed) {
        return dc > 0 ? DIR_RIGHT : DIR_LEFT
      }
    }
  }
  return null
}

export type PerfectPlayResult = {
  maxCrossingsAchievable: number
  tickAtTenthCrossing: number | null
}

/** Fastest legal path through the map, ignoring lives and police entirely. */
export function runPerfectPlay(lanes: Lane[]): PerfectPlayResult {
  let laneIdx = 0
  let col = Math.floor(COLS / 2)
  let crossings = 0
  let tickAtTenth: number | null = null

  for (let t = 0; t < DURATION_TICKS; t++) {
    const lane = lanes[laneIdx]
    if (!lane) break
    const nextLane = lanes[laneIdx + 1]
    const dir = planMove(lane, nextLane, col, t)
    if (dir === DIR_UP) {
      laneIdx++
      const arrived = lanes[laneIdx]
      if (arrived && arrived.kind === 'verge' && arrived.crossIndex && arrived.crossIndex > crossings) {
        crossings = arrived.crossIndex
        if (crossings === 10 && tickAtTenth === null) tickAtTenth = t
      }
    } else if (dir === DIR_LEFT) {
      col = clampCol(col - 1)
    } else if (dir === DIR_RIGHT) {
      col = clampCol(col + 1)
    }
    // dir === null: hold this tick
  }

  return { maxCrossingsAchievable: crossings, tickAtTenthCrossing: tickAtTenth }
}

/** Convenience wrapper taking a full MapData, used by buildMap(). */
export function solveMap(map: Pick<MapData, 'lanes'>): PerfectPlayResult {
  return runPerfectPlay(map.lanes)
}
