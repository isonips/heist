// POST { identityToken } -> verifies it with Privy (server-side, see
// privyServer.ts), mints our own session cookie from the resolved address.
// This is the one place "a Privy login becomes a HEIST session" happens —
// every other server route only ever reads the cookie this sets.
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { isPrivyConfigured, verifyPrivyIdentityToken } from '@/lib/privyServer'
import { SESSION_COOKIE, signSession } from '@/lib/session'

export async function POST(req: Request) {
  if (!isPrivyConfigured()) {
    return NextResponse.json({ error: 'Privy is not configured on this deployment (NEXT_PUBLIC_PRIVY_APP_ID / PRIVY_APP_SECRET).' }, { status: 503 })
  }
  let identityToken: unknown
  try {
    ;({ identityToken } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 })
  }
  if (typeof identityToken !== 'string' || !identityToken) {
    return NextResponse.json({ error: 'identityToken is required.' }, { status: 400 })
  }

  const address = await verifyPrivyIdentityToken(identityToken)
  if (!address) {
    return NextResponse.json({ error: 'Could not verify identity — no linked wallet yet, or the token is invalid/expired.' }, { status: 401 })
  }

  let token: string
  try {
    token = signSession(address)
  } catch {
    return NextResponse.json({ error: 'Session signing is not configured on this deployment (SESSION_SECRET).' }, { status: 503 })
  }

  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return NextResponse.json({ address })
}
