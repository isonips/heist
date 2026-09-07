'use client'

// Mounted once, globally (see PrivyClientProvider.tsx) — this is the one
// place a Privy login becomes a HEIST session, regardless of which tab is
// open. It used to live inside ProfileTab.tsx's own effect, which only
// ran while PROFILE was mounted — meaning a login triggered from PLAY's
// wallet gate (see HeistGame.tsx, P1) would authenticate with Privy but
// never actually get exchanged for a session cookie or update
// identity.ts's cache, since nothing was listening. Lifting it here makes
// identity sync work no matter which tab (or gate) triggered the login.
import { useEffect, useState } from 'react'
import { useIdentityToken, usePrivy } from '@privy-io/react-auth'
import { getIdentity, setIdentity, type Identity } from '@/game/identity'
import { reconcileIdentity, snapshotActive } from '@/game/profile'

export default function AuthSync() {
  const { ready, authenticated } = usePrivy()
  const { identityToken } = useIdentityToken()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ready || !authenticated || !identityToken) return
    if (getIdentity()) return
    let cancelled = false
    ;(async () => {
      setError(null)
      try {
        const guestSnapshot = snapshotActive() // must run before identity switches
        const res = await fetch('/api/auth/privy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identityToken }),
        })
        const data = (await res.json().catch(() => ({}))) as { address?: string; error?: string }
        if (!res.ok || !data.address) throw new Error(data.error ?? 'Could not sign in.')
        if (cancelled) return
        const id: Identity = { address: data.address, source: 'privy' }
        setIdentity(id)
        await reconcileIdentity(id, guestSnapshot)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not sign in.')
      }
    })()
    return () => { cancelled = true }
  }, [ready, authenticated, identityToken])

  // Surfaced by ProfileTab reading this via a dedicated hook would be
  // overkill for one string — simplest correct thing is to not render
  // anything here at all and let a failed sync just mean "still
  // disconnected," which every gate already handles. Logged for
  // debugging only.
  useEffect(() => {
    if (error) console.error('[AuthSync]', error)
  }, [error])

  return null
}
