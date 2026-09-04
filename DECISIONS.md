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

