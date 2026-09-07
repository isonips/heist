// Server-only. A signed, single-use "permission slip" for one PLAY run —
// see DECISIONS.md P5. /api/play/start mints one: it rolls the seed and
// every mystery-item/painting drop for this run server-side (via the same
// atomic roll_global_drop() RPC as before, just called from the server
// now instead of the client) and signs the results into the ticket. The
// client never sees or chooses the seed or any drop outcome — it just
// carries this ticket through the run and hands it back, with the action
// log, to /api/play/finish, which decodes seed/drops from the *signature*,
// not from anything the client claims in the request body. A tampered
// ticket fails verification outright; there is no field in the decoded
// payload a client edit could change without invalidating the signature.
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { ITEM_ORDER, type ItemKey } from '@/game/heistRun'

const TICKET_TTL_S = 10 * 60 // a 60s run plus generous network/UI slack

export type PlayTicket = {
  address: string
  seed: number
  runId: string
  paintingHit: boolean
  itemHits: Record<ItemKey, boolean>
}

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET is not set — see .env.example.')
  return s
}

function sign(payload: string): string {
  // "play:" context prefix keeps this signature namespace-separate from
  // session.ts's — same secret, but a play ticket can never be replayed
  // as a session cookie or vice versa even if someone tried.
  return createHmac('sha256', secret()).update(`play:${payload}`).digest('base64url')
}

export function mintPlayTicket(address: string, paintingHit: boolean, itemHits: Record<ItemKey, boolean>): { token: string; seed: number; runId: string } {
  const seed = randomInt(0, 0x100000000) // uint32, same range HeistRun's own default seed uses
  const runId = randomBytes(12).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + TICKET_TTL_S
  const body = { address, seed, runId, paintingHit, itemHits, exp }
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url')
  const token = `${encoded}.${sign(encoded)}`
  return { token, seed, runId }
}

/** Returns the verified ticket, or null for anything that doesn't check
 *  out — bad signature, expired, malformed, or (if `expectAddress` is
 *  given) issued to a different address than the caller's own session. */
export function verifyPlayTicket(token: string | undefined | null, expectAddress: string): PlayTicket | null {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot < 0) return null
  const encoded = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = sign(encoded)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let body: { address?: unknown; seed?: unknown; runId?: unknown; paintingHit?: unknown; itemHits?: unknown; exp?: unknown }
  try {
    body = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof body.exp !== 'number' || body.exp < Math.floor(Date.now() / 1000)) return null
  if (typeof body.address !== 'string' || body.address !== expectAddress) return null
  if (typeof body.seed !== 'number' || typeof body.runId !== 'string') return null
  if (typeof body.paintingHit !== 'boolean') return null
  const itemHits = body.itemHits as Record<string, unknown>
  if (!itemHits || typeof itemHits !== 'object') return null
  for (const key of ITEM_ORDER) {
    if (typeof itemHits[key] !== 'boolean') return null
  }
  return {
    address: body.address,
    seed: body.seed,
    runId: body.runId,
    paintingHit: body.paintingHit,
    itemHits: itemHits as Record<ItemKey, boolean>,
  }
}
