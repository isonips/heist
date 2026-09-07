// POST -> { ticket, seed, runId, paintingHit, itemHits }. The one place a
// PLAY run's seed and drop rolls get decided — server-side, signed into a
// ticket the client carries through the run and hands back at
// /api/play/finish (see src/lib/playTicket.ts and DECISIONS.md P5). The
// client never chooses its own seed or drops; it only receives what this
// route already decided.
import { NextResponse } from 'next/server'
import { rollAllDropsServer } from '@/lib/globalDropsServer'
import { mintPlayTicket } from '@/lib/playTicket'
import { getSessionAddress } from '@/lib/requireSession'

export async function POST() {
  const address = await getSessionAddress()
  if (!address) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { paintingHit, itemHits } = await rollAllDropsServer()

  let ticket: ReturnType<typeof mintPlayTicket>
  try {
    ticket = mintPlayTicket(address, paintingHit, itemHits)
  } catch {
    return NextResponse.json({ error: 'Not configured on this deployment (SESSION_SECRET).' }, { status: 503 })
  }

  return NextResponse.json({
    ticket: ticket.token,
    seed: ticket.seed,
    runId: ticket.runId,
    paintingHit,
    itemHits,
  })
}
