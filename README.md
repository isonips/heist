# HEIST

Cross ten roads. The cops are behind you. Grab what you can.

A Frogger-style traffic-crossing game with a chase mechanic and a
push-your-luck loot layer: cross traffic for 60 seconds, reach ten
crossings to arm the escape door, then decide whether to walk away with
just the ticket or risk staying for whatever you've picked up along the
way. Police trail behind at a distance the player is only ever told about
in prose ("the gap is closing"), never a number.

Deployed on Vercel from this repo's `main` branch — `PLAY` and `DEMO` share one engine and one tab;
`RULES` explains the odds without handing a bot exact thresholds to exploit;
`PROFILE` holds stats, tonight's ticket count, and an optional wallet
connect.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint      # eslint, zero warnings tolerated
```

## The engine

`src/game/heistRun.ts` is the whole simulation — world generation, traffic,
the police chase, loot, mystery items, canvas rendering, sound — one class,
one file, deliberately not split into a "real" engine plus a UI-only
adapter. It's seeded: `new HeistRun(seed)` reproduces the exact same world
and, given the same sequence of recorded actions, the exact same outcome.
Every `Math.random()` in the sim path was replaced with an independent
seeded stream per gameplay concern (map, traffic, loot, items, furniture,
presentation), so adding a new roll to one never shifts another — see
`DECISIONS.md #1` for the exact split and why.

```ts
import { HeistRun, replay } from '@/game/heistRun'

const run = new HeistRun(12345)       // seeded, recorded (run.seed)
run.onKey('ArrowUp')                   // every action is logged: run.actionLog
run.advance()                          // one 110ms tick

const result = replay(run.seed, run.actionLog) // pure, DOM-free, no canvas/audio
```

`DEMO` mode is the same engine with `stakes: false` in spirit — no wallet
payout, no ticket recorded, nothing written to the (future) on-chain
ledger; it's the exact same `HeistRun`, not a second implementation.

## Calibration

`src/harness/` drives the real engine headlessly (no browser, no canvas) to
measure difficulty rather than guess at it:

```bash
npx tsx src/harness/cli.ts 2000          # cautious-bot sweep: success rate, median crossings, reinforcement rate
npx tsx src/harness/measure.ts 500       # relativeGap, impossibleShare, lootPickupRate
npm run test:determinism                 # 200 seeds, played then replayed, fails on any divergence
```

Full history of every tuning pass, what was measured, and why each number
landed where it did: [`CALIBRATION.md`](./CALIBRATION.md).

## Determinism & replay

`npm run test:determinism` plays 200 seeds with a scripted bot, replays
each recorded action log through the pure `replay()` function, and fails
loudly on the first mismatch — this is the actual guarantee, checked, not
just asserted. It also writes 20 of those seed/actions/result triples to
[`test-vectors/heist-v1.json`](./test-vectors/heist-v1.json) (tracked in
git), a reference fixture set for a future Solidity port to replay against.

## Identity

`src/game/identity.ts` connects a real EIP-1193 injected wallet (MetaMask
and friends — no API key needed) or, once configured, Privy's embedded
wallet (currently a documented stub — no app ID in this environment). An
address becomes the primary key for stats/tickets once connected; until
then everything lives in an anonymous per-browser `localStorage` bucket
that connecting later claims. See `DECISIONS.md #4`.

## `/embed`

A 300px, transparent, chrome-free activity ticker meant to sit on another
page. Reuses the same feed machinery (`lines.ts`, `feedBus.ts`) the real
in-app wire uses; currently seeded with synthetic ambient activity because
there's no shared backend feed yet to pull real cross-visitor events from.
See `DECISIONS.md #5`.

## Project docs

- [`CALIBRATION.md`](./CALIBRATION.md) — every difficulty/RNG tuning pass, with numbers.
- [`DECISIONS.md`](./DECISIONS.md) — calls made without stopping to ask, and the reasoning behind each.
- [`SESSION.md`](./SESSION.md) — latest working session's summary: done, remaining, blocked.

## Stack

Next.js 15 (App Router) + TypeScript (strict) + Tailwind, deployed on
Vercel. No test framework dependency beyond the project's own `tsx`-run
harness scripts (`src/harness/`) — deliberate, matching the existing
calibration tooling's pattern rather than introducing a second one.
