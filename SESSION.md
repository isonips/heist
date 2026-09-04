# Session summary

Working session on the brief: one seeded engine (no more `src/engine/`
dead code), a difficulty/RNG measurement pass, reinforcement retuned,
address-based identity, `/embed`, and a splash screen. All six priorities
in the brief got real work; none were skipped. Details and reasoning for
every non-obvious call are in `DECISIONS.md`, organized by the same six
numbered sections as below. Tuning history and every measured number is in
`CALIBRATION.md`.

Every commit in this session builds, typechecks, and lints clean
(`npx tsc --noEmit`, `npx eslint src --max-warnings=0`, `npm run build`) —
checked before each one, not just at the end.

## 1. Determinism — done

- `HeistRun` takes an optional `seed`; every `Math.random()` in the sim path
  (world generation, loot, mystery items, furniture, the wallet roll, even
  the cosmetic alert-text picker) now draws from one of six independent
  seeded streams (`DECISIONS.md #1`), so extending one domain never shifts
  another.
- Every player action (move/escape/use-item) is logged as `[tick, action]`
  in `run.actionLog`. `replay(seed, actions) -> Result` is pure and DOM-free.
- `npm run test:determinism` plays 200 seeds, replays each, and failed on
  its first real run — a genuine bug (`replay()` advancing one tick past
  where the source bot loop stopped after an escape). Fixed; all 200 seeds
  replay identically now. 20 of those are committed at
  `test-vectors/heist-v1.json` as a reference for a future Solidity port.
- `src/engine/` (the abandoned grid-based track, nothing ever imported it)
  is deleted outright, not left dormant. Its one reusable file, `rng.ts`,
  moved to `src/game/rng.ts`.

## 2. Measurement — done, two targets not chased

- `src/harness/greedyBot.ts` (never escapes at 10, detours for loot, plays
  to its natural end) makes `relativeGap` measurable for the first time —
  it was structurally 0 before (the old bot always stopped at exactly 10).
- `src/harness/solver.ts` computes `impossibleShare` by replaying the real
  `buildWorld()`/traffic logic with collisions and the police catch both
  switched off (`HeistRun`'s new `invincible` flag).
- Measured: `relativeGap` 1.40 (target < 0.06), `impossibleShare` 4.2%
  (target 30-35%), `lootPickupRate` 68.8%. The first two are far from their
  targets and I did not force-tune either — full reasoning in
  `CALIBRATION.md`'s measurement section and `DECISIONS.md #2`. Short
  version: closing `relativeGap` looks like it would need a different
  hazard model, not a parameter; closing `impossibleShare` would mean
  redesigning map generation so roughly a third of maps are unwinnable by
  anyone — a real design decision, not a calibration nudge, and the brief's
  explicit "you decide, tune it" mandate was scoped to reinforcement (item
  3), not this. **This is the one open item most worth the project owner's
  own look** — see "What's next" below.

## 3. Reinforcement — done

`REIN_LEAD_S` 20 → 11. Trigger rate was 0% (measured, not assumed) at 2000
trials; now 16-17% across three separate sample runs at 3000-5000 trials
each, inside the 15-25% target. `successRate` cost was modest (64.8% →
~60-61%), `medianCrossings` unchanged at 10. Full sweep table in
`CALIBRATION.md`.

## 4. Identity — done, one path real, one stubbed

`src/game/identity.ts`: `connectInjected()` is a real, working EIP-1193
wallet connection (no API key needed). `connectPrivy()` is a stub — no app
ID configured in this environment — with the identical `Identity` shape, so
swapping in the real SDK later touches one function body, not any call
site. `profile.ts` now scopes every stat/username/ticket read-write to the
connected address (or an anonymous guest bucket otherwise), with
`reconcileIdentity()` implementing the actual policy a real backend will
also need (returning address's record wins; first connect claims guest
progress once). No real backend was stood up — `localStorage` keyed by
address stands in for it, deliberately, per the session's own instruction
to stub missing external access rather than build it. `DECISIONS.md #4`.

## 5. `/embed` — done

300px, transparent body, no window chrome, no game board, up to 8 entries
each on its own dark plate — reusing the real feed's own `lines.ts`/
`feedBus.ts` machinery, not a parallel rendering path. Content is synthetic
(client-generated plausible activity) because there's no shared backend
feed to pull real cross-visitor events from yet — flagged clearly in the
page's own comments and `DECISIONS.md #5` so it isn't mistaken for real
data later.

## 6. Splash + README — done

Three-line splash (`CROSS TEN ROADS` / `THE COPS ARE BEHIND YOU` / `GRAB
WHAT YOU CAN`), shown once per browser via a `localStorage` flag,
auto-dismisses after 3s, skippable by click/tap/any key. README.md replaced
entirely — was still the unedited `create-next-app` boilerplate; now
describes the actual project, the seeded engine, the harness/calibration
workflow, and what's real vs. stubbed in identity/`/embed`.

## What's next (not started, or deliberately left open)

- **`impossibleShare`/`relativeGap` gap** (see #2 above) — needs a design
  decision from the project owner, not another tuning pass. If the 30-35%
  `impossibleShare` target is truly wanted, `buildWorld()`'s lane-count
  distribution needs to occasionally roll much harder traffic than its
  current uniform 1-4 lanes; that's a bigger, riskier change than anything
  else in this session and deserves explicit sign-off given it means some
  maps become unwinnable regardless of skill.
- **Privy** — needs `NEXT_PUBLIC_PRIVY_APP_ID` (or equivalent) added to the
  Vercel project's environment variables, then `connectPrivy()` in
  `src/game/identity.ts` gets its real implementation swapped in.
- **A real backend** — everything currently standing in for "the server"
  (profile/stats storage, the painting/mystery-item global counters, the
  `/embed` feed) is `localStorage` or client-only. The shapes are all
  written to make that swap contained (see `DECISIONS.md #2, #4, #5`), but
  none of it is provisioned — no database was created in this session,
  intentionally, since that's real infrastructure with a cost and a
  security surface that isn't mine to stand up without the owner present.
- **On-chain ledger / Solidity port** — explicitly out of scope for this
  session (per the original brief's phase-3 framing across the whole
  project). `test-vectors/heist-v1.json` exists specifically so that work
  has something to check itself against when it starts.
- Minor: re-running `npm run test:determinism` regenerates
  `test-vectors/heist-v1.json` with a *different* (still internally
  consistent) set of recorded actions each time, because the harness bot's
  own left/right tie-break uses an unseeded coin flip (deliberately — it's
  an external "player" policy choice, not engine state, so it was never
  folded into the engine's seeded streams). Harmless — the file it produces
  is always a valid, replayable fixture set — but worth knowing before
  wondering why that file shows a diff after just running the test.

## Blockers hit (all resolved or stubbed, none silently skipped)

- No Privy credentials → stubbed (`identity.ts`), documented, moved on.
- No database/backend → stubbed (localStorage stands in throughout),
  documented, moved on.
- No test framework installed → used the project's existing `tsx`-script
  harness pattern instead of adding vitest/jest for one test file; a
  deliberate scope call, in `DECISIONS.md`'s style even though it didn't
  get its own numbered entry (it's a tooling choice, not a gameplay one).
