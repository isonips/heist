'use client'

import { useEffect, useState } from 'react'
import { theme } from '@/design/theme'
import type { ICONS } from '@/design/sprite-data'
import { eventIcon, type EventType } from '@/design/lines'
import { fetchRecentFeedEvents, postFeedEvent, subscribeFeed, type FeedEntry } from '@/game/feedBus'
import { isSupabaseConfigured } from '@/lib/supabase'
import PixelIcon from './PixelIcon'

const pal = theme.palette
const MAX_LINES = theme.feed.maxLines
const FEED_TEXT = theme.type.size.feed
const POLL_MS = 6000

// Shown only when there's no backend to read real activity from (local dev
// without Supabase configured) — never mixed with real rows once one exists,
// so nothing here can be mistaken for something that actually happened.
const AMBIENT: FeedEntry[] = [
  { id: -1, type: 'runInProgress', text: 'someone is making a run for it — 6 and counting', self: false, at: Date.now() },
  { id: -2, type: 'cleanGetaway', text: 'kade.eth is in the wind with 11 crossings', self: false, at: Date.now() },
]

export default function FeedWindow() {
  // Collapsed by default — expanded, it's 420px tall and can sit over the
  // game's own controls on a narrower window. "Collapsible to just the title
  // bar so it never gets in the way" (design brief) argues for starting there.
  const [collapsed, setCollapsed] = useState(true)
  const [entries, setEntries] = useState<FeedEntry[]>(() => (isSupabaseConfigured() ? [] : AMBIENT))
  const [pulse, setPulse] = useState(false)
  const [draft, setDraft] = useState('')
  // Mobile: "the window becomes a collapsed bar at the bottom of the
  // screen... it must never cover the game" (design brief, section 10).
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const update = () => setMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    return subscribeFeed((entry) => {
      setEntries((prev) => [entry, ...prev].slice(0, MAX_LINES))
      if (collapsed) {
        setPulse(true)
        setTimeout(() => setPulse(false), 900)
      }
    })
  }, [collapsed])

  // P1: real cross-tab/cross-player activity, polled rather than pushed —
  // simpler and reliable enough for a ticker at this pace, no realtime
  // channel to open/clean up. A row this tab just posted itself (via the
  // subscribeFeed effect above) is skipped by matching text within a short
  // window, so sending something doesn't double it up once the next poll
  // reads it back from the server.
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    let cancelled = false
    const poll = async () => {
      const fresh = await fetchRecentFeedEvents(MAX_LINES)
      if (cancelled || !fresh.length) return
      setEntries((prev) => {
        const recentText = new Set(prev.filter((e) => Date.now() - e.at < 20000).map((e) => e.text))
        const merged = [...prev]
        for (const row of fresh) {
          if (merged.some((e) => e.id === row.id)) continue
          if (recentText.has(row.text)) continue
          merged.push(row)
        }
        merged.sort((a, b) => b.at - a.at)
        return merged.slice(0, MAX_LINES)
      })
    }
    void poll()
    const id = window.setInterval(poll, POLL_MS)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [])

  const send = () => {
    const text = draft.trim()
    if (!text) return
    postFeedEvent('playerMessage', { name: 'you' }, true)
    setEntries((prev) => [{ id: Date.now(), type: 'playerMessage' as EventType, text: `you: ${text}`, self: true, at: Date.now() }, ...prev].slice(0, MAX_LINES))
    setDraft('')
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: mobile ? 0 : 12,
        left: mobile ? 0 : 'auto',
        bottom: mobile ? 0 : 12,
        width: mobile ? '100%' : theme.feed.window.w,
        background: pal.shade,
        border: `2px solid ${pal.ink}`,
        borderLeft: mobile ? 'none' : `2px solid ${pal.ink}`,
        borderRight: mobile ? 'none' : `2px solid ${pal.ink}`,
        borderBottom: mobile ? 'none' : `2px solid ${pal.ink}`,
        boxShadow: `0 0 0 3px ${pal.pale} inset`,
        fontFamily: theme.type.family,
        zIndex: 50,
      }}
    >
      <button
        onClick={() => setCollapsed((c) => !c)}
        style={{
          width: '100%',
          height: theme.feed.window.collapsedH,
          background: pulse ? pal.amber : pal.steel,
          color: pulse ? pal.ink : pal.white,
          border: 'none',
          borderBottom: collapsed ? 'none' : `2px solid ${pal.ink}`,
          fontSize: FEED_TEXT,
          cursor: 'pointer',
          textAlign: 'left',
          padding: '0 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>HEIST WIRE — 47 online</span>
        <PixelIcon name="chevron" scale={1} rotate={collapsed ? -90 : 0} />
      </button>

      {!collapsed && (
        <>
          <div
            style={{
              height: mobile ? '46vh' : theme.feed.window.h - theme.feed.window.collapsedH - theme.feed.composer.height,
              overflowY: 'auto',
              padding: 4,
            }}
          >
            {entries.map((e) => (
              <div
                key={e.id}
                style={{
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                  padding: '4px 4px',
                  marginBottom: 2,
                  background: e.self ? pal.steel : pal.shade,
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
          <div style={{ display: 'flex', height: theme.feed.composer.height, borderTop: `2px solid ${pal.ink}` }}>
            <input
              value={draft}
              maxLength={theme.feed.composer.maxChars}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="say something ($0.10)"
              style={{
                flex: 1,
                background: pal.chrome,
                color: pal.pale,
                border: 'none',
                fontFamily: theme.type.family,
                fontSize: FEED_TEXT,
                padding: '0 6px',
              }}
            />
            <button
              onClick={send}
              style={{ background: pal.amber, color: pal.ink, border: 'none', fontSize: FEED_TEXT, padding: '0 10px', cursor: 'pointer' }}
            >
              SEND
            </button>
          </div>
        </>
      )}
    </div>
  )
}
