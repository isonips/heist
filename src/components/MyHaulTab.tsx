'use client'

import { useEffect, useState } from 'react'
import { theme } from '@/design/theme'
import type { ItemKey } from '@/game/heistRun'
import { getHaul, type HaulCounts } from '@/game/haulStore'
import { getStats } from '@/game/profile'
import PixelIcon from './PixelIcon'

const pal = theme.palette
const BODY = theme.type.size.body
const FEED = theme.type.size.feed

const ITEMS: { key: ItemKey; name: string; rarity: string; effect: string }[] = [
  { key: 'oldMan', name: 'The Old Man', rarity: 'common', effect: 'stops traffic for 8s' },
  { key: 'pileUp', name: 'The Pile-Up', rarity: 'common', effect: 'blocks one lane' },
  { key: 'shortcut', name: 'The Shortcut', rarity: 'rare', effect: '5s more head start' },
  { key: 'safe', name: 'The Safe', rarity: 'rare', effect: 'freezes the bonus for 7 days' },
  { key: 'haul', name: 'The Haul', rarity: 'legendary', effect: 'raises the bonus cap to 110%' },
]

export default function MyHaulTab() {
  const [counts, setCounts] = useState<HaulCounts | null>(null)
  const [paintings, setPaintings] = useState(0)
  useEffect(() => {
    setCounts(getHaul())
    setPaintings(getStats().paintingsStolen)
  }, [])

  return (
    <div style={{ fontFamily: theme.type.family, color: pal.pale, fontSize: BODY, lineHeight: theme.type.lineHeight.read }}>
      <p style={{ color: pal.concrete, fontSize: FEED }}>
        No wallet connected yet — embedded wallet and on-chain recording are
        phase 3, and drops aren&apos;t yet the real global counter across every
        player either (that needs the same backend). Counts below are earned
        by playing, kept locally in this browser as a stand-in. Nothing here
        implies a value, a price, or a date.
      </p>

      <h3 style={{ color: pal.amber, marginTop: 12, fontSize: BODY, fontWeight: 700 }}>Paintings</h3>
      {paintings === 0 ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${pal.chrome}` }}>
          <QuestionSlot />
          <div style={{ flex: 1, color: pal.steelLt }}>none kept yet</div>
        </div>
      ) : (
        Array.from({ length: paintings }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${pal.chrome}` }}>
            <QuestionSlot />
            <div style={{ flex: 1 }}>Unidentified piece #{i + 1}</div>
            <span style={{ color: pal.gold, fontSize: FEED }}>COMING SOON</span>
          </div>
        ))
      )}
      <p style={{ color: pal.concrete, fontSize: FEED, marginTop: 4 }}>
        What you actually took stays unrevealed until this ships for real — a
        rare drop, not a common one.
      </p>

      <h3 style={{ color: pal.amber, marginTop: 16, fontSize: BODY, fontWeight: 700 }}>The collection</h3>
      {ITEMS.map((item) => {
        const count = counts?.[item.key] ?? 0
        return (
          <div key={item.key} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${pal.chrome}` }}>
            <span
              style={{
                width: 22,
                height: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: pal.chrome,
                flexShrink: 0,
                opacity: count > 0 ? 1 : 0.4,
              }}
            >
              <PixelIcon name={item.key} scale={2} />
            </span>
            <div style={{ flex: 1 }}>
              <div>{item.name} <span style={{ color: pal.concrete, fontSize: FEED }}>({item.rarity})</span></div>
              <div style={{ color: pal.concrete, fontSize: FEED }}>{item.effect}</div>
            </div>
            <span style={{ color: count > 0 ? pal.gold : pal.steelLt, fontSize: FEED }}>
              {count > 0 ? `x${count}` : 'not earned'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function QuestionSlot() {
  return (
    <span
      style={{
        width: 22,
        height: 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: pal.chrome,
        color: pal.concrete,
        flexShrink: 0,
        fontSize: BODY,
        fontWeight: 700,
      }}
    >
      ?
    </span>
  )
}
