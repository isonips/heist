'use client'

import { useEffect, useState } from 'react'
import { theme } from '@/design/theme'
import type { ICONS } from '@/design/sprite-data'
import { eventIcon, type EventType } from '@/design/lines'
import { postFeedEvent, subscribeFeed, type FeedEntry } from '@/game/feedBus'
import PixelIcon from '@/components/PixelIcon'

const pal = theme.palette
const MAX_LINES = 8

// No shared backend feed exists yet (see DECISIONS.md #5) — a real embed
// needs real cross-visitor activity. Until then this synthesises plausible
// ambient lines client-side, through the exact same lines.ts bag-draw and
// token substitution a real event uses, so the copy itself needs no changes
// when a live feed replaces this generator.
const NAMES = ['kade.eth', 'moss', 'DZ', 'unclegary', 'ren.eth', 'tf2000', 'BB', 'sable']
const AMBIENT_TYPES: EventType[] = ['cleanGetaway', 'runInProgress', 'caught', 'keptRareItem', 'wonDraw', 'itemUsed', 'outOfTime']

function randomTokens(type: EventType): Record<string, string | number> {
  const name = NAMES[Math.floor(Math.random() * NAMES.length)]
  const crossings = 6 + Math.floor(Math.random() * 20)
  switch (type) {
    case 'keptRareItem': return { name, item: 'a painting' }
    case 'itemUsed': return { name }
    case 'wonDraw': return { name }
    default: return { name, crossings, lane: crossings }
  }
}

export default function EmbedPage() {
  const [entries, setEntries] = useState<FeedEntry[]>([])

  useEffect(() => subscribeFeed((entry) => setEntries((prev) => [entry, ...prev].slice(0, MAX_LINES))), [])

  useEffect(() => {
    // Seed immediately so the widget isn't blank for the first few seconds,
    // then keep the wire moving at a believable, uneven pace.
    const fire = () => {
      const type = AMBIENT_TYPES[Math.floor(Math.random() * AMBIENT_TYPES.length)]
      postFeedEvent(type, randomTokens(type), false)
    }
    fire()
    const id = setInterval(fire, 3500 + Math.random() * 3000)
    return () => clearInterval(id)
  }, [])

  return (
    <>
      {/* Overrides globals.css's solid body background just for this route
          — an embed has to be transparent so it can sit on a host page,
          not carry its own page background. */}
      <style>{'html,body{background:transparent!important}'}</style>
      <div style={{ width: 300, fontFamily: theme.type.family }}>
        {entries.map((e) => (
          <div
            key={e.id}
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              padding: '5px 6px',
              marginBottom: 3,
              background: pal.shade,
              border: `1px solid ${pal.ink}`,
              fontSize: theme.feed.entry.fontSize,
              lineHeight: theme.feed.entry.lineHeight,
              color: pal.pale,
            }}
          >
            <PixelIcon name={eventIcon[e.type].replace('icon.', '') as keyof typeof ICONS} scale={2} />
            <span>{e.text}</span>
          </div>
        ))}
      </div>
    </>
  )
}
