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

---

# Follow-up session: two corrections confirmed, one new finding (P0)

The project owner confirmed both open items from #2 above were real problems
with the *brief's targets*, not gaps in the measurement, and told me to
apply the same judgment going forward without stopping to check.

## relativeGap — removed

Confirmed: for a policy riding out a roughly constant per-tick hazard, the
95th-percentile-to-median ratio is `ln(0.05)/ln(0.50) ≈ 4.32` as a matter of
the math, not the tuning — no combination of `POLICE_PX`/`REIN_LEAD_S`/
anything else was ever going to land this near 0.06. The 0.06 target came
from the abandoned grid engine's binary reachable/not-reachable model, which
this game's continuous survival process doesn't resemble. Removed
`relativeGap` and `relativeGapFixedSkill` from `src/harness/measure.ts`
entirely, and the vestigial `relativeGap` field from `src/harness/sweep.ts`'s
`SweepSummary` too (same invalid-metric family, even though it was trivially
0 there for an unrelated reason — the cautious bot's crossings distribution
is a point mass at 10 by construction). `p95Crossings` stays in
`SweepSummary` as a plain stat; only the ratio is gone. Reasoning recorded
in `CALIBRATION.md`'s "relativeGap: dropped" section, not just here, since
that's where someone re-running the harness would look first.

## impossibleShare — confirmed correct at 4.2%, `buildWorld()` untouched

Confirmed: the ceiling against scripted play is already supplied by police
pressure (`successRate` 60-61%, inside the target band the `REIN_LEAD_S`
retune was aimed at), so pushing a third of maps into "unwinnable by
anyone" would be degrading the game to satisfy a target whose actual goal
(a real, present ceiling on scripted/bot play) is already met a different
way. No code changed for this item this pass — `CALIBRATION.md` gained a
short section recording that the number was re-checked and the decision to
leave `buildWorld()` alone stands, so a future reader doesn't wonder whether
4.2% was ever looked at again.

## P0: rational bot — loot is not currently reachable by rational play

New work, not a correction. `src/harness/rationalBot.ts`: same movement/
loot-seeking policy as the greedy bot, but once armed it re-evaluates every
tick whether to escape (lock the ticket, forfeit anything held) or hold
(risk the ticket and the loot for a chance to bank both) — hold only while
there's something worth holding *and* the lead is still above `SAFE_LEAD_S`.

**Threshold choice: `SAFE_LEAD_S = 13`, the exact far/mid boundary
`heistRun.ts`'s own `alerts()` already uses**, not a new invented number —
a rational player has no better signal than what the shipped game actually
shows them (the alert-level banner), so the bot uses the same one. This
isn't a fully Bellman-optimal exit policy (that needs its own simulation
study to estimate P(survive | lead, time left) properly, disproportionate
to what P0 asked for); it's a defensible, principled threshold, and its
defensibility matters here because the finding it produced is stark.

**Result: `lootKeptRate` is 0% at 1000 trials, and `reachedTenthRate`
exactly equals `ticketRate`** — meaning in a thousand trials, the "hold"
branch of the policy never fired even once; every run that reaches crossing
10 escapes with the ticket on that exact same decision point. Before
trusting a single threshold's result, swept `SAFE_LEAD_S` across the game's
entire alert range (3.4/6.5/13, critical through far) to check this wasn't
an artifact of picking 13 specifically — `lootKeptRate` stayed at 0.0-0.7%
across all three. The reason is structural: median lead is already down to
~7s by the time crossing 10 is reached (consistent with
`medianLeadAtSeventhS` measured earlier in `CALIBRATION.md`), which sits
below every threshold tested — there is no point during a run where
"armed" and "comfortably safe by the game's own definition" coincide, so a
rational reading of the game's own signals says escape immediately, always.

**I made no changes in response to this finding, per the explicit
instruction not to.** It's reported as a design finding, not a bug: the
wallet/painting/mystery-item economy, as currently paced, is only ever
banked by a player choosing to override their own better judgment and gamble
past what the game itself is telling them is safe — never by playing
rationally. What (if anything) changes about pacing, the escape mechanic, or
the loot economy's shape as a result is the project owner's call.

## P1: real backend (Supabase)

**New, dedicated Supabase project ("heist", id `wzljvpoqgszhyfaquilm`, org
"Megamble"), not one of the two existing projects in that org
("Megamble", "Onepot").** Both already exist and are presumably serving
other, unrelated apps under this account — mixing this game's schema into
either would risk an unrelated app's data/migrations, for no benefit.
Free tier (`get_cost` returned $0/month before creating it, confirmed via
`confirm_cost` — no paid commitment made on anyone's behalf without a
number to check).

**Schema** (full SQL in the Supabase migration `initial_schema`, applied
via the MCP tool — also readable with `list_tables`/`execute_sql` against
project `wzljvpoqgszhyfaquilm`): `profiles` (address PK, username),
`stats` (address PK/FK, the same six counters `ProfileStats` always had),
`tickets_daily` (address+day composite PK, count — "today" and "best day"
are plain aggregate queries over this now, not fields kept in sync by
hand), `global_drop_counters` (item_key PK, games_count, threshold — one
row per drop type, P2), `feed_events` (id, type, text, address nullable,
self, created_at).

**Architecture: localStorage stays the synchronous read path everywhere;
every write pushes to Supabase fire-and-forget.** Rewriting every caller
(`HeistGame.tsx`'s tick loop, `ProfileTab.tsx`) to be async throughout would
have been the "purer" architecture, but it meant touching the tick-loop
code that P1-P3's determinism/calibration work depended on being stable,
under real time pressure, for a change that doesn't need it: the brief's
own words — "localStorage n'est qu'un cache réconcilié **au chargement**"
— already describe exactly this shape. Reconciliation
(`reconcileIdentity()` in `profile.ts`) is the one place that's genuinely
async (it already lived inside `ProfileTab.tsx`'s async `connect()` flow),
and it's where "server authoritative" actually gets enforced: a returning
address's server record overwrites the local cache outright; a new address
claims the guest session's local progress by writing it to the server once.
Ordinary gameplay writes (`recordGameResult`, `recordTicketWon`,
`setUsername`) keep their exact original synchronous signatures and local
behavior, and additionally fire an unawaited `.upsert()` when an identity
is connected — a slow or failed push never blocks the UI or the local
write, by design, same trust model a cache-then-reconcile system implies.

**Feed moved too** (explicitly listed in the brief's P1: "bascule profil,
statistiques, compteurs globaux **et feed** dessus"). `postFeedEvent`
still fires the local in-memory pub/sub first (instant same-tab feedback —
no reason to wait on a round-trip to see your own action), and additionally
inserts into `feed_events` when `self=true` — ambient/system placeholder
lines (`self=false`) are never written to shared storage, since they aren't
real plays and would pollute real data with fake ones. `FeedWindow.tsx`
polls `feed_events` every 6s and merges new rows in (deduped against
recent local entries by text-within-20s, so a message this tab just sent
doesn't double up once the poll reads it back). Chose polling over a
Supabase Realtime channel: simpler, no subscription lifecycle to manage,
and entirely adequate at a feed's actual pace — nothing here needs
sub-second latency.

**The typed chat message itself (the `you: {text}` line, not the flavour
line `postFeedEvent` already draws) is not pushed to the server.** It was
already local-only before this session and stays that way — broadcasting
free-text player input to every viewer is a moderation-relevant decision
("$0.10" in the composer's placeholder implies a real payment gate that
doesn't exist yet either) that P1's "move the feed onto Supabase" doesn't,
on its own, obviously include. Narrower scope, flagged rather than silently
expanded.

**`/embed` now reads real `feed_events` rows** (polling, same pattern as
`FeedWindow`) instead of generating synthetic activity — but only when
Supabase is configured; the synthetic generator from the earlier `/embed`
work stays as a fallback for local dev with no env vars set, gated so it
can never run alongside real data (checked once via `isSupabaseConfigured()`,
not per-row).

**I could not verify the live client integration end-to-end from inside
this sandbox — flagging this plainly rather than claiming a test that
didn't happen.** This environment's egress proxy rejects the Supabase
project's host outright (confirmed both from a Playwright-driven browser
and a plain Node script: `"Host not in allowlist:
wzljvpoqgszhyfaquilm.supabase.co"`), while the Supabase MCP tool itself
reaches the same project fine — it evidently goes through a different,
privileged channel than this sandbox's general internet egress. So: the
**schema and the RPC function are verified directly** (`apply_migration`
succeeded, `list_tables` shows all 5 tables with RLS on, `execute_sql`
round-tripped `roll_global_drop()` and confirmed it increments correctly).
The **client code is typechecked, lint-clean, and follows
`@supabase/supabase-js`'s standard patterns** (`createClient` +
`.from().select/.insert/.upsert()` + `.rpc()`) throughout. What's
**not verified** is a real browser successfully calling out to
`wzljvpoqgszhyfaquilm.supabase.co` and a row landing in the table — that
needs testing somewhere with normal internet access (the deployed Vercel
app, or a future session without this sandbox's allowlist). One thing this
sandboxed test *did* confirm usefully: when the network call fails
outright, `buildRun()` still resolves and the run still starts
(`rollGlobalDrop()`'s try/catch returns `false` rather than throwing) — the
graceful-degradation path this was designed around held up under an actual
failure, not just in theory.

**Env vars**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(`.env.example` added, `.env.local` set locally for this session's own
`npm run build` checks, gitignored as usual). These are **not set in
Vercel** by me — no tool in this session can write Vercel project
environment variables, and this is exactly the kind of external-config gap
the brief says to stub and flag rather than block on: `getSupabase()`
returns `null` when they're absent, and every caller already degrades to
the pre-P1 local-only behavior in that case, so the deployed app keeps
working (guest-only, local storage, no shared counters) until someone adds
the two values to the Vercel project settings. README.md documents this.

## P2: global drop counters, server-side

**One `global_drop_counters` row per drop type — the painting (already had
exactly this model client-side, `paintingStore.ts`) plus, new, each of the
five mystery items**, which previously used an independent per-run Bernoulli
roll off the seeded `itemRng` stream (`ITEM_ODDS`) — explicitly *not* a
global counter, and exactly what the brief says must not be true anymore
("jamais de la performance individuelle").

**The roll is a `security definer` Postgres function
(`roll_global_drop(item_key) returns boolean`), not a client
read-then-write.** `global_drop_counters` has a `select`-only RLS policy for
anon — no insert/update/delete grant at all — so the function is the *only*
path that can change a row, and it does the increment-and-maybe-reset
atomically inside one `for update`-locked transaction. This is the one
place in this whole session's backend where I actually hardened something
past "same trust level localStorage already had": a client can no longer
inflate its own drop odds by manipulating a client-side counter, because
there isn't one anymore — the number that matters lives only in a table
the client can't write to directly.

**Thresholds are randomised ranges chosen so the long-run mean matches the
original `ITEM_ODDS`** (e.g. `oldMan` 1/12 → threshold uniform in [8,16],
mean 12; `haul` 1/2400 → [1600,3200], mean 2400) — same spirit as
`paintingStore.ts`'s existing 50-150 range for the painting, extended to
the other five. This preserves each item's original *rarity feel* while
changing *what it's a rarity of* (games played globally, not one player's
own run) — the actual point of P2.

**`HeistRun` gained an optional 4th constructor param, `itemRoll?: (item:
ItemKey) => boolean`, mirroring how `paintingRoll` already worked.** Left
undefined, the class falls back to its existing local seeded behavior
(`itemRng`) exactly as before — this is what the harness, `replay()`, and
every determinism/calibration test still use, unchanged, on purpose: those
need to stay pure and offline regardless of whether a backend exists.
`itemRng` still independently decides *where* an item appears (`nextInt`
for board position) even when `itemRoll` is supplied — only the *whether/
which* decision moved.

**Async pre-fetch happens *before* `HeistRun` is constructed, never inside
it** (`src/game/buildRun.ts`): the mode-select screen already had a natural
async boundary (picking PLAY/DEMO, or hitting RUN AGAIN), so a real
Supabase-backed session calls `roll_global_drop` for all 6 drop types via
one `Promise.all` there, then constructs `new HeistRun(seed, () =>
paintingHit, false, (item) => itemResults.get(item))` with everything
already resolved to plain synchronous closures. This was the one
non-negotiable constraint: `HeistRun`'s constructor, `advance()`, and
`replay()` all had to stay 100% synchronous no matter what — making
construction itself async would have broken `replay()`'s "pure, DOM-free"
contract and the whole determinism-test harness this session's priority 1
was built around. `HeistGame.tsx` shows "SHUFFLING THE DECK…" for the ~0
(no backend)–300ms (backend configured) gap this adds before a run starts.

**DEMO never touches the global counters, backend configured or not.**
Stakes:false means no ticket, no wallet payout, no ledger write (true since
before P1) — rolling the shared counters for a run that structurally can't
bank anything would just spend real players' shared, finite-feeling rarity
budget on nothing. `buildRun(demo, seed)` checks `demo` first and returns
`new HeistRun(seed)` (local defaults) immediately, without calling
`globalDrops.ts` at all.

**`haulStore.ts` (per-player counts of items *earned*, for a display that
was already removed earlier this session — see the MY HAUL section) was
not migrated to Supabase.** It's a personal stat, not a global counter — no
fairness-across-players concern the way item *rarity* has — and nothing
currently displays it. Left local-only; would follow the same `profile.ts`
pattern later if the display ever comes back.

## Third session: P0 follow-up (LOOT_ESCAPE_AT), P1 verification, P2 demo telemetry

## P0: LOOT_ESCAPE_AT

**Rule, not retune** — the clock, police constants, and `buildWorld()` are
all untouched. `escapeNow()` and `clock()`'s timeout branch both now check
`crossed >= LOOT_ESCAPE_AT` (not just `>= ESCAPE_AT`) to decide whether
`taken`/`hands`/`heldItem`/`walletOutcome`/`usedItemsThisRun` survive the
transition to `mode: 'paid'` — the same forfeiture shape `escapeNow()`
already had, just gated on a second, later threshold instead of unlocking
at loot-pickup time. Applied identically to the clock timing out (not just
a voluntary escape) so the two exit paths stay symmetric — a run that
happens to reach `LOOT_ESCAPE_AT` right as the clock hits zero keeps its
loot the same as one that chose to escape there.

**The sweep initially returned ~0% for every value 11-16 tested — this
was a bug in the harness bot, not a dead end in the mechanic, and I
caught it before reporting a false negative.** The first `rationalBot.ts`
pass reused its existing `SAFE_LEAD_S=13` interrupt threshold (a fixed,
every-tick "is this still comfortably safe" check) unchanged from the
prior open-ended-goal analysis. Since median lead is already ~7s by
crossing 10, that check fires on literally the first tick after arming
regardless of `LOOT_ESCAPE_AT`'s value — the bot never got the chance to
even attempt reaching 11, let alone 16. I noticed the flat-zero result
looked suspicious (a real mechanic effect should vary *something* across
11-16, even if it never clears the target) and ran a 2D sanity check
before accepting the number — varying `SAFE_LEAD_S` alongside
`LOOT_ESCAPE_AT` showed the threshold, not the mechanic, was driving the
result (0.3% → 22-36% just from loosening the threshold, same
`LOOT_ESCAPE_AT`). This is exactly the kind of thing "if the sweep shows
it doesn't work, say so plainly" was guarding against, and it would have
been a plainly *wrong* "doesn't work" if I'd reported the first pass
uncritically.

**Fixed by changing what "rational" means for a bounded goal, not by
loosening the check until a number looked right.** An interrupt-based
bail-out is the correct model for an open-ended commitment (risk keeps
accumulating with time, so re-evaluating and bailing when it's no longer
worth it is genuinely rational). It's the wrong model for a short, bounded
one — 1 to 6 more crossings — because bailing 1-2 ticks into a short push
barely reduces exposure (you're not meaningfully safer having escaped one
tick earlier than the tick you'd have been caught on anyway) while it
forfeits the loot with certainty in runs that would often have succeeded.
`rationalBot.ts`'s default changed from "re-evaluate and bail below 13s of
lead, every tick" to "commit once armed if there's something worth
holding, don't second-guess until `LOOT_ESCAPE_AT` or death"
(`SAFE_LEAD_S = 0` by default, still an overridable parameter — see the
file's own header comment for the full reasoning, kept there rather than
only here since that's where a future reader tuning this would look
first). This is a genuine, argued refinement to the measurement
methodology, the same category of judgment call as `relativeGap`'s
closed-form derivation earlier — not "tuning the bot until the game looks
good," which is precisely what wasn't done: the corrected bot's numbers
were taken as reported, including that `ticketRate` drops meaningfully
(59% → 54%) as the real cost of the mechanic now actually working.

**`LOOT_ESCAPE_AT = 11` shipped — the lowest of 11-16 tested, and it
already clears 25-40% (35.2% at 5000 trials, 35.55% at 10000) without
needing to go any higher.** Full sweep table in `CALIBRATION.md`. Per
"retiens la plus basse valeur qui y arrive, pour ne pas allonger le jeu
plus que nécessaire" — no reason tested to prefer a larger value once the
smallest one already clears the target.

**UI**: the escape button now reads `ESCAPE — TICKET ONLY` from
`ESCAPE_AT` and `ESCAPE — TICKET + LOOT` from `LOOT_ESCAPE_AT`, plus a
small "`N` more to keep it" indicator shown only while carrying something
and short of the threshold — all three conditions (`canEscape`,
`carrying`, `escapeKeepsLoot`) read directly off the same `hud` snapshot
fields the rest of the component already used, no new state. **Not
manually click-verified reaching crossing 11 in a real browser** — a
scripted Playwright keypress sequence isn't a traffic-aware player and
died at crossing 2 in the one attempt made; building a browser-side bot
smart enough to reliably reach crossing 11 was judged not worth the cost
given the underlying state transitions (`escapeNow()`/`clock()`'s
loot-keeping branches) are already exercised thousands of times by
`rationalBot.ts`'s own trials, and the JSX itself is simple, type-checked
conditional rendering off already-correct fields. Flagging this rather
than claiming a click-through that didn't happen.

## P1: still not verifiable from this session

Re-checked before doing anything else, per "si les variables ne sont
toujours pas là, note-le et passe à P2": this sandbox's egress proxy still
rejects `wzljvpoqgszhyfaquilm.supabase.co` outright (re-confirmed with a
fresh `curl`, same `connect_rejected`/organization-policy result as last
session — the restriction didn't lift). Also checked whether the Vercel
env vars might have been added since: `list_teams` (Vercel MCP) returns no
teams for this session, so there's no path here to list or read the
project's environment variables either, to even know whether they're set.

**Both blockers are independent, and either one alone would already make
the P1 checklist impossible from here**: no visibility into whether the
Vercel vars are set, and even if they were, this sandbox still can't reach
Supabase to run the actual checks (a game writing to the five tables, the
RPC incrementing, `/embed` showing real rows, cross-browser reconciliation
via an address). Noting this and moving to P2, per the fallback
instruction — the schema/RPC-level verification from last session
(`DECISIONS.md`'s earlier P1 entry) still stands as what has been checked;
nothing new was checkable this pass.

## P2: demo telemetry + /stats comparison page

**`pickedUpLootEver`.** The P0 change made `state.taken`/`state.hands`
forfeitable on a no-loot clock timeout, not just on an early `escapeNow()`
— which broke `lootPickedUp` telemetry that used to read those fields
directly (`greedyBot.ts` was doing `Object.keys(run.state.taken).length >
0`, and `measure.ts`'s `lootKeptRateGreedy` was doing `lootPickedUp &&
win`). Added a dedicated `pickedUpLootEver` flag on `HeistRun`, set once
inside `pickUp()`'s loot branch and never cleared by forfeiture — it
answers "did this run ever hold loot" independently of whether the loot
survived to the end. Propagated to `greedyBot.ts` (fixed its
`lootPickedUp` source, added an explicit `lootKept` field instead of
inferring it) and `rationalBot.ts` (added `lootPickedUp`, already had
`lootKept`). Fixed `measure.ts`'s `lootKeptRateGreedy` to read the new
`lootKept` field directly rather than recombining a now-decoupled pair.

**`demo_runs` table.** Same shape as the harness bots' own trial results
(seed, crossings, heartsLost, lootAvailable/lootPickedUp/lootKept,
outcome, ticks) plus the full `actions`/`inputs` logs already kept
locally, so a demo run is replayable server-side later if needed. No
`address` column — DEMO is `stakes:false` and was never wallet-gated, so
there's no identity to key it to; it's anonymous by design, same as
`feed_events`. RLS: open insert and open select (any anon key can write
and read), matching `feed_events`'s existing policy shape — this is
low-stakes telemetry, not the address-keyed `profiles`/`stats` tables.
`demoLog.ts`'s `recordDemoRun()` keeps writing to `localStorage` first
(export-as-JSON still works fully offline) and fire-and-forget pushes to
Supabase after, same pattern as `profile.ts`/`feedBus.ts`. Migration
applied directly via the Supabase MCP tool (this sandbox can't reach the
project over plain network, but the MCP tool uses a separate privileged
channel — same asymmetry noted in the P1 entries above).

**`/stats` page.** Unlisted route, no auth — nothing in the app's own nav
links to it, which is what the brief offered as the alternative to
building real access control for an internal measurement page. Renders
one table: humans (real `demo_runs` rows, all browsers) against the three
harness bots, same columns (n, median/p95 crossings, success rate, loot
pickup rate, loot kept rate). The bots run live in the page's own browser
tab rather than showing numbers copied from `CALIBRATION.md` — `bot.ts`/
`greedyBot.ts`/`rationalBot.ts` are pure functions over `HeistRun` with no
Node-only dependencies, so nothing stops them running client-side.

Two bugs found and fixed during Playwright verification, both worth
recording because neither was in the original design:

1. **Fetch blocked the whole page.** The first version `await`ed
   `fetchAggregateDemoRuns()` (a Supabase call, which just hangs in this
   sandbox — see P1) before running any bot trial, so the page never got
   past "loading" here. Fixed by splitting into two independent
   `useEffect`s: bot trials run and render immediately in one; the human
   fetch runs in the other, wrapped in a 6s `Promise.race` timeout, and
   updates its own row independently once it settles or times out. In a
   real deployment with Supabase reachable this fetch would resolve in
   well under 6s, so the split costs nothing there — it only fixes the
   pathological case of an unreachable/misconfigured backend.
2. **Bot trials never turned sound off, so running live in a browser tab
   opened up to 1500 real `AudioContext`s.** `bot.ts`/`greedyBot.ts`/
   `rationalBot.ts` construct their own internal `HeistRun` and were never
   told to mute it. In the CLI harness this is invisible — `HeistRun`'s
   `audio()` bails out immediately when `window` is undefined, so the
   calibration sweeps (thousands of trials in milliseconds) never touch
   Web Audio at all. But `/stats` runs the same trial functions inside a
   real browser tab, where `window` *is* defined — every crossing/alert/
   arrest event during a trial synthesised real tones through a freshly
   constructed, never-closed `AudioContext`. 500 trials x 3 bots was still
   short of a table 30+ seconds later; the page read as hung, and an
   earlier Playwright pass actually crashed the tab outright. First
   suspected the cause was 1500 synchronous playthroughs blocking the
   main thread and added a `runChunked()` yield-every-40 helper — real
   and worth keeping regardless (it's what keeps the tab responsive while
   this runs), but it didn't fix the actual hang, which was audio graph
   construction, not compute. Fixed at the source: all three bot-trial
   functions now set `run.soundOn = false` immediately after constructing
   their `HeistRun`, before the first tick — a no-op in the CLI harness
   (already silent there) and the fix for the browser case. With both
   fixes in place the page renders in ~5s for 1500 total trials.

`BOT_TRIALS = 500` and `CHUNK_SIZE = 40` were sized empirically against
this sandbox's Playwright/headless-Chromium tab, not measured against a
real desktop browser — noting this in case `/stats` ever needs raising
past 500 for tighter confidence intervals; nothing suggests it will be
slower on a real machine; 500 was not reduced despite the earlier
(pre-audio-fix) appearance of trouble, since the root cause turned out to
be a real bug rather than a sandbox-specific resource limit.

## P0: the commitment window replaces LOOT_ESCAPE_AT

New brief, new end-game shape — `LOOT_ESCAPE_AT` (the previous round's
fix) is gone, replaced with a fixed-length decision window, per explicit
instruction. `heistRun.ts`:

- The game is genuinely unbounded past `ESCAPE_AT` now — no second
  crossing threshold at all, and nothing about the payout depends on how
  far past 10 a run goes.
- `WINDOW_S = 10` seconds open the instant `crossed` first reaches
  `ESCAPE_AT` (edge-triggered in `step()`'s forward-crossing branch, gated
  on `mode === 'run'` so it can't re-fire and doesn't reopen if a later
  backward hop dips `crossed` back under 10 — once opened, it's opened for
  good). Mode becomes `'armed'`, `state.windowLeft` starts counting down
  once per elapsed second in `clock()`, the same cadence `timeLeft`
  already used.
- `escapeNow()` now only does anything while `mode === 'armed'` — the
  ticket-only exit, forfeiting everything carried, exactly as before.
  Once the window's countdown reaches 0, `clock()` flips mode to
  `'committed'` and `escapeNow()` becomes a permanent no-op: no more exit,
  by design, matching "il est engagé, plus de retour possible" literally
  rather than just in spirit.
- Committed play is not a special code path — `'committed'` (and
  `'armed'`) are both in `live()`, so police/traffic/reinforcement/collide
  all keep running exactly as they did before this round; the only thing
  that changes is which further transitions are reachable.
- Reaching the natural end of the 60s clock (`clock()`'s existing
  `t <= 0` branch) now pays out everything whenever mode is `'committed'`
  *or* still `'armed'` — the latter covers the edge case where a run
  reaches the 10th crossing late enough that the window's own 10-second
  countdown hasn't finished when the main clock does. The brief didn't
  spell out what should happen there; the read taken is that reaching
  literal time-zero without ever pressing Escape *is* "held to the end" by
  definition, regardless of whether the window's separate internal
  counter had also finished — treating it as a loss instead would
  penalize a run for time running out a beat before its own decision
  clock did, which contradicts the brief's own framing that inaction
  defaults toward commitment, not away from it.
- Loot/items picked up after the window opens (mid-window or after
  committing) are ordinary `pickUp()` calls, ungated by mode — "le butin
  ramassé après la 10e compte aussi" falls out of not touching `pickUp()`
  at all, rather than needing a special case.

**Bots.** `bot.ts` (cautious): escapes the instant `mode === 'armed'`
instead of the instant `crossed >= ESCAPE_AT` — same trigger tick in
practice, but the guard now matches what actually gates `escapeNow()`.
`greedyBot.ts` (never escapes): unchanged in policy — it was already the
right shape for "let the window lapse" — but gained `reachedTenth`,
`tickAtTenth`, and `reachedCommitted` telemetry, since this bot became the
sweep's measurement vehicle (below). `rationalBot.ts`: the old EV logic
(`lootEscapeAt`/`safeLeadS` thresholds, re-evaluated every tick) doesn't
map onto the new mechanic at all — there is no "how much further" decision
anymore, only "escape now or let it lapse", and that choice is only live
during the window. Simplified to: while `mode === 'armed'`, escape only if
there's nothing worth protecting (`hasPendingValue`); otherwise hold. This
game still has no priced-in value for loot (no real point/EV system), so
"hold whenever there's something at stake" is the more honest reading of
"rational" than fabricating a threshold against an unpriced payoff — same
judgment call as the old bot's file comment made, carried over to the new
shape.

**Sweep.** Full table and diagnosis in `CALIBRATION.md`'s matching P0
follow-up entry — summary: none of the three requested knobs
(`POLICE_PX`, `POLICE_HEAD_START_S`, a new `TRAFFIC_DENSITY` multiplier)
can move median-seconds-to-the-10th-crossing out of a ~17-24s band, in
either direction, individually or combined; they only trade reach-10 rate
and post-commit survival against each other. Per the brief's own
instruction for exactly this outcome, **no value was forced** —
`POLICE_PX`/`POLICE_HEAD_START_S` stay unchanged, `TRAFFIC_DENSITY` ships
at its neutral default (1×, byte-for-byte the old spacing). Sweep
methodology: sed-edited the three module constants and re-invoked a fresh
`npx tsx` process per combination (module-level consts, not runtime
params — same pattern as earlier `POLICE_PX`/`REIN_LEAD_S` sensitivity
sweeps), always restored from a pre-sweep backup between combinations and
confirmed byte-identical to the pre-sweep file afterward. New script:
`src/harness/sweepWindow.ts` (the old `sweepLootEscape.ts` was deleted —
it swept a mechanic that no longer exists).

**UI.** `HeistGame.tsx`'s top alert banner now branches three ways instead
of two: while `mode === 'armed'` it replaces the ordinary siren banner
with a flashing (alternates by `tick` parity, same idiom the game already
uses elsewhere for urgency) red/amber bar reading `{windowLeft}s — ESCAPE
NOW · ticket` against `HOLD · ticket + loot` — the brief's exact two-option
framing, plus the countdown it asked to be "visible et pressant"; while
`mode === 'committed'` it shows a non-flashing, persistent `NO WAY OUT —
COMMITTED` bar until the run ends, satisfying "un marqueur permanent";
otherwise the original alert-level banner is unchanged. The bottom control
row keeps the actual `ESCAPE NOW · TICKET` button (interaction stays where
every other action button already lives) plus a passive `hold for ticket +
loot` / `no way out — hold to the end` label alongside it. Not manually
clicked through to crossing 10 in a live browser — same call as last
round's `LOOT_ESCAPE_AT` UI (a scripted bot died at crossing 2 there, and
building a smarter one wasn't judged worth it against a harness that
already exercises these exact transitions thousands of times per sweep
row). What *was* checked live: the page loads, the mode-select and initial
Play screen render, the ordinary alert banner still renders correctly
after a few real keypresses (confirming the new three-way branch's
`showBanner` fallthrough didn't regress), and no console/runtime errors
fire in any of it.

## P0: sprint/stamina, and why the police/traffic have to slow down too

Follow-up to the window-balance sweep above, which found no combination of
`POLICE_PX`/`POLICE_HEAD_START_S`/`TRAFFIC_DENSITY` could reach 40-48s
median-seconds-to-the-10th — every one of them only changes whether a run
*survives* to the 10th, not how fast it gets there, so pushing them harder
just kills slow runs off instead of slowing the survivors down. The user's
proposal: a sprint gauge (hold to run, get winded, recover) — a lever that
throttles *pace* uniformly rather than *survival probability* selectively.
Full mechanic and sweep history: `CALIBRATION.md`'s P0 follow-up 4 — this
entry is the design reasoning, not the numbers.

**The core insight came from the user, not from this session's own
modeling, and it's worth recording precisely because it wasn't obvious
from the engine alone:** `law()`'s police advance is a fixed rate against
the *position* gap (`wy - policeWy`), not against elapsed time. Slowing
the thief without slowing the police is mathematically identical to
speeding the police up — both close the same gap faster. This was
confirmed empirically first (extreme sprint/winded values only reached
~26s median with reach-10 rate crushed to 10%) before the fix went in, not
assumed. The fix — multiply the police's per-tick advance in `law()`, and
traffic's scroll in `advance()`, by the same `windedMult()` the thief's
own hop uses while winded (never while sprinting — sprint stays a real,
earned advantage, not something the world also speeds up to match) —
makes the *relative* closing rate, and so the real arrest probability,
unaffected by how long a winded stretch runs. Only real time changes.
`secsToArrest()` is deliberately left un-rescaled (still divides by the
full `POLICE_PX`), so it reads pessimistic while winded — the player feels
chased harder than they mechanically are, which is what the user asked
for ("ils ne le savent pas donc ils ont la pression de ralentir") and
falls out of the fix for free rather than needing separate engineering.

**Second problem, also user-caught:** a thief who started a hop while
sprinting could still wind out mid-crossing and get stuck slow in the
middle of a multi-lane road with no way back — "traverser une voie de 4
routes sans être ralenti au milieu." Fixed by locking the thief's own hop
speed (`crossingSpeedMult`) the instant they leave a safe band (pave/stop)
and holding it fixed through every lane of that crossing, however many,
regardless of what the gauge does underneath — released only on landing
back on safe ground. A crossing is now entered at a known, committed pace;
winded can only ever be something that happens (and is felt) starting from
a sidewalk, which is also where recovery becomes real — "il peut récupérer
sur les trottoirs et ne pas traverser" falls out of the same fix, not a
second mechanism.

**Bots hold sprint continuously** (`bot.ts`/`greedyBot.ts`/
`rationalBot.ts` call `setSprinting(true)` once, right after construction)
— the natural greedy baseline ("always try to go fast") that both
represents an eager player's real strategy and gives the sweep a single,
reproducible policy to measure pace against, rather than needing a second
bot archetype just for stamina timing.

**Final values** (`POLICE_PX = 5.5`, `SPRINT_DRAIN_S = 8`,
`SPRINT_RECHARGE_S = 10`, `SPRINT_SPEED_MULT = 1.0`,
`WINDED_SPEED_MULT = 0.0`) clear the conditional-survival target (64.5% in
the 50-65% band) but leave reach-10 rate (37.4%) and median secsToTenth
(39.4s) a few points short of their floors (45%, 40s) — the closest a
dozen-plus combinations around this point came to a clean triple hit.
Accepted as final per instruction ("on laisse comme ça") rather than
continuing to search past that point or loosening a target band to fit
the result. `TRAFFIC_SPEED_BANDS`/`TRAFFIC_SPEED_SCALE` (an earlier,
decelerating-rate traffic-speed-ramp attempt, tried before sprint) stay in
the codebase at a neutral default (`SCALE = 0`) — same structural ceiling
as every other pressure-only lever, not deleted since the plumbing itself
is sound and sweepable if ever needed again.

## Outro animations: bike vs. helicopter, once the balance work landed

Per instruction, sequenced strictly after the sprint/window calibration
above ("on ajustera après la vitesse... une fois ok on passe aux
visuels") — this entry covers the two winning outros: a stolen bike for a
ticket-only window escape, a helicopter pickup for holding to the end
after committing.

**What distinguishes the two isn't what's in hand.** A committed run that
never picked up any loot still deserves the "held out" ending, not the
"cut and ran" one — the two outros are about *how* the run ended, not
what it's carrying. Added `heldToEnd: boolean` to `RunState`, set only in
`clock()`'s natural-end-of-clock branch (never in `escapeNow()`), and a
`paidAtTick: number | null` field marking the tick `mode` became `'paid'`
— both consumed by `draw()`'s new `drawOutro()` method, gated by a new
`OUTRO_TICKS` constant (~2.6s) that also gets exported so `HeistGame.tsx`
knows how long to hold the summary screen back.

**Sprites are generated, not hand-drawn row-by-row.** `sprite-data.ts`
already has box/rbox/wheel primitives the vehicle sprites are built from
(`makeCar`/`makeTruck`); added a `line()` helper (box/rbox are axis-aligned
only, and a bike frame needs diagonals) and built `makeBike()`/
`makeHelicopter()` the same way, exported as `OUTRO.bike`/
`OUTRO.helicopter`. Chose this over hand-authoring pixel rows blind — the
existing rows in this file were clearly iterated against a real renderer,
which wasn't practical to do by inspection alone, so building from the
same parametric primitives already in file (and then actually rendering
and screenshotting the result — see below) was the safer path to
something that reads correctly at this scale on the first attempt.

**The outro replaces the ordinary thief-drawing branch in `draw()`,
not a separate overlay layer** — while `mode === 'paid'` and
`tick - paidAtTick < OUTRO_TICKS`, `drawOutro()` runs instead of the
normal shadow+`cell()` thief draw; once the outro's ticks are spent,
nothing is drawn there at all (the getaway has left, plausible as a final
frame on its own). `HeistGame.tsx`'s summary overlay is held back by the
same window (`outroActive`) so the canvas animation is visible before the
dark "THE CRIME PAID" screen covers it — `ended` itself (which still gates
input, e.g. `canEscape`) is untouched, only the overlay's own render is
delayed.

**Verified live, not just read** — a real bug would've been invisible from
code review alone here, since pixel-row math is easy to get subtly wrong
in a way that still typechecks. Patched `ESCAPE_AT`/`WINDOW_S`/
`DURATION_S`/`POLICE_PX`/`POLICE_HEAD_START_S` locally to trigger both
outros in seconds instead of a full run, played both through Playwright,
and screenshotted several frames of each — bike riding off to the right
with the world frozen behind it, helicopter descending, thief disappearing
at pickup, helicopter climbing back out the top of frame. Both read
correctly; no code changes were needed after seeing them. All test-only
constant patches were reverted before committing — diffed against the
prior commit to confirm every constant landed back on its real, shipped
value.

**Found and fixed along the way, not test-script-specific:** `RunState`'s
`timeLeft` was initialized from a hard-coded literal `60` in both places
`state` gets constructed, not from `DURATION_S` — meaning `DURATION_S`
never actually controlled the run length despite being the documented,
exported source of truth for it (`RulesTab.tsx` already displays it to
players as if it did). Changed both literals to `timeLeft: DURATION_S`.
No behavioral change at the current value (`DURATION_S` already equals
60), confirmed by re-running the calibration sweep before and after and
seeing identical numbers — but it was a live bug: anyone changing
`DURATION_S` alone, expecting it to change the game, would have silently
gotten nothing.

## P2 — Identity (session brief, "HEIST — session complète")

**Privy is the single client-side auth front door for both login paths,
not a hand-rolled SIWE nonce/signature flow.** The brief's P2 asks for:
a nonce, a signed message, server verification, an httpOnly session
cookie, and — critically — "les deux chemins [email et wallet injecté]
produisent une adresse traitée à l'identique par le reste du code." Rather
than build a parallel nonce/message/verify system by hand, the login UI
uses Privy's own modal (`loginMethods: ['email', 'wallet']`,
`embeddedWallets.ethereum.createOnLogin: 'users-without-wallets'` so an
email-only user still gets a real address). Privy already requires a
signature to link an external wallet, and mints an embedded wallet for
email-only users — so both paths resolve to exactly one address through
exactly one code path by construction, which is the strongest possible
version of "traité à l'identique."

The server never trusts an address the client sends. It verifies Privy's
**identity token** — a JWT, `usePrivy()`'s `useIdentityToken()` hook on
the client — via `@privy-io/server-auth`'s `PrivyClient.getUser({idToken})`
(`src/lib/privyServer.ts`). This decodes locally against Privy's public
keys (no API round-trip, no rate limit) and returns a `User` whose
`.wallet.address` is the one thing this whole system trusts. On success,
`/api/auth/privy` mints the app's **own** session: a stateless HMAC token
(`address.expiry.signature`, base64url — `src/lib/session.ts`) in an
httpOnly, secure, sameSite=lax cookie, 30-day TTL. Every server route that
needs to know "who is this" calls `getSessionAddress()`
(`src/lib/requireSession.ts`), which reads and verifies that cookie —
never a request parameter, never a header the client sets.

This satisfies the actual *security property* the brief was describing
(server-issued nonce-equivalent, nothing client-forgeable, session in an
httpOnly cookie, one signature at login) without literally being SIWE. It
is a deliberate deviation from the brief's literal wording
("Nonce serveur, message signé") — flagged here per the brief's own
"tranche seul, documente" instruction, since a silent substitution here is
exactly the kind of judgment call that should be visible rather than
assumed. No real money or irreversible action is involved in this choice,
so it did not wait for confirmation, but it's surfaced so it can be
revisited if Privy turns out to be the wrong call for some reason not
visible from here (e.g. a cost/ToS concern).

**Session is a stateless HMAC token, not a DB-backed session table.**
`address.expiry.hmac(address,expiry)`, base64url-encoded. Chosen because:
nothing to garbage-collect, no extra round-trip on every request, and
revocation isn't a stated requirement anywhere in the brief — exposure is
already bounded by the 30-day TTL. If revocation (e.g. "log out
everywhere") becomes a real requirement later, this is the piece that
would need to grow a server-side denylist or move to a DB-backed session.

**Username: server-enforced permanence, not just a UI convention.** A DB
unique index (`profiles_username_unique on lower(username) where username
is not null`, applied live via migration) is the actual uniqueness
guarantee — it's the only thing that's still correct under a race between
two concurrent claims. `/api/auth/username` additionally: rejects outright
if the session's address already has a username (no "rename" path exists
server-side, so the client can't accidentally expose one), checks length
(3-20) and charset (letters/digits/underscore), and checks a reserved-word
list (`src/game/reservedUsernames.ts`) normalized to catch
punctuation/case variants. The client (`ProfileTab.tsx`) requires a
second, explicit "CONFIRM" click after showing "this name is permanent"
before submitting — satisfying "prévenu clairement avant validation."
Guest (not-yet-connected) nicknames stay freely renameable, local-only,
and are deliberately **not** carried over to the server on first connect
(`profile.ts`'s `reconcileIdentity`) — a guest nickname never passed the
reserved-word/uniqueness checks, so first-time connects always land on
the real claim flow instead of silently promoting an unchecked name.

**Three secrets this environment cannot generate or fetch, blocking any
live verification of this system:**
- `SESSION_SECRET` — any long random string; needs to be set (and stay
  identical across deployments that must read each other's cookies) in
  Vercel. I can generate a candidate value, but setting it in Vercel is
  explicitly reserved (env vars are a "money/infra" class action here).
- `PRIVY_APP_SECRET` — from the Privy dashboard, distinct from the
  already-set public `NEXT_PUBLIC_PRIVY_APP_ID`.
- `SUPABASE_SERVICE_ROLE_KEY` — from the Supabase dashboard; confirmed no
  MCP tool exposes it (only `get_publishable_keys` exists, which excludes
  it by design).

Until these three are set in Vercel, `/api/auth/privy`, `/api/auth/username`
and anything else touching `supabaseAdmin`/`privyServer`/`session` return
`503`s (checked explicitly, not left to throw) — the app still builds and
DEMO still works, PLAY/PROFILE's CONNECT button just won't complete.

**The existing RLS gap (anon can INSERT/UPDATE `profiles`/`stats`/
`tickets_daily`) is deliberately NOT tightened yet.** `profile.ts`'s
stats/tickets pushes still write directly with the anon key — flipping
RLS now would break that live path before P5 replaces it with
server-authoritative writes through session-checked routes. Tightening
RLS is sequenced into P5, after those replacements exist and are
verified, not before.

**`connectInjected()`/raw EIP-1193 wallet connection was removed
entirely**, not kept as a second option alongside Privy. A raw injected
address with no signature proves nothing (`identity.ts`'s old comment
even said so) — exactly the falsifiable pattern P2 warns against. Privy's
own modal already supports connecting an external injected wallet (with a
required signature to link it), so there was no case where the old path
did something Privy's doesn't, and keeping it would have meant two
address-producing code paths again, undermining the "traité à l'identique"
property above.

## P6 — Butin/objets, prêts pour le mint rétroactif

**New table `haul_items`** (address, item_type, seed, run_id unique,
ts, on_chain_batch nullable), RLS enabled with **no policies at all** —
unlike `profiles`/`stats`/`tickets_daily` (an earlier, looser era where
the client writes with the anon key, see the RLS-gap note above and P5),
this table has no legacy client-write path to preserve, so it starts
locked down from day one: only the service role
(`src/lib/supabaseAdmin.ts`) ever touches it, via `/api/haul/record`
(POST, session-authenticated, idempotent on `run_id` — a run earns at
most one item, same as the game's own "one per run" rule) and `/api/haul`
(GET, session-authenticated).

**The sealed-chest property is enforced at the API layer, not just the
UI.** `/api/haul`'s response only ever includes `{ts, revealed}` —
`item_type` is never selected into the response at all, so there's
nothing for `MyHaulTab.tsx` to accidentally render even if someone
extended the component carelessly later. "Ne révèle ni type, ni rareté,
ni effet" holds even if the UI changes.

**Guest/local `haulStore.ts` is unchanged in what it stores, but now also
pushes to the server when connected.** It keeps its original per-type
local counts (that's the player's own transient knowledge of what they
just picked up mid-run — the HUD already showed them the item name at
pickup, so it's not a leak) — that local cache is not the sealed record.
`MyHaulTab.tsx` deliberately does NOT surface the local per-type counts;
a disconnected guest only sees a total count as a "connect to claim
these" prompt, never a type breakdown, keeping the tab's own sealed
framing consistent regardless of connection state.

**Not yet real:** `PLAY` doesn't require a wallet yet (P1's mode gating
is still pending — task #34), so most runs today don't have a connected
identity to attach a haul record to; `recordItemEarned()` guards on
`getIdentity()` being present and silently stays local-only otherwise,
same degrade-gracefully pattern as `profile.ts`. Once P1 lands, every
PLAY run will have an address by construction and this stops being a
gap.

## P10 — Vault + HaulLedger contracts, written and tested, **not deployed**

**Written, not deployed — per the brief's own instruction ("ne déploie
rien sans moi").** Live in `contracts/` as a separate npm project (own
`package.json`), outside the Next.js app's build. `Vault.sol` and
`HaulLedger.sol` — see `contracts/README.md` for the full picture; this
section covers the decisions.

**`Vault.sol`: deposit/withdraw only, deliberately no owner, no pause, no
admin function of any kind.** "Retrait toujours possible sans permission"
is read literally: there is no function anywhere in the contract that
could gate, pause, or block a withdrawal — not because it's disabled, but
because it was never written. `balanceOf` is internal accounting (not
`token.balanceOf(address(this))`, which a direct token transfer into the
contract could otherwise desync) — solvency (`sum(balanceOf) ==
token.balanceOf(vault)`) is asserted as an invariant across a mixed
deposit/withdraw sequence in the test suite, not just spot-checked.
Reentrancy is guarded two ways at once (OZ's `nonReentrant` modifier, and
effects-before-interaction — balance is debited before the token
transfer) and a test proves it: a malicious ERC20 mock that calls back
into `withdraw()` from inside its own `transfer()` is used to show the
guard actually stops a double-spend, not just that the happy path works.

**`HaulLedger.sol`: stores a Merkle root per batch, not the batch's
entries.** Putting every kept-loot record on chain individually would be
expensive for no real benefit — a root lets the server later prove any
one item's inclusion in a specific batch without the chain ever having
held player-level detail. Append-only is a property of the function
surface (there is no `setBatchRoot`/`deleteBatch`/etc. — verified
directly in the test suite by asserting the ABI doesn't contain one), not
a policy. The recorder role uses a 2-step handoff (`proposeRecorder` /
`acceptRecorder`, OZ's `Ownable2Step` pattern applied to a plain address
instead of full `Ownable`) so a compromised or retiring recorder key can
be rotated without a typo permanently orphaning the role.

**Known, deliberate gap: no on-chain "debit for a game" function on
`Vault`.** P7's `deposit` payment path needs something to reduce a
player's on-chain balance when they play a game funded from a prior
deposit — that's a genuine unresolved design question (what account can
call it, what limits it, how it reconciles with the off-chain ledger),
and deciding who gets to move a player's custodied funds without a fresh
per-game signature is exactly a real-money design call, not one to guess
at silently. Not built here — see `contracts/README.md`'s last section.
The `perRun` payment path doesn't need this at all (each game is its own
on-chain transaction), so it isn't blocked by this gap.

**Toolchain note, not a design decision:** this sandbox's egress
allowlist blocks `binaries.soliditylang.org`, which is where Hardhat's
built-in `compile`/`test` tasks try to download solc from — so both were
worked around (compiling via the `solc` **npm package** instead, and a
hand-rolled test runner via `hardhat run --no-compile` instead of
`hardhat test`'s Mocha, which also auto-compiles first). Full detail and
exact commands in `contracts/README.md`. All 14 tests pass locally
(`cd contracts && npm test`); nothing here required weakening a test to
get around the network limitation, only the compile step.

**Robinhood Chain target, not verified against a live RPC from this
sandbox** — the same network limitation blocks reaching
`https://rpc.mainnet.chain.robinhood.com` (an Arbitrum Orbit L2, chainId
4663) to confirm it directly. The brief's own instruction ("vérifie les
deux avant tout déploiement") is preserved as a blocking pre-deploy step,
not skipped — recorded here as still outstanding, to be done (by me, if
this sandbox gains reach, or by you) before any real deployment, which
in any case waits for you regardless.

## P1 — DEMO/PLAY gating, and a fix to where the Privy↔session sync ran

**The Privy→session sync moved out of `ProfileTab.tsx` into a new
`AuthSync.tsx`, mounted once at the root (inside `PrivyClientProvider`).**
It used to run only while the PROFILE tab was mounted — meaning a login
triggered from anywhere else (PLAY's new wallet gate, below) would
authenticate with Privy but never actually get exchanged for HEIST's own
session cookie, since nothing was listening. This was a real bug latent
in the P2 commit, only surfaced now that something else needs to trigger
a login. `identity.ts` grew a small pub-sub (`onIdentityChange`, same
shape as `feedBus.ts`'s listener set) so `ProfileTab`, `MyHaulTab`, and
`HeistGame` can each react when `AuthSync` lands an identity, without
needing a shared state library.

**PLAY requires a connected wallet; DEMO never does — "pas de porte
dérobée" means the check has to be at the one place a run actually
starts, not sprinkled at the UI layer.** `HeistGame.tsx`'s `startMode()`
is that place — every route to a `'play'` run goes through it. Clicking
PLAY without an identity calls Privy's `login()` and returns *without*
building a run; `pendingPlayRef` remembers to actually start once
`AuthSync` lands one (via `onIdentityChange`), so a player never needs to
click PLAY twice. `restart()` (the RUN AGAIN button) re-checks the same
gate for a non-demo run — covers the edge case of disconnecting (via
PROFILE) mid-session and hitting RUN AGAIN, which would otherwise have
kept a `'play'`-mode run going with no identity attached to it. Clicking
the PROFILE tab itself now also opens Privy's login immediately when
disconnected (`page.tsx`'s `changeTab`), rather than only showing a
CONNECT button after arriving — matches "cliquer sur PLAY ou PROFILE
ouvre la connexion wallet" for both entry points.

**Not verified live from this sandbox.** The three secrets are now set in
Vercel per your message, but this sandbox's network block (still present
— re-confirmed this round) means I can't open the deployed app in a real
browser to click through PLAY→login→run myself. `npx tsc --noEmit`,
`npx eslint --max-warnings=0`, and `npm run build` are all clean, and the
determinism harness still passes (unaffected — no engine change), but
that's static/build-time verification, not the real click-through this
task is ultimately supposed to confirm. Asking you to smoke-test PLAY and
PROFILE once this is deployed is the fastest real check.

**Bug found from that smoke test: "connected but the game doesn't open."**
Root cause — `AuthSync.tsx` was syncing on `authenticated` alone. For an
email login, Privy creates the embedded wallet *after* authentication
completes, not atomically with it (see `PrivyClientProvider`'s
`embeddedWallets.ethereum.createOnLogin` config). The identity token
minted the instant `authenticated` flips true often has no wallet linked
yet; `/api/auth/privy` correctly rejects that (nothing to resolve an
address from), and nothing retried — `pendingPlayRef` in `HeistGame.tsx`
just sat there forever, which from the player's side looked exactly like
"I connected and PLAY did nothing." A wallet-login (external wallet,
already attached at auth time) likely wasn't hit by this same race, so
this was probably email-path-specific.

Fixed by waiting on `user.wallet` instead of `authenticated` —
`usePrivy()`'s `user` is Privy's live object, not a cached token, so it
updates the moment the embedded wallet actually exists. Once it does, the
exchange now calls `getIdentityToken()` (an imperative, fresh fetch)
rather than relying on the `useIdentityToken()` hook's possibly-stale
cached value. Also added a small visible error banner (`AuthSync.tsx`
now renders instead of always returning `null`) — the previous
`console.error`-only failure mode meant a real failure was invisible to
anyone not holding devtools open, which is exactly how this one shipped
unnoticed. Still not click-tested live from this sandbox (same network
block); this is the fix from reading the actual Privy SDK types and
reasoning through the timing, not from watching it fail and retrying —
worth a second real smoke test once redeployed.

## P5 — Server-authoritative PLAY: seed, drops, replay verification, ledger

**New flow for a real PLAY run:** `POST /api/play/start` (session
required) rolls the seed and every mystery-item/painting drop
server-side (the same `roll_global_drop()` RPC as before, just called
from the server instead of the client — see `src/lib/globalDropsServer.ts`),
signs all of it into a ticket (`src/lib/playTicket.ts`, HMAC over
`{address, seed, runId, paintingHit, itemHits, exp}`, 10-minute TTL,
`SESSION_SECRET`-keyed but namespace-separated from session cookies by a
`play:` prefix in the signed payload), and hands the ticket plus the
already-decided facts back to the client so it can render the run
locally in real time (`buildRun.ts` now accepts a `preRolled` param and
skips its own RPC calls when given one). At the end of the run, the
client posts the ticket and `run.actionLog` to `POST /api/play/finish`,
which decodes seed/runId/drops from the ticket's *signature* — never
from the request body — and calls `replay(seed, actions, ...)` (the same
pure function the determinism harness runs 200 seeds through) to get the
authoritative outcome. Nothing about payout, stats, tickets, or the haul
is ever read from what the client claims about how its own run went.

**Why the seed/drops had to move server-side, not just gain a
signature-check at the end:** the wallet outcome/amount roll is entirely
seed-derived (deterministic, `replay()` reproduces it exactly), but
mystery-item and painting drops are *external* facts (a real atomic
counter increment via `roll_global_drop()`) that `replay()` has no way to
independently re-derive after the fact — it can only reproduce what
`paintingRoll`/`itemRoll` callbacks it's given say happened. If the
client still rolled its own drops and just told the server what they
were, the server would have no way to tell a real roll from a fabricated
"I got the safe" claim. Moving the roll itself server-side, before the
run even starts, and signing the result into the ticket, closes that —
`replay()`'s signature grew an optional `itemRoll` parameter to make this
possible (additive, existing callers unaffected — determinism harness
still passes 200/200 after this change).

**Idempotent on `runId`, at two layers.** `play_results` (keyed by
`run_id`) is both the retry-safe response cache (a repeated `finish()`
call for the same run returns the cached result instead of reprocessing)
and a real, replay-verified record of every game — useful later for P11
(comparing human runs to the bots) since it's the actual verified
outcome, not a client's report of one. The `ledger` table's `unique
(reason, ref)` constraint is the actual guarantee under a race (two
`finish()` calls for the same run hitting the DB at once): the first
`ledger` insert (`reason='play'`) is attempted before any other write,
and a `23505` (unique violation) on it is the signal "already processed"
— the `play_results` check is the fast path, this is the guarantee.

**Ledger is immutable, append-only, balance-by-sum.** `{address, delta,
reason, ref, ts}`, `reason` constrained to `play | loot | prize | deposit
| withdraw`. No update/delete path exists for it, anywhere. `PLAY_PRICE_USDG`
(currently 0, see `src/game/economy.ts`) is the `play` row's (negative)
delta — the plumbing writes a real ledger row for every game today, at
zero cost, ready for the moment P7/the Vault contract makes it real. The
wallet payout amount (`loot` reason) is unchanged from the existing
nothing/refund/double mechanic — this round did *not* touch the P3
calibration question. (Since resolved — see `CALIBRATION.md`'s P3
section: the premise that the loot budget had to fully drain was wrong;
the table stays 0/10/20 USDG, unchanged, permanently.)

**P6 (haul) tightened at the same time:** `/api/haul/record` (session-only,
client-claimed itemType/seed/runId — a real gap under P5's own standard)
is deleted. `/api/play/finish` now writes `haul_items` itself, from
`result.usedItemsThisRun`/`result.heldItem` (added to the `Result` type
this round — `usedItemsThisRun` wasn't exposed before), which are
server-verified facts, not client claims. `haulStore.ts` (the local
per-browser count DEMO and guests still see) lost its server-push
entirely — it's local cache only now, which is all it ever should have
been once a real server path existed.

**RLS on `profiles`/`stats`/`tickets_daily` is locked down** — the gap
flagged earlier this session (anon could `INSERT`/`UPDATE` any row) is
closed: those policies are dropped, `SELECT` stays public (feed/leaderboard
reads, unchanged). This was sequenced deliberately behind removing every
remaining client-side write first (confirmed via a repo-wide grep before
touching RLS) — `profile.ts`'s `reconcileIdentity()` used to `insert()` a
fresh row on a first-time connect; that's gone too (see below), so
nothing was left depending on the anon-write policies by the time they
were dropped. Verified via `get_advisors`: the only remaining findings
are the two already-documented, intentional ones (the new
service-role-only tables showing "RLS enabled, no policy" — correct,
that's the point — and `roll_global_drop`'s anon-callable
`SECURITY DEFINER`, expected since an earlier round).

**`profile.ts`'s "claim guest stats on first connect" behavior is
removed, not just deferred.** It used to copy a guest's local
pre-connect stats onto the server as that address's first row. Under P1
(PLAY requires a connection before it can even start), a guest can no
longer accumulate real PLAY stats before connecting — DEMO never touched
`stats` either (`if (!demo)` gated it) — so the only way guest stats
could ever be non-zero was stale localStorage predating this session's
P1 change. Keeping a "trust the client's claimed guest stats" write path
for a case that can no longer legitimately happen would be exactly the
kind of client-trusting write P5 exists to eliminate (a guest could
otherwise inflate fake stats locally before ever connecting). Local
continuity for a first-time connect is preserved cosmetically
(`reconcileIdentity` still copies the guest snapshot into the
address-scoped *local* cache) — nothing server-side depends on it, and
the first real `/api/play/finish` creates the actual row.

**Not done, flagged for later, not silently skipped:** atomicity across
the sequence of writes in `/api/play/finish` (ledger → haul → tickets →
stats → play_results) is "each step idempotent-safe on retry," not "one
database transaction" — a real transaction would need this logic to live
in a Postgres function (like `roll_global_drop`), which isn't practical
here since `replay()` is the actual game engine in TypeScript, not
something to reimplement in PL/pgSQL. A partial failure mid-sequence
means "some but not all of this run's effects landed," recoverable by a
retry (each individual write is itself idempotent) but not instantaneously
atomic. Acceptable at this stage, worth revisiting before real money is
on the line.

## P4 — Bonus, ticket (server-authoritative foundation)

**Bonus is a `stats.bonus_pct` column (0-100, integer), written only by
`/api/play/finish`.** Decay ("-20% per calendar day without playing") is
computed lazily against `stats.updated_at` (the previous play) at the
next play, not by a scheduled job — there's no cron in this codebase yet,
and lazy decay is exactly as correct (the stored value only has to be
right *when read*, and every read of it happens either right after a
write or via a fresh server round-trip) without needing one. `+10%` on a
win, applied after decay, capped at 100 — matches the brief exactly.
Ticket issuance (`tickets_daily`, one per win regardless of escape vs.
held-to-end) moved from a client anon-key upsert to the same route.

**Not done this round, and it's the bigger lift:** the daily draw itself
(weighted-by-ticket winner selection, pot/rollover, a scheduled,
reproducible trigger) and the codes system (10-wins unlock, referral,
manual attribution). Both need real design decisions of their own
(exact draw mechanics, how a Vercel Cron or Supabase scheduled function
actually fires it, what "reproducible with the same seed" means for a
winner-selection RNG) that weren't reached this session — see the
session's final punch-list.

## P4 — Daily draw

**Built this round, on top of the above.** `src/game/draw.ts` is pure,
DB-free logic — same shape as `replay()`: `pickDrawWinner(seed, entries)`
picks a winner weighted by ticket count using the game's own seeded RNG
(`src/game/rng.ts`, the same xorshift32 the engine itself uses — no
`Math.random` anywhere in this codebase's real-money paths, consistent
with the existing rule), and `seedForDrawDay(day)` derives that seed from
the date string alone (FNV-1a — not a security boundary, the date is
public, just deterministic and cheap). Same seed, same ticket list,
same winner, always — literally "rejouable: même graine, même gagnant."
`payoutForWinner(pot, bonusPct, hasLifetimeCode)` applies the bonus
multiplier and the "no code -> capped at half the pot" fallback the
brief itself specifies.

**`hasLifetimeCode` is hardcoded `false` at its one call site
(`/api/draw/run`) — not a placeholder standing in for a bug, the actual
correct value today.** The codes system (10-wins unlock, referral,
manual attribution) isn't built yet, so nobody has a code; every winner
is capped at half the pot, which is exactly the brief's stated behavior
for a winner without one. Wiring a real per-address lookup here is a
one-line change once codes exist.

**`increment_draw_contribution(day, amount)`** is a new atomic RPC
(`SECURITY DEFINER`, same pattern as `roll_global_drop`) that
`/api/play/finish` calls after every game — `POT_PCT * PLAY_PRICE_USDG`,
currently always 0, but the write is real and happens every game, same
"plumbing now, amount later" as the ledger's `play` row. `draw_days`
(one row per calendar day: seed, contributions, the settled winner/
payout/rollover once run) has public `SELECT` — P8 needs pot/countdown/
previous-winner visible to a disconnected visitor — but no write policy
at all; only `/api/draw/run` (service role) ever settles a day.

**Trigger: Vercel Cron, not a manual step** (`vercel.json`, daily at
00:00 UTC) — satisfies "déclenchement sans intervention manuelle."
`/api/draw/run` settles *yesterday's* (UTC) tickets — you can't finalize
a day's tickets while it isn't over — and checks a new `CRON_SECRET` env
var against the `Authorization: Bearer <secret>` header Vercel
automatically attaches to a scheduled invocation once that env var is
set. **Requires `CRON_SECRET` in Vercel to actually fire** — flagged
alongside this write-up, not something I can set myself (see
`.env.example`); doesn't move money on its own (`PLAY_PRICE_USDG` is
still 0), so it isn't a "real money" decision, just a required
deployment step, same class as the three P2 secrets.

**Settling is idempotent (`ran_at` guard), which is a different property
from "rejouable."** A day that's already been paid never gets
reprocessed or re-paid by a second `/api/draw/run` call (that would be a
real double-payout bug) — but `pickDrawWinner()` itself, the pure
function, can be independently re-run by anyone with the day's seed and
that day's `tickets_daily` rows and will always reach the identical
winner, for audit, regardless of whether it's ever "replayed" for a
payout. The prize itself lands in the normal `ledger` (`reason='prize',
ref='draw:<day>'`), reusing the same `unique(reason, ref)` idempotency
the rest of P5 already relies on.

**Rollover chain:** each settled day stores its own `rollover` (what
wasn't paid out); the next day's opening pot is read from the most
recent *settled* day's `rollover`, not assumed to be yesterday
specifically — a gap with no plays at all just means 0 rolled in, same
as day one ever had.

**UI: folded into `ProfileTab`'s existing "Tonight's draw" section
rather than a new dedicated page/tab.** The brief's P8 describes a
separate draw page; given the scope already covered this session, adding
pot/countdown/last-winner as a few more rows in an already-open section
was the pragmatic call over standing up a new tab for three data points
— a dedicated page is still reasonable to build later (P8 is not
otherwise touched), this just isn't it.

**Still not done: the codes system itself** (10-wins unlock, referral at
$500 filleul volume, manual attribution with a traceable prefix). Genuine
remaining scope, not started.

## P4 — Codes: original reading was wrong, corrected per explicit instruction

**The earlier reading in this file (superseded, kept only for the
record) had it backwards: it deferred a `ten_wins`/`referral` code's
unlock to a $500-volume threshold on the redeemer.** Corrected, per
explicit instruction: **redeeming any code — `manual`, `ten_wins`, or
`referral` alike — unlocks the redeemer immediately**, no exceptions,
no conditional path. `lifetime_unlocked=true`, bonus starts at (at
least) 50%, right at redemption.

**The $500 filleul-volume mechanic is a completely separate thing: it's
how a *parrain* (the code's issuer) earns a *new* code to distribute —
not a condition on the *filleul's* (redeemer's) own unlock at all.** The
two had been fused into one mechanism in the earlier reading; they're
independent now:

- `/api/codes/redeem` unlocks the redeemer outright, and — if the code
  had an issuer — also records `referred_by` on the redeemer, purely for
  tracking the relationship.
- `/api/play/finish` watches each referred address's own play volume
  (`sum(abs(delta))` from `ledger` where `reason='play'`); the first time
  it crosses `REFERRAL_VOLUME_USDG`, the *referrer* (`referred_by`) is
  granted a brand new `referral`-sourced code to give out. Guarded by a
  new `profiles.referral_reward_granted` flag so this fires once per
  filleul, not once per $500 increment thereafter.

Both remain dormant in practice while `PLAY_PRICE_USDG` is 0 (volume
never moves) — expected, resolves at the real price, same as everywhere
else this round.

**Still not built: any way to actually create a `manual` code.**
"Attribution manuelle avec préfixe traçable pour les partenaires"
implies a human (you, or a partner-facing admin flow) explicitly creates
one — there's no admin/partner role or auth concept in this app at all
yet. Today, a manual code is inserted directly into the `codes` table
(e.g. via the Supabase dashboard or MCP) with whatever prefix marks the
partner — `source='manual'`, `issuer_address` optional. A real admin
UI/route for this is future work if partner codes need to be self-serve.

## Deployment failure after CRON_SECRET was set — a likely cause, fixed defensively, not confirmed

**The Vercel deployment failed after `CRON_SECRET` was added and the
project redeployed — no build log was available to me (still no network
reach to Vercel from this sandbox, and no Vercel MCP access either), so
this is a plausible-and-fixed hypothesis, not a diagnosed-and-confirmed
one.** The one thing that changed around when secrets got set is
`NEXT_PUBLIC_PRIVY_APP_ID` going from unset (in this sandbox, still) to
actually set (in Vercel) — and that flips `PrivyClientProvider` from a
plain passthrough to actually rendering `<PrivyProvider>`. That
component is `'use client'`, but `'use client'` doesn't stop Next.js
from running it once during the server-side pass that produces the
initial HTML (SSR/static prerendering) — it only adds client-side
hydration on top. Privy's SDK does browser-only setup (storage, crypto)
that has no business executing during that server pass, and a crash
there is exactly the class of failure a local build in an environment
that never had the App ID set could never have caught.

**Fix: `PrivyClientProvider.tsx` now gates the real `<PrivyProvider>`
behind a `mounted` state, set `true` only inside a client-only
`useEffect`.** Before that fires (server render, and the first client
render before hydration effects run), it renders `{children}` directly
— the rest of the page's SSR/static output is completely unaffected,
only Privy's own provider is deferred to strictly-after-hydration,
client-only. `usePrivy()` and friends elsewhere in the tree already
tolerate "no provider" (confirmed earlier this session — the build
doesn't crash when the hooks are called without one), so the brief
window before the effect fires isn't a functional gap.

**Deliberately not the alternative fix** (`next/dynamic(...,
{ssr:false})` around the whole provider from `layout.tsx`) — tried
first, reverted: that would stop the *entire app* from rendering on the
server (everything is inside `PrivyClientProvider`'s `{children}`),
turning the initial page load into a blank shell until JS hydrates.
The mounted-gate keeps SSR/static output identical for everything except
Privy's own internals.

**If this wasn't the actual cause, the deployment will fail again in the
same way** — the fastest path from here is the literal error text from
Vercel's build log (Deployments → the failed one → Build Logs), which
this sandbox cannot fetch itself. Asked for it; proceeding with other
work in parallel rather than blocking on it, since this fix is a real
improvement regardless of whether it was the actual cause.

**Deploy fix was right — the real cause was `CRON_SECRET` having leading/
trailing whitespace in its Vercel value**, per the actual build log the
user pasted after this fix landed (`vercel build` validates cron-header
env vars and refuses a value with whitespace outright, unrelated to
Privy). The Privy mounted-gate fix above stays — it's still a real
improvement, just not what broke this particular deploy.

## First real smoke test: two live bugs found and fixed

**"Sign-in failed: Could not read your Privy identity token" — on a
*wallet* login (signature), not email.** The previous round's fix
(`AuthSync.tsx` waiting for `user.wallet` before syncing) targeted a
real but different race — email's embedded-wallet creation lag. This
one showed up even with a wallet already attached at auth time, meaning
`getIdentityToken()` itself can return null for a beat right after
`authenticated` flips true, independent of the wallet-readiness race.
Fixed by retrying the token fetch with backoff (`TOKEN_RETRY_DELAYS_MS`,
~8.7s total) before giving up, and — the more important part — giving
the error banner an actual RETRY button that re-runs the whole exchange.
Before this, a failure here was a dead end: nothing re-triggered the
effect (its dependency array never changed), so a stuck session required
a hard reload.

**"Puis on ne peut rien faire dans play/profile/draw" — a second,
compounding bug.** PLAY/PROFILE's gates called Privy's `login()`
whenever `!getIdentity()`, without checking whether Privy already
considered the session `authenticated`. Once the token-read above
failed, the player *was* authenticated with Privy but had no local
identity — clicking PLAY or the PROFILE tab called `login()` again,
which has nothing left to do when already authenticated and, from the
player's side, just did nothing. Fixed by checking `authenticated`
first: if true, don't call `login()` again — show a short "finishing
sign-in" message instead and let `onIdentityChange` pick it up the
moment `AuthSync` actually lands a session (now far more likely to,
given the retry fix above; the manual RETRY button is the fallback if
it still doesn't). Applied consistently in `HeistGame.tsx` (PLAY +
RUN AGAIN), `page.tsx` (the PROFILE tab switch), and `ProfileTab.tsx`
(the CONNECT button itself).

**Neither bug could have been caught by this sandbox's own build/lint/
typecheck/determinism suite** — both are runtime races against Privy's
real client-side SDK, only observable with a real login. This is
exactly the category of thing the standing "verify live, not just read"
discipline exists for; this sandbox still can't do that itself, so the
first real click-through remains the only way these surface. Worth
treating every "it doesn't work" report from here on as a likely real
bug report, not user error, given the track record so far (two for two).

## P7 — perRun path chosen; `HeistPlay.sol` written and tested, not deployed

**The user picked the path and gave the design directly**: perRun, not
deposit. One signed transaction per game (10 USDG), sent straight to
HEIST's contract, which splits it into the lucky draw, in-game payouts
(loot), and treasury — matching P3's original 45/45/10 framing, now with
an actual contract behind it.

`contracts/contracts/HeistPlay.sol` (21 tests, all passing —
`cd contracts && npm test`): `play(bytes32 runId)` pulls `playPrice` USDG
from the caller, sends `treasuryBps` of it to `treasury` immediately, and
leaves the rest pooled in the contract's own balance. `payout(to, ref,
amount, reason)` — `operator`-only, `reason` restricted to `loot`/
`prize` — moves funds out of that pool; idempotent on `ref`, reverting
outright on a repeat rather than silently no-op-ing. `owner` (2-step
transfer, same pattern as `HaulLedger`'s recorder) controls
`playPrice`/`treasuryBps`/`treasury`/`operator`.

**Deliberately doesn't maintain separate on-chain balances for the pot
vs. the loot budget** — both stay pooled together; the off-chain `ledger`
table (P5) is what actually tracks which portion is earmarked for what,
via its existing `reason` column. Mirrors the off-chain system's own
shape (one ledger, `reason` distinguishes movements) rather than
inventing an on-chain notion of "today's pot," which the contract has no
way to compute correctly anyway — that requires knowing every game's
verified outcome, and only server-side `replay()` determines that.

**Still not wired into the running app** — `/api/play/start`/`finish`
don't call this contract yet (there's no deployed address to call, and
`PLAY_PRICE_USDG` is still 0). Wiring it in later means: `start` requires
proof of a `play()` transaction before issuing a ticket, and `finish`
calls `HeistPlay.payout()` (as `operator`) alongside its existing
off-chain ledger writes, not instead of them — the off-chain ledger
stays the accounting source of truth either way. Not deployed anywhere,
per the standing instruction; see `contracts/README.md` for the fuller
writeup.

