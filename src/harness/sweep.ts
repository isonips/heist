import { runBotTrial, type BotTrialResult } from './bot'

export type SweepSummary = {
  trials: number
  successRate: number
  medianCrossings: number
  p95Crossings: number
  relativeGap: number
  medianHeartsLostOnWin: number
  reinforcementTriggerRate: number
  medianLeadAtSeventhS: number | null
  outcomeBreakdown: Record<string, number>
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function p95(arr: number[]): number {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(0.95 * s.length))]
}

export function runSweep(trials: number): { summary: SweepSummary; rows: BotTrialResult[] } {
  const rows: BotTrialResult[] = []
  for (let i = 0; i < trials; i++) rows.push(runBotTrial())

  const crossings = rows.map((r) => r.crossed)
  const wins = rows.filter((r) => r.win)
  const heartsLostOnWin = wins.map((r) => r.heartsLost)
  const leads = rows.map((r) => r.leadAtSeventhS).filter((v): v is number => v !== null)
  const med = median(crossings)
  const p95v = p95(crossings)

  const outcomeBreakdown: Record<string, number> = {}
  for (const r of rows) outcomeBreakdown[r.outcome] = (outcomeBreakdown[r.outcome] ?? 0) + 1

  const summary: SweepSummary = {
    trials,
    successRate: wins.length / trials,
    medianCrossings: med,
    p95Crossings: p95v,
    relativeGap: med > 0 ? (p95v - med) / med : 0,
    medianHeartsLostOnWin: median(heartsLostOnWin),
    reinforcementTriggerRate: rows.filter((r) => r.reinforcementFired).length / trials,
    medianLeadAtSeventhS: leads.length ? median(leads) : null,
    outcomeBreakdown,
  }

  return { summary, rows }
}

export function toCsv(rows: BotTrialResult[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0]) as (keyof BotTrialResult)[]
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map((h) => String(r[h])).join(','))
  return lines.join('\n')
}
