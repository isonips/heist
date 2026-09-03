'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Scales a fixed-size composite (the canvas + its pixel-perfect DOM overlays)
 * down to fit a narrower viewport, via CSS transform rather than resizing
 * every overlay — everything inside keeps its native pixel-art coordinates,
 * so HUD/canvas/controls never drift out of alignment with each other.
 * Never scales up past 1x.
 */
export default function ResponsiveScale({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const el = outerRef.current
    if (!el) return
    const update = () => {
      const available = el.parentElement?.clientWidth ?? width
      setScale(Math.min(1, available / width))
    }
    update()
    const ro = new ResizeObserver(update)
    if (el.parentElement) ro.observe(el.parentElement)
    return () => ro.disconnect()
  }, [width])

  return (
    <div ref={outerRef} style={{ width: width * scale, height: height * scale, overflow: 'hidden' }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  )
}
