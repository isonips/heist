// Blits a sprite-data.ts pixel grid (rows of single-char palette keys) onto a
// canvas at an integer scale. This is the one place a sprite's string rows
// turn into pixels — everything else just picks which rows to draw.
import { PAL } from '@/design/sprite-data'

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  rows: readonly string[],
  x: number,
  y: number,
  scale: number,
  overrides?: Record<string, string>,
): void {
  const palette = overrides ? { ...PAL, ...overrides } : PAL
  for (let ry = 0; ry < rows.length; ry++) {
    const row = rows[ry]
    let runStart = -1
    let runColour = ''
    const flush = (endX: number) => {
      if (runStart < 0) return
      ctx.fillStyle = runColour
      ctx.fillRect(x + runStart * scale, y + ry * scale, (endX - runStart) * scale, scale)
      runStart = -1
    }
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx]
      if (ch === '.') {
        flush(rx)
        continue
      }
      const colour = palette[ch] ?? ch
      if (runStart < 0) {
        runStart = rx
        runColour = colour
      } else if (colour !== runColour) {
        flush(rx)
        runStart = rx
        runColour = colour
      }
    }
    flush(row.length)
  }
}

export function spriteSize(rows: readonly string[], scale: number): { w: number; h: number } {
  return { w: (rows[0]?.length ?? 0) * scale, h: rows.length * scale }
}
