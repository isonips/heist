export type Dir = 1 | 2 | 3 | 4
export const DIR_UP: Dir = 1
export const DIR_DOWN: Dir = 2
export const DIR_LEFT: Dir = 3
export const DIR_RIGHT: Dir = 4

export type Input = [tick: number, dir: Dir]

export type Config = {
  density: number // 0.20 - 0.80
  speedMul: number // 0.60 - 1.60
  policeDelay: number // ticks the police trail behind
  grace: number // ticks before the police start
  ramp: number // per-lane difficulty increase, e.g. 0.014
  /** Off only for the harness's reinforcement A/B sweep. Defaults to true. */
  reinforcement?: boolean
}

export type LaneKind = 'start' | 'verge' | 'road'

export type TrafficStrip = {
  slots: number
  period: number
  occupied: boolean[] // length = slots
  speedFpPerTick: number
}

/** 0 = no wallet on this run. 1 = opened, nothing. 2 = opened, refund. 3 = opened, double. */
export type WalletOutcome = 0 | 1 | 2 | 3

export type Lane = {
  index: number
  kind: LaneKind
  /** Crossing count secured by clearing this lane's far edge; null mid-crossing (multi-lane road groups). */
  crossIndex: number | null
  obstacles?: boolean[] // verge: length COLS, true = blocked
  traffic?: TrafficStrip // road
  busStop?: boolean
  lootCol?: number | null
  walletOutcome?: WalletOutcome
  hasPainting?: boolean
}

export type MapData = {
  seed: number
  cfg: Config
  lanes: Lane[]
  maxCrossingsAchievable: number
  tickAtTenthCrossing: number | null
  rejectedLaneAttempts: number
}

export type EndReason = 'escaped' | 'survived' | 'outOfTime' | 'outOfLives' | 'caught'

export type Result = {
  crossings: number
  lanesReached: number
  win: boolean
  escaped: boolean
  heartsLost: number
  walletOpened: number
  paintingKept: boolean
  endTick: number
  reason: EndReason
}

export type PlayerPos = { lane: number; col: number }

export type State = {
  cfg: Config
  map: MapData
  tick: number
  player: PlayerPos
  wasClear: boolean
  hearts: number
  crossings: number
  furthestLane: number
  furthestLaneAtTick: Int16Array
  policeLane: number
  policeLagTicks: number
  policeElastic: boolean
  pushAccumFP: number
  reinforcementFired: boolean
  reinforcementBannerUntil: number
  hasWallet: boolean
  hasPainting: boolean
  walletOutcome: number
  ended: boolean
  result: Result | null
  inputsLog: Input[]
}
