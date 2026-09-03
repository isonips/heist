import { COLS, DURATION_TICKS, GOAL, LIVES, LOOT_PICKUP_RANGE_COLS } from './constants'
import { buildMap } from './map'
import { isColumnBlocked } from './laneGeometry'
import { updatePolice } from './police'
import {
  DIR_DOWN,
  DIR_LEFT,
  DIR_RIGHT,
  DIR_UP,
  type Config,
  type Dir,
  type EndReason,
  type Input,
  type Result,
  type State,
} from './types'

export function initState(seed: number, cfg: Config): State {
  const map = buildMap(seed, cfg)
  const furthestLaneAtTick = new Int16Array(DURATION_TICKS + 1)
  return {
    cfg,
    map,
    tick: 0,
    player: { lane: 0, col: Math.floor(COLS / 2) },
    wasClear: true,
    hearts: LIVES,
    crossings: 0,
    furthestLane: 0,
    furthestLaneAtTick,
    policeLane: 0,
    policeLagTicks: cfg.grace + cfg.policeDelay,
    policeElastic: false,
    pushAccumFP: 0,
    reinforcementFired: false,
    reinforcementBannerUntil: -1,
    hasWallet: false,
    hasPainting: false,
    walletOutcome: 0,
    ended: false,
    result: null,
    inputsLog: [],
  }
}

function finalize(state: State, reason: EndReason): State {
  const win = reason === 'escaped' || reason === 'survived'
  const lootKept = reason === 'survived'
  const result: Result = {
    crossings: state.crossings,
    lanesReached: state.player.lane,
    win,
    escaped: reason === 'escaped',
    heartsLost: LIVES - state.hearts,
    walletOpened: lootKept ? state.walletOutcome : 0,
    paintingKept: lootKept && state.hasPainting,
    endTick: state.tick,
    reason,
  }
  return { ...state, ended: true, result }
}

function applyInput(state: State, input: Dir): void {
  const lane = state.map.lanes[state.player.lane]
  if (input === DIR_UP) {
    const targetIdx = state.player.lane + 1
    const target = state.map.lanes[targetIdx]
    if (target && !isColumnBlocked(target, state.player.col, state.tick)) {
      state.player.lane = targetIdx
      if (targetIdx > state.furthestLane) state.furthestLane = targetIdx
      if (target.kind === 'verge' && target.crossIndex != null && target.crossIndex > state.crossings) {
        state.crossings = target.crossIndex
      }
    }
  } else if (input === DIR_DOWN) {
    const targetIdx = state.player.lane - 1
    if (targetIdx >= 0) {
      const target = state.map.lanes[targetIdx]
      if (!isColumnBlocked(target, state.player.col, state.tick)) {
        state.player.lane = targetIdx
      }
    }
  } else if (input === DIR_LEFT || input === DIR_RIGHT) {
    const targetCol = Math.max(0, Math.min(COLS - 1, state.player.col + (input === DIR_RIGHT ? 1 : -1)))
    if (!isColumnBlocked(lane, targetCol, state.tick)) {
      state.player.col = targetCol
    }
  }
}

function checkLoot(state: State): void {
  const lane = state.map.lanes[state.player.lane]
  if (!lane.busStop || lane.lootCol == null) return
  if (Math.abs(state.player.col - lane.lootCol) > LOOT_PICKUP_RANGE_COLS) return
  if (lane.walletOutcome && !state.hasWallet) {
    state.hasWallet = true
    state.walletOutcome = lane.walletOutcome
  }
  if (lane.hasPainting && !state.hasPainting) {
    state.hasPainting = true
  }
}

/** Advances exactly one tick, optionally applying `input` this tick. Returns a new State. */
export function step(prevState: State, input?: Dir): State {
  if (prevState.ended) return prevState

  const state: State = {
    ...prevState,
    player: { ...prevState.player },
    inputsLog: input !== undefined ? [...prevState.inputsLog, [prevState.tick, input]] : prevState.inputsLog,
  }

  if (input !== undefined) {
    applyInput(state, input)
    checkLoot(state)
  }

  const currentLane = state.map.lanes[state.player.lane]
  const blockedNow = isColumnBlocked(currentLane, state.player.col, state.tick)
  if (blockedNow) {
    if (state.wasClear) {
      state.hearts -= 1
      state.wasClear = false
      if (state.hearts <= 0) {
        return finalize(state, 'outOfLives')
      }
    }
  } else {
    state.wasClear = true
  }

  updatePolice(state)
  if (state.policeLane >= state.player.lane) {
    return finalize(state, 'caught')
  }

  state.tick += 1
  if (state.tick <= DURATION_TICKS) {
    state.furthestLaneAtTick[state.tick] = state.furthestLane
  }

  if (state.tick >= DURATION_TICKS) {
    return finalize(state, state.crossings >= GOAL ? 'survived' : 'outOfTime')
  }

  return state
}

/** Ends the run early, keeping the ticket and forfeiting any carried loot. Requires crossings >= GOAL. */
export function escape(state: State): State {
  if (state.ended || state.crossings < GOAL) return state
  return finalize(state, 'escaped')
}

/** Pure: same seed, config and inputs always produce the same Result. */
export function simulate(seed: number, cfg: Config, inputs: Input[]): Result {
  let state = initState(seed, cfg)
  const byTick = new Map<number, Dir>()
  for (const [tick, dir] of inputs) byTick.set(tick, dir)

  while (!state.ended && state.tick < DURATION_TICKS) {
    const dir = byTick.get(state.tick)
    state = step(state, dir)
  }

  return state.result ?? finalize(state, state.crossings >= GOAL ? 'survived' : 'outOfTime').result!
}
