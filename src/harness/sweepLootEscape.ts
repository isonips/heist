// P0 follow-up: measures the CURRENT LOOT_ESCAPE_AT (as exported from
// heistRun.ts) against the rational bot — lootKeptRate, ticketRate,
// successRate. Run once per candidate value by editing the constant and
// re-invoking (tsx re-evaluates the whole module fresh each process, so
// this is reliable — same technique CALIBRATION.md's REIN_LEAD_S/POLICE_PX
// sweeps used). Usage: npx tsx src/harness/sweepLootEscape.ts [trials] [safeLeadS]
//
// safeLeadS defaults to the bot's own built-in 13s (the game's far/mid
// alert boundary). Also accepts an override so the sweep can check whether
// a result is really about LOOT_ESCAPE_AT or is being masked by the bot's
// safety-valve firing before it ever gets a chance to reach the target —
// see CALIBRATION.md's P0 follow-up for why this mattered here.
import { LOOT_ESCAPE_AT } from '@/game/heistRun'
import { runRationalBotTrial } from './rationalBot'

const trials = Number(process.argv[2] ?? 2000)
const safeLeadS = process.argv[3] !== undefined ? Number(process.argv[3]) : undefined

const rows = Array.from({ length: trials }, (_, i) => runRationalBotTrial(i + 1, undefined, undefined, safeLeadS))
const ticketRate = rows.filter((r) => r.ticketed).length / trials
const lootRuns = rows.filter((r) => r.lootAvailable)
const lootKeptRate = lootRuns.length ? lootRuns.filter((r) => r.lootKept).length / lootRuns.length : 0
// successRate here matches the brief's usage elsewhere in this codebase:
// the fraction of runs that came away with the ticket at all (== ticketRate
// for this bot, since it never dies holding nothing worth the risk) — kept
// as its own field/name for direct comparability with cli.ts's cautious-bot
// successRate.
const successRate = ticketRate

console.log(JSON.stringify({ trials, lootEscapeAt: LOOT_ESCAPE_AT, safeLeadS: safeLeadS ?? 0, ticketRate: Number(ticketRate.toFixed(4)), lootKeptRate: Number(lootKeptRate.toFixed(4)), lootRunCount: lootRuns.length, successRate: Number(successRate.toFixed(4)) }))
