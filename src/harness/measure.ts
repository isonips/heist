// impossibleShare, lootPickupRate/lootKeptRate (greedy bot, for context),
// and the P0 loot-viability numbers from the rational bot. relativeGap was
// removed after being confirmed structurally invalid for this game — see
// CALIBRATION.md's "relativeGap: dropped" section and DECISIONS.md #2.
// Usage: npx tsx src/harness/measure.ts [trials]
import { writeFileSync } from 'node:fs'
import { TICK_MS } from '@/game/heistRun'
import { runGreedyBotTrial } from './greedyBot'
import { runRationalBotTrial } from './rationalBot'
import { impossibleShare } from './solver'

const trials = Number(process.argv[2] ?? 500)

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function p95(arr: number[]): number {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(0.95 * s.length))]
}

const started = Date.now()
const seeds = Array.from({ length: trials }, (_, i) => i + 1)

const greedy = seeds.map((s) => runGreedyBotTrial(s))
const greedyCrossings = greedy.map((r) => r.crossed)
const lootRuns = greedy.filter((r) => r.lootAvailable)
const lootPickupRate = lootRuns.length ? lootRuns.filter((r) => r.lootPickedUp).length / lootRuns.length : 0
const lootKeptRateGreedy = lootRuns.length ? lootRuns.filter((r) => r.lootKept).length / lootRuns.length : 0

// impossibleShare uses its own seed range (offset well clear of the ones
// above) purely so a curious reader diffing seed lists doesn't wonder why
// the same seed appears in both a bot trial and a reachability check for
// unrelated reasons — the two checks don't need to share seeds to be valid.
const solverSeeds = Array.from({ length: trials }, (_, i) => 100000 + i)
const impossible = impossibleShare(solverSeeds)

// P0: the actual question — is the loot playable for a bot that plays to
// maximize expected value? Own seed range too, same reasoning as above.
const rationalSeeds = Array.from({ length: trials }, (_, i) => 200000 + i)
const rational = rationalSeeds.map((s) => runRationalBotTrial(s))
const rationalLootRuns = rational.filter((r) => r.lootAvailable)
const ticketRate = rational.filter((r) => r.ticketed).length / trials
const lootKeptRateRational = rationalLootRuns.length ? rationalLootRuns.filter((r) => r.lootKept).length / rationalLootRuns.length : 0
const tenthTicks = rational.map((r) => r.tickAtTenth).filter((v): v is number => v !== null)
const medianSecsToTenth = tenthTicks.length ? (median(tenthTicks) * TICK_MS) / 1000 : null
const committedRuns = rational.filter((r) => r.reachedCommitted)
const conditionalSurvival = committedRuns.length ? committedRuns.filter((r) => r.ticketed).length / committedRuns.length : null

const summary = {
  trials,
  impossibleShare: Number(impossible.toFixed(4)),
  greedy: {
    lootPickupRate: Number(lootPickupRate.toFixed(4)),
    lootKeptRate: Number(lootKeptRateGreedy.toFixed(4)),
    medianCrossings: median(greedyCrossings),
    p95Crossings: p95(greedyCrossings),
    maxCrossings: Math.max(...greedyCrossings),
    lootRunCount: lootRuns.length,
  },
  rational: {
    ticketRate: Number(ticketRate.toFixed(4)),
    lootKeptRate: Number(lootKeptRateRational.toFixed(4)),
    lootRunCount: rationalLootRuns.length,
    reachedTenthRate: Number((tenthTicks.length / trials).toFixed(4)),
    medianSecsToTenth,
    conditionalSurvivalAfterCommit: conditionalSurvival === null ? null : Number(conditionalSurvival.toFixed(4)),
    outcomeBreakdown: rational.reduce<Record<string, number>>((acc, r) => {
      acc[r.outcome] = (acc[r.outcome] ?? 0) + 1
      return acc
    }, {}),
  },
  elapsedMs: Date.now() - started,
}

writeFileSync('harness-out/measure-summary.json', JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
