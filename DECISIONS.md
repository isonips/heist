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

## 2. Measurement

**`HeistRun` gained an `invincible` constructor flag, used only by the
solver.** `impossibleShare` needs "perfect play, ignoring lives and police"
against the *real* map/traffic logic — reusing `buildWorld()`/`step()`/
`vehiclesIn()` exactly, not a second copy of them (explicitly ruled out:
"deux copies divergeront"). `invincible` just short-circuits the two places
that end a run early (`collide()`'s life loss, `law()`'s catch check) and
changes nothing else — police still moves, traffic still runs, the map is
exactly what a real player would see. Never set outside
`src/harness/solver.ts`; the default constructor path (`new HeistRun()`,
what every real play session uses) is unaffected.

**`stopX`/`lootX`/`lootAt`/`itemX`/`itemAt` became public.** They were
`private` on `HeistRun` but are pure reads (no side effects, already used by
`draw()`) — the greedy bot needs to know whether loot/an item exists at the
stop it's standing on and where, and re-deriving that eligibility logic
(crossed-count gating, the taken-flag, the one-per-run item rule) outside
the class would have been exactly the kind of duplication this whole session
is meant to avoid. Widening five getters' visibility is a much smaller,
safer change than that.

**`relativeGap` (1.40 literal / 1.18 fixed-skill) and `impossibleShare`
(4.2%) both landed far from their targets (< 0.06, 30-35%), and I did not
force-tune either one to hit them.** Full reasoning and numbers are in
`CALIBRATION.md`'s new "relativeGap, impossibleShare, lootPickupRate"
section; the short version: `relativeGap` staying large looks structural to
a "keep playing against constant risk" bot rather than a tunable parameter,
and closing `impossibleShare`'s gap would mean redesigning `buildWorld()` so
roughly a third of maps are unwinnable by anyone, which is a real
game-design decision (not obviously "more calibrated," could easily read as
"less fair") that the brief didn't ask me to make outright — it asked me to
measure, and named `POLICE_PX`/`REIN_LEAD_S`-style tuning explicitly only
for priority 3 (reinforcement). Flagging both numbers here rather than
quietly reworking map generation to chase a target inherited from the
abandoned grid engine's own calibration, which may not even transfer.
`lootPickupRate` (68.8%) is the one number here that's a clean, useful
result on its own, not a target to hit.

## 3. Reinforcement

**Retuned rather than removed.** `REIN_LEAD_S` went from 20 to 11
(measured: 0% trigger rate down to 16.3% at 5000 trials — inside the
15-25% target). Chose retuning over removal because the mechanic has real,
already-built presentation (the "A CRUISER JUST CUT IN" banner, the
red-flood critical wash it forces, the reinforcement car animation and
`laugh()` sting) that only ever fires in this one moment — deleting it would
throw that away for a problem that a one-constant change actually fixes.
`REIN_FROM` (crossing 7, when reinforcement becomes eligible at all) and
`POLICE_MAX_LEAD_S` (26, the *separate* elastic-push threshold that scales
police speed) are untouched — this and the earlier `POLICE_PX`/
`POLICE_HEAD_START_S` retune are now two independently-tuned levers, and
conflating them again risked repeating the earlier mistake (documented in
`CALIBRATION.md`'s police-pacing section, from before this session) where
lowering `POLICE_MAX_LEAD_S` directly suppressed reinforcement by preventing
lead from ever growing large enough to arm it.

## 4. Identity

**Privy is stubbed; the injected-wallet path is real.** No Privy app ID is
configured in this environment (no API key, per the session's own
instruction to stub what's missing and move on) — `connectPrivy()` in
`src/game/identity.ts` always rejects, with a message that says exactly
that. `connectInjected()` needed no key at all: `window.ethereum` is either
there or it isn't, and `eth_requestAccounts` is a standard EIP-1193 call, so
that path is genuinely functional today, not just scaffolding — it's the one
button on the Profile tab that actually connects a real wallet. Both
functions return the same `Identity` shape (`{ address, source }`), so
wiring in `@privy-io/react-auth` later replaces one function body, not any
call site in `profile.ts` or `ProfileTab.tsx`.

**"The server is authoritative" is honoured as a *shape*, not a real
backend.** There is no database or API route to be authoritative from in
this session (provisioning one — e.g. via the Supabase MCP tool available
here — is real infrastructure I'm not standing up unilaterally without the
project owner's go-ahead, especially mid-session with nobody watching).
What ships instead: `localStorage` keys scoped by address
(`heist-stats-v1::0xabc...`) stand in for "a row keyed by address on a
server," and `reconcileIdentity()` implements the actual policy that
matters regardless of what's behind it — a returning address's own record
always wins over the guest bucket; a first-time connect claims whatever was
played as a guest, once, not on every reconnect. When a real backend
exists, `profile.ts`'s functions (`getStats`, `recordGameResult`, etc.) are
the only things that need their bodies swapped from `localStorage` calls to
network calls — every call site elsewhere in the app is already written
against "read/write the active profile," not against `localStorage`
directly.

**Existing guest data isn't touched or migrated automatically.** Someone
who's been playing without connecting keeps using the same unscoped keys
(`heist-stats-v1`, no `::address` suffix) this file always used — nothing
about this change requires or forces a connection. Reconciliation only ever
runs at the moment of an explicit connect click.

## 5. `/embed`

**Content is synthetic, not a real shared feed.** There's no backend to pull
genuine cross-visitor activity from (same limitation as the mystery-item
drops and painting rarity elsewhere in this codebase — see `MyHaulTab`/
`paintingStore.ts` from before this session). `/embed` generates plausible
lines client-side on an interval, through the *exact same* `lines.ts`
bag-draw and `postFeedEvent`/`subscribeFeed` machinery the real feed uses —
so the moment a real shared event stream exists, this page's fake generator
`useEffect` is what gets deleted, and nothing about the rendering or the
copy needs to change. Flagging this prominently because an acquisition
widget showing fabricated activity is the kind of thing that reads fine in
a demo and badly in production if anyone forgets it's still a stand-in.

**300px was already load-bearing, not a number I picked.** `lines.ts`'s own
header comment says every line is written to fit "a 300px embed" — this
route is the first thing that actually cashes that constraint in, rather
than introducing a new one.

**Transparency is done with a route-scoped `<style>` override, not a nested
layout touching `<body>`.** Next's App Router only lets the *root* layout
own `<html>`/`<body>`; a nested layout can't change the tag itself, only
what's inside it. Cheapest correct fix: `/embed`'s page emits
`html,body{background:transparent!important}` inline, scoped to just that
route by virtue of only that page rendering it — every other route keeps
`globals.css`'s solid background untouched.

**No composer, no collapse, no window chrome, read-only.** The brief's
"sans chrome ni compositeur" — this is meant to be dropped into someone
else's page as a passive activity ticker, not a second copy of the app's
own UI; interactivity (sending a message, collapsing) belongs to the real
`FeedWindow`, not an embed.

