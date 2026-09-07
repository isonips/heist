'use client'

// P8: the dedicated draw page — pot, countdown, the player's own tickets
// and bonus, the previous result with its winner, plus a wallet section
// (balance from the ledger, deposit/withdraw greyed out until the Vault
// contract is live — see P10/P7). See DECISIONS.md P8.
import { useCallback, useEffect, useState } from 'react'
import { theme } from '@/design/theme'
import { getIdentity, onIdentityChange } from '@/game/identity'
import { getBestDay, getStats, getTicketsToday, type ProfileStats } from '@/game/profile'

const pal = theme.palette
const BODY = theme.type.size.body
const FEED = theme.type.size.feed

const row = { display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${pal.chrome}` } as const

type DrawInfo = { pot: number; previous: { day: string; winnerAddress: string | null; payout: number; totalTickets: number } | null }
type WalletInfo = { balance: number; deposits: number; withdrawals: number }

export default function DrawTab() {
  const [connected, setConnected] = useState(false)
  const [draw, setDraw] = useState<DrawInfo | null>(null)
  const [wallet, setWallet] = useState<WalletInfo | null>(null)
  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [tickets, setTickets] = useState(0)
  const [bestDay, setBestDay] = useState(0)
  const [countdown, setCountdown] = useState('')

  const load = useCallback(() => {
    const identity = getIdentity()
    setConnected(Boolean(identity))
    setStats(getStats())
    setTickets(getTicketsToday())
    setBestDay(getBestDay())
    if (identity) {
      fetch('/api/wallet').then((res) => res.json()).then((data) => { if (data.balance !== undefined) setWallet(data) }).catch(() => {})
    } else {
      setWallet(null)
    }
  }, [])

  useEffect(() => {
    load()
    return onIdentityChange(load)
  }, [load])

  useEffect(() => {
    fetch('/api/draw').then((res) => res.json()).then((data) => { if (data.pot !== undefined) setDraw(data) }).catch(() => {})
  }, [])

  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      const nextMidnightUTC = Math.ceil(now / 86400000) * 86400000
      const s = Math.max(0, Math.floor((nextMidnightUTC - now) / 1000))
      const h = String(Math.floor(s / 3600)).padStart(2, '0')
      const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
      const sec = String(s % 60).padStart(2, '0')
      setCountdown(`${h}:${m}:${sec}`)
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div style={{ fontFamily: theme.type.family, color: pal.pale, fontSize: BODY, lineHeight: theme.type.lineHeight.read }}>
      <h3 style={{ color: pal.amber, fontSize: BODY, fontWeight: 700, marginTop: 0 }}>Tonight&apos;s Draw</h3>
      <div style={row}>
        <span>Pot</span>
        <span style={{ color: pal.gold }}>{draw ? draw.pot.toFixed(2) : '—'} USDG</span>
      </div>
      <div style={row}>
        <span>Draw in</span>
        <span style={{ color: pal.gold }}>{countdown || '—'}</span>
      </div>
      {draw?.previous && (
        <div style={row}>
          <span>Last winner ({draw.previous.day})</span>
          <span style={{ color: pal.gold }}>
            {draw.previous.winnerAddress
              ? `${draw.previous.winnerAddress.slice(0, 6)}… — ${draw.previous.payout.toFixed(2)} USDG`
              : 'no tickets, rolled over'}
          </span>
        </div>
      )}
      <p style={{ color: pal.concrete, fontSize: FEED, marginTop: 4 }}>
        One winner a day, picked at random weighted by ticket count. Their bonus multiplies what
        they collect from the pot; whatever they don&apos;t collect rolls into tomorrow&apos;s pot.
        Without a lifetime unlock, a win is capped at half the pot (see PROFILE).
      </p>

      <h3 style={{ color: pal.amber, fontSize: BODY, fontWeight: 700, marginTop: 16 }}>Your Numbers</h3>
      {connected ? (
        <>
          <div style={row}>
            <span>Bonus</span>
            <span style={{ color: pal.gold }}>{stats?.bonusPct ?? 0}%</span>
          </div>
          <div style={row}>
            <span>Tickets today</span>
            <span style={{ color: pal.gold }}>{tickets}</span>
          </div>
          <div style={row}>
            <span>Biggest day</span>
            <span style={{ color: pal.gold }}>{bestDay}</span>
          </div>
        </>
      ) : (
        <p style={{ color: pal.concrete, fontSize: FEED, marginTop: 0 }}>Connect to see your bonus and tickets.</p>
      )}

      <h3 style={{ color: pal.amber, fontSize: BODY, fontWeight: 700, marginTop: 16 }}>Wallet</h3>
      {connected ? (
        <div style={row}>
          <span>Balance</span>
          <span style={{ color: pal.gold }}>{wallet ? wallet.balance.toFixed(2) : '—'} USDG</span>
        </div>
      ) : (
        <p style={{ color: pal.concrete, fontSize: FEED, marginTop: 0 }}>Connect to see your balance.</p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button disabled title="Available once the Vault contract is deployed" style={{ ...buttonStyle, opacity: 0.4, cursor: 'not-allowed', flex: 1 }}>
          DEPOSIT
        </button>
        <button disabled title="Available once the Vault contract is deployed" style={{ ...buttonStyle, opacity: 0.4, cursor: 'not-allowed', flex: 1 }}>
          WITHDRAW
        </button>
      </div>
      <p style={{ color: pal.concrete, fontSize: FEED, marginTop: 4 }}>
        Deposit and withdraw need the Vault contract live on-chain (see /contracts — written and
        tested, not deployed yet). Balance above is real ledger accounting; nothing has actually
        moved yet since PLAY is still free (PLAY_PRICE is 0).
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
  fontSize: BODY,
} as const
