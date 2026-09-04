'use client'

// P2: humans (DEMO tab, real telemetry from demo_runs) vs. the three
// harness bots, on the same metrics — the one comparison this codebase
// couldn't make before, since the bots' numbers only ever lived in
// terminal output (CALIBRATION.md) and nothing measured real play at all.
//
// Unlisted, not access-controlled: no link to this route from anywhere in
// the app's own nav, which is what the brief offered as the alternative to
// building real auth for an internal measurement page. Bot trials
// (bot.ts/greedyBot.ts/rationalBot.ts) have zero Node-only dependencies —
// they're pure functions over HeistRun — so they run for real, live, in
// this page's own browser tab rather than showing stale numbers copied
// from CALIBRATION.md.
import { useEffect, useState } from 'react'
import { theme } from '@/design/theme'
import { runBotTrial } from '@/harness/bot'
import { runGreedyBotTrial } from '@/harness/greedyBot'
import { runRationalBotTrial } from '@/harness/rationalBot'
import { fetchAggregateDemoRuns, type DemoRunSummary } from '@/game/demoLog'
import { isSupabaseConfigured } from '@/lib/supabase'

const pal = theme.palette
const BOT_TRIALS = 500
const CHUNK_SIZE = 40

/** Runs fn(seed) over every seed, yielding to the event loop every
 *  CHUNK_SIZE calls so a long batch doesn't block the tab in one go. */
async function runChunked<T>(seeds: number[], fn: (seed: number) => T): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < seeds.length; i += CHUNK_SIZE) {
    for (const seed of seeds.slice(i, i + CHUNK_SIZE)) out.push(fn(seed))
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return out
}

function median(arr: number[]): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function p95(arr: number[]): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(0.95 * s.length))]
}

type Row = {
  label: string
  n: number
  medianCrossings: number
  p95Crossings: number
  successRate: number | null
  lootPickupRate: number | null
  lootKeptRate: number | null
}

function summarize(label: string, crossings: number[], successes: boolean[], loot: { available: boolean; pickedUp: boolean; kept: boolean }[]): Row {
  const lootRuns = loot.filter((l) => l.available)
  return {
    label,
    n: crossings.length,
    medianCrossings: median(crossings),
    p95Crossings: p95(crossings),
    successRate: successes.length ? successes.filter(Boolean).length / successes.length : null,
    lootPickupRate: lootRuns.length ? lootRuns.filter((l) => l.pickedUp).length / lootRuns.length : null,
    lootKeptRate: lootRuns.length ? lootRuns.filter((l) => l.kept).length / lootRuns.length : null,
  }
}

function buildHumanRow(runs: DemoRunSummary[]): Row {
  return summarize(
    `Humans — DEMO tab (n=${runs.length})`,
    runs.map((r) => r.crossings),
    runs.map((r) => r.mode === 'paid'),
    runs.map((r) => ({ available: r.lootAvailable, pickedUp: r.lootPickedUp, kept: r.lootKept })),
  )
}

function pct(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(1)}%`
}

const FETCH_TIMEOUT_MS = 6000

function withTimeout<T>(promise: Promise<T>, fallback: T, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

export default function StatsPage() {
  // Bot rows and the human row load independently and on their own
  // schedule — bot trials are synchronous/instant and shouldn't wait on a
  // network call that might be slow or (an unreachable backend) never
  // resolve at all. humanRow stays null (shown as "loading") until its own
  // fetch settles or times out.
  const [botRows, setBotRows] = useState<Row[] | null>(null)
  const [humanRow, setHumanRow] = useState<Row | null>(null)
  const [humanLoaded, setHumanLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function run() {
      // Chunked with a yield between batches — BOT_TRIALS x 3 bots run
      // synchronously each, and doing all of it in one uninterrupted block
      // was long enough to make this sandbox's browser tab unresponsive
      // during testing. Yielding to the event loop between chunks keeps
      // the tab (and any real browser) responsive while it computes.
      const seeds = Array.from({ length: BOT_TRIALS }, (_, i) => i + 1)
      const cautious = await runChunked(seeds, runBotTrial)
      const greedy = await runChunked(seeds, runGreedyBotTrial)
      const rational = await runChunked(seeds, runRationalBotTrial)
      if (cancelled) return
      setBotRows([
        summarize(`Cautious bot (n=${BOT_TRIALS}) — escapes the instant it's armed`, cautious.map((r) => r.crossed), cautious.map((r) => r.win), cautious.map(() => ({ available: false, pickedUp: false, kept: false }))),
        summarize(`Greedy bot (n=${BOT_TRIALS}) — never escapes voluntarily`, greedy.map((r) => r.crossed), greedy.map((r) => r.win), greedy.map((r) => ({ available: r.lootAvailable, pickedUp: r.lootPickedUp, kept: r.lootKept }))),
        summarize(`Rational bot (n=${BOT_TRIALS}) — plays for expected value`, rational.map((r) => r.crossed), rational.map((r) => r.ticketed), rational.map((r) => ({ available: r.lootAvailable, pickedUp: r.lootPickedUp, kept: r.lootKept }))),
      ])
    }
    void run()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    withTimeout(fetchAggregateDemoRuns(), [], FETCH_TIMEOUT_MS).then((demoRuns) => {
      if (cancelled) return
      setHumanRow(buildHumanRow(demoRuns))
      setHumanLoaded(true)
    })
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ padding: 24, fontFamily: theme.type.family, color: pal.pale, background: pal.road, minHeight: '100vh' }}>
      <h1 style={{ color: pal.amber, fontSize: theme.type.size.display, marginBottom: 4 }}>HEIST — stats</h1>
      <p style={{ color: pal.concrete, fontSize: theme.type.size.feed, maxWidth: 640, marginBottom: 16 }}>
        Real DEMO-tab play (humans) against three harness bots, same metrics, same run. Bot trials run live in this
        tab — {BOT_TRIALS} seeds each, seeds 1..{BOT_TRIALS}. Unlisted page, no auth — don&apos;t link it from
        anywhere player-facing.
      </p>

      {!isSupabaseConfigured() && (
        <p style={{ color: pal.sirenRed, fontSize: theme.type.size.body, marginBottom: 16 }}>
          No backend configured (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY unset) — the human row will show 0 runs.
          Bot rows still work; they don&apos;t need a backend.
        </p>
      )}

      {botRows === null ? (
        <p style={{ color: pal.concrete }}>Running {BOT_TRIALS} trials per bot…</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: theme.type.size.feed, minWidth: 720 }}>
            <thead>
              <tr>
                {['Population', 'n', 'Median crossings', 'p95 crossings', 'Success rate', 'Loot pickup rate', 'Loot kept rate'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 12px', borderBottom: `2px solid ${pal.ink}`, color: pal.amber }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {!humanLoaded ? (
                  <td colSpan={7} style={{ padding: '6px 12px', borderBottom: `1px solid ${pal.chrome}`, color: pal.concrete }}>
                    Humans — DEMO tab: fetching demo_runs (times out after {FETCH_TIMEOUT_MS / 1000}s)…
                  </td>
                ) : (
                  <RowCells r={humanRow!} />
                )}
              </tr>
              {botRows.map((r) => <RowCells key={r.label} r={r} />)}
            </tbody>
          </table>
          {humanLoaded && humanRow?.n === 0 && (
            <p style={{ color: pal.concrete, fontSize: theme.type.size.feed, marginTop: 12 }}>
              No demo runs logged yet (or the backend was unreachable) — play a few rounds in DEMO to seed the human row.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function RowCells({ r }: { r: Row }) {
  const pal2 = theme.palette
  return (
    <>
      <td style={{ padding: '6px 12px', borderBottom: `1px solid ${pal2.chrome}` }}>{r.label}</td>
      <td style={{ padding: '6px 12px', borderBottom: `1px solid ${pal2.chrome}` }}>{r.n}</td>
      <td style={{ padding: '6px 12px', borderBottom: `1px solid ${pal2.chrome}` }}>{r.medianCrossings}</td>
      <td style={{ padding: '6px 12px', borderBottom: `1px solid ${pal2.chrome}` }}>{r.p95Crossings}</td>
      <td style={{ padding: '6px 12px', borderBottom: `1px solid ${pal2.chrome}`, color: pal2.gold }}>{pct(r.successRate)}</td>
      <td style={{ padding: '6px 12px', borderBottom: `1px solid ${pal2.chrome}` }}>{pct(r.lootPickupRate)}</td>
      <td style={{ padding: '6px 12px', borderBottom: `1px solid ${pal2.chrome}` }}>{pct(r.lootKeptRate)}</td>
    </>
  )
}
