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
import { useEffect, useRef, useState } from 'react'
import { theme } from '@/design/theme'
import { getIdentity, setIdentity, type Identity } from '@/game/identity'
import { reconcileIdentity, snapshotActive } from '@/game/profile'

// Short and few — this is only meant to ride out a beat right after auth,
// not paper over a real problem. The original 6-attempt/~8.7s burst was
// itself the cause of a real bug found live: getIdentityToken() hits
// Privy's own API (confirmed — see @privy-io/api-base's rate-limit error
// text), and firing 6 calls in ~9s, then another 6 on every manual RETRY,
// was enough to trip Privy's own rate limit — "Too many requests" was our
// own retry loop's doing, not a real outage. 3 attempts / ~2.5s is still
// enough for the race this exists for.
const TOKEN_RETRY_DELAYS_MS = [0, 700, 1800]
// After any failure, RETRY is disabled for a cooldown that grows with
// consecutive failures (5s, 10s, 15s... capped at 30s) — specifically so
// hammering RETRY against a live rate-limit can't make it worse, which is
// exactly what happened before this existed ("même résultat en essayant
// à nouveau", immediately, every time).
const RETRY_COOLDOWN_STEP_S = 5
const RETRY_COOLDOWN_MAX_S = 30

export default function AuthSync() {
  const { ready, authenticated, user } = usePrivy()
  const hasWallet = Boolean(user?.wallet?.address)
  const [error, setError] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const failCountRef = useRef(0)
  const [cooldownS, setCooldownS] = useState(0)

  const registerFailure = () => {
    failCountRef.current += 1
    setCooldownS(Math.min(RETRY_COOLDOWN_MAX_S, failCountRef.current * RETRY_COOLDOWN_STEP_S))
  }

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
        failCountRef.current = 0
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not sign in.')
        registerFailure()
      }
    })()
    return () => { cancelled = true }
  }, [ready, authenticated, hasWallet, retryNonce])

  useEffect(() => {
    if (cooldownS <= 0) return
    const timer = setInterval(() => setCooldownS((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldownS])

  // Bug found live (P9 smoke test): the effect above returns immediately,
  // silently, while `!hasWallet` — correct for the brief embedded-wallet-
  // creation lag it was written for, but if a wallet never links at all
  // (Privy dashboard misconfigured, or a wallet login that fails to
  // attach), this used to hang forever with no error, no banner, and
  // therefore no RETRY — "Finishing sign-in…" with no way out, since the
  // banner below only ever rendered from the *other* effect's catch
  // block, which this path never reaches. This timer is independent of
  // that one specifically so a stuck `hasWallet` surfaces its own error
  // instead of hanging silently.
  useEffect(() => {
    if (!ready || !authenticated || hasWallet) return
    const timer = setTimeout(() => {
      setError('No wallet is linked to this sign-in yet. Disconnect and try again, or retry.')
      registerFailure()
    }, 8000)
    return () => clearTimeout(timer)
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
        disabled={cooldownS > 0}
        style={{
          background: theme.palette.pale,
          border: 'none',
          color: theme.palette.ink,
          cursor: cooldownS > 0 ? 'default' : 'pointer',
          opacity: cooldownS > 0 ? 0.6 : 1,
          fontFamily: theme.type.family,
          padding: '2px 8px',
        }}
      >
        {cooldownS > 0 ? `RETRY (${cooldownS}s)` : 'RETRY'}
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
