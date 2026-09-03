import { runBot } from './bot'
import type { Config } from '../engine/types'

export type SweepRow = {
  density: number
  speedMul: number
  reinforcement: boolean
  seeds: number
  successRate: number
  medianCrossings: number
  p95Crossings: number
  relativeGap: number
  medianHeartsLostOnWin: number
  laneRejectionRate: number
  impossibleShare: number
  lootPickupRateBot: number
  reinforcementTriggerRate: number
  medianLeadAtSeventhS: number
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

export type SweepOptions = {
  densities: number[]
  speedMuls: number[]
  seedsPerConfig: number
  reinforcement: boolean
  policeDelay: number
  grace: number
  ramp: number
  seedBase: number
}

export function runSweep(opts: SweepOptions): SweepRow[] {
  const rows: SweepRow[] = []
  let seedCounter = opts.seedBase

  for (const density of opts.densities) {
    for (const speedMul of opts.speedMuls) {
      const cfg: Config = {
        density,
        speedMul,
        policeDelay: opts.policeDelay,
        grace: opts.grace,
        ramp: opts.ramp,
        reinforcement: opts.reinforcement,
      }

      const crossings: number[] = []
      const heartsLostWin: number[] = []
      const leads: number[] = []
      let wins = 0
      let rejected = 0
      let roadLanes = 0
      let impossible = 0
      let lootPick = 0
      let lootAttempt = 0
      let reinFired = 0

      for (let i = 0; i < opts.seedsPerConfig; i++) {
        const seed = seedCounter++
        const run = runBot(seed, cfg)
        crossings.push(run.result.crossings)
        if (run.result.win) {
          wins++
          heartsLostWin.push(run.result.heartsLost)
        }
        rejected += run.rejectedLaneAttempts
        roadLanes += run.roadLaneCount
        if (run.impossible) impossible++
        if (run.lootAttempted) lootAttempt++
        if (run.lootKept) lootPick++
        if (run.reinforcementFired) reinFired++
        if (run.leadAtSeventhS != null) leads.push(run.leadAtSeventhS)
      }

      const med = median(crossings)
      const p95v = p95(crossings)

      rows.push({
        density,
        speedMul,
        reinforcement: opts.reinforcement,
        seeds: opts.seedsPerConfig,
        successRate: wins / opts.seedsPerConfig,
        medianCrossings: med,
        p95Crossings: p95v,
        relativeGap: med > 0 ? (p95v - med) / med : 0,
        medianHeartsLostOnWin: median(heartsLostWin),
        laneRejectionRate: rejected / (rejected + roadLanes),
        impossibleShare: impossible / opts.seedsPerConfig,
        lootPickupRateBot: lootAttempt > 0 ? lootPick / lootAttempt : 0,
        reinforcementTriggerRate: reinFired / opts.seedsPerConfig,
        medianLeadAtSeventhS: median(leads),
      })
    }
  }

  return rows
}

export function toCsv(rows: SweepRow[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0]) as (keyof SweepRow)[]
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map((h) => String(r[h])).join(','))
  return lines.join('\n')
}
