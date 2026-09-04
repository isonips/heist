# Decisions

Calls made without stopping to ask, per this session's instructions, with the
reasoning behind each. Newest at the bottom of each section as the session
progresses; sections correspond to the priority list in the brief.

## 1. Determinism

**Domain split.** The brief names five streams (map, trafic, butin, items,
mobilier). The actual `Math.random()` call sites in `heistRun.ts` didn't
divide cleanly into exactly five, so two calls needed a home the brief didn't
name:

- The police head-start roll (`POLICE_HEAD_START_S`) went into the `map`
  stream. It's part of one-time run setup alongside `buildWorld()`, not a
  per-tick police decision, so it reads more like "where the world starts"
  than "police behaviour."
- The alert flavour-text picker (`drawBag()` — which of several equivalent
  lines like "THE GAP IS CLOSING" shows) got its own sixth stream,
  `presentation`. It has zero effect on outcome, but a replay should look
  identical too, not just play identical, so it still needed to be seeded
  rather than left on `Math.random()`. Leaving even one unseeded call site
  would have meant the class still wasn't fully pure.
- `buildWorld()` itself splits across two streams: lane count / truck lane /
  direction go to `map` (world structure), the per-lane traffic phase offset
  goes to `traffic` (how that structure looks in motion). This is the one
  genuinely arguable split in the file; either domain would have been
  defensible, and this is the reading I shipped.

**The painting drop is intentionally excluded from the seed.** It's a
stand-in for a global, cross-player rare-drop counter (see
`paintingStore.ts`) — state that lives in this browser's `localStorage`
across every game ever played here, not state that belongs to one run's
seed. Folding it into a domain stream would have been actively wrong: it
would make "the same seed always produces the same painting-or-not," which
isn't true of the real mechanic it's standing in for, and isn't something a
future backend-driven version could honour either. Instead `HeistRun`'s
constructor takes an injectable `paintingRoll: () => boolean`, defaulting to
the real `rollPaintingDrop`; `replay()` defaults it to `() => false` so a
pure replay never touches `localStorage` and never needs the browser's
current global counter state to reproduce a result. A caller that wants a
replay to also reproduce the historical painting roll can pass the actual
outcome in explicitly (not needed yet — no caller does this).

**`runId` and the no-seed constructor path stay on `Math.random()`.**
`runId` is a telemetry label, not gameplay state — never read back into any
decision the engine makes. The constructor's default seed (`new
HeistRun()`, no argument) is `Date.now() ^ random`, i.e. still
non-deterministic on purpose: ordinary play should get a fresh, unpredictable
world every time, exactly like today. What changed is that the seed is now
*recorded* (`run.seed`), so an ordinary play session becomes replayable and
verifiable after the fact — determinism was never about forcing players onto
fixed seeds, only about making whichever seed they got reproducible.

**Furniture slot order used to be `arr.sort(() => Math.random() - 0.5)`.**
That's both unseeded and a known-biased shuffle (the comparator gets called
an unpredictable number of times per pair, so the result isn't uniform).
Replaced with a seeded Fisher-Yates (`shuffle()` in `rng.ts`). This is a
strict improvement to a purely cosmetic roll (which of four fixed slots gets
a bin vs. a tree first) — flagging it here because it's a behavior change,
even though nothing about play should be able to tell the difference.

**`Math.round(Math.random() * spacing)` (traffic phase) became
`nextRange(state, 0, spacing)`.** The original wasn't perfectly uniform at
the endpoints (an artifact of `round` on a continuous roll); `nextRange` is.
Noted for the same reason as the shuffle — a real but inconsequential
behavior change, not a hidden one.

**`src/engine/` is now fully deleted, not just dormant.** Confirmed nothing
imports it. `rng.ts` (the one genuinely reusable, model-agnostic part) moved
to `src/game/rng.ts` and gained `nextFloat`, `shuffle`, and `deriveStream` —
the pieces the live engine's conversion needed that the grid engine's
version didn't have. `solver.ts`'s reachability-constrained greedy planner
and `map.ts`'s generation-time perfect-play check don't port literally —
they're written against a 13-column discrete grid (`Lane`, `TrafficStrip`,
`COLS`) that has no equivalent in `heistRun.ts`'s continuous-pixel,
vehicle-list world. The *concept* (a lookahead-based reachability solver,
used both as a smarter bot and as an "is this seed even winnable" check) is
reimplemented natively against the real data model in `src/harness/` for
priority 2, rather than the original grid code being kept around unused.

**The determinism test (`src/harness/determinism.ts`, `npm run
test:determinism`) found a real bug on its first run** — not a false
positive, an actual replay divergence, on ~85% of the first 200 seeds. Worth
recording because it's exactly the kind of bug this priority exists to
catch: `replay()` called `run.advance()` unconditionally after applying each
tick's actions, but `src/harness/bot.ts`'s loop — the thing that produced the
action log in the first place — calls `escapeNow()` and then `break`s
*without* a further `advance()`. So any run that ended by escaping replayed
one tick longer than it actually ran. Fixed by having `replay()` check
`run.live()` after applying actions and stop there too, mirroring the source
loop exactly. All 200 seeds replay identically after the fix. Endings by
being caught or running out of time were never affected — `law()`/`clock()`
already flip `mode` to a non-live value *inside* the `advance()` call that
was going to happen anyway, so there's no asymmetric extra step for replay
to introduce there.

**Test vectors live in `test-vectors/heist-v1.json` (tracked in git), not
`harness-out/`** (gitignored, regenerable scratch output from the existing
calibration harness). These 20 fixtures are meant to outlive this session —
a reference the future Solidity port can replay against — so they needed to
actually be committed, not thrown away between runs.

