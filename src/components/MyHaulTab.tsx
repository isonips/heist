'use client'

// Sealed chests only — see DECISIONS.md P6. This tab (and the API it
// reads, /api/haul) never shows itemType/rarity/effect, on purpose: the
// reveal happens later, at the retroactive mint, not here. The count from
// haulStore (local, per-browser) is shown for a guest as a rough preview
// only — the real, address-scoped, mint-ready record only exists once
// connected.
import { useEffect, useState } from 'react'
import { theme } from '@/design/theme'
import { getIdentity } from '@/game/identity'
import { getHaul } from '@/game/haulStore'

const pal = theme.palette
const BODY = theme.type.size.body
const FEED = theme.type.size.feed

type HaulItem = { ts: string; revealed: boolean }

export default function MyHaulTab() {
  const [connected, setConnected] = useState(false)
  const [items, setItems] = useState<HaulItem[] | null>(null)
  const [localCount, setLocalCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const identity = getIdentity()
    setConnected(Boolean(identity))
    const counts = getHaul()
    setLocalCount(Object.values(counts).reduce((a, b) => a + b, 0))
    if (!identity) return
    let cancelled = false
    fetch('/api/haul')
      .then((res) => res.json())
      .then((data: { items?: HaulItem[]; error?: string }) => {
        if (cancelled) return
        if (data.items) setItems(data.items)
        else setError(data.error ?? 'Could not load your haul.')
      })
      .catch(() => { if (!cancelled) setError('Could not load your haul.') })
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ fontFamily: theme.type.family, color: pal.pale, fontSize: BODY, lineHeight: theme.type.lineHeight.read }}>
      <h3 style={{ color: pal.amber, fontSize: BODY, fontWeight: 700, marginTop: 0 }}>My Haul</h3>
      <p style={{ color: pal.concrete, fontSize: FEED, marginTop: 0 }}>
        Every mystery item you&apos;ve kept, sealed. What&apos;s inside — type, rarity, effect — is
        revealed later, at the mint. For now: closed chests, dated.
      </p>

      {!connected && (
        <p style={{ color: pal.concrete, fontSize: FEED, marginTop: 12 }}>
          {localCount > 0
            ? `${localCount} chest${localCount === 1 ? '' : 's'} in this browser, unconnected — connect to lock them to your address.`
            : 'Connect to see your haul.'}
        </p>
      )}

      {connected && error && <p style={{ color: pal.sirenRed, fontSize: FEED, marginTop: 12 }}>{error}</p>}

      {connected && !error && items === null && (
        <p style={{ color: pal.concrete, fontSize: FEED, marginTop: 12 }}>Loading…</p>
      )}

      {connected && items !== null && items.length === 0 && (
        <p style={{ color: pal.concrete, fontSize: FEED, marginTop: 12 }}>No chests yet — win a run holding a mystery item to earn one.</p>
      )}

      {connected && items !== null && items.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {items.map((item, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 10px',
                marginBottom: 6,
                background: pal.chrome,
                border: `1px solid ${pal.ink}`,
                boxShadow: `inset 1px 1px 0 ${pal.steelLt}`,
              }}
            >
              <span>{new Date(item.ts).toLocaleDateString()}</span>
              <span style={{ color: pal.gold }}>{item.revealed ? 'MINTED' : 'REVEAL SOON'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
