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
at the 7th crossing is now ~7s, nowhere near the (then) 20s trigger. Retuned
separately below.

## Reinforcement retuned (`REIN_LEAD_S`: 20 → 11)

Measured first: `reinforcementTriggerRate` was 0% at 2000 trials with
`REIN_LEAD_S = 20` — confirming the note above wasn't just an artifact of a
small sample. Median lead at crossing 7 sits around 7.2s; with a 20s
threshold, reinforcement was reachable only by wildly outlier-fast runs, in
practice never.

Swept `REIN_LEAD_S` down against the harness (2000-3000 trials each) to find
where the trigger rate lands in the 15-25% target band:

| REIN_LEAD_S | reinforcementTriggerRate | successRate | medianCrossings |
|---|---|---|---|
| 20 (prior) | 0% | 64.8% | 10 |
| 12 | 7.9% | 64.2% | 10 |
| **11** | **16.3%** (5000 trials) | **60.9%** | **10** ← shipped |
| 10 | 24.5% | 57.9% | 10 |
| 8 | 43.9% | 53.4% | 10 |
| 6 | 65.5% | 48.8% | 9 |

Shipped `REIN_LEAD_S = 11`: comfortably inside 15-25% (16.3% at 5000
trials), with only a modest cost to `successRate` (64.8% → 60.9%) and no
change to `medianCrossings`. `REIN_FROM` (7) and `POLICE_MAX_LEAD_S` (26,
the elastic-push threshold, unrelated to reinforcement's own trigger) are
untouched. Re-sweep the same way (`for v in ...; do sed ...REIN_LEAD_S...;
npx tsx src/harness/cli.ts N; done`, see git history of this file) before
nudging this again.

Notes on reading the harness output in general:

- The bot in `src/harness/bot.ts` is a simple forward/dodge heuristic with a
  4-tick lookahead, not an optimal player, and it never hesitates the way a
  human does — treat its numbers as a ceiling estimate, not a finished RTP.

## relativeGap: dropped from the harness

Confirmed structurally invalid for this game, not just hard to hit. For a
policy that keeps playing against a roughly constant per-tick hazard of
being caught, the ratio of the 95th percentile to the median crossings is a
closed-form function of the survival curve alone: p95/median =
ln(0.05)/ln(0.50) ≈ 4.32, independent of how any parameter is tuned — the
95th-percentile run is "survived 20x as many independent hazard rolls as
the median run," and that ratio doesn't move just because the per-roll
hazard does. The 0.06 target came from a binary reachability model (the
abandoned grid engine's own calibration — a map is either perfect-playable
or it isn't, with no continuous survival process), which doesn't describe
the game that got built. `relativeGap`/`relativeGapFixedSkill` are removed
from `src/harness/measure.ts`; the greedy bot (`greedyBot.ts`) stays, since
it's still the only thing that measures `lootPickupRate`.

## impossibleShare: 4.2% confirmed correct, not chased

`buildWorld()` is untouched. The ceiling against scripted play is already
supplied by police pressure, not by making maps unwinnable: `successRate`
sits at 60-61% (`REIN_LEAD_S` retune, above), inside the target band that
was already the point of that lever. Pushing `impossibleShare` to 30-35%
would mean redesigning lane-count generation so roughly a third of maps are
lost *no matter how well anyone plays them* — a strictly worse player
experience in service of a target that's already being met a different way.
Confirmed via `src/harness/solver.ts` (perfect play, lives and the police
catch both switched off via `HeistRun`'s `invincible` flag) — no code
changed here this pass, this section exists to record that the number was
checked again and the decision to leave it stands.

## P0: is the loot actually playable? (`src/harness/rationalBot.ts`)

The real question `lootPickupRate` (68.8%) vs `lootKeptRate` (3.9%, greedy
bot) raised: those numbers come from a bot that never escapes voluntarily,
so they can't say whether a bot that actually plays *to keep the loot* — by
choosing to escape or hold at the right moment, not by refusing to escape
at all — does any better. `rationalBot.ts` is that bot: same safe-crossing
and loot-seeking policy as the greedy bot, but once armed (`crossed >= 10`)
it re-evaluates every tick — hold while there's something worth holding and
the lead is still comfortably safe (`secsToArrest() > 13`, the same
far/mid boundary the shipped game's own `alerts()` already uses — not a new
number), escape the instant either condition fails.

1000 trials:

| metric | value |
|---|---|
| `ticketRate` (earned the ticket at all) | **59.2%** |
| `lootKeptRate` (of runs where loot spawned) | **0%** |
| `reachedTenthRate` | **59.2%** (identical to ticketRate — see below) |
| median seconds to reach the 10th crossing | **22.4s** |
| median seconds left on the clock at that moment | **38s** |

**`lootKeptRate` is 0%, and it's not an artifact of the 13s threshold.**
Swept `SAFE_LEAD_S` across the game's own full alert range — 3.4s
(`critical`, the most risk-tolerant reading of "rational") through 6.5s
(`near`) to 13s (`far`) — and `lootKeptRate` stayed at 0.0-0.7% the entire
way; `ticketRate` moved (53-59%) but the loot number didn't move in any
meaningful sense. The reason is structural, not a threshold-tuning problem:
median lead is already down to ~7s by the time the 10th crossing is even
reached (consistent with `medianLeadAtSeventhS` ≈ 7.2s measured earlier in
this file), which is already below every one of those thresholds — so a
rational bot, using the game's own signal for "safe," finds the position
already too risky to hold *at the exact moment it becomes able to hold
anything at all*. There isn't a window where "armed" and "comfortably
safe" coincide. `reachedTenthRate == ticketRate` confirms this from the
other direction: every single trial that reaches crossing 10 escapes with
the ticket on that same decision point, every time — the "hold" branch of
the policy never actually fires in a thousand trials.

**This confirms the hypothesis directly: the central decision always
resolves to "escape," items and loot don't get a chance to accumulate, and
nothing here was changed to make this number look better.** `SAFE_LEAD_S`
is left at 13 (the most conservative, most defensibly-"rational" of the
three tested) — see `DECISIONS.md`'s P0 entry for the full reasoning and
the sensitivity table. This is a game-design finding (the wallet/painting/
mystery-item economy is not currently reachable by rational play, only by a
player who deliberately gambles against their own better judgment), not a
calibration one, and it's the project owner's call what to do about it.

**`lootPickupRate` (68.8%, greedy bot) is still the number that came out
clean, unrelated to the finding above.** Of the runs where a wallet or
painting actually spawned, the greedy (never-escapes) bot reached and
picked it up more than two-thirds of the time — the detour-and-pickup logic
itself works fine. The problem P0 identifies is entirely about the exit
decision once something valuable is in hand, not about whether the loot can
be physically reached.

## Known-fixed issues

- `buildMap` (the dormant `src/engine/`) could end on a live 'road' lane
  with no closing verge, stranding the player in traffic forever.
- The live game's `escapeNow()` used to keep whatever was in hand; both
  briefs require escaping to forfeit carried loot (ticket only).
- Surviving the 60s clock used to pay out regardless of crossings; now only
  pays out at `crossed >= ESCAPE_AT`, otherwise it's a loss (`outcome:
  'timeout'`).
