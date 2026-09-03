import { DURATION_TICKS, GOAL, LIVES, TPS } from '@/engine/constants'
import type { State } from '@/engine/types'
import { theme } from '@/design/theme'
import { ICONS } from '@/design/sprite-data'
import { drawSprite } from './pixel'
import { CANVAS_W } from './layout'

const pal = theme.palette

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, colour: string, size = 16) {
  ctx.font = `${size}px "Silkscreen", monospace`
  ctx.fillStyle = colour
  ctx.textBaseline = 'top'
  ctx.fillText(s, x, y)
}

const HUD_HEIGHT = 22

export function renderHud(ctx: CanvasRenderingContext2D, state: State, reinforcementBanner: boolean): void {
  // Opaque backing bar so traffic passing underneath never blends with the
  // hearts/counter/timer — HUD must read "in the corner of the eye".
  ctx.fillStyle = pal.ink
  ctx.fillRect(0, 0, CANVAS_W, HUD_HEIGHT)

  // Hearts, top-left.
  for (let i = 0; i < LIVES; i++) {
    const rows = i < state.hearts ? ICONS.heartFull : ICONS.heartEmpty
    drawSprite(ctx, rows, 6 + i * 18, 6, 2)
  }

  // Crossing counter, top-right: "N / 10".
  const crossingLabel = `${state.crossings} / ${GOAL}`
  text(ctx, crossingLabel, CANVAS_W - 8 - crossingLabel.length * 10, 6, pal.pale)

  // Timer, top-centre.
  const secsLeft = Math.max(0, Math.ceil((DURATION_TICKS - state.tick) / TPS))
  const timerLabel = `${secsLeft}s`
  text(ctx, timerLabel, CANVAS_W / 2 - timerLabel.length * 5, 6, pal.pale)

  if (state.crossings >= GOAL && !state.ended) {
    text(ctx, 'ESCAPE READY', 6, 26, pal.gold, 8)
  }

  if (reinforcementBanner) {
    ctx.fillStyle = pal.sirenRed
    ctx.fillRect(0, 24, CANVAS_W, 3)
  }
}
