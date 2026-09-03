// Core tick/grid constants — see heistcodebrief.md section 3.
export const TPS = 30
export const DURATION_S = 60
export const DURATION_TICKS = DURATION_S * TPS // 1800
export const COLS = 13
export const FP = 1000 // fixed-point units per cell
export const HIT = 700 // collision half-width, in FP
export const GOAL = 10 // crossings to secure the ticket
export const LIVES = 3
export const MAXLANE = 60

// Player move cadence. Not enumerated as a named constant in the brief;
// picked as a reasonable arcade hop rate (30 TPS / 6 ticks = 5 hops/s) and
// used consistently by movement, the reachability check and the solver.
export const TICKS_PER_MOVE = 6

// Reinforcement (rubber band), fired at most once per run.
export const REIN_FROM = 7 // crossing index it can start firing from
export const REIN_LEAD_S = 20 // lead (seconds) that triggers it
export const REIN_BANNER_TICKS = 26
export const REIN_COLLAPSE_LEAD_S = 9 // lead right after reinforcement lands

// Police elastic ("push"): once the player's lead exceeds POLICE_MAX_LEAD_S,
// police close the gap at PUSH_MULTIPLIER x their base pursuit speed until
// the lead is back under PUSH_TIER_S. Base pursuit speed itself is derived
// from policeDelay/grace (see police.ts). Values below are the brief's
// updated constants (they replace an earlier 16s / 12s revision).
export const POLICE_MAX_LEAD_S = 26
export const PUSH_TIER_S = 18
export const PUSH_MULTIPLIER_FP = 2600 // 2.6x, scaled by 1000

// Map generation
export const VERGE_MIN_OBSTACLES = 3
export const VERGE_MAX_OBSTACLES = 6
export const ROAD_RUN_MIN = 1 // road lanes between verges
export const ROAD_RUN_MAX = 2
export const BUS_STOP_CROSSING_MIN = 6
export const BUS_STOP_CROSSING_MAX = 9
export const LOOT_PICKUP_RANGE_COLS = 3

// Traffic strip shape. `slots` cars spaced `period` cells apart per lane,
// picked per-lane from a seeded roll within these bounds.
export const SLOTS_MIN = 3
export const SLOTS_MAX = 6
export const PERIOD_MIN = 2
export const PERIOD_MAX = 4

// Base traffic scroll speed at lane 0, in FP cells per tick, before
// speedMul/ramp are applied. 90 FP/tick @ 30 TPS = 2.7 cells/s.
export const BASE_SPEED_FP_PER_TICK = 90
