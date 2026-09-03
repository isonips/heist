'use client'

import { useEffect, useRef } from 'react'
import { ICONS } from '@/design/sprite-data'
import { drawSprite } from '@/render/pixel'

type IconName = keyof typeof ICONS

/** An 8x8 chrome/HUD glyph from sprites.json, never an inline text/icon-font glyph. */
export default function PixelIcon({ name, scale = 2, rotate = 0 }: { name: IconName; scale?: number; rotate?: 0 | 90 | 180 | -90 }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, 8 * scale, 8 * scale)
      drawSprite(ctx, ICONS[name], 0, 0, scale)
    }
  }, [name, scale])
  return (
    <canvas
      ref={ref}
      width={8 * scale}
      height={8 * scale}
      style={{ imageRendering: 'pixelated', transform: rotate ? `rotate(${rotate}deg)` : undefined, display: 'block' }}
    />
  )
}
