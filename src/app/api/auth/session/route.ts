// GET -> { address } | { address: null }. The client can't read an
// httpOnly cookie directly — this is how it finds out whether it's logged
// in, and as whom.
import { NextResponse } from 'next/server'
import { getSessionAddress } from '@/lib/requireSession'

export async function GET() {
  const address = await getSessionAddress()
  return NextResponse.json({ address })
}
