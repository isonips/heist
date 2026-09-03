# Calibration status

## The harness now measures the live game

`src/harness/` drives `src/game/heistRun.ts` — the ported prototype that
Play/Demo actually run — not `src/engine/`. Those are two separate tracks:

- `src/engine/` + `src/render/pixel.ts`'s old siblings (removed) were a
  from-scratch, seed-deterministic reimplementation built from
  `heistcodebrief.md`'s abstract spec (integers only, no `Math.random`, a
  fixed 13-column grid). Per the project owner's direction, the actual game
  had to be a faithful port of the approved Claude Design prototype instead
  — floats, `Math.random()`, continuous pixel positions — so `src/engine/`
  and `src/harness/` were pointed at a ruleset nothing plays anymore.
- `src/engine/` is left in place (still typechecks, still has its own solver
  and reachability-constrained map generation) as the starting point for the
  Solidity-portable rewrite the code brief describes for phase 3, but it is
  currently dormant — no UI calls it.

Run it: `npx tsx src/harness/cli.ts <trials>` — writes
`harness-out/live-summary.json` and `harness-out/live-trials.csv`.

## Police pacing retuned (playtesting: reached crossing 23 and was never once caught)

The original ported constants (`POLICE_PX = 1.4`, head start `[12, 15]`) came
straight from the prototype, but a human playing for real reached crossing 23
without ever being caught — 1000 bot trials confirmed it: **police caught the
bot in only 3.5% of runs.** The rubber-band mechanics (elastic push,
once-per-run reinforcement) only fire when the lead grows huge, so a player
who just keeps moving forward barely feels police pressure at all — the
threat that's supposed to define the whole chase wasn't really there.

Retuned by sweeping `POLICE_PX` / `POLICE_HEAD_START_S` against the harness
(fast: ~300ms for 1000 trials) until reaching 10 was a real, present risk
without making it unreachable for the median run:

| POLICE_PX | head start (s) | collared | flattened | escaped | medianCrossings |
|---|---|---|---|---|---|
| 1.4 (orig.) | [12, 15] | 3.5% | 16.9% | 79.6% | 10 |
| 2.2 | [8, 11] | 11.6% | 14.5% | 73.9% | 10 |
| 3.6 | [4, 6] | 22.2% | 8.4% | 69.4% | 10 |
| 4.2 | [3, 5] | 52.7% | 1.4% | 45.9% | **9** ← too hard, median run falls short of the goal |
| **4.0** | **[5, 7]** | **27.0%** | **6.8%** | **66.2%** | **10** ← shipped |

Shipped: `POLICE_PX = 4.0`, `POLICE_HEAD_START_S = [5, 7]`. Better than
1-in-25 runs ending in a catch: better than 1-in-4, while the median
competent run still reaches the goal. This is extremely sensitive to head
start especially — going from `[5,7]` to `[3,5]` at a similar `POLICE_PX`
was the difference between "hard but fair" and "median run doesn't reach
10". Re-tune with `npx tsx src/harness/cli.ts <trials>` before nudging
these again, one change at a time.

Side effect: `reinforcementTriggerRate` dropped from 97% to ~0% — median lead
at the 7th crossing is now ~7s, nowhere near the 20s trigger. With baseline
pressure this much higher, reinforcement no longer has a job to do against a
forward-moving player; it's now a backstop for outlier-fast runs rather than
routine. Worth a deliberate look before phase 3, but not blocking.

Notes on reading the harness output in general:

- **`relativeGap` (p95 vs median) isn't a useful number here** — it was a
  code-brief metric for the abandoned grid engine, measuring luck-driven
  spread across seeds at a fixed skill level. This bot always stops at
  exactly 10 crossings (the rational move once escape is armed), so
  median = p95 = 10 by construction whenever the goal is reached at all.
- The bot in `src/harness/bot.ts` is a simple forward/dodge heuristic with a
  4-tick lookahead, not an optimal player, and it never hesitates the way a
  human does — treat its numbers as a ceiling estimate, not a finished RTP.

## Known-fixed issues

- `buildMap` (the dormant `src/engine/`) could end on a live 'road' lane
  with no closing verge, stranding the player in traffic forever.
- The live game's `escapeNow()` used to keep whatever was in hand; both
  briefs require escaping to forfeit carried loot (ticket only).
- Surviving the 60s clock used to pay out regardless of crossings; now only
  pays out at `crossed >= ESCAPE_AT`, otherwise it's a loss (`outcome:
  'timeout'`).
