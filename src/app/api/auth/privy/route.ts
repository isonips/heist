// POST { identityToken?, accessToken? } -> verifies one of them with Privy
// (server-side, see privyServer.ts), mints our own session cookie from
// the resolved address. This is the one place "a Privy login becomes a
// HEIST session" happens — every other server route only ever reads the
// cookie this sets.
//
// Two verification paths, tried in order: identityToken first (cheap,
// rate-limit-friendly per @privy-io/server-auth's own doc comment), then
// accessToken as a fallback — added after a real, repeated live bug: a
// session's identity token can come back null indefinitely on every
// client-side path tried (the reactive hook, the imperative call, a
// grace-period fallback — see AuthSync.tsx's history), for reasons
// outside this app's control. The access token is a different, always-
// issued Privy token; accepting it here means a stuck identity token no
// longer strands a sign-in entirely.
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { isPrivyConfigured, verifyPrivyAccessToken, verifyPrivyIdentityToken } from '@/lib/privyServer'
import { SESSION_COOKIE, signSession } from '@/lib/session'

export async function POST(req: Request) {
  if (!isPrivyConfigured()) {
    return NextResponse.json({ error: 'Privy is not configured on this deployment (NEXT_PUBLIC_PRIVY_APP_ID / PRIVY_APP_SECRET).' }, { status: 503 })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 })
  }
  const { identityToken, accessToken } = (body ?? {}) as { identityToken?: unknown; accessToken?: unknown }
  if (typeof identityToken !== 'string' && typeof accessToken !== 'string') {
    return NextResponse.json({ error: 'identityToken or accessToken is required.' }, { status: 400 })
  }

  const address = typeof identityToken === 'string' && identityToken
    ? await verifyPrivyIdentityToken(identityToken)
    : typeof accessToken === 'string' && accessToken
      ? await verifyPrivyAccessToken(accessToken)
      : null
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
