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

## P0 follow-up: LOOT_ESCAPE_AT — loot banked by pushing on, not surviving the clock

Rule change, not a retune: escaping at `ESCAPE_AT` (10) still secures the
ticket only; escaping at `LOOT_ESCAPE_AT` or later secures the ticket *and*
whatever's carried. `LOOT_ESCAPE_AT` replaces "survive to the open 60s
clock" — which the measurement above found was never actually reachable —
with a bounded number of extra crossings the player can weigh against their
current lead. Neither the clock, the police constants, nor `buildWorld()`
were touched — this is entirely a change to the loot-retention condition.

**First sweep (11-16, `src/harness/rationalBot.ts` unchanged from the
measurement above) landed at ~0% for every value, which turned out to be a
flaw in the bot, not the mechanic.** The bot's exit policy re-evaluated a
fixed 13s safety threshold every tick, inherited from the old open-ended
"survive the clock" analysis. Since median lead is already ~7s by crossing
10, that threshold fires on the very first post-arming tick regardless of
how close `LOOT_ESCAPE_AT` is — the bot never got far enough to test the
new mechanic at all. Caught via a 2D sanity sweep (`LOOT_ESCAPE_AT` ×
`SAFE_LEAD_S`, `sweepLootEscape.ts`'s second argument): loosening the
threshold moved `lootKeptRate` a lot (0.3% → 22-36% across the tested
range, same `LOOT_ESCAPE_AT` values), which a genuine mechanic-level dead
end would not have done.

**Fixed the bot, not the game.** A fixed interrupt threshold makes sense
for an open-ended commitment (more exposure over time = more accumulated
risk, so bail when it stops looking worth it) but not for a short *bounded*
one — bailing 1-2 ticks into a 1-6-crossing push doesn't meaningfully
reduce risk (both paths take a similar number of ticks to reach safety), it
just forfeits loot for certain in runs that would often have succeeded
anyway. `rationalBot.ts`'s default is now "commit once armed if there's
something worth holding, don't second-guess every tick" (`SAFE_LEAD_S =
0`) — still overridable for sensitivity checks, no longer the default.
Full reasoning in the file's own header comment.

**Final sweep, 5000 trials per value, corrected bot:**

| LOOT_ESCAPE_AT | lootKeptRate | ticketRate |
|---|---|---|
| **11** | **35.2%** (35.55% at 10k trials) | 54.3% ← shipped |
| 12 | 41.4% | 50.0% |
| 13 | 35.8% | 46.0% |
| 14 | 29.1% | 42.5% |
| 15 | 23.5% | 40.1% |
| 16 | 19.3% | 37.4% |

`LOOT_ESCAPE_AT = 11` shipped: the lowest value tested, and it already
clears the 25-40% target (35.2%, confirmed at 35.55% on a 10k-trial
re-run) — one extra crossing beyond arming is enough. Not monotonic (12
reads slightly *higher* than both 11 and 13) — this is real, not sampling
noise: every row above replays the exact same 5000 seeds, so the only
variable changing is the threshold itself; some specific interaction
between where `LOOT_ESCAPE_AT` lands and the map's own periodic geometry
plausibly explains the bump, but it wasn't investigated further since it
doesn't change the answer. `successRate`/`ticketRate` costs something for
this bot (54.3% vs. the ~59-61% baseline from bots that don't chase loot at
all) — a real, expected trade-off: committing past arming for a shot at
loot means occasionally losing the ticket that a pure escape-at-10 bot
would have banked for certain.

## P0 follow-up 2: the commitment window (WINDOW_S) replaces LOOT_ESCAPE_AT

New end-game shape, replacing the LOOT_ESCAPE_AT threshold above entirely
(see DECISIONS.md's matching entry for the full mechanic writeup): the game
is unbounded past `ESCAPE_AT` — reaching crossing 12 or 30 doesn't change
the payout — but the 10th crossing opens a fixed `WINDOW_S = 10` second
decision window. Escaping inside it still bags the ticket only (loot
forfeited). Letting it lapse (the default — nothing has to be pressed)
commits the run: no more escape, ever; only surviving to the 60s clock's
natural end pays out the ticket *and* everything carried, including
anything picked up after the window opened.

The brief's own diagnosis of the old mechanic's failure: reaching the 10th
currently takes ~22s, so the old rule ("survive the rest of the open 60s
clock from crossing 10 on") demanded roughly 38 more seconds held at a lead
of ~7s — structurally unwinnable, which is exactly what the LOOT_ESCAPE_AT
sweep measured (lootKeptRate 0% at every threshold 11-16). The new
mechanic's insight: hardening how *fast* the game reaches the 10th
crossing should, if it worked, push the window's close later, which
*shortens* the hold remaining before the clock's natural end (60 -
(T10+10)) — turning an unwinnable open-ended survival demand into a short,
bounded one. The brief asked to test this by sweeping `POLICE_PX`,
`POLICE_HEAD_START_S`, and traffic density (a new `TRAFFIC_DENSITY`
multiplier on lane spacing, added for exactly this sweep) against three
targets, measured with the greedy bot (never escapes voluntarily, so
reaching the window always lapses into 'committed' unless caught first —
the right vehicle for all three metrics at once):

| target | band |
|---|---|
| median seconds to the 10th crossing | 40-48s |
| reach-10 rate | 45-55% |
| conditional survival after commitment | 50-65% |

**Result: no combination of the three requested knobs reaches all three
targets — or even the first one. Median time-to-10th stayed clamped
between ~17s and ~24s across the entire range swept, in both directions,
individually and combined.** Full sweep (greedy bot, seeds 1..3000 per
row; `secsToTenth` is the median over runs that reached it):

*POLICE_PX (head start [5,7], density 1×):*

| PX | reach-10 rate | median secsToTenth | cond. survival after commit |
|---|---|---|---|
| 4.0 (baseline) | 59.2% | 22.7s | 5.1% |
| 4.3 | 53.2% | 22.3s | 3.2% |
| 4.6 | 46.7% | 21.2s | 3.2% |
| 5.0 | 40.4% | 20.6s | 2.0% |
| 5.5 | 30.7% | 19.6s | 1.3% |
| 6.0 | 22.9% | 17.9s | 0% |

*POLICE_HEAD_START_S (PX 4.0, density 1×):*

| head start | reach-10 rate | median secsToTenth | cond. survival after commit |
|---|---|---|---|
| [5,7] (baseline) | 58.6% | 22.9s | 3.2% |
| [4,6] | 55.7% | 22.8s | 5.2% |
| [3,5] | 48.6% | 21.8s | 4.2% |
| [2,4] | 39.3% | 21.2s | 3.4% |
| [1,3] | 30.0% | 20.4s | 3.1% |

*TRAFFIC_DENSITY (PX 4.0, head start [5,7]):*

| density | reach-10 rate | median secsToTenth | cond. survival after commit |
|---|---|---|---|
| 1.0 (baseline) | 59.7% | 22.9s | 5.4% |
| 1.05 | 53.1% | 23.0s | 3.1% |
| 1.08 | 48.9% | 23.0s | 1.2% |
| 1.1 | 46.0% | 23.1s | 1.5% |
| 1.15 | 42.9% | 23.4s | 1.4% |
| 1.2 | 35.1% | 23.7s | 1.2% |
| 1.3 | 23.2% | 22.9s | 0% |
| 1.5 | 6.1% | 16.9s | 0% |
| 1.75 | 2.0% | 16.3s | 0% |
| 2.0 | 0.1% | 13.5s | — (0 committed runs) |

*Combined points, checked in case stacking the three levers behaves
differently than any one alone — it doesn't:*

| PX | head start | density | reach-10 rate | median secsToTenth | cond. survival after commit |
|---|---|---|---|---|---|
| 3.0 | [7,9] | 0.85× (easier, sanity check) | 77.6% | 21.8s | 18.5% |
| 4.3 | [4,6] | 1.1× (mild combined harden) | 36.2% | 21.8s | 2.2% |
| 4.6 | [3,5] | 1.2× (moderate combined harden) | 16.3% | 19.3s | 0% |

**Diagnosis.** These three knobs only change whether a run *survives* long
enough to reach the 10th crossing (police catch risk, collision risk) —
none of them change how fast the player's own forward progress *reaches*
crossing 10 when nothing kills the run first. That pace is set by
`buildWorld()`'s map generation (1-4 lanes rolled per section) and the hop
cadence, neither of which these three constants touch. So hardening
mostly kills off runs before the 10th rather than slowing down the ones
that get there — which is why median secsToTenth barely moves, and if
anything trends slightly *down* as difficulty rises (a survivorship
effect: the runs still reaching 10 under harder settings are
disproportionately the fast/lucky ones, not the median ones). The easier
direction confirms the same decoupling from the other side: PX 3.0 / head
start [7,9] / density 0.85× roughly triples the reach-10 rate (77.6% vs.
59.7% baseline) while median secsToTenth barely changes (21.8s vs.
22.9s). At every setting where reach-10 rate actually lands inside the
45-55% band, median secsToTenth clusters at 21-23s regardless of which
knob produced it — never above 24s, roughly half the 40-48s floor of the
target band. And conditional survival after commit stays under ~5.5%
almost everywhere in the target's neighborhood, because the post-commit
hold is `60 - (T10 + 10)` ≈ 27-30s against the *same* pursuit pressure
that was just tuned harder to (unsuccessfully) try to raise T10 in the
first place — pushing these levers harder doesn't trade one target for
another, it costs reach-rate and conditional-survival at the same time
without buying anything on median secsToTenth.

**No change shipped to `POLICE_PX`, `POLICE_HEAD_START_S`, or
`TRAFFIC_DENSITY`** — they stay at their pre-sweep values (4.0, [5,7], 1×)
rather than landing on a combination that clears none of the three
targets. `TRAFFIC_DENSITY` itself (new this round) stays in the codebase
at its neutral default (1× — reproduces the original spacing exactly) so
it's available as a tested, working lever for whichever change actually
addresses this. If the target band still matters, the lever that could
plausibly move median secsToTenth is the one the brief didn't include in
scope: `buildWorld()`'s own lane-count roll (currently 1-4 per section) or
the base traffic scroll speed (`TRAFFIC_PX`) — either directly changes how
long it takes to *complete* a crossing rather than how likely a run is to
die before finishing one. Not touched here without direction to do so,
consistent with this session's standing rule about map generation.

## P0 follow-up 3: a decelerating traffic-speed ramp — same wall, different route

Before sprint, tried making `trafficPx()` (vehicle scroll speed, not
spacing) compound with crossings — first a flat per-tier rate
(`TRAFFIC_SPEED_TIER_CROSSINGS`/`RAMP_PCT`, since removed), then a
per-crossing rate that decreases band by band as the run goes on
(`TRAFFIC_SPEED_BANDS`, kept — 10/8/6/4/2% per crossing across bands
[0,5), [5,10), [10,15), [15,20), [20,∞), scaled by `TRAFFIC_SPEED_SCALE`),
matching how difficulty curves usually avoid a runaway exponential. Same
result as follow-up 2 either way: whatever scale pushed reach-10 rate into
the 45-55% band (~0.8×) had already crushed conditional survival to 0%,
because a ramp that's purely a function of *total crossed* necessarily
gives a run that's gone further past the 10th (which is exactly what
committing requires) a *larger* cumulative value than a run that just
reached it — there's no way to be "harder before 10" and "gentler while
holding after 10" with one curve evaluated at two different points on the
same increasing line. `TRAFFIC_SPEED_SCALE` ships at 0 (neutral — this
lever's structural ceiling turned out to be the same as follow-up 2's,
not worth carrying a nonzero default that doesn't clear any target).

## P0 follow-up 4: sprint/stamina — the lever that actually worked

The brief's own read on follow-up 2's dead end: police/traffic-pressure
levers only filter out unlucky runs — they don't touch the survivors' own
median pace. What was missing was something that costs *time* uniformly
rather than *survival probability* selectively. Proposal: hold Enter to
sprint; `SPRINT_DRAIN_S` seconds of it and the gauge (state.staminaPct)
empties, forcing `winded` — slower than baseline, not just back to
baseline — until it refills over `SPRINT_RECHARGE_S`. Implemented in
`heistRun.ts` (`setSprinting()`, `staminaTick()`, `speedMult()`), logged
as `SprintDown`/`SprintUp` actions for replay, wired into
`bot.ts`/`greedyBot.ts`/`rationalBot.ts` as "always sprint when possible"
(the natural greedy baseline for measuring pace).

**First pass — the placeholder values (1.5×/0.6×, 8s/5s) made continuous
sprint-holding *faster* than baseline on average**, not slower: the
weighted average of 8s at 1.5× and 5s at 0.6× is `(8×1.5+5×0.6)/13 ≈
1.15×`. Caught this via the duty-cycle math before trusting the first
(flat) sweep result, rather than reporting "sprint doesn't move the
needle" without checking why.

**Second pass — even the most extreme values (1.0×/0.0×, i.e. sprint
grants no speed at all and winded means a full stop) only reached
medianSecsToTenth ≈ 26s, and reach-10 rate collapsed to 10%.** Diagnosis:
`law()`'s police advance is a fixed per-tick rate independent of the
thief's own speed — it closes on `wy - policeWy`, the *position* gap, not
elapsed time. Slowing the thief without slowing the police is
mathematically identical to speeding the police up: both close the gap
faster. Every lever tried in follow-ups 2 and 3 did this too, just less
directly — this is the same trap under a different name, and it explains
why nothing before sprint could move the survivors' median pace: anything
that costs time by making a run more likely to die *is* the trap, not an
accident of a particular knob.

**The fix, and the reason this session's model didn't reach it alone —
the user did:** slow the police by the *exact same factor* as the thief
while winded (not while sprinting — sprint stays a real, earned
advantage). `law()`'s police advance and `advance()`'s traffic scroll both
multiply by `windedMult()` (winded-only, ignoring sprint) alongside the
thief's own `speedMult()`. Because both sides of the arrest-gap race slow
in lockstep, the relative closing rate — and so the real arrest
probability — is unchanged; only the real time it takes to cover the same
ground goes up. `secsToArrest()` itself is deliberately left dividing by
the *full*, un-slowed `POLICE_PX`, so it reads pessimistic during a winded
stretch (as if the police were still closing at full speed) — the player
feels pressure that isn't mechanically real, which was the point, not a
side effect to fix.

**Third pass, extending the same lockstep principle to traffic, still
came up short at the exact given durations (8s/5s):** reach-10 rate
recovered from 10% to 41% at the extreme (1.0×/0.0×), and medianSecsToTenth
reached 30.7s — real progress, but the theoretical ceiling with these
durations is `8×1/13 ≈ 0.615×` even at the limit (winded = full stop),
which peaks around 36s, not 40-48s. **Extending `SPRINT_RECHARGE_S`
(explicitly offered as "5 secondes par exemple" in the brief, not a fixed
requirement) is what closed the rest of the gap** — the recharge-only
sweep at 1.0×/0.0× alone reached medianSecsToTenth 45-49s at
recharge=13-15s, but reach-10 rate fell to 11-16% doing it: at 0.0×, a
thief frozen mid-hop inside a traffic lane for the full winded duration is
a near-certain hit regardless of the police-gap fix, since `collide()`'s
risk is about *ticks spent covered*, not the position-gap race. Fixed the
same way as the police gap: `advance()`'s traffic scroll also multiplies
by `windedMult()`, so a frozen thief faces frozen traffic too.

**Fourth pass — even with both lockstep fixes, a thief who *started* a
hop while sprinting could still wind out mid-crossing and get caught
crawling three lanes into a four-lane road with no way back.** Per
instruction: locked the thief's own hop speed (`crossingSpeedMult`) the
moment they leave a safe band (pave/stop), held fixed for every lane of
that crossing regardless of how the gauge changes underneath, released
only once back on safe ground. A multi-lane crossing is now entered
knowing the pace it'll be crossed at; getting winded mid-road is no longer
possible — winded can only ever apply to a crossing *starting* from a
sidewalk, which is also where recovery becomes real again ("récupère sur
les trottoirs"). This alone moved the sweep's best point from ~41%
reach-10 rate to ~52% at the same constants, before further tuning.

**Final sweep and shipped values** (`sweepWindow.ts`, greedy bot, 5000-8000
trials per point; POLICE_HEAD_START_S and TRAFFIC_DENSITY left at their
original baseline throughout — only POLICE_PX and the sprint constants
were varied):

| POLICE_PX | drain/recharge | S / W | reach-10 rate | median secsToTenth | cond. survival |
|---|---|---|---|---|---|
| 4.0 | 8/5 (placeholders) | 1.5/0.6 | 73-85% | 23-24s | 62-87% |
| 4.0 | 8/13 | 1.0/0.0 | 50.4% | 46.2s | 99.4% |
| 5.5 | 8/10 | 1.0/0.0 | 40.3% | 40.4s | 71.5% (PX 5.2) |
| **5.5** | **8/10** | **1.0/0.0** | **37.4%** | **39.4s** | **64.5%** |

Shipped: `POLICE_PX = 5.5`, `SPRINT_DRAIN_S = 8`, `SPRINT_RECHARGE_S = 10`,
`SPRINT_SPEED_MULT = 1.0`, `WINDED_SPEED_MULT = 0.0`. Conditional survival
lands inside the 50-65% target (64.5%). Reach-10 rate (37.4%) and median
secsToTenth (39.4s) sit just under their floors (45% and 40s) — within a
few points, not the order-of-magnitude gaps every earlier attempt in
follow-ups 2-4 produced, but not a clean triple hit either. Roughly a
dozen more combinations around this point (`POLICE_PX` 5.0-6.0,
`SPRINT_RECHARGE_S` 10-15, `SPRINT_DRAIN_S` 8-12) were tried without
finding one that clears all three at once — the three metrics move
together tightly enough in this neighborhood that no further search
within the same four constants found a strict improvement. Accepted as
final per instruction ("on laisse comme ça") rather than continuing to
search or loosening a target band.

## Known-fixed issues

- `buildMap` (the dormant `src/engine/`) could end on a live 'road' lane
  with no closing verge, stranding the player in traffic forever.
- The live game's `escapeNow()` used to keep whatever was in hand; both
  briefs require escaping to forfeit carried loot (ticket only).
- Surviving the 60s clock used to pay out regardless of crossings; now only
  pays out at `crossed >= ESCAPE_AT`, otherwise it's a loss (`outcome:
  'timeout'`).
