// The play scene: lanes, traffic, police, the thief, obstacles and loot, all
// read from one State snapshot. Nothing here decides game rules — it only
// draws what the engine already computed (isColumnBlocked / traffic screen
// positions are the same source of truth the engine uses for collision).
import { COLS } from '@/engine/constants'
import { trafficCarScreenPositions } from '@/engine/laneGeometry'
import type { Lane, State } from '@/engine/types'
import { theme } from '@/design/theme'
import { COPS, COP_W, ENV, HANDS, HELD, POSES, VEHICLES } from '@/design/sprite-data'
import { drawSprite } from './pixel'
import { CANVAS_H, CANVAS_W, CENTER_ROW, COL_PX, LANE_PX, VISIBLE_ROWS, colToScreenX, fpToScreenX, laneToScreenY } from './layout'

const pal = theme.palette

function surfaceColour(kind: Lane['kind']): string {
  if (kind === 'road') return pal.road
  if (kind === 'verge') return pal.verge
  return pal.concrete // 'start' — the opening pavement
}

function drawBand(ctx: CanvasRenderingContext2D, y: number, kind: Lane['kind']) {
  ctx.fillStyle = surfaceColour(kind)
  ctx.fillRect(0, y, CANVAS_W, LANE_PX)
  if (kind === 'road') {
    // light gravel speck texture, indexed on the band's own y so it never
    // crawls when the camera moves — a cheap stand-in for asphalt()'s lattice.
    ctx.fillStyle = pal.chrome
    for (let x = 4; x < CANVAS_W; x += 16) ctx.fillRect(x, y + 6, 2, 2)
    for (let x = 12; x < CANVAS_W; x += 20) ctx.fillRect(x, y + 16, 2, 2)
  }
}

function drawBoundary(ctx: CanvasRenderingContext2D, y: number, above: Lane['kind'], below: Lane['kind']) {
  if (above === 'road' && below === 'road') {
    ctx.strokeStyle = pal.concrete
    ctx.lineWidth = 2
    ctx.setLineDash([6, 6])
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(CANVAS_W, y)
    ctx.stroke()
    ctx.setLineDash([])
  } else if (above === 'road' || below === 'road') {
    ctx.strokeStyle = pal.pale
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(CANVAS_W, y)
    ctx.stroke()
  }
}

function groundShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, bandBottom: number) {
  ctx.fillStyle = pal.ink
  ctx.fillRect(x + 1, bandBottom - 3, Math.max(1, w - 2), 2)
}

function obstacleSprite(col: number) {
  const kind = col % 3
  if (kind === 0) return ENV.tree
  if (kind === 1) return ENV.bin
  return ENV.bollard
}

export function renderScene(ctx: CanvasRenderingContext2D, state: State, tick: number): void {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  const playerLane = state.player.lane

  const firstLane = playerLane + CENTER_ROW
  // Two passes, as the brief requires: every band first, then every object,
  // so nothing on a lower band ever paints over a car above it.
  for (let row = 0; row <= VISIBLE_ROWS; row++) {
    const laneIndex = firstLane - row
    const lane = state.map.lanes[laneIndex]
    const y = laneToScreenY(laneIndex, playerLane)
    if (y < -LANE_PX || y > CANVAS_H) continue
    drawBand(ctx, y, lane ? lane.kind : 'verge')
    const nextLane = state.map.lanes[laneIndex + 1]
    if (lane) drawBoundary(ctx, y, nextLane ? nextLane.kind : lane.kind, lane.kind)
  }

  for (let row = 0; row <= VISIBLE_ROWS; row++) {
    const laneIndex = firstLane - row
    const lane = state.map.lanes[laneIndex]
    if (!lane) continue
    const y = laneToScreenY(laneIndex, playerLane)
    if (y < -LANE_PX || y > CANVAS_H) continue
    const bandBottom = y + LANE_PX

    if (lane.kind === 'road' && lane.traffic) {
      const positions = trafficCarScreenPositions(lane, tick)
      const sprite = VEHICLES.car
      for (const posFP of positions) {
        const cx = fpToScreenX(posFP)
        const drawX = Math.round(cx - sprite.w / 2)
        const drawY = bandBottom - sprite.h - 2
        groundShadow(ctx, drawX, y, sprite.w, bandBottom)
        drawSprite(ctx, sprite.rows, drawX, drawY, 1)
      }
    }

    if (lane.kind === 'verge' && lane.obstacles) {
      for (let c = 0; c < COLS; c++) {
        if (!lane.obstacles[c]) continue
        const sprite = obstacleSprite(c)
        const cx = colToScreenX(c) + COL_PX / 2
        const drawX = Math.round(cx - sprite.w / 2)
        const drawY = bandBottom - sprite.h
        groundShadow(ctx, drawX, y, sprite.w, bandBottom)
        drawSprite(ctx, sprite.rows, drawX, drawY, 1)
      }
    }

    if (lane.busStop) {
      const shelterX = Math.round(CANVAS_W / 2 - ENV.busStop.w / 2)
      drawSprite(ctx, ENV.busStop.rows, shelterX, bandBottom - ENV.busStop.h, 1)
      drawSprite(ctx, ENV.bystander.rows, shelterX + ENV.busStop.w + 4, bandBottom - ENV.bystander.h, 1)

      const alreadyPassed = laneIndex <= state.player.lane
      if (!alreadyPassed && lane.lootCol != null) {
        const iconRows = lane.walletOutcome ? HELD.wallet : lane.hasPainting ? HELD.painting : null
        if (iconRows) {
          const lx = colToScreenX(lane.lootCol) + COL_PX / 2 - 6
          drawSprite(ctx, iconRows.filter((r) => r.trim() !== '.'.repeat(20)), lx, bandBottom - 14, 1)
        }
      }
    }

    // The police, on foot, in the lane they've reached.
    if (laneIndex === state.policeLane && state.tick >= state.cfg.grace) {
      const cel = COPS[Math.floor(tick / 6) % COPS.length]
      const baseX = colToScreenX(state.player.col) - COP_W - 4
      drawSprite(ctx, cel, Math.round(baseX), bandBottom - cel.length, 1)
      drawSprite(ctx, COPS[(Math.floor(tick / 6) + 1) % COPS.length], Math.round(baseX + COP_W + 4), bandBottom - cel.length, 1)
    }

    // The thief.
    if (laneIndex === state.player.lane) {
      const pose = state.ended && state.result?.reason === 'caught' ? POSES.caught : !state.wasClear ? POSES.hit : POSES.stand
      const held = state.hasWallet && state.hasPainting ? HANDS.both : state.hasPainting ? HANDS.painting : state.hasWallet ? HANDS.wallet : HANDS.ticket
      const cx = colToScreenX(state.player.col) + COL_PX / 2
      const drawX = Math.round(cx - 10)
      const drawY = bandBottom - 24
      groundShadow(ctx, drawX, y, 20, bandBottom)
      drawSprite(ctx, pose, drawX, drawY, 1)
      for (const item of held) drawSprite(ctx, HELD[item as keyof typeof HELD], drawX, drawY, 1)
    }
  }
}
