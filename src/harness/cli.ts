// Calibration run against the LIVE game (heistRun.ts).
// Usage: npx tsx src/harness/cli.ts [trials]
import { mkdirSync, writeFileSync } from 'node:fs'
import { runSweep, toCsv } from './sweep'

const trials = Number(process.argv[2] ?? 1000)

const started = Date.now()
const { summary, rows } = runSweep(trials)
const elapsedMs = Date.now() - started

mkdirSync('harness-out', { recursive: true })
writeFileSync('harness-out/live-trials.csv', toCsv(rows))
writeFileSync('harness-out/live-summary.json', JSON.stringify({ ...summary, elapsedMs }, null, 2))
console.log(JSON.stringify({ ...summary, elapsedMs }, null, 2))
