import {
  BUS_STOP_CROSSING_MAX,
  BUS_STOP_CROSSING_MIN,
  COLS,
  MAXLANE,
  PERIOD_MAX,
  PERIOD_MIN,
  ROAD_RUN_MAX,
  ROAD_RUN_MIN,
  SLOTS_MAX,
  SLOTS_MIN,
  TICKS_PER_MOVE,
  VERGE_MAX_OBSTACLES,
  VERGE_MIN_OBSTACLES,
  BASE_SPEED_FP_PER_TICK,
} from './constants'
import { buildOccupancyTable, cycleTicks, tableClearRun } from './laneGeometry'
import { solveMap } from './solver'
import { rngFromSeed, nextRange, nextChance, type RngState } from './rng'
import type { Config, Lane, MapData, TrafficStrip, WalletOutcome } from './types'

// Reachability sample budget: one full occupancy cycle is usually well under
// this, but a pattern with an awkward speed/period gcd can run long — cap it
// so generation stays cheap across a 1000-seed sweep.
const REACHABILITY_SAMPLE_CAP = 30
const MAX_LANE_ATTEMPTS = 6

function pickColumns(rng: RngState, count: number): [number[], RngState] {
  const pool = Array.from({ length: COLS }, (_, i) => i)
  const chosen: number[] = []
  let s = rng
  for (let k = 0; k < count && pool.length > 0; k++) {
    let idx: number
    ;[idx, s] = nextRange(s, 0, pool.length - 1)
    chosen.push(pool[idx])
    pool.splice(idx, 1)
  }
  return [chosen, s]
}

function checkReachable(lane: Lane): boolean {
  const sampleCap = Math.min(cycleTicks(lane), REACHABILITY_SAMPLE_CAP)
  const maxWindow = 4 * TICKS_PER_MOVE + 5 // largest `needed` value, at dist=3
  const tableTicks = sampleCap + maxWindow
  const table = buildOccupancyTable(lane, tableTicks)
  const dist0Needed = TICKS_PER_MOVE + 5

  for (let t = 0; t < sampleCap; t++) {
    for (let c = 0; c < COLS; c++) {
      if (tableClearRun(table, tableTicks, c, t, dist0Needed) >= dist0Needed) continue
      let ok = false
      for (let dist = 1; dist <= 3 && !ok; dist++) {
        const needed = (dist + 1) * TICKS_PER_MOVE + 5
        for (const dc of [dist, -dist]) {
          const c2 = c + dc
          if (c2 < 0 || c2 >= COLS) continue
          if (tableClearRun(table, tableTicks, c2, t, needed) >= needed) {
            ok = true
            break
          }
        }
      }
      if (!ok) return false
    }
  }
  return true
}

function buildTraffic(
  rng: RngState,
  cfg: Config,
  laneIndex: number,
  softenSteps: number,
): [TrafficStrip, RngState] {
  const [slots, s1] = nextRange(rng, SLOTS_MIN, SLOTS_MAX)
  const [period, s2] = nextRange(s1, PERIOD_MIN, Math.min(PERIOD_MAX + softenSteps, 8))
  let s = s2

  const rampFactor = 1 + cfg.ramp * laneIndex
  const density = Math.max(0.05, Math.min(0.95, cfg.density * rampFactor - softenSteps * 0.12))
  const speedMul = Math.max(0.3, cfg.speedMul * rampFactor - softenSteps * 0.15)
  const speedFpPerTick = Math.max(20, Math.round(BASE_SPEED_FP_PER_TICK * speedMul))

  let occupied: boolean[] = []
  let attempts = 0
  do {
    occupied = []
    for (let i = 0; i < slots; i++) {
      const [hit, s3] = nextChance(s, density)
      occupied.push(hit)
      s = s3
    }
    attempts++
  } while (attempts < 10 && (occupied.every((o) => o) || occupied.every((o) => !o)))
  if (occupied.every((o) => o)) occupied[0] = false
  if (occupied.every((o) => !o)) occupied[0] = true

  return [{ slots, period, occupied, speedFpPerTick }, s]
}

function buildRoadLane(
  laneIndex: number,
  cfg: Config,
  rng: RngState,
): { lane: Lane; rng: RngState; rejections: number } {
  let s = rng
  let rejections = 0
  let traffic: TrafficStrip
  for (let attempt = 0; attempt <= MAX_LANE_ATTEMPTS; attempt++) {
    ;[traffic, s] = buildTraffic(s, cfg, laneIndex, attempt)
    const candidate: Lane = { index: laneIndex, kind: 'road', crossIndex: null, traffic }
    if (checkReachable(candidate)) {
      return { lane: candidate, rng: s, rejections }
    }
    rejections++
  }
  // Fallback: a single sparse slot is trivially reachable from anywhere.
  const safe: TrafficStrip = { slots: SLOTS_MIN, period: 8, occupied: [true, false, false], speedFpPerTick: 30 }
  return { lane: { index: laneIndex, kind: 'road', crossIndex: null, traffic: safe }, rng: s, rejections }
}

function buildVergeLane(
  laneIndex: number,
  crossIndex: number,
  rng: RngState,
): { lane: Lane; rng: RngState } {
  const [obstacleCount, s1] = nextRange(rng, VERGE_MIN_OBSTACLES, VERGE_MAX_OBSTACLES)
  const [cols, s2] = pickColumns(s1, obstacleCount)
  let s = s2
  const obstacles = new Array(COLS).fill(false)
  for (const c of cols) obstacles[c] = true

  const lane: Lane = { index: laneIndex, kind: 'verge', crossIndex, obstacles }

  if (crossIndex >= BUS_STOP_CROSSING_MIN && crossIndex <= BUS_STOP_CROSSING_MAX) {
    lane.busStop = true
    const [lootCol, s3] = nextRange(s, 0, COLS - 1)
    lane.lootCol = lootCol
    s = s3

    // Wallet appears on most bus-stop runs; painting is the rarer alternate.
    // Odds within "has wallet": nothing 45%, refund 43%, double 11% (brief 3).
    const [roll, s4] = nextRange(s, 0, 999)
    s = s4
    if (roll < 700) {
      const [outcomeRoll, s5] = nextRange(s, 0, 999)
      s = s5
      const outcome: WalletOutcome = outcomeRoll < 450 ? 1 : outcomeRoll < 880 ? 2 : 3
      lane.walletOutcome = outcome
    } else if (roll < 850) {
      lane.hasPainting = true
    }
  }

  return { lane, rng: s }
}

export function buildMap(seed: number, cfg: Config): MapData {
  let rng = rngFromSeed(seed)
  const lanes: Lane[] = [{ index: 0, kind: 'start', crossIndex: 0 }]
  let laneIndex = 1
  let rejectedLaneAttempts = 0
  let crossIndex = 0

  while (laneIndex <= MAXLANE) {
    let roadRun: number
    ;[roadRun, rng] = nextRange(rng, ROAD_RUN_MIN, ROAD_RUN_MAX)
    for (let i = 0; i < roadRun && laneIndex <= MAXLANE; i++) {
      const built = buildRoadLane(laneIndex, cfg, rng)
      rng = built.rng
      rejectedLaneAttempts += built.rejections
      lanes.push(built.lane)
      laneIndex++
    }
    if (laneIndex > MAXLANE) break
    crossIndex++
    const built = buildVergeLane(laneIndex, crossIndex, rng)
    rng = built.rng
    lanes.push(built.lane)
    laneIndex++
  }

  const map: MapData = { seed, cfg, lanes, maxCrossingsAchievable: 0, tickAtTenthCrossing: null, rejectedLaneAttempts }
  const solved = solveMap(map)
  map.maxCrossingsAchievable = solved.maxCrossingsAchievable
  map.tickAtTenthCrossing = solved.tickAtTenthCrossing
  return map
}
