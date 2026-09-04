'use client'

import { useEffect, useState } from 'react'
import { theme } from '@/design/theme'

const pal = theme.palette
const SEEN_KEY = 'heist-splash-seen-v1'
const DURATION_MS = 3000
const LINES = ['CROSS TEN ROADS', 'THE COPS ARE BEHIND YOU', 'GRAB WHAT YOU CAN']

/** Shown once per browser (localStorage flag), auto-dismisses after 3s,
 *  skippable at any point by a click, tap, or key. Sits above everything
 *  else in the tree — page.tsx renders it alongside, not instead of, the
 *  real UI, so there's nothing else to mount once it's gone. */
export default function SplashScreen() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let seen = true
    try { seen = window.localStorage.getItem(SEEN_KEY) === '1' } catch { /* unavailable — show it */ }
    if (!seen) setVisible(true)
  }, [])

  useEffect(() => {
    if (!visible) return
    const dismiss = () => setVisible(false)
    const timer = window.setTimeout(dismiss, DURATION_MS)
    window.addEventListener('keydown', dismiss)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', dismiss)
    }
  }, [visible])

  useEffect(() => {
    if (visible) return
    try { window.localStorage.setItem(SEEN_KEY, '1') } catch { /* unavailable */ }
  }, [visible])

  if (!visible) return null

  return (
    <div
      onClick={() => setVisible(false)}
      role="button"
      tabIndex={0}
      aria-label="Skip intro"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: pal.ink,
        color: pal.pale,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        cursor: 'pointer',
        fontFamily: theme.type.family,
        textAlign: 'center',
        padding: 24,
      }}
    >
      {LINES.map((line, i) => (
        <div
          key={line}
          style={{
            fontSize: theme.type.size.display,
            color: i === 1 ? pal.sirenRed : i === 2 ? pal.gold : pal.amber,
          }}
        >
          {line}
        </div>
      ))}
      <div style={{ position: 'absolute', bottom: 20, right: 20, fontSize: theme.type.size.feed, color: pal.concrete }}>
        TAP TO SKIP
      </div>
    </div>
  )
}
