'use client'

import { useLogout, usePrivy } from '@privy-io/react-auth'
import { useCallback, useEffect, useState } from 'react'
import { theme } from '@/design/theme'
import { ESCAPE_AT } from '@/game/heistRun'
import { disconnect as disconnectWallet, getIdentity, onIdentityChange, type Identity } from '@/game/identity'
import { claimUsername, ENTRY_FEE_USDG, getBestDay, getStats, getTicketsToday, getUsername, setUsername, type ProfileStats } from '@/game/profile'

const pal = theme.palette
const BODY = theme.type.size.body
const FEED = theme.type.size.feed

const row = { display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${pal.chrome}` } as const

export default function ProfileTab() {
  const { ready, login, authenticated } = usePrivy()
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
  const [codeInfo, setCodeInfo] = useState<{ lifetimeUnlocked: boolean; issuedCode: string | null } | null>(null)
  const [redeemDraft, setRedeemDraft] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const refreshCodes = useCallback(() => {
    if (!getIdentity()) { setCodeInfo(null); return }
    fetch('/api/codes').then((res) => res.json()).then((data) => {
      if (data.lifetimeUnlocked !== undefined) setCodeInfo(data)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    refreshCodes()
    return onIdentityChange(refreshCodes)
  }, [refreshCodes])

  const redeemCode = async () => {
    const code = redeemDraft.trim()
    if (!code) return
    setRedeeming(true)
    setRedeemMsg(null)
    try {
      const res = await fetch('/api/codes/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRedeemMsg({ ok: false, text: data.error ?? 'Could not redeem.' })
      } else {
        setRedeemDraft('')
        setRedeemMsg({ ok: true, text: data.unlocked ? 'Unlocked!' : 'Linked — unlocks once your volume hits the referral threshold.' })
        refreshCodes()
      }
    } catch {
      setRedeemMsg({ ok: false, text: 'Network error — try again.' })
    } finally {
      setRedeeming(false)
    }
  }

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
    return onIdentityChange(refresh) // AuthSync.tsx does the actual sync; this just re-renders when it lands
  }, [refresh])

  const disconnect = () => {
    disconnectWallet()
    void fetch('/api/auth/logout', { method: 'POST' })
    void privyLogout()
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
          {authenticated ? (
            <p style={{ color: pal.concrete, fontSize: FEED, margin: 0 }}>
              Finishing sign-in… if this doesn&apos;t resolve in a few seconds, check the banner at the
              bottom of the screen.
            </p>
          ) : (
            <button onClick={() => login()} disabled={!ready} style={{ ...buttonStyle, opacity: !ready ? 0.5 : 1 }}>
              CONNECT
            </button>
          )}
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
        <span>Bonus</span>
        <span style={{ color: pal.gold }}>{stats?.bonusPct ?? 0}%</span>
      </div>
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
        clock, the ticket is yours either way. Resets at midnight UTC. Bonus multiplies what you&apos;d
        win at the draw: +10% per win, −20% per calendar day you don&apos;t play, 0-100%. Pot, countdown,
        and the last winner are on the DRAW tab.
      </p>

      {identity && (
        <>
          <h3 style={{ color: pal.amber, fontSize: BODY, fontWeight: 700, marginTop: 16 }}>Lifetime unlock</h3>
          {codeInfo?.lifetimeUnlocked ? (
            <p style={{ color: pal.gold, fontSize: FEED, marginTop: 0 }}>Unlocked — no draw cap.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={redeemDraft}
                  disabled={redeeming}
                  onChange={(e) => { setRedeemDraft(e.target.value); setRedeemMsg(null) }}
                  onKeyDown={(e) => e.key === 'Enter' && redeemCode()}
                  placeholder="have a code?"
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
                <button onClick={redeemCode} disabled={redeeming} style={buttonStyle}>REDEEM</button>
              </div>
              {redeemMsg && <p style={{ color: redeemMsg.ok ? pal.gold : pal.sirenRed, fontSize: FEED, marginTop: 4 }}>{redeemMsg.text}</p>}
              <p style={{ color: pal.concrete, fontSize: FEED, marginTop: 4 }}>
                Without a code, a draw win is capped at half the pot. Unlock removes the cap and starts
                your bonus at 50%.
              </p>
            </>
          )}
          {codeInfo?.issuedCode && (
            <p style={{ color: pal.concrete, fontSize: FEED, marginTop: 4 }}>
              Your code to share: <span style={{ color: pal.gold }}>{codeInfo.issuedCode}</span>
            </p>
          )}
        </>
      )}

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
