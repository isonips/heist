// The harness's bot player: drives real simulate()-equivalent play (lives
// and police fully in effect) using the engine's shared greedy policy, so
// the sweep measures what a scripted player would actually get away with.
import { GOAL, TPS } from '../engine/constants'
import { initState, step } from '../engine/simulate'
import { planMove } from '../engine/solver'
import type { Config, Result, State } from '../engine/types'

export type BotRun = {
  result: Result
  reinforcementFired: boolean
  leadAtSeventhS: number | null
  lootAttempted: boolean
  lootKept: boolean
  roadLaneCount: number
  rejectedLaneAttempts: number
  maxCrossingsAchievable: number
  impossible: boolean
}

export function runBot(seed: number, cfg: Config): BotRun {
  let state: State = initState(seed, cfg)
  let leadAtSeventhS: number | null = null
  let lootAttempted = false

  while (!state.ended && state.tick < 1e9) {
    const lane = state.map.lanes[state.player.lane]
    const nextLane = state.map.lanes[state.player.lane + 1]
    const dir = planMove(lane, nextLane, state.player.col, state.tick) ?? undefined
    const prevCrossings = state.crossings
    state = step(state, dir)
    if (state.hasWallet || state.hasPainting) lootAttempted = true
    if (prevCrossings < 7 && state.crossings >= 7 && leadAtSeventhS === null) {
      leadAtSeventhS = state.policeLagTicks / TPS
    }
    if (!state.map.lanes[state.player.lane]) break // ran off generated lanes
  }

  const result = state.result ?? {
    crossings: state.crossings,
    lanesReached: state.player.lane,
    win: state.crossings >= GOAL,
    escaped: false,
    heartsLost: 0,
    walletOpened: 0,
    paintingKept: false,
    endTick: state.tick,
    reason: state.crossings >= GOAL ? ('survived' as const) : ('outOfTime' as const),
  }

  const roadLaneCount = state.map.lanes.filter((l) => l.kind === 'road').length

  return {
    result,
    reinforcementFired: state.reinforcementFired,
    leadAtSeventhS,
    lootAttempted,
    lootKept: result.walletOpened > 0 || result.paintingKept,
    roadLaneCount,
    rejectedLaneAttempts: state.map.rejectedLaneAttempts,
    maxCrossingsAchievable: state.map.maxCrossingsAchievable,
    impossible: state.map.maxCrossingsAchievable < GOAL,
  }
}
