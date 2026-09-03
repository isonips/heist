// Trailing pursuit + elastic catch-up + the once-per-run reinforcement.
// "Lead" is always derived from policeLagTicks (an exact tick count), so
// converting to seconds is exact — no drift between the number the UI shows
// and the number the engine acts on.
import {
  POLICE_MAX_LEAD_S,
  PUSH_MULTIPLIER_FP,
  PUSH_TIER_S,
  REIN_BANNER_TICKS,
  REIN_COLLAPSE_LEAD_S,
  REIN_FROM,
  REIN_LEAD_S,
  TPS,
} from './constants'
import type { State } from './types'

export function updatePolice(state: State): void {
  const { cfg, tick } = state
  if (tick < cfg.grace) {
    state.policeLane = 0
    return
  }

  const leadSeconds = state.policeLagTicks / TPS
  const reinforcementOn = cfg.reinforcement !== false

  if (reinforcementOn && !state.reinforcementFired && state.crossings >= REIN_FROM && leadSeconds > REIN_LEAD_S) {
    state.policeLagTicks = REIN_COLLAPSE_LEAD_S * TPS
    state.reinforcementFired = true
    state.reinforcementBannerUntil = tick + REIN_BANNER_TICKS
  } else {
    if (!state.policeElastic && leadSeconds > POLICE_MAX_LEAD_S) state.policeElastic = true
    if (state.policeElastic && leadSeconds <= PUSH_TIER_S) state.policeElastic = false
    if (state.policeElastic) {
      state.pushAccumFP += PUSH_MULTIPLIER_FP - 1000
      while (state.pushAccumFP >= 1000 && state.policeLagTicks > 0) {
        state.policeLagTicks -= 1
        state.pushAccumFP -= 1000
      }
    }
  }

  const refTick = tick - state.policeLagTicks
  state.policeLane = refTick <= 0 ? 0 : state.furthestLaneAtTick[Math.min(refTick, tick)]
}
