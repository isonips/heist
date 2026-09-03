'use client'

import type { CSSProperties } from 'react'
import { theme } from '@/design/theme'
import PixelIcon from './PixelIcon'

export type Dir = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'

// 44px minimum hit target (design brief section 13), a hand-drawn chevron
// sprite per direction — never a text glyph or webfont arrow.
const ROTATE: Record<Dir, 0 | 90 | 180 | -90> = {
  ArrowUp: 180,
  ArrowDown: 0,
  ArrowLeft: 90,
  ArrowRight: -90,
}

export default function TouchControls({ onPress }: { onPress: (dir: Dir) => void }) {
  const pal = theme.palette
  const press = (dir: Dir) => (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    onPress(dir)
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 48px)',
        gridTemplateRows: 'repeat(2, 48px)',
        gap: 6,
        justifyContent: 'center',
        padding: '10px 0',
      }}
    >
      <Pad dir="ArrowLeft" onPress={press} style={{ gridColumn: 1, gridRow: 1 }} />
      <Pad dir="ArrowUp" onPress={press} style={{ gridColumn: 2, gridRow: 1 }} />
      <Pad dir="ArrowRight" onPress={press} style={{ gridColumn: 3, gridRow: 1 }} />
      <Pad dir="ArrowDown" onPress={press} style={{ gridColumn: 2, gridRow: 2 }} />
    </div>
  )

  function Pad({ dir, onPress: onp, style }: { dir: Dir; onPress: (d: Dir) => (e: React.TouchEvent | React.MouseEvent) => void; style: CSSProperties }) {
    return (
      <button
        onTouchStart={onp(dir)}
        onMouseDown={onp(dir)}
        style={{
          ...style,
          width: 48,
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: pal.chrome,
          border: `1px solid ${pal.ink}`,
          boxShadow: `inset 1px 1px 0 ${pal.steelLt}, inset -1px -1px 0 ${pal.ink}`,
          touchAction: 'manipulation',
        }}
        aria-label={dir}
      >
        <PixelIcon name="chevron" scale={3} rotate={ROTATE[dir]} />
      </button>
    )
  }
}
