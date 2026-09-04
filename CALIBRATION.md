# Calibration status

## The harness measures the live game — which is now the only engine

`src/harness/` drives `src/game/heistRun.ts` — the ported prototype that
Play/Demo actually run, and, as of the determinism pass, the seeded engine
too (see `DECISIONS.md` #1). There used to be a second, from-scratch
seed-deterministic engine at `src/engine/`, built from `heistcodebrief.md`'s
abstract spec (integers only, a fixed 13-column grid) — nothing ever
imported it, and it modeled a different ruleset than what Play/Demo actually
run. It's deleted now: `heistRun.ts` itself is seeded
(`new HeistRun(seed)`, `run.actionLog`, `replay(seed, actions)`), so there's
one engine, not two.

Run it: `npx tsx src/harness/cli.ts <trials>` — writes
`harness-out/live-summary.json` and `harness-out/live-trials.csv`.
`npm run test:determinism` replays 200 seeds against their own recorded
action logs and fails on any divergence; it also refreshes
`test-vectors/heist-v1.json`.

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

- The bot in `src/harness/bot.ts` is a simple forward/dodge heuristic with a
  4-tick lookahead, not an optimal player, and it never hesitates the way a
  human does — treat its numbers as a ceiling estimate, not a finished RTP.

## relativeGap, impossibleShare, lootPickupRate (`npx tsx src/harness/measure.ts <trials>`)

The old note above (still true of `src/harness/cli.ts`'s bot alone) was that
`relativeGap` couldn't be measured because the cautious bot always escapes
the instant it reaches crossing 10 — median = p95 = 10 by construction. Fixed
by adding a second bot, `src/harness/greedyBot.ts`: it uses the same
safe-crossing policy but never escapes, detours sideways for loot/items when
one is sitting at the bus stop it's on, and rides every run to its natural
end (caught, out of lives, or the 60s clock). 500 trials, same seed set for
both bots:

| metric | value | target | read |
|---|---|---|---|
| `relativeGap` (greedy p95 vs cautious median) | **1.40** | < 0.06 | see below |
| `relativeGapFixedSkill` (greedy p95 vs its own median) | **1.18** | — | see below |
| `impossibleShare` (solver, 500 seeds) | **4.2%** | 30-35% | see below |
| `lootPickupRate` (of runs where loot spawned) | **68.8%** | — | bot actually detours for it |
| `lootKeptRate` (picked up *and* survived to bank it) | **3.9%** | — | greedy bot dies with loot in hand far more than it banks it |

**`relativeGap` is not close to 0.06, and I don't think it can be with this
kind of bot without changing what the metric means.** The literal ask —
greedy ceiling vs cautious median — is comparing two different policies, one
of which is capped at exactly 10 by definition; any greedy ceiling above 10
(and it needs to be, that's the entire point of "push past 10 for loot")
produces a large ratio against a median stuck at 10. So I also computed the
brief's original definition (see the git history of this file): p95 vs
median of *one* policy's own distribution across seeds — `relativeGapFixedSkill`,
still 1.18. That number stays large for a structural reason, not a tuning
one: a bot that keeps playing against a roughly constant per-crossing risk
of being caught produces a heavy right tail almost no matter how that risk
is tuned (a small number of lucky seeds survive to crossing 40-49 while most
don't clear crossing 15) — the median and the 95th percentile of "how long
until something with constant hazard dies" are never going to sit close
together. Getting this under 0.06 would mean either the risk stops being
roughly constant per crossing (a different pacing model, not a parameter
nudge) or the metric gets redefined to only compare *successful* runs. I
measured and reported this rather than force-fitting `POLICE_PX` to hit a
number that may not be reachable by this route — flagged in `DECISIONS.md`.

**`impossibleShare` is 4.2%, target is 30-35% — also not chased.** The
solver (`src/harness/solver.ts`) reuses the real `buildWorld()`/traffic/
stepping logic with lives and the police catch both switched off
(`HeistRun`'s `invincible` flag — see `DECISIONS.md` #2) and the same
forward/dodge policy as the cautious bot, then checks whether crossing 10 is
reachable inside the 60s clock at all. Only ~1 in 24 generated maps can't be
perfect-played to the goal. Closing that gap to 30-35% needs `buildWorld()`
itself to occasionally generate much harder traffic than it does today (it
always rolls 1-4 lanes per section, uniformly) — a map-generation difficulty
change, not a bot or police change, and a much bigger one: it would mean
roughly a third of runs are lost *no matter how well anyone plays them*.
That's a real design call about what "hard" should mean here (skill-and-luck
vs. sometimes-just-unwinnable), not something to force through unilaterally
off one inherited target number — left for explicit direction, see
`DECISIONS.md`.

**`lootPickupRate` (68.8%) is the number that came out clean.** Of the runs
where a wallet or painting actually spawned, the greedy bot reached and
picked it up more than two-thirds of the time — the detour logic works. What
it rarely does is survive with it: `lootKeptRate` is under 4%, because this
bot never plays it safe once it has loot, it just keeps crossing. That gap
(pick up 69%, keep 4%) is itself useful signal for anyone tuning "is loot
worth the risk" later, even though nothing here changed because of it.

## Known-fixed issues

- `buildMap` (the dormant `src/engine/`) could end on a live 'road' lane
  with no closing verge, stranding the player in traffic forever.
- The live game's `escapeNow()` used to keep whatever was in hand; both
  briefs require escaping to forfeit carried loot (ticket only).
- Surviving the 60s clock used to pay out regardless of crossings; now only
  pays out at `crossed >= ESCAPE_AT`, otherwise it's a loss (`outcome:
  'timeout'`).
