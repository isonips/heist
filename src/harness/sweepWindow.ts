// P0: sweep POLICE_PX / POLICE_HEAD_START_S / TRAFFIC_DENSITY against the
// commitment-window targets (median secs to the 10th crossing, reach-10
// rate, conditional survival after commit). This script measures one
// combo — the constants it reads are heistRun.ts's actual module-level
// values, so a shell driver edits that file's constants with sed and
// re-invokes this fresh per combo (module consts, not runtime params;
// same methodology as earlier POLICE_PX/REIN_LEAD_S sensitivity sweeps —
// see CALIBRATION.md). The greedy bot (never escapes voluntarily) is the
// measurement vehicle: every trial that reaches the window lapses straight
// into 'committed' unless caught first, which is exactly the denominator
// "conditional survival after commit" needs.
import { POLICE_HEAD_START_S, POLICE_PX, TICK_MS, TRAFFIC_DENSITY } from '@/game/heistRun'
import { runGreedyBotTrial } from './greedyBot'

const trials = Number(process.argv[2] ?? 3000)

function median(arr: number[]): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const rows = Array.from({ length: trials }, (_, i) => runGreedyBotTrial(i + 1))
const reachedTenth = rows.filter((r) => r.reachedTenth)
const tenthTicks = reachedTenth.map((r) => r.tickAtTenth as number)
const medianSecsToTenth = tenthTicks.length ? (median(tenthTicks) * TICK_MS) / 1000 : null
const reachedTenthRate = reachedTenth.length / trials
const committed = rows.filter((r) => r.reachedCommitted)
const conditionalSurvivalAfterCommit = committed.length ? committed.filter((r) => r.win).length / committed.length : null

console.log(JSON.stringify({
  policePx: POLICE_PX,
  policeHeadStartS: POLICE_HEAD_START_S,
  trafficDensity: TRAFFIC_DENSITY,
  trials,
  reachedTenthRate: Number(reachedTenthRate.toFixed(4)),
  medianSecsToTenth,
  conditionalSurvivalAfterCommit: conditionalSurvivalAfterCommit === null ? null : Number(conditionalSurvivalAfterCommit.toFixed(4)),
  committedCount: committed.length,
}))
