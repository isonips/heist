'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { theme } from '@/design/theme'
import { ESCAPE_AT, H, HeistRun, SCALE, TICK_MS, W, type Mode } from '@/game/heistRun'
import { postFeedEvent } from '@/game/feedBus'
import type { EventType } from '@/design/lines'
import { ICONS } from '@/design/sprite-data'
import { drawSprite } from '@/render/pixel'

type Props = { demo?: boolean }

const REASON_LABEL: Record<'paid' | 'collared' | 'flattened', string> = {
  paid: 'the crime paid',
  collared: 'caught',
  flattened: 'out of lives',
}

function reportResult(name: string, mode: Mode, outcome: 'collared' | 'flattened', crossed: number, hands: string) {
  let type: EventType
  let tokens: Record<string, string | number>
  if (mode === 'paid') {
    if (hands === 'painting' || hands === 'both') {
      type = 'keptRareItem'
      tokens = { name, item: 'a painting' }
    } else {
      type = 'cleanGetaway'
      tokens = { name, crossings: crossed }
    }
  } else if (outcome === 'collared') {
    type = 'caught'
    tokens = { name, crossings: crossed, lane: crossed }
  } else {
    type = 'outOfLives'
    tokens = { name }
  }
  postFeedEvent(type, tokens, true)
}

export default function HeistGame({ demo = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const runRef = useRef<HeistRun>(new HeistRun())
  const nameRef = useRef<string>(`guest${Math.floor(Math.random() * 900 + 100)}`)
  const reportedRef = useRef(false)
  const [hud, setHud] = useState(() => snapshot(runRef.current))

  const restart = useCallback(() => {
    runRef.current = new HeistRun()
    reportedRef.current = false
    setHud(snapshot(runRef.current))
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
      e.preventDefault()
      runRef.current.onKey(e.key)
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
      const run = runRef.current
      if (run.live()) run.advance()
      run.draw(ctx)
      setHud(snapshot(run))
      if (!run.live() && !reportedRef.current) {
        reportedRef.current = true
        if (!demo) reportResult(nameRef.current, run.state.mode, run.state.outcome, run.state.crossed, run.state.hands)
      }
    }, TICK_MS)

    return () => window.clearInterval(id)
  }, [demo])

  const ended = hud.mode === 'paid' || hud.mode === 'lost'
  const canEscape = hud.crossed >= ESCAPE_AT && !ended

  const toggleSound = useCallback(() => {
    runRef.current.toggleSound()
    setHud(snapshot(runRef.current))
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative', width: W * SCALE, height: H * SCALE }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ width: W * SCALE, height: H * SCALE, imageRendering: 'pixelated', border: `2px solid ${theme.palette.ink}` }}
        />
        <Hud hud={hud} />
        {ended && (
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
            <div style={{ fontSize: 20, color: hud.mode === 'paid' ? theme.palette.gold : theme.palette.sirenRed }}>
              {hud.mode === 'paid' ? 'THE CRIME PAID' : "CRIME DOESN'T PAY"}
            </div>
            <div>{hud.crossed} crossings — {REASON_LABEL[hud.mode === 'paid' ? 'paid' : hud.outcome]}</div>
            <button onClick={restart} style={buttonStyle}>RUN AGAIN</button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontFamily: theme.type.family, fontSize: 12, color: theme.palette.concrete }}>
          {demo ? 'DEMO — nothing at stake' : `${hud.crossed} / ${ESCAPE_AT} crossings`}
        </span>
        {canEscape && (
          <button onClick={() => runRef.current.escapeNow()} style={buttonStyle}>ESCAPE</button>
        )}
        <button onClick={toggleSound} style={{ ...buttonStyle, padding: '6px 10px' }} title={hud.soundOn ? 'Mute' : 'Unmute'}>
          {hud.soundOn ? 'SOUND ON' : 'SOUND OFF'}
        </button>
      </div>
    </div>
  )
}

type HudSnapshot = ReturnType<typeof snapshot>
function snapshot(run: HeistRun) {
  return {
    lives: run.lives(),
    crossed: run.state.crossed,
    timeLeft: run.state.timeLeft,
    mode: run.state.mode,
    outcome: run.state.outcome,
    hands: run.state.hands,
    alertMsg: run.alertMsg,
    soundOn: run.soundOn,
  }
}

function Hud({ hud }: { hud: HudSnapshot }) {
  const pal = theme.palette
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 20,
        background: pal.ink,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 6px',
        fontFamily: theme.type.family,
        fontSize: 11,
        color: pal.pale,
        pointerEvents: 'none',
      }}
    >
      <span style={{ display: 'flex', gap: 2 }}>
        {[0, 1, 2].map((i) => <Heart key={i} full={i < hud.lives} />)}
      </span>
      <span>{hud.timeLeft}s</span>
      <span>{hud.crossed} / {ESCAPE_AT}</span>
    </div>
  )
}

function Heart({ full }: { full: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, 16, 16)
      drawSprite(ctx, full ? ICONS.heartFull : ICONS.heartEmpty, 0, 0, 2)
    }
  }, [full])
  return <canvas ref={ref} width={16} height={16} style={{ imageRendering: 'pixelated' }} />
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
