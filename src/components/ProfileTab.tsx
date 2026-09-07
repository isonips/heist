'use client'

import { useIdentityToken, useLogout, usePrivy } from '@privy-io/react-auth'
import { useCallback, useEffect, useState } from 'react'
import { theme } from '@/design/theme'
import { ESCAPE_AT } from '@/game/heistRun'
import { disconnect as disconnectWallet, getIdentity, setIdentity, type Identity } from '@/game/identity'
import { claimUsername, ENTRY_FEE_USDG, getBestDay, getStats, getTicketsToday, getUsername, reconcileIdentity, setUsername, snapshotActive, type ProfileStats } from '@/game/profile'

const pal = theme.palette
const BODY = theme.type.size.body
const FEED = theme.type.size.feed

const row = { display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${pal.chrome}` } as const

export default function ProfileTab() {
  const { ready, authenticated, login } = usePrivy()
  const { identityToken } = useIdentityToken()
  const { logout: privyLogout } = useLogout()

  const [name, setName] = useState('')
  const [draft, setDraft] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [tickets, setTickets] = useState(0)
  const [bestDay, setBestDay] = useState(0)
  const [identity, setLocalIdentity] = useState<Identity | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    const existing = getUsername()
    setName(existing ?? '')
    setDraft('')
    setConfirming(false)
    setStats(getStats())
    setTickets(getTicketsToday())
    setBestDay(getBestDay())
    setLocalIdentity(getIdentity())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Privy has verified the login (email or wallet) — exchange its identity
  // token for our own session cookie, then reconcile local/server state.
  // See DECISIONS.md P2: this is the one place a Privy login becomes a
  // HEIST identity; every write elsewhere trusts the cookie this sets, not
  // any address the client claims.
  useEffect(() => {
    if (!ready || !authenticated || !identityToken) return
    if (getIdentity()) return
    let cancelled = false
    ;(async () => {
      setSyncing(true)
      setSyncError(null)
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
        if (!cancelled) refresh()
      } catch (err) {
        if (!cancelled) setSyncError(err instanceof Error ? err.message : 'Could not sign in.')
      } finally {
        if (!cancelled) setSyncing(false)
      }
    })()
    return () => { cancelled = true }
  }, [ready, authenticated, identityToken, refresh])

  const disconnect = () => {
    disconnectWallet()
    void fetch('/api/auth/logout', { method: 'POST' })
    void privyLogout()
    refresh()
  }

  const claim = async () => {
    if (!confirming) {
      if (!draft.trim()) return
      setConfirming(true)
      return
    }
    setClaiming(true)
    setClaimError(null)
    const result = await claimUsername(draft)
    setClaiming(false)
    if (!result.ok) {
      setClaimError(result.error)
      setConfirming(false)
      return
    }
    setName(result.username)
    setDraft('')
    setConfirming(false)
  }

  const saveGuestName = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    setUsername(trimmed)
    setName(trimmed)
    setDraft('')
  }

  return (
    <div style={{ fontFamily: theme.type.family, color: pal.pale, fontSize: BODY, lineHeight: theme.type.lineHeight.read }}>
      <h3 style={{ color: pal.amber, fontSize: BODY, fontWeight: 700, marginTop: 0 }}>Account</h3>
      {identity ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: pal.gold }}>
            {identity.address.slice(0, 6)}…{identity.address.slice(-4)}
          </span>
          <button onClick={disconnect} style={buttonStyle}>DISCONNECT</button>
        </div>
      ) : (
        <>
          <button onClick={() => login()} disabled={!ready || syncing} style={{ ...buttonStyle, opacity: !ready || syncing ? 0.5 : 1 }}>
            {syncing ? 'CONNECTING…' : 'CONNECT'}
          </button>
          {syncError && <p style={{ color: pal.sirenRed, fontSize: FEED, marginTop: 4 }}>{syncError}</p>}
          <p style={{ color: pal.concrete, fontSize: FEED, marginTop: 4 }}>
            Email or wallet — either way you get one address. PLAY, tickets, bonus and loot all need
            this; DEMO doesn&apos;t. Progress below is local to this browser until you connect.
          </p>
        </>
      )}

      <h3 style={{ color: pal.amber, fontSize: BODY, fontWeight: 700, marginTop: 16 }}>Username</h3>
      {name ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: pal.gold }}>{name}</span>
          {!identity && <span style={{ color: pal.concrete, fontSize: FEED }}>local only</span>}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={draft}
              maxLength={20}
              disabled={claiming}
              onChange={(e) => { setDraft(e.target.value); setConfirming(false); setClaimError(null) }}
              onKeyDown={(e) => e.key === 'Enter' && (identity ? claim() : saveGuestName())}
              placeholder="pick a name"
              style={{
                flex: 1,
                background: pal.chrome,
                color: pal.pale,
                border: `1px solid ${pal.ink}`,
                fontFamily: theme.type.family,
                fontSize: BODY,
                padding: '6px 8px',
              }}
            />
            <button onClick={identity ? claim : saveGuestName} disabled={claiming} style={buttonStyle}>
              {identity ? (confirming ? 'CONFIRM' : 'CLAIM') : 'SAVE'}
            </button>
          </div>
          {identity && confirming && (
            <p style={{ color: pal.amber, fontSize: FEED, marginTop: 4 }}>
              This name is permanent — it can never be changed. Click CONFIRM to lock it in.
            </p>
          )}
          {identity && !confirming && (
            <p style={{ color: pal.concrete, fontSize: FEED, marginTop: 4 }}>
              Free, unique, and permanent once claimed. Shown in the feed and stream overlay.
            </p>
          )}
          {claimError && <p style={{ color: pal.sirenRed, fontSize: FEED, marginTop: 4 }}>{claimError}</p>}
        </div>
      )}

      <h3 style={{ color: pal.amber, fontSize: BODY, fontWeight: 700, marginTop: 16 }}>Tonight&apos;s draw</h3>
      <div style={row}>
        <span>Tickets earned today</span>
        <span style={{ color: pal.gold }}>{tickets}</span>
      </div>
      <div style={row}>
        <span>Biggest day</span>
        <span style={{ color: pal.gold }}>{bestDay}</span>
      </div>
      <p style={{ color: pal.concrete, fontSize: FEED, marginTop: 4 }}>
        One ticket per run that reaches {ESCAPE_AT} crossings and gets out — escape early or ride out the
        clock, the ticket is yours either way. Resets at midnight UTC.
      </p>

      <h3 style={{ color: pal.amber, fontSize: BODY, fontWeight: 700, marginTop: 16 }}>Stats</h3>
      <div style={row}>
        <span>Won / played</span>
        <span>{stats?.gamesWon ?? 0} / {stats?.gamesPlayed ?? 0}</span>
      </div>
      <div style={row}>
        <span>Total staked</span>
        <span>{(stats?.gamesPlayed ?? 0) * ENTRY_FEE_USDG} USDG</span>
      </div>
      <div style={row}><span>Total crossings</span><span>{stats?.totalCrossings ?? 0}</span></div>
      <div style={row}><span>Wallets stolen</span><span>{stats?.walletsStolen ?? 0}</span></div>
      <div style={row}><span>Wallet winnings (points)</span><span style={{ color: pal.gold }}>{stats?.walletWinningsTotal ?? 0}</span></div>
      <div style={row}><span>Paintings stolen</span><span>{stats?.paintingsStolen ?? 0}</span></div>
      <p style={{ color: pal.concrete, fontSize: FEED, marginTop: 8 }}>
        &quot;Stolen&quot; only counts what you actually kept — escaping forfeits whatever&apos;s in hand,
        same rule as everywhere else. Total staked is a projection (games played × {ENTRY_FEE_USDG} USDG) —
        no payment system exists yet, so nothing has actually moved.
      </p>
    </div>
  )
}

const buttonStyle = {
  fontFamily: theme.type.family,
  background: pal.amber,
  color: pal.ink,
  border: `1px solid ${pal.ink}`,
  boxShadow: `inset 1px 1px 0 ${pal.gold}, inset -1px -1px 0 ${pal.amberDp}`,
  padding: '6px 12px',
  cursor: 'pointer',
  fontSize: BODY,
} as const
