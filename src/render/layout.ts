import { COLS } from '@/engine/constants'

// Sprites (thief 20x24, car 48x20) are authored close to a 24px cell, so the
// board is drawn at native sprite resolution (scale 1) rather than one of
// theme.ts's thief.scales — those targeted a different base resolution.
export const COL_PX = 24
export const LANE_PX = 24
export const VISIBLE_ROWS = 13
export const CENTER_ROW = 6
export const CANVAS_W = COLS * COL_PX
export const CANVAS_H = VISIBLE_ROWS * LANE_PX

export function laneToScreenY(laneIndex: number, playerLane: number): number {
  const screenRow = CENTER_ROW - (laneIndex - playerLane)
  return screenRow * LANE_PX
}

export function colToScreenX(col: number): number {
  return col * COL_PX
}

export function fpToScreenX(fp: number): number {
  return (fp / 1000) * COL_PX
}
