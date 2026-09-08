# Session summary

Four working sessions on the same brief, continued in one file. First
pass: one seeded engine (`src/engine/` dead code deleted), a difficulty/RNG
measurement pass, reinforcement retuned, address-based identity (stubbed),
`/embed`, a splash screen. Second pass: two of the first pass's metric
targets confirmed invalid and dropped, a third bot answering "is the loot
actually playable" (P0 — found `lootKeptRate` 0%, reported as a design
finding), and a real backend (Supabase) for profile/stats/feed/global drop
counters (P1, P2). Third pass: the P0 finding acted on by changing the
conservation rule itself (loot banked by pushing past a crossing
threshold, `LOOT_ESCAPE_AT`, not by surviving the whole clock), P1
re-checked and still blocked from this sandbox, and demo-run telemetry +
an unlisted human-vs-bot comparison page (P2). Fourth pass (this one):
`LOOT_ESCAPE_AT` itself replaced by a fixed-length decision window
(commit or walk away, once, ten seconds after the door arms) per new
instruction, swept against three new balance targets, and reported
honestly when none of the three requested knobs (police speed/head start,
traffic density) could reach them — followed by a sprint/stamina mechanic
(the user's proposal) that turned out to be the actual missing lever,
after two more user-caught fixes (police and traffic have to slow down in
lockstep with a winded thief, or slowing the thief just closes the arrest
gap faster; a crossing has to be entered at a locked pace so winded can
never strike mid-road) got it within a few points of all three targets —
accepted as final, then closed out with the two outro animations the
balance work had been blocking (a stolen bike for a window escape, a
helicopter for holding to the end). Details and reasoning for every
non-obvious call are in `DECISIONS.md`; tuning history and every measured
number is in `CALIBRATION.md`.

Every commit across all four sessions builds, typechecks, and lints clean
(`npx tsc --noEmit`, `npx eslint src --max-warnings=0`, `npm run build`) —
checked before each one, not just at the end.

## Determinism — done (session 1)

- `HeistRun` takes an optional `seed`; every `Math.random()` in the sim path
  now draws from one of six independent seeded streams (`DECISIONS.md #1`).
- Every player action is logged (`run.actionLog`); `replay(seed, actions)`
  is pure and DOM-free. `npm run test:determinism` plays 200 seeds, replays
  each, and caught a genuine bug on its first run (fixed) — all 200 now
  replay identically. 20 are committed at `test-vectors/heist-v1.json` for
  a future Solidity port.
- `src/engine/` (the abandoned grid-based track) deleted outright.

## Measurement — two targets dropped, one new finding (sessions 1 + 2)

- **`relativeGap`: removed from the harness entirely**, confirmed
  structurally invalid rather than just hard to hit — for a
  constant-per-tick-hazard policy, p95/median = ln(0.05)/ln(0.50) ≈ 4.32 as
  a matter of math, independent of tuning. The 0.06 target came from the
  abandoned grid engine's binary reachability model.
- **`impossibleShare`: confirmed correct at 4.2%, `buildWorld()`
  untouched.** The ceiling against scripted play is already supplied by
  police pressure (`successRate` 60-61%, in the target band the
  reinforcement retune aimed at) — pushing a third of maps into
  unwinnable-by-anyone would be worse, not better.
- **P0 (session 2): is the loot actually playable?**
  `src/harness/rationalBot.ts` plays to maximize expected value — seeks
  loot, then re-evaluates every tick after crossing 10 whether to escape
  (lock the ticket) or hold (risk it to bank loot too), using the game's
  own alert-tier boundary as the "still safe" threshold. **Result:
  `lootKeptRate` is 0% at 1000 trials, robust across the game's entire
  alert-threshold range (3.4s–13s tested).** Median lead is already ~7s by
  crossing 10 — below every threshold tested — so "armed" and "comfortably
  safe" never coincide; the rational move is always to escape immediately.
  No changes made in that session, per instruction — reported as a design
  finding for the project owner.
- **P0 (session 3): the finding above acted on — `LOOT_ESCAPE_AT`.**
  Conservation no longer requires surviving the whole open clock; it
  requires escaping (or timing out) at or past a second, later crossing
  threshold. Swept `LOOT_ESCAPE_AT` 11–16 with the rational bot; caught and
  fixed a real methodological bug before trusting the first (flat-zero)
  result — the bot's inherited `SAFE_LEAD_S=13` interrupt threshold, tuned
  for the old open-ended goal, was firing on the very first tick after
  arming regardless of the new threshold, so the bot never even attempted
  the later crossings. Changed the bot's policy for this bounded goal
  (commit once armed if there's pending value, don't second-guess every
  tick — `SAFE_LEAD_S=0`), re-swept, and got real, varying numbers.
  **Shipped `LOOT_ESCAPE_AT = 11`** — the lowest value clearing the 25–40%
  target band (`lootKeptRate` 37.4% at 11; full table in `CALIBRATION.md`).
  UI: the escape button now reads `ESCAPE — TICKET ONLY` vs.
  `ESCAPE — TICKET + LOOT` depending on `hud.crossed`, with a "N more to
  keep it" counter while carrying something short of the threshold. Full
  reasoning: `DECISIONS.md`'s "P0: LOOT_ESCAPE_AT" entry.
- **P0 (session 4): `LOOT_ESCAPE_AT` replaced outright — a fixed decision
  window, not a second crossing threshold.** New instruction: the game is
  now genuinely unbounded past `ESCAPE_AT` (crossing 12 vs. 30 pays out
  identically); reaching the 10th instead opens a `WINDOW_S = 10` second
  window. Escape inside it and it's ticket-only, same as before. Let it
  lapse — the default, no button press needed — and the run is committed:
  no more escape, ever; only holding to the natural end of the 60s clock
  pays out everything, including loot picked up after the window opened.
  Swept `POLICE_PX`, `POLICE_HEAD_START_S`, and a new `TRAFFIC_DENSITY`
  multiplier against three targets (median secs to the 10th: 40-48s;
  reach-10 rate: 45-55%; conditional survival after commit: 50-65%) with
  the greedy bot (never escapes, so reaching the window always lapses into
  committed unless caught first). **None of the three knobs reach any of
  the targets** — median secs-to-10th stays clamped between ~17s and ~24s
  across the entire range tested (0.85x-2x traffic density, PX 3.0-6.0,
  head start [7,9] down to [1,3], individually and combined), because
  these levers only change whether a run *survives* to the 10th, not how
  fast it *gets there* once nothing kills it — that pace is set by the map
  generation and hop cadence, outside this sweep's scope. No value forced;
  all three constants ship unchanged from their pre-sweep baseline, per
  the brief's own instruction for exactly this outcome. Full table and
  diagnosis: `CALIBRATION.md`'s "P0 follow-up 2" entry; mechanic writeup:
  `DECISIONS.md`'s "P0: the commitment window replaces LOOT_ESCAPE_AT".
- **P0 (session 4 continued): sprint/stamina — the lever that actually
  moved the target.** A decelerating traffic-speed ramp was tried next
  (`TRAFFIC_SPEED_BANDS`) and hit the identical wall for a structural
  reason: any single curve that's a function of total crossings has to
  give a run further past the 10th (exactly what committing requires) a
  *larger* value than one that just reached it — no shape change fixes
  that. The user's next proposal broke the pattern: a sprint gauge (hold
  to run, get winded, recover) throttles *pace* uniformly instead of
  *survival probability* selectively — the missing category of lever.
  First pass showed it could go the wrong way entirely (placeholder
  values made continuous sprinting *faster* on average than not
  sprinting) before it worked. Two more fixes, both the user's own catch,
  got it there: (1) `law()`'s police advance is a fixed rate against the
  *position* gap, so slowing the thief without slowing the police is the
  same as speeding the police up — fixed by slowing both, and traffic too,
  by the same factor while winded (never while sprinting, which stays a
  real advantage); (2) a thief could still wind out mid-crossing on a
  multi-lane road with no way back — fixed by locking hop speed for the
  whole crossing the moment a safe band (pave/stop) is left, releasing
  only on landing back on one. **Shipped: `POLICE_PX = 5.5`,
  `SPRINT_DRAIN_S = 8`, `SPRINT_RECHARGE_S = 10`, `SPRINT_SPEED_MULT =
  1.0`, `WINDED_SPEED_MULT = 0.0`** — clears conditional survival (64.5%,
  target 50-65%) with reach-10 rate (37.4%) and median secsToTenth (39.4s)
  a few points under their floors (45%, 40s), the closest of a
  dozen-plus combinations tried near this point. Accepted as final per
  instruction rather than continuing to search. Full sweep history:
  `CALIBRATION.md`'s "P0 follow-up 4"; mechanic and fix reasoning:
  `DECISIONS.md`'s "P0: sprint/stamina, and why the police/traffic have to
  slow down too".

## Reinforcement — done (session 1)

`REIN_LEAD_S` 20 → 11. Trigger rate 0% (measured) → 16-17% across three
sample runs, inside the 15-25% target. `successRate` cost modest
(64.8% → ~60-61%), `medianCrossings` unchanged at 10.

## Identity — real path + stub (session 1), now backed by a real store (session 2)

`src/game/identity.ts`: `connectInjected()` is real (any EIP-1193 wallet,
no API key). `connectPrivy()` is a documented stub (no app ID configured).
`profile.ts` now writes through to Supabase (see Backend below) instead of
`localStorage` alone.

## `/embed` — done (session 1), reads real data now (session 2)

300px, transparent, no chrome, up to 8 entries each on its own dark plate.
Was synthetic client-generated activity in session 1; now polls real
`feed_events` rows from Supabase when configured, falling back to the
original synthetic generator only when it isn't (never mixed).

## Splash + README — done (session 1)

Three-line splash, once per browser, 3s auto-dismiss, skippable.
README.md replaced entirely; updated again this session for the backend.

## Backend (Supabase) — new this session, P1 + P2

- New dedicated Supabase project ("heist", `wzljvpoqgszhyfaquilm`, free
  tier) — not either of the two unrelated existing projects in the same
  org. 5 tables, address as the primary key throughout, RLS on all of them.
- **P1**: `profile.ts`/`feedBus.ts` push to Supabase fire-and-forget on
  every write; `localStorage` stays the synchronous read path everywhere.
  `reconcileIdentity()` (at wallet-connect time) is the one async path and
  is where "server authoritative" is actually enforced. `FeedWindow`/
  `/embed` poll `feed_events` for real cross-player activity.
- **P2**: `global_drop_counters` replaces the mystery items' old per-run
  independent roll with one global counter per drop type (painting + 5
  items), advanced only through a `security definer` RPC — the table has
  no client write policy at all, so this is genuinely hardened, not just
  moved. `HeistRun` gained an optional `itemRoll` param so this resolves
  via one `Promise.all` *before* construction — the engine itself stays
  100% synchronous, which `replay()`/the determinism harness depend on.
  DEMO never touches the shared counters (stakes:false).
- **Verified**: schema and the RPC, directly via the Supabase MCP tools
  (`apply_migration`, `execute_sql` round-tripped `roll_global_drop()`).
- **Not verified**: a real browser successfully writing to Supabase. This
  sandbox's egress proxy rejects the project's host outright ("Host not in
  allowlist"), confirmed from both a Playwright browser and plain Node —
  the Supabase MCP tool reaches the same project fine, evidently through a
  separate privileged channel. What *was* confirmed under that failure:
  graceful degradation held (`buildRun()` still resolves, a run still
  starts) when the network call fails. **Needs one real smoke test
  somewhere with normal internet access** — the deployed Vercel app, or a
  future session without this sandbox's allowlist — before fully trusting
  the write path. Re-checked in session 3 (P1 was re-attempted per that
  session's brief): both blockers unchanged — the network policy still
  rejects the project host, and Vercel's `list_teams` still returns no
  teams, so there's no visibility into the project's env vars either. See
  `DECISIONS.md`'s "P1: still not verifiable from this session" entry.
- **Not set: Vercel environment variables.** `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are in `.env.example` and were set in
  this session's own local `.env.local` (gitignored) to verify the build,
  but no tool available in this session can write Vercel's project env
  vars. **The deployed app will run in guest-only/local-storage-only mode,
  exactly like before this session, until someone adds those two values in
  the Vercel dashboard.** This is the most actionable single remaining
  step — everything else in P1/P2 is done and waiting on it.

## Demo telemetry + `/stats` (session 3, P2)

- New `demo_runs` Supabase table — same fields the harness bots already
  report (seed, crossings, hearts lost, loot picked-up/kept, outcome) plus
  the full action/input log, so a run is replayable later. No `address`
  column: DEMO is `stakes:false` and was never wallet-gated, so it's
  anonymous by design, same RLS shape as `feed_events` (open insert, open
  select). `demoLog.ts` writes `localStorage` first, then fire-and-forget
  pushes to Supabase, same pattern as the rest of the backend.
- New unlisted `/stats` page: one table, real human DEMO runs against all
  three harness bots on identical metrics (n, median/p95 crossings,
  success rate, loot pickup rate, loot kept rate). The bots run live in
  the page's own browser tab — they're pure functions over `HeistRun`, no
  Node-only dependencies.
- Two real bugs caught and fixed during Playwright verification of the new
  page: the human-row fetch was blocking the whole page before any bot
  trial could run (now two independent effects, the fetch on a 6s
  timeout); and the bot-trial functions never muted `HeistRun`'s sound,
  so 500 trials x 3 bots running inside a real browser tab (as opposed to
  the CLI harness, where `window` is undefined and audio never
  initialises at all) opened up to 1500 live `AudioContext`s and made the
  tab hang. Fixed at the source — `bot.ts`/`greedyBot.ts`/
  `rationalBot.ts` now set `run.soundOn = false` right after constructing
  their `HeistRun`. Full writeup: `DECISIONS.md`'s "P2: demo telemetry"
  entry.
- Side effect of the P0 loot-forfeiture-on-timeout change: added
  `pickedUpLootEver` to `HeistRun` (telemetry-only, survives forfeiture,
  unlike `state.taken`/`state.hands`) and fixed two places that had gone
  stale reading the old fields directly (`greedyBot.ts`'s `lootPickedUp`,
  `measure.ts`'s `lootKeptRateGreedy`).

## What's next

1. **Add the two Supabase env vars to the Vercel project** (see above) —
   the actual unblocking step for everything in P1/P2 to go live. Still
   the single most actionable remaining step; re-confirmed blocked from
   this sandbox in session 3, no change.
2. **Do one real smoke test against the live Supabase project** once the
   env vars are set (play a run, connect a wallet, confirm rows land in
   `profiles`/`stats`/`global_drop_counters`/`feed_events`/`demo_runs`, the
   RPC-driven global item counter increments, `/embed` shows real rows,
   `/stats` shows real human runs, and an address's progress follows it to
   a second browser) — this sandbox couldn't do it (network policy), but a
   normal browser hitting the deployed app can.
3. **Commitment-window balance: closed, accepted as final, not a clean
   triple hit.** Sprint/stamina (session 4 continued) got conditional
   survival into its target band; reach-10 rate and median secsToTenth sit
   a few points under their floors, the closest point a dozen-plus
   combinations found. Accepted per instruction ("on laisse comme ça")
   rather than continuing to search — see `CALIBRATION.md`'s "P0
   follow-up 4" if the target band ever needs revisiting.
4. **Visuals for the two escape outcomes — done.** A ticket-only window
   escape steals a bike and rides off; holding to the end after committing
   gets picked up by a helicopter. New `RunState.heldToEnd` distinguishes
   the two (by how the run ended, not what it's carrying); new
   `OUTRO.bike`/`OUTRO.helicopter` sprites built from the same box/rbox/
   wheel primitives the vehicles already use, plus a new `line()` helper
   for the bike's diagonal frame tubes; `draw()`'s `drawOutro()` plays for
   `OUTRO_TICKS` (~2.6s) before `HeistGame.tsx` shows the summary screen.
   Verified live (Playwright, timers patched locally to trigger both in
   seconds, screenshotted mid-animation) — see `DECISIONS.md`'s "Outro
   animations" entry, which also covers a real bug found along the way:
   `timeLeft` was seeded from a hard-coded `60`, not `DURATION_S`.
5. **Privy** — needs `NEXT_PUBLIC_PRIVY_APP_ID`, then `connectPrivy()` in
   `identity.ts` gets its real implementation.
6. **On-chain ledger / Solidity port** — still out of scope; the
   determinism work and `test-vectors/heist-v1.json` exist so that work has
   something to check itself against when it starts.
7. Minor: `npm run test:determinism` regenerates `test-vectors/heist-v1.json`
   with different (still valid) recorded actions each run, because the
   harness bot's own left/right tie-break is an unseeded coin flip
   (deliberately — it's the bot's policy, not engine state).

## Blockers hit (all resolved or stubbed, none silently skipped)

- No Privy credentials → stubbed (`identity.ts`), documented.
- No test framework installed → used the project's existing `tsx`-script
  harness pattern rather than adding vitest/jest for one test file.
- No way to write Vercel env vars from this session → documented as the
  top "what's next" item instead of silently leaving it unmentioned;
  re-checked in session 3 (`list_teams` still returns no teams), still
  blocked.
- This sandbox's network policy blocks the Supabase project host →
  verified everything reachable from here (schema, RPC, migrations)
  directly via the Supabase MCP tools instead, and documented the one
  thing that still needs a real-network smoke test.
- Session 3: bot-trial functions run live inside `/stats`'s browser tab
  opened real `AudioContext`s (invisible in the Node CLI harness, where
  `window` is undefined) and made the page hang → fixed by muting sound in
  the three harness bots (`run.soundOn = false`), not by working around it
  with more chunking alone.

## Session 5 — carte-blanche pass on the arbitrage doc (P3/P4 correction, P7/P10 contract rewrite)

Given full autonomy for one pass ("fait tout ce que tu peux faire, ne met
rien en attente de ma validation... tu as carte blanche"), against a
direct-answers document that corrected two of my own prior readings and
settled the rest. Order followed was the doc's own: fix P3/P4 → E2E
smoke pass (P9) → HeistPlay wiring status → rest of the contracts.

**P3 (économie du butin) — my prior framing was wrong, corrected.** The
45/45/10 retribution/pot/treasury split is a target *allocation*, not a
full-payout promise; the wallet is banked roughly 1 game in 9, so most of
the retribution line never leaves the till on any given run — that's
expected, not a gap to fix. The wallet table (0/10/20 USDG) stays exactly
as-is, permanently. Rules tab now shows only the three raw wallet-content
odds (nothing/refund/double), no RTP or split language. `economy.ts`,
`CALIBRATION.md`, `RulesTab.tsx`, `DECISIONS.md` all corrected; the
superseded original P3 writeup kept in a collapsed `<details>` for the
record rather than deleted.

**P4 (codes) — also corrected.** Redeeming any code (manual, `ten_wins`,
or `referral` alike) unlocks lifetime status immediately, always — no
deferred condition, ever. The $500-play-volume mechanic is a *separate*
thing: it's how a referrer earns a new code to give out once their
referred player crosses that volume, not a condition on the referred
player's own unlock. `/api/codes/redeem` and `/api/play/finish`'s
referral block rewritten accordingly; new `profiles.referral_reward_granted`
column guards the referrer-reward firing once per referred player.

**P9 (E2E path) — verified what this sandbox can verify.** Local
Playwright against `npm run dev` confirmed DEMO mode and all five tabs
(PLAY/RULES/MY HAUL/DRAW/PROFILE) render and play correctly with no
console errors. Found one real bug this way: `usePrivy()` throws if
`NEXT_PUBLIC_PRIVY_APP_ID` is entirely unset (not the production case —
confirmed not to reproduce once any app ID is present) — documented as a
known, deliberately-unfixed dev-only gap in `DECISIONS.md`. The real
PLAY→connect→pay→win→bonus chain against live Supabase/Privy still can't
be exercised from this sandbox (same standing network block as every
prior session) — see the message to the user for exactly what to click
through to confirm it live.

**P7/P10 (contracts) — `HeistPlay.sol` rewritten for the corrected key
model, P10's decimals requirements built out.** `owner`/`operator`/
`treasury` enforced as three genuinely distinct roles: `treasury` can
start unset (`address(0)`) since the real multisig doesn't exist yet, and
changes only via a 2-step `proposeTreasury`/`acceptTreasury` (no
single-step setter, ever); `owner` and `operator` are enforced distinct
everywhere a role can change; `operator` (a hot server key) is bounded by
new owner-only per-tx/daily payout caps, plus an explicit on-chain
solvency check in `payout()` independent of `SafeERC20`'s own revert
behavior. New `MockUSDG6` mock and a dedicated test block prove the
contract moves raw token units correctly against a 6-decimal token (the
real USDG's actual decimals, verified on-chain this session — see
`DECISIONS.md` P10) rather than ever assuming the ERC20-default 18. New
`scripts/verifyToken.js` is a mandatory pre-deploy guard (chainId,
bytecode, `symbol()`, `decimals()` against a live RPC) — confirmed it
correctly aborts given this sandbox's own blocked egress to the target
RPC, rather than deploying on a guess. 35 contract tests passing (was
21). **Still not deployed anywhere** — per the standing instruction,
repeated throughout the arbitrage doc, that survives even this round's
carte blanche.

Every change this round: contracts committed and pushed after their own
test pass; app-side changes (P3/P4) committed and pushed after their own
verification pass. Nothing held back pending approval, per the explicit
instruction — except any future smart-contract *deployment*, which stays
blocked on the user regardless of how much autonomy is granted elsewhere.
