'use client'

import { useCallback, useEffect, useState } from 'react'
import { theme } from '@/design/theme'
import { ESCAPE_AT } from '@/game/heistRun'
import { connectInjected, connectPrivy, disconnect as disconnectWallet, getIdentity, hasInjectedWallet, type Identity } from '@/game/identity'
import { ENTRY_FEE_USDG, getBestDay, getStats, getTicketsToday, getUsername, reconcileIdentity, setUsername, snapshotActive, type ProfileStats } from '@/game/profile'

const pal = theme.palette
const BODY = theme.type.size.body
const FEED = theme.type.size.feed

const row = { display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${pal.chrome}` } as const

export default function ProfileTab() {
  const [name, setName] = useState('')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [tickets, setTickets] = useState(0)
  const [bestDay, setBestDay] = useState(0)
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [injectedAvailable, setInjectedAvailable] = useState(false)

  const refresh = useCallback(() => {
    const existing = getUsername()
    setName(existing ?? '')
    setDraft(existing ?? '')
    setEditing(!existing)
    setStats(getStats())
    setTickets(getTicketsToday())
    setBestDay(getBestDay())
    setIdentity(getIdentity())
  }, [])

  useEffect(() => {
    refresh()
    setInjectedAvailable(hasInjectedWallet())
  }, [refresh])

  const save = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    setUsername(trimmed)
    setName(trimmed)
    setEditing(false)
  }

  const connect = async (via: () => Promise<Identity>) => {
    setConnecting(true)
    setConnectError(null)
    try {
      const guestSnapshot = snapshotActive() // must run before identity switches
      const id = await via()
      reconcileIdentity(id, guestSnapshot)
      refresh()
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Could not connect.')
    } finally {
      setConnecting(false)
    }
  }

  const disconnect = () => {
    disconnectWallet()
    refresh()
  }

  return (
    <div style={{ fontFamily: theme.type.family, color: pal.pale, fontSize: BODY, lineHeight: theme.type.lineHeight.read }}>
      <h3 style={{ color: pal.amber, fontSize: BODY, fontWeight: 700, marginTop: 0 }}>Wallet</h3>
      {identity ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: pal.gold }}>
            {identity.address.slice(0, 6)}…{identity.address.slice(-4)}
            <span style={{ color: pal.concrete, fontSize: FEED }}> ({identity.source})</span>
          </span>
          <button onClick={disconnect} style={buttonStyle}>DISCONNECT</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => connect(connectInjected)}
              disabled={connecting || !injectedAvailable}
              style={{ ...buttonStyle, opacity: connecting || !injectedAvailable ? 0.5 : 1 }}
            >
              {injectedAvailable ? 'CONNECT WALLET' : 'NO WALLET FOUND'}
            </button>
            <button
              onClick={() => connect(connectPrivy)}
              disabled={connecting}
              title="Not configured in this environment"
              style={{ ...buttonStyle, background: pal.chrome, color: pal.concrete, opacity: 0.6 }}
            >
              PRIVY (SOON)
            </button>
          </div>
          {connectError && <p style={{ color: pal.sirenRed, fontSize: FEED, marginTop: 4 }}>{connectError}</p>}
          <p style={{ color: pal.concrete, fontSize: FEED, marginTop: 4 }}>
            Progress below is local to this browser until you connect. Connecting a wallet for the
            first time claims it under that address; a returning address keeps its own record.
          </p>
        </>
      )}

      <h3 style={{ color: pal.amber, fontSize: BODY, fontWeight: 700, marginTop: 16 }}>Username</h3>
      {editing ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={draft}
            maxLength={20}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
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
          <button onClick={save} style={buttonStyle}>SAVE</button>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: pal.gold }}>{name}</span>
          <button onClick={() => setEditing(true)} style={buttonStyle}>CHANGE</button>
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
