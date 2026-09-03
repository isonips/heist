// Demo-tab telemetry: "it logs seed, inputs, crossings, heartsLost, result
// and per-move timings, and can export the aggregate as JSON. That is how
// I measure real humans against the bot ceiling." (code brief, section 6)
//
// heistRun.ts has no seed (it's the ported prototype's Math.random() world,
// not the deterministic engine — see CALIBRATION.md), so runId stands in:
// it identifies a run for this export, not something a replay can reseed.
import type { LoggedInput } from './heistRun'

export type DemoRunRecord = {
  runId: string
  startedAt: string
  crossings: number
  heartsLost: number
  result: { mode: string; outcome: string }
  ticks: number
  inputs: LoggedInput[]
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

export function recordDemoRun(record: DemoRunRecord): DemoRunRecord[] {
  const all = [...load(), record]
  save(all)
  return all
}

export function getDemoLog(): DemoRunRecord[] {
  return load()
}

export function clearDemoLog(): void {
  save([])
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
