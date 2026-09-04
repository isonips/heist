// The three numbers priority 2 asked for, all in one run so they're
// comparable against the same seed set: relativeGap, impossibleShare,
// lootPickupRate. Usage: npx tsx src/harness/measure.ts [trials]
import { writeFileSync } from 'node:fs'
import { runBotTrial } from './bot'
import { runGreedyBotTrial } from './greedyBot'
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

// Same seed set for the cautious and greedy bots, so "cautious bot's median
// vs greedy bot's ceiling" is a same-seeds comparison, not two populations.
const seeds = Array.from({ length: trials }, (_, i) => i + 1)

const cautious = seeds.map((s) => runBotTrial(s))
const cautiousCrossings = cautious.map((r) => r.crossed)
const cautiousMedian = median(cautiousCrossings)

const greedy = seeds.map((s) => runGreedyBotTrial(s))
const greedyCrossings = greedy.map((r) => r.crossed)
const greedyMedian = median(greedyCrossings)
const greedyP95 = p95(greedyCrossings)
const greedyMax = Math.max(...greedyCrossings)

const relativeGap = cautiousMedian > 0 ? (greedyP95 - cautiousMedian) / cautiousMedian : 0
// The brief's original relativeGap (see CALIBRATION.md's existing note on
// the metric) was luck-driven spread across seeds AT ONE FIXED skill level
// — p95 vs median of the SAME bot's own distribution, not one bot's ceiling
// against a different bot's median. Reported alongside the literal ask
// above because the two answer different questions and only one of them
// can plausibly land near a single-digit-percent target.
const relativeGapFixedSkill = greedyMedian > 0 ? (greedyP95 - greedyMedian) / greedyMedian : 0

const lootRuns = greedy.filter((r) => r.lootAvailable)
const lootPickupRate = lootRuns.length ? lootRuns.filter((r) => r.lootPickedUp).length / lootRuns.length : 0
const lootKeptRate = lootRuns.length ? lootRuns.filter((r) => r.lootPickedUp && r.win).length / lootRuns.length : 0

// impossibleShare uses its own seed range (offset well clear of the ones
// above) purely so a curious reader diffing seed lists doesn't wonder why
// the same seed appears in both a bot trial and a reachability check for
// unrelated reasons — the two checks don't need to share seeds to be valid.
const solverSeeds = Array.from({ length: trials }, (_, i) => 100000 + i)
const impossible = impossibleShare(solverSeeds)

const summary = {
  trials,
  relativeGap: Number(relativeGap.toFixed(4)),
  relativeGapFixedSkill: Number(relativeGapFixedSkill.toFixed(4)),
  cautiousMedianCrossings: cautiousMedian,
  greedyMedianCrossings: greedyMedian,
  greedyP95Crossings: greedyP95,
  greedyMaxCrossings: greedyMax,
  impossibleShare: Number(impossible.toFixed(4)),
  lootPickupRate: Number(lootPickupRate.toFixed(4)),
  lootKeptRate: Number(lootKeptRate.toFixed(4)),
  lootRunCount: lootRuns.length,
  greedyOutcomeBreakdown: greedy.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1
    return acc
  }, {}),
  elapsedMs: Date.now() - started,
}

writeFileSync('harness-out/measure-summary.json', JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
