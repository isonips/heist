'use client'

import { useEffect, useState } from 'react'
import { theme } from '@/design/theme'
import type { ICONS } from '@/design/sprite-data'
import { eventIcon, type EventType } from '@/design/lines'
import { fetchRecentFeedEvents, postFeedEvent, subscribeFeed, type FeedEntry } from '@/game/feedBus'
import { isSupabaseConfigured } from '@/lib/supabase'
import PixelIcon from '@/components/PixelIcon'

const pal = theme.palette
const MAX_LINES = 8
const POLL_MS = 5000

// Synthetic fallback for when there's no backend configured to read real
// activity from (local dev without Supabase set up) — see DECISIONS.md #5
// and P1. Whenever Supabase *is* configured this whole block is unused:
// the effect below reads real rows from feed_events instead. Kept as a
// fallback rather than deleted so the widget still demos something with no
// env vars set, but it must never run alongside real data.
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

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let cancelled = false
    const poll = async () => {
      const fresh = await fetchRecentFeedEvents(MAX_LINES)
      if (!cancelled && fresh.length) setEntries(fresh)
    }
    void poll()
    const id = window.setInterval(poll, POLL_MS)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [])

  useEffect(() => {
    if (isSupabaseConfigured()) return undefined // real data available — the synthetic generator never runs
    const unsubscribe = subscribeFeed((entry) => setEntries((prev) => [entry, ...prev].slice(0, MAX_LINES)))
    const fire = () => {
      const type = AMBIENT_TYPES[Math.floor(Math.random() * AMBIENT_TYPES.length)]
      postFeedEvent(type, randomTokens(type), false)
    }
    fire()
    const id = window.setInterval(fire, 3500 + Math.random() * 3000)
    return () => { unsubscribe(); window.clearInterval(id) }
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
