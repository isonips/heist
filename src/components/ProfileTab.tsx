'use client'

import { useEffect, useState } from 'react'
import { theme } from '@/design/theme'
import { ESCAPE_AT } from '@/game/heistRun'
import { getStats, getTicketsToday, getUsername, setUsername, type ProfileStats } from '@/game/profile'

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

  useEffect(() => {
    const existing = getUsername()
    setName(existing ?? '')
    setDraft(existing ?? '')
    setEditing(!existing)
    setStats(getStats())
    setTickets(getTicketsToday())
  }, [])

  const save = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    setUsername(trimmed)
    setName(trimmed)
    setEditing(false)
  }

  return (
    <div style={{ fontFamily: theme.type.family, color: pal.pale, fontSize: BODY, lineHeight: theme.type.lineHeight.read }}>
      <h3 style={{ color: pal.amber, fontSize: BODY, fontWeight: 700, marginTop: 0 }}>Username</h3>
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
      <p style={{ color: pal.concrete, fontSize: FEED, marginTop: 4 }}>
        One ticket per run that reaches {ESCAPE_AT} crossings and gets out — escape early or ride out the
        clock, the ticket is yours either way. Resets at midnight UTC.
      </p>

      <h3 style={{ color: pal.amber, fontSize: BODY, fontWeight: 700, marginTop: 16 }}>Stats</h3>
      <div style={row}><span>Games played</span><span>{stats?.gamesPlayed ?? 0}</span></div>
      <div style={row}><span>Total crossings</span><span>{stats?.totalCrossings ?? 0}</span></div>
      <div style={row}><span>Wallets stolen</span><span>{stats?.walletsStolen ?? 0}</span></div>
      <div style={row}><span>Wallet winnings (points)</span><span style={{ color: pal.gold }}>{stats?.walletWinningsTotal ?? 0}</span></div>
      <div style={row}><span>Paintings stolen</span><span>{stats?.paintingsStolen ?? 0}</span></div>
      <p style={{ color: pal.concrete, fontSize: FEED, marginTop: 8 }}>
        &quot;Stolen&quot; only counts what you actually kept — escaping forfeits whatever&apos;s in hand,
        same rule as everywhere else. Points are play money: there is no payment system yet.
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
