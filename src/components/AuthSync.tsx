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
// Identity token history (three real bugs in a row, each fixing the last
// without solving the underlying problem):
// 1. First version polled the imperative getIdentityToken() with a
//    retry-and-backoff loop — turned out to be the bug itself:
//    getIdentityToken() hits Privy's own API on every call ("Too many
//    requests" is @privy-io/api-base's own rate-limit error text), and
//    repeated bursts tripped Privy's rate limit hard enough that it
//    didn't clear even after 18 real minutes of waiting.
// 2. Switched to Privy's reactive `useIdentityToken()` hook, which reads
//    state the SDK already maintains — no network call of our own. Fixed
//    the rate limit, but then the hook's value was reported to simply
//    stay null forever on a fresh sign-in, with no fallback — a plain
//    reactive read isn't enough if Privy's SDK hasn't already populated
//    that state through some other path yet.
// 3. Current version: prefer the hook (costs nothing when it works), but
//    if it hasn't populated after a short grace period, fall back to
//    exactly ONE imperative getIdentityToken() call — not a loop. One
//    call per sign-in attempt is negligible rate-limit risk while still
//    covering the case the hook alone can't.
import { getIdentityToken, useIdentityToken, usePrivy } from '@privy-io/react-auth'
import { useEffect, useRef, useState } from 'react'
import { theme } from '@/design/theme'
import { getIdentity, setIdentity, type Identity } from '@/game/identity'
import { reconcileIdentity, snapshotActive } from '@/game/profile'

// Grace period for the reactive hook to populate on its own before the
// single imperative fallback call fires.
const HOOK_GRACE_MS = 1500
// How long to wait for a wallet to link before treating it as stuck.
const WALLET_WAIT_MS = 8000
// After any failure, RETRY is disabled for a cooldown that grows with
// consecutive failures (5s, 10s, 15s... capped at 30s) — protects our own
// /api/auth/privy endpoint (and the single fallback call above) against a
// mashed RETRY button.
const RETRY_COOLDOWN_STEP_S = 5
const RETRY_COOLDOWN_MAX_S = 30

export default function AuthSync() {
  const { ready, authenticated, user } = usePrivy()
  const { identityToken: hookToken } = useIdentityToken()
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
        let token = hookToken
        if (!token) {
          await new Promise((resolve) => setTimeout(resolve, HOOK_GRACE_MS))
          if (cancelled) return
          token = hookToken || (await getIdentityToken())
        }
        if (!token) throw new Error('Could not read your Privy identity token.')
        const res = await fetch('/api/auth/privy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identityToken: token }),
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
  }, [ready, authenticated, hasWallet, hookToken, retryNonce])

  useEffect(() => {
    if (cooldownS <= 0) return
    const timer = setInterval(() => setCooldownS((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldownS])

  // Bug found live (P9 smoke test): the main effect above used to return
  // immediately, silently, while `!hasWallet` — correct for the brief
  // embedded-wallet-creation lag it was written for, but if a wallet
  // never links at all (Privy dashboard misconfigured, or a wallet login
  // that fails to attach), this used to hang forever with no error, no
  // banner, and therefore no RETRY — "Finishing sign-in…" with no way
  // out. This timer is independent of the main effect so a stuck
  // `hasWallet` surfaces its own error instead of hanging silently.
  useEffect(() => {
    if (!ready || !authenticated || hasWallet) return
    const timer = setTimeout(() => {
      setError('No wallet is linked to this sign-in yet. Disconnect and try again, or retry.')
      registerFailure()
    }, WALLET_WAIT_MS)
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
