// Calibration sweep runner. Usage: npx tsx src/harness/cli.ts [seedsPerConfig]
import { mkdirSync, writeFileSync } from 'node:fs'
import { runSweep, toCsv, type SweepRow } from './sweep'

const seedsPerConfig = Number(process.argv[2] ?? 1000)

const densities = [0.2, 0.35, 0.5, 0.65, 0.8]
const speedMuls = [0.6, 0.85, 1.1, 1.35, 1.6]

// Fixed baseline for the police timing config fields, which the brief scopes
// out of this sweep (only density x speedMul is swept). grace=3s warmup,
// policeDelay=9s trail, matching the "9-12s" head start noted in design chat.
const policeDelay = 9 * 30
const grace = 3 * 30
const ramp = 0.014

const started = Date.now()

const withRein = runSweep({
  densities,
  speedMuls,
  seedsPerConfig,
  reinforcement: true,
  policeDelay,
  grace,
  ramp,
  seedBase: 1,
})

const withoutRein = runSweep({
  densities,
  speedMuls,
  seedsPerConfig,
  reinforcement: false,
  policeDelay,
  grace,
  ramp,
  seedBase: 1_000_000,
})

mkdirSync('harness-out', { recursive: true })
writeFileSync('harness-out/sweep-reinforcement-on.csv', toCsv(withRein))
writeFileSync('harness-out/sweep-reinforcement-off.csv', toCsv(withoutRein))

function avgGap(rows: SweepRow[]): number {
  return rows.reduce((a, r) => a + r.relativeGap, 0) / rows.length
}

const summary = {
  seedsPerConfig,
  configs: densities.length * speedMuls.length,
  elapsedMs: Date.now() - started,
  avgRelativeGapWithReinforcement: avgGap(withRein),
  avgRelativeGapWithoutReinforcement: avgGap(withoutRein),
  gapCompression: avgGap(withoutRein) - avgGap(withRein),
}
writeFileSync('harness-out/summary.json', JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
