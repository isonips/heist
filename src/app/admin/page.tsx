'use client'

// Admin-only stats panel (deployer/treasury wallet, see src/lib/adminAuth.ts)
// — for pulling numbers to post about the game (X, etc.), not part of the
// player-facing app shell. Gated both here (hide the panel) and, more
// importantly, server-side in /api/admin/stats (deny the data) — a
// client-only gate would just be cosmetic.
import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useState } from 'react'
import { theme } from '@/design/theme'
import { getIdentity, onIdentityChange } from '@/game/identity'

const pal = theme.palette

type AdminStats = {
  gamesPlayed: number
  uniquePlayers: number
  pot: number
  totalRedistributed: number
  projectedFees: number
  bestPlayer: { address: string; username: string | null; crossed: number } | null
}

export default function AdminPage() {
  const { ready, authenticated, login } = usePrivy()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = () => {
      if (!getIdentity()) { setLoading(false); return }
      setLoading(true)
      fetch('/api/admin/stats')
        .then(async (res) => {
          const data = await res.json()
          if (!res.ok) throw new Error(data.error ?? 'Not authorized.')
          setStats(data)
          setError(null)
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Not authorized.'))
        .finally(() => setLoading(false))
    }
    load()
    return onIdentityChange(load)
  }, [])

  const shell = (children: React.ReactNode) => (
    <div
      style={{
        minHeight: '100vh',
        background: pal.ink,
        color: pal.pale,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        fontFamily: theme.type.family,
        padding: 24,
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  )

  if (!getIdentity()) {
    return shell(
      <>
        <div style={{ fontSize: theme.type.size.body, color: pal.concrete }}>Not authorized.</div>
        <button
          onClick={() => login()}
          disabled={!ready || authenticated}
          style={{
            fontFamily: theme.type.family,
            background: pal.amber,
            color: pal.ink,
            border: `1px solid ${pal.ink}`,
            padding: '6px 14px',
            cursor: 'pointer',
          }}
        >
          CONNECT
        </button>
      </>,
    )
  }

  if (loading) return shell(<div style={{ color: pal.concrete }}>Loading…</div>)
  if (error || !stats) return shell(<div style={{ color: pal.concrete }}>Not authorized.</div>)

  const tiles: { label: string; value: string }[] = [
    { label: 'Games played', value: String(stats.gamesPlayed) },
    { label: 'Unique players', value: String(stats.uniquePlayers) },
    { label: 'Pot (today)', value: `${stats.pot.toFixed(2)} USDG` },
    { label: 'Redistributed (all-time)', value: `${stats.totalRedistributed.toFixed(2)} USDG` },
    { label: 'Treasury fees (projected)', value: `${stats.projectedFees.toFixed(2)} USDG` },
    {
      label: 'Best run',
      value: stats.bestPlayer
        ? `${stats.bestPlayer.crossed} crossings — ${stats.bestPlayer.username ?? `${stats.bestPlayer.address.slice(0, 6)}…${stats.bestPlayer.address.slice(-4)}`}`
        : '—',
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: pal.ink, color: pal.pale, fontFamily: theme.type.family, padding: 24 }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ color: pal.amber, fontSize: theme.type.size.display, marginBottom: 4 }}>HEIST — Admin</h1>
        <p style={{ color: pal.concrete, fontSize: theme.type.size.feed, marginBottom: 20 }}>
          Treasury fees are projected from today&apos;s config, not a recorded on-chain figure — they read 0 while
          the game is free (PLAY_PRICE_USDG = 0) and stay a projection until HeistPlay.sol is deployed and each
          play() call is tracked directly.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {tiles.map((t) => (
            <div key={t.label} style={{ background: pal.shade, border: `1px solid ${pal.steel}`, padding: 14 }}>
              <div style={{ fontSize: theme.type.size.feed, color: pal.concrete, marginBottom: 6 }}>{t.label}</div>
              <div style={{ fontSize: theme.type.size.body, color: pal.gold, wordBreak: 'break-word' }}>{t.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
