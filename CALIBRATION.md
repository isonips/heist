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

## What 1000 trials say (bot: escapes the instant 10 crossings arms the door)

```
successRate            0.833   (833 escaped / 38 caught / 129 out of hearts)
medianCrossings        10      (p95 also 10 — the bot never grinds past the goal)
medianHeartsLostOnWin  1
reinforcementTriggerRate 0.971
medianLeadAtSeventhS   ~32s
```

Notes on reading this table:

- **`relativeGap` (p95 vs median) isn't a useful number here** — it was a
  code-brief metric for the abandoned grid engine, measuring luck-driven
  spread across seeds at a fixed skill level. This bot always stops at
  exactly 10 crossings (the rational move once escape is armed), so
  median = p95 = 10 by construction. A gap metric worth trusting would need
  to compare *time-to-tenth-crossing* across trials instead.
- **129/1000 trials (13%) still die before reaching 10** even with a bot
  that dodges reasonably well — reaching the goal at all is genuinely not
  trivial, which matches what manual playtesting found.
- **Reinforcement fires on 97% of runs.** The bot's natural pace puts it
  ~32s ahead of the police by the 7th crossing, far past the 20s trigger —
  so for a bot (or a fast human), reinforcement isn't an occasional rubber
  band, it's closer to a guaranteed core mechanic. Worth deciding deliberately
  (raise `REIN_LEAD_S`, or lean into it) rather than leaving as a side effect.
- **83% bot win rate** is a data point, not a verdict — it's exactly as good
  as the bot in `src/harness/bot.ts` (a simple forward/dodge heuristic with a
  4-tick lookahead), not an optimal player. Treat it as a ceiling estimate,
  same spirit as the code brief's original intent, not a finished RTP number.

## Known-fixed issues

- `buildMap` (the dormant `src/engine/`) could end on a live 'road' lane
  with no closing verge, stranding the player in traffic forever.
- The live game's `escapeNow()` used to keep whatever was in hand; both
  briefs require escaping to forfeit carried loot (ticket only).
- Surviving the 60s clock used to pay out regardless of crossings; now only
  pays out at `crossed >= ESCAPE_AT`, otherwise it's a loss (`outcome:
  'timeout'`).
