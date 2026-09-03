'use client'

import type { ReactNode } from 'react'
import { theme } from '@/design/theme'

export type TabId = 'play' | 'demo' | 'rules' | 'haul'

const TABS: { id: TabId; label: string }[] = [
  { id: 'play', label: 'PLAY' },
  { id: 'demo', label: 'DEMO' },
  { id: 'rules', label: 'RULES' },
  { id: 'haul', label: 'MY HAUL' },
]

const pal = theme.palette

export default function WindowChrome({
  active,
  onChange,
  children,
}: {
  active: TabId
  onChange: (t: TabId) => void
  children: ReactNode
}) {
  return (
    <div
      style={{
        maxWidth: 720,
        width: '96vw',
        margin: '32px auto',
        border: `3px solid ${pal.white}`,
        boxShadow: `0 0 0 2px ${pal.ink}, inset 0 0 0 1px ${pal.steel}`,
        background: pal.shade,
      }}
    >
      <div
        style={{
          height: theme.chrome.titleBarHeight,
          background: pal.steel,
          color: pal.white,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
          borderBottom: `2px solid ${pal.ink}`,
          fontSize: 14,
        }}
      >
        <span>HEIST.exe</span>
        <span style={{ display: 'flex', gap: 4 }}>
          <ChromeButton label="_" />
          <ChromeButton label="X" />
        </span>
      </div>

      <div style={{ display: 'flex', height: theme.chrome.tabHeight, borderBottom: `2px solid ${pal.ink}` }}>
        {TABS.map((t) => {
          const isActive = t.id === active
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              style={{
                flex: 1,
                background: isActive ? pal.shade : pal.chrome,
                color: isActive ? pal.amber : pal.concrete,
                border: 'none',
                borderRight: `1px solid ${pal.ink}`,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div style={{ padding: theme.chrome.panelPadding / 2 }}>{children}</div>
    </div>
  )
}

function ChromeButton({ label }: { label: string }) {
  return (
    <span
      style={{
        width: 18,
        height: 18,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: pal.chrome,
        boxShadow: `inset 1px 1px 0 ${pal.steelLt}, inset -1px -1px 0 ${pal.ink}`,
        fontSize: 10,
      }}
    >
      {label}
    </span>
  )
}
