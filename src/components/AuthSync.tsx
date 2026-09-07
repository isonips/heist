'use client'

// Mounted once, globally (see PrivyClientProvider.tsx) — this is the one
// place a Privy login becomes a HEIST session, regardless of which tab is
// open. It used to live inside ProfileTab.tsx's own effect, which only
// ran while PROFILE was mounted — meaning a login triggered from PLAY's
// wallet gate (see HeistGame.tsx, P1) would authenticate with Privy but
// never actually get exchanged for a session cookie or update
// identity.ts's cache, since nothing was listening. Lifting it here makes
// identity sync work no matter which tab (or gate) triggered the login.
//
// Waits for `user.wallet` specifically, not just `authenticated` — for an
// email-only login, Privy creates the embedded wallet (see
// PrivyClientProvider's embeddedWallets config) *after* authentication
// completes, not atomically with it. `user.wallet` is Privy's own live
// user object, not a cached token, so it updates the moment the embedded
// wallet actually exists.
//
// Even with the wallet ready, getIdentityToken() (an imperative fetch)
// can still return null for a beat — observed live on a *wallet* login
// (signature, no embedded-wallet creation lag at all), so this isn't the
// same race as the wallet one above; it's the identity token itself
// taking a moment to reflect a just-completed auth. Retried with a short
// backoff rather than failing on the first null, and a genuine failure
// now offers a manual retry — the previous version had neither, so a
// stuck token would strand the whole session (PLAY/PROFILE/DRAW gates
// all check identity.ts, which never got set) until a hard reload.
import { getIdentityToken, usePrivy } from '@privy-io/react-auth'
import { useEffect, useState } from 'react'
import { theme } from '@/design/theme'
import { getIdentity, setIdentity, type Identity } from '@/game/identity'
import { reconcileIdentity, snapshotActive } from '@/game/profile'

const TOKEN_RETRY_DELAYS_MS = [0, 400, 800, 1500, 3000, 3000] // ~8.7s total before giving up

export default function AuthSync() {
  const { ready, authenticated, user } = usePrivy()
  const hasWallet = Boolean(user?.wallet?.address)
  const [error, setError] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)

  useEffect(() => {
    if (!ready || !authenticated || !hasWallet) return
    if (getIdentity()) return
    let cancelled = false
    ;(async () => {
      setError(null)
      try {
        const guestSnapshot = snapshotActive() // must run before identity switches
        let identityToken: string | null = null
        for (const delay of TOKEN_RETRY_DELAYS_MS) {
          if (cancelled) return
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
          identityToken = await getIdentityToken()
          if (identityToken) break
        }
        if (!identityToken) throw new Error('Could not read your Privy identity token after several tries.')
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
  }, [ready, authenticated, hasWallet, retryNonce])

  // A silent console.error here was worse than useless the one time this
  // actually broke — nobody watching the game screen has devtools open.
  // A small banner with an actual retry at least gives a stuck session a
  // way out that isn't a hard reload.
  if (!error) return null
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        background: theme.palette.sirenRed,
        color: theme.palette.pale,
        border: `1px solid ${theme.palette.ink}`,
        padding: '8px 14px',
        fontFamily: theme.type.family,
        fontSize: theme.type.size.feed,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span>Sign-in failed: {error}</span>
      <button
        onClick={() => setRetryNonce((n) => n + 1)}
        style={{ background: theme.palette.pale, border: 'none', color: theme.palette.ink, cursor: 'pointer', fontFamily: theme.type.family, padding: '2px 8px' }}
      >
        RETRY
      </button>
      <button
        onClick={() => setError(null)}
        style={{ background: 'transparent', border: 'none', color: theme.palette.pale, cursor: 'pointer', fontFamily: theme.type.family }}
      >
        ✕
      </button>
    </div>
  )
}
