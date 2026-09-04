# Session summary

Three working sessions on the same brief, continued in one file. First
pass: one seeded engine (`src/engine/` dead code deleted), a difficulty/RNG
measurement pass, reinforcement retuned, address-based identity (stubbed),
`/embed`, a splash screen. Second pass: two of the first pass's metric
targets confirmed invalid and dropped, a third bot answering "is the loot
actually playable" (P0 — found `lootKeptRate` 0%, reported as a design
finding), and a real backend (Supabase) for profile/stats/feed/global drop
counters (P1, P2). Third pass (this one): the P0 finding acted on by
changing the conservation rule itself (loot banked by pushing past a
threshold, not by surviving the whole clock), P1 re-checked and still
blocked from this sandbox, and demo-run telemetry + an unlisted
human-vs-bot comparison page (P2). Details and reasoning for every
non-obvious call are in `DECISIONS.md`; tuning history and every measured
number is in `CALIBRATION.md`.

Every commit in both sessions builds, typechecks, and lints clean
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
3. `LOOT_ESCAPE_AT = 11` is shipped (session 3) — no longer a decision
   waiting on the project owner. If the target band or the underlying
   police/clock calibration ever changes, re-run
   `src/harness/sweepLootEscape.ts` rather than hand-picking a new value;
   full sweep table in `CALIBRATION.md`.
4. **Privy** — needs `NEXT_PUBLIC_PRIVY_APP_ID`, then `connectPrivy()` in
   `identity.ts` gets its real implementation.
5. **On-chain ledger / Solidity port** — still out of scope; the
   determinism work and `test-vectors/heist-v1.json` exist so that work has
   something to check itself against when it starts.
6. Minor: `npm run test:determinism` regenerates `test-vectors/heist-v1.json`
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
