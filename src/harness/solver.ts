// "Is this seed even winnable?" — perfect play, ignoring lives and police
// entirely, same definition the old src/engine/solver.ts used for the
// abandoned grid engine (see DECISIONS.md #1-2). Reuses the real
// buildWorld()/step()/traffic logic via HeistRun's invincible flag rather
// than re-deriving lane/traffic feasibility from scratch — the one thing
// this neutralises is the two lose conditions (collide, get caught), so
// "reachable" here means the map's traffic and timing physically allow ten
// crossings inside 60s for a bot that never has to worry about being hit.
import { ESCAPE_AT, HeistRun, TICK_MS } from '@/game/heistRun'
import { decideMove } from './bot'

const MAX_TICKS = Math.ceil(60000 / TICK_MS) // the real run clock, not the 65s safety margin the bots use — a catch/timeout can't extend this one

/** True if crossing ESCAPE_AT is reachable within the 60s clock for this
 *  seed, playing the same greedy forward/dodge policy the harness bots use,
 *  with collisions and the police catch both switched off. */
export function isReachable(seed: number): boolean {
  const run = new HeistRun(seed, () => false, true)
  for (let ticks = 0; ticks < MAX_TICKS; ticks++) {
    if (run.state.crossed >= ESCAPE_AT) return true
    const dir = decideMove(run)
    if (dir) run.onKey(dir)
    else if (!run.started) run.onKey('ArrowUp')
    run.advance()
  }
  return run.state.crossed >= ESCAPE_AT
}

export function impossibleShare(seeds: number[]): number {
  const impossible = seeds.filter((s) => !isReachable(s)).length
  return impossible / seeds.length
}
