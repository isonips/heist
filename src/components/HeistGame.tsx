'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { GOAL, TPS } from '@/engine/constants'
import { escape, initState, step } from '@/engine/simulate'
import { DIR_DOWN, DIR_LEFT, DIR_RIGHT, DIR_UP, type Dir, type Result, type State } from '@/engine/types'
import { DEFAULT_CONFIG } from '@/game/config'
import { renderScene } from '@/render/scene'
import { renderHud } from '@/render/hud'
import { CANVAS_H, CANVAS_W } from '@/render/layout'
import { theme } from '@/design/theme'
import { postFeedEvent } from '@/game/feedBus'
import type { EventType } from '@/design/lines'

const KEY_TO_DIR: Record<string, Dir> = {
  ArrowUp: DIR_UP,
  ArrowDown: DIR_DOWN,
  ArrowLeft: DIR_LEFT,
  ArrowRight: DIR_RIGHT,
}

const REASON_LABEL: Record<Result['reason'], string> = {
  escaped: 'escaped clean',
  survived: 'made it to the clock',
  outOfTime: 'ran out of road',
  outOfLives: 'out of lives',
  caught: 'caught',
}

function newSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
}

function reportResult(name: string, r: Result) {
  const walletAmount = r.walletOpened === 1 ? 'nothing' : r.walletOpened === 2 ? 'a refund' : r.walletOpened === 3 ? 'double' : ''
  let type: EventType
  let tokens: Record<string, string | number>
  if (r.reason === 'escaped') {
    type = 'cleanGetaway'
    tokens = { name, crossings: r.crossings }
  } else if (r.reason === 'survived' && r.paintingKept) {
    type = 'keptRareItem'
    tokens = { name, item: 'a painting' }
  } else if (r.reason === 'survived' && r.walletOpened > 0) {
    type = 'walletOpened'
    tokens = { name, amount: walletAmount }
  } else if (r.reason === 'survived') {
    type = 'cleanGetaway'
    tokens = { name, crossings: r.crossings }
  } else if (r.reason === 'caught') {
    type = 'caught'
    tokens = { name, crossings: r.crossings, lane: r.lanesReached }
  } else if (r.reason === 'outOfLives') {
    type = 'outOfLives'
    tokens = { name }
  } else {
    type = 'outOfTime'
    tokens = { name }
  }
  postFeedEvent(type, tokens, true)
}

type Props = { demo?: boolean }

export default function HeistGame({ demo = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef = useRef<State>(initState(newSeed(), DEFAULT_CONFIG))
  const pendingDir = useRef<Dir | undefined>(undefined)
  const [result, setResult] = useState<Result | null>(null)
  const [crossings, setCrossings] = useState(0)
  const [canEscape, setCanEscape] = useState(false)
  const nameRef = useRef<string>(`guest${Math.floor(Math.random() * 900 + 100)}`)

  const restart = useCallback(() => {
    stateRef.current = initState(newSeed(), DEFAULT_CONFIG)
    pendingDir.current = undefined
    setResult(null)
    setCrossings(0)
    setCanEscape(false)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      const dir = KEY_TO_DIR[e.key]
      if (dir) {
        pendingDir.current = dir
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    const id = window.setInterval(() => {
      let state = stateRef.current
      if (!state.ended) {
        const dir = pendingDir.current
        pendingDir.current = undefined
        state = step(state, dir)
        stateRef.current = state
        setCrossings(state.crossings)
        setCanEscape(state.crossings >= GOAL && !state.ended)
        if (state.ended && state.result) {
          setResult(state.result)
          if (!demo) reportResult(nameRef.current, state.result)
        }
      }
      const banner = state.reinforcementFired && state.tick < state.reinforcementBannerUntil
      renderScene(ctx, state, state.tick)
      renderHud(ctx, state, banner)
    }, 1000 / TPS)

    return () => window.clearInterval(id)
  }, [demo])

  const doEscape = useCallback(() => {
    const s = escape(stateRef.current)
    stateRef.current = s
    if (s.result) {
      setResult(s.result)
      if (!demo) reportResult(nameRef.current, s.result)
    }
  }, [demo])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative', width: CANVAS_W, height: CANVAS_H }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ width: CANVAS_W, height: CANVAS_H, imageRendering: 'pixelated', border: `2px solid ${theme.palette.ink}` }}
        />
        {result && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(5,6,10,0.88)',
              color: theme.palette.pale,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontFamily: theme.type.family,
              textAlign: 'center',
              padding: 12,
            }}
          >
            <div style={{ fontSize: 20, color: result.win ? theme.palette.gold : theme.palette.sirenRed }}>
              {result.win ? 'THE CRIME PAID' : 'CRIME DOES NOT PAY'}
            </div>
            <div>{result.crossings} crossings — {REASON_LABEL[result.reason]}</div>
            {result.win && (
              <div style={{ fontSize: 12, color: theme.palette.concrete }}>
                {result.escaped ? 'Ticket kept, loot left behind.' : `Ticket kept. Wallet: ${result.walletOpened > 0 ? 'opened' : 'none'}${result.paintingKept ? ', painting kept' : ''}.`}
              </div>
            )}
            <button onClick={restart} style={buttonStyle}>RUN AGAIN</button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontFamily: theme.type.family, fontSize: 12, color: theme.palette.concrete }}>
          {demo ? 'DEMO — nothing at stake' : `${crossings} / ${GOAL} crossings`}
        </span>
        {canEscape && !result && (
          <button onClick={doEscape} style={buttonStyle}>ESCAPE</button>
        )}
      </div>
    </div>
  )
}

const buttonStyle: CSSProperties = {
  fontFamily: theme.type.family,
  background: theme.palette.amber,
  color: theme.palette.ink,
  border: `1px solid ${theme.palette.ink}`,
  boxShadow: `inset 1px 1px 0 ${theme.palette.gold}, inset -1px -1px 0 ${theme.palette.amberDp}`,
  padding: '6px 14px',
  cursor: 'pointer',
  fontSize: 12,
}
