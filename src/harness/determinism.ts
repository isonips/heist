// The determinism guarantee, checked directly: play N seeds with the bot,
// replay each recorded action log against its seed through the pure
// replay() function, and fail loudly on the first mismatch. This is what
// "seeded and replayable" actually means — not just that the code compiles,
// but that two runs of the exact same (seed, actions) always land on the
// exact same Result.
//
// Usage: npx tsx src/harness/determinism.ts [seedCount] [--vectors N]
import { mkdirSync, writeFileSync } from 'node:fs'
import { replay, type Result } from '@/game/heistRun'
import { runBotTrial } from './bot'

const args = process.argv.slice(2)
const seedCount = Number(args.find((a) => !a.startsWith('--')) ?? 200)
const vectorFlagIdx = args.indexOf('--vectors')
const vectorCount = vectorFlagIdx >= 0 ? Number(args[vectorFlagIdx + 1] ?? 20) : 20

function sameResult(a: Result, b: Result): boolean {
  return a.mode === b.mode && a.outcome === b.outcome && a.crossed === b.crossed && a.lives === b.lives &&
    a.hands === b.hands && a.ticks === b.ticks && a.walletOutcome === b.walletOutcome &&
    a.walletAmount === b.walletAmount && a.heldItem === b.heldItem
}

let failures = 0
const vectors: { seed: number; actions: [number, string][]; result: Result }[] = []

for (let seed = 1; seed <= seedCount; seed++) {
  const trial = runBotTrial(seed)
  const replayed = replay(trial.seed, trial.actions)
  const ok = sameResult(trial.result, replayed)
  if (!ok) {
    failures++
    console.error(`DIVERGENCE at seed ${seed}:`)
    console.error('  original:', JSON.stringify(trial.result))
    console.error('  replayed:', JSON.stringify(replayed))
  }
  if (seed <= vectorCount) {
    vectors.push({ seed: trial.seed, actions: trial.actions, result: trial.result })
  }
}

// Tracked in git (unlike harness-out/, which is regenerable scratch output)
// — these are meant to outlive this session, as reference fixtures for the
// future Solidity port to check its own replay against.
mkdirSync('test-vectors', { recursive: true })
writeFileSync('test-vectors/heist-v1.json', JSON.stringify(vectors, null, 2))

if (failures > 0) {
  console.error(`\n${failures} / ${seedCount} seeds diverged on replay.`)
  process.exit(1)
}
console.log(`OK — ${seedCount} seeds replayed identically. ${vectors.length} test vectors written to test-vectors/heist-v1.json.`)
