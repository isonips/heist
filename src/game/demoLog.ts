// Demo-tab telemetry: seed, actions, inputs (movement timings), crossings,
// heartsLost, loot picked-up/kept, and the outcome — the same shape as
// the three harness bots' own trial results, so real play is directly
// comparable to bot ceilings on the same metrics (P2). Kept locally
// (export-as-JSON still works offline) and, when Supabase is configured,
// pushed to the shared demo_runs table (fire-and-forget) so the aggregate
// page (src/app/stats/page.tsx) can compare humans against the bots.
import { getSupabase } from '@/lib/supabase'
import type { LoggedInput, ReplayInput } from './heistRun'

export type DemoRunRecord = {
  runId: string
  seed: number
  startedAt: string
  crossings: number
  heartsLost: number
  lootAvailable: boolean
  lootPickedUp: boolean
  lootKept: boolean
  result: { mode: string; outcome: string }
  ticks: number
  inputs: LoggedInput[]
  actions: ReplayInput[]
}

const STORAGE_KEY = 'heist-demo-log-v1'

function load(): DemoRunRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as DemoRunRecord[]) : []
  } catch {
    return []
  }
}

function save(records: DemoRunRecord[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    // storage full or unavailable — the export button still works off memory
  }
}

function pushToServer(record: DemoRunRecord) {
  const supabase = getSupabase()
  if (!supabase) return
  void supabase.from('demo_runs').insert({
    run_id: record.runId,
    seed: record.seed,
    started_at: record.startedAt,
    crossings: record.crossings,
    hearts_lost: record.heartsLost,
    loot_available: record.lootAvailable,
    loot_picked_up: record.lootPickedUp,
    loot_kept: record.lootKept,
    mode: record.result.mode,
    outcome: record.result.outcome,
    ticks: record.ticks,
    actions: record.actions,
    inputs: record.inputs,
  }).then(() => {})
}

export function recordDemoRun(record: DemoRunRecord): DemoRunRecord[] {
  const all = [...load(), record]
  save(all)
  pushToServer(record)
  return all
}

export function getDemoLog(): DemoRunRecord[] {
  return load()
}

export function clearDemoLog(): void {
  save([])
}

export type DemoRunSummary = {
  crossings: number
  mode: string
  lootAvailable: boolean
  lootPickedUp: boolean
  lootKept: boolean
}

/** For the /stats aggregate page — real human demo runs, across every
 *  browser that's played, not just this one. Empty array (not a throw)
 *  when Supabase isn't configured or the request fails, same convention
 *  as feedBus.ts's fetchRecentFeedEvents. */
export async function fetchAggregateDemoRuns(limit = 5000): Promise<DemoRunSummary[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('demo_runs')
      .select('crossings,mode,loot_available,loot_picked_up,loot_kept')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    return data.map((row) => ({
      crossings: Number(row.crossings) || 0,
      mode: String(row.mode),
      lootAvailable: Boolean(row.loot_available),
      lootPickedUp: Boolean(row.loot_picked_up),
      lootKept: Boolean(row.loot_kept),
    }))
  } catch {
    return []
  }
}

export function exportDemoLogAsFile(): void {
  const records = load()
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `heist-demo-log-${Date.now()}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
