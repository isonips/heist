'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { theme } from '@/design/theme'
import { ESCAPE_AT, H, HeistRun, SCALE, TICK_MS, W, type ItemKey, type Mode } from '@/game/heistRun'
import { postFeedEvent } from '@/game/feedBus'
import { exportDemoLogAsFile, getDemoLog, recordDemoRun } from '@/game/demoLog'
import { recordItemEarned } from '@/game/haulStore'
import { getUsername, recordGameResult, recordTicketWon } from '@/game/profile'
import type { EventType } from '@/design/lines'
import PixelIcon from './PixelIcon'
import ResponsiveScale from './ResponsiveScale'
import TouchControls, { type Dir as TouchDir } from './TouchControls'

const ITEM_LABEL: Record<ItemKey, string> = {
  oldMan: 'THE OLD MAN — TRAFFIC STOPS DEAD',
  pileUp: 'THE PILE-UP — A LANE IS BLOCKED',
  shortcut: 'THE SHORTCUT — FIVE SECONDS BOUGHT',
  safe: 'THE SAFE',
  haul: 'THE HAUL',
}

const REASON_LABEL: Record<'paid' | 'collared' | 'flattened' | 'timeout', string> = {
  paid: 'the crime paid',
  collared: 'caught',
  flattened: 'out of lives',
  timeout: 'ran out of road',
}

function reportResult(name: string, mode: Mode, outcome: 'collared' | 'flattened' | 'timeout', crossed: number, hands: string) {
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
  } else if (outcome === 'timeout') {
    type = 'outOfTime'
    tokens = { name }
  } else {
    type = 'outOfLives'
    tokens = { name }
  }
  postFeedEvent(type, tokens, true)
}

export default function HeistGame() {
  const [mode, setMode] = useState<'play' | 'demo' | null>(null)
  const demo = mode === 'demo'
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const runRef = useRef<HeistRun>(new HeistRun())
  const nameRef = useRef<string>(getUsername() ?? `guest${Math.floor(Math.random() * 900 + 100)}`)
  const reportedRef = useRef(false)
  const [hud, setHud] = useState(() => snapshot(runRef.current))
  const [loggedRuns, setLoggedRuns] = useState(0)
  useEffect(() => { if (demo) setLoggedRuns(getDemoLog().length) }, [demo])

  const restart = useCallback(() => {
    runRef.current = new HeistRun()
    reportedRef.current = false
    setHud(snapshot(runRef.current))
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        runRef.current.useItem()
        return
      }
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
        if (run.state.mode === 'paid') {
          const earned = [...run.usedItemsThisRun, ...(run.state.heldItem ? [run.state.heldItem] : [])]
          earned.forEach(recordItemEarned)
        }
        if (!demo) {
          recordGameResult({
            won: run.state.mode === 'paid',
            crossings: run.state.crossed,
            walletKept: run.state.mode === 'paid' && (run.state.hands === 'wallet' || run.state.hands === 'both'),
            walletPayout: run.state.walletOutcome === 'nothing' ? 0 : run.state.walletOutcome === 'refund' ? run.state.walletAmount : run.state.walletOutcome === 'double' ? run.state.walletAmount * 2 : 0,
            paintingKept: run.state.mode === 'paid' && (run.state.hands === 'painting' || run.state.hands === 'both'),
          })
          if (run.state.mode === 'paid') recordTicketWon()
        }
        if (demo) {
          const total = recordDemoRun({
            runId: run.runId,
            startedAt: new Date(run.startedAtMs).toISOString(),
            crossings: run.state.crossed,
            heartsLost: 3 - run.lives(),
            result: { mode: run.state.mode, outcome: run.state.outcome },
            ticks: run.tick,
            inputs: run.inputLog,
          })
          setLoggedRuns(total.length)
        } else {
          reportResult(nameRef.current, run.state.mode, run.state.outcome, run.state.crossed, run.state.hands)
        }
      }
    }, TICK_MS)

    return () => window.clearInterval(id)
  }, [mode, demo])

  const ended = hud.mode === 'paid' || hud.mode === 'lost'
  const canEscape = hud.crossed >= ESCAPE_AT && !ended

  const toggleSound = useCallback(() => {
    runRef.current.toggleSound()
    setHud(snapshot(runRef.current))
  }, [])

  const [touch, setTouch] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(hover: none) and (pointer: coarse)')
    const update = () => setTouch(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  if (mode === null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', padding: '24px 0' }}>
        <button onClick={() => setMode('play')} style={{ ...buttonStyle, width: 200, fontSize: theme.type.size.display, padding: '14px 0' }}>PLAY</button>
        <button onClick={() => setMode('demo')} style={{ ...buttonStyle, width: 200, fontSize: theme.type.size.display, padding: '14px 0' }}>DEMO</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <ResponsiveScale width={W * SCALE} height={H * SCALE + CONTROLS_HEIGHT}>
      {/* Controls live inside this fixed-size frame (not in normal page flow
          below it), so the panel's total height never depends on where the
          page happens to end — which is what let the fixed feed window's
          collapsed bar land on top of Escape/Sound on a short viewport. */}
      <div style={{ position: 'relative', width: W * SCALE, height: H * SCALE + CONTROLS_HEIGHT }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ position: 'absolute', top: 0, left: 0, width: W * SCALE, height: H * SCALE, imageRendering: 'pixelated', border: `2px solid ${theme.palette.ink}` }}
        />
        <Hud hud={hud} />
        {hud.effectBanner && (
          <div
            style={{
              position: 'absolute',
              top: HUD_HEIGHT,
              left: 0,
              right: 0,
              background: theme.palette.gold,
              color: theme.palette.ink,
              textAlign: 'center',
              fontFamily: theme.type.family,
              fontSize: theme.type.size.feed,
              padding: '2px 0',
              pointerEvents: 'none',
            }}
          >
            {ITEM_LABEL[hud.effectBanner]}
          </div>
        )}
        {ended && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: W * SCALE,
              height: H * SCALE,
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
            <div style={{ fontSize: theme.type.size.display, color: hud.mode === 'paid' ? theme.palette.gold : theme.palette.sirenRed }}>
              {hud.mode === 'paid' ? 'THE CRIME PAID' : "CRIME DOESN'T PAY"}
            </div>
            <div style={{ fontSize: theme.type.size.body }}>{hud.crossed} crossings — {REASON_LABEL[hud.mode === 'paid' ? 'paid' : hud.outcome]}</div>
            {hud.mode === 'paid' && hud.walletOutcome && (hud.hands === 'wallet' || hud.hands === 'both') && (
              <div style={{ fontSize: theme.type.size.feed, color: theme.palette.concrete }}>
                {hud.walletOutcome === 'nothing' && 'the wallet was empty'}
                {hud.walletOutcome === 'refund' && `the wallet had ${hud.walletAmount} points`}
                {hud.walletOutcome === 'double' && `the wallet had ${hud.walletAmount * 2} points — double`}
              </div>
            )}
            {hud.mode === 'paid' && (hud.hands === 'painting' || hud.hands === 'both') && (
              <div style={{ fontSize: theme.type.size.feed, color: theme.palette.gold }}>a painting, kept — see MY HAUL</div>
            )}
            <button onClick={restart} style={buttonStyle}>RUN AGAIN</button>
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: CONTROLS_HEIGHT,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            padding: '0 4px',
          }}
        >
          <span style={{ fontFamily: theme.type.family, fontSize: theme.type.size.body, color: theme.palette.concrete }}>
            {demo ? 'DEMO — nothing at stake' : `${hud.crossed} / ${ESCAPE_AT} crossings`}
          </span>
          {canEscape && (
            <button onClick={() => runRef.current.escapeNow()} style={buttonStyle}>ESCAPE</button>
          )}
          {hud.heldItem && !ended && (
            <button onClick={() => runRef.current.useItem()} style={{ ...buttonStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
              <PixelIcon name={hud.heldItem} scale={2} /> USE
            </button>
          )}
          <button onClick={toggleSound} style={{ ...buttonStyle, padding: '6px 10px' }} title={hud.soundOn ? 'Mute' : 'Unmute'}>
            {hud.soundOn ? 'SOUND ON' : 'SOUND OFF'}
          </button>
        </div>
      </div>
      </ResponsiveScale>
      {touch && (
        <TouchControls
          onPress={(dir: TouchDir) => runRef.current.onKey(dir)}
        />
      )}
      {demo && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontFamily: theme.type.family, fontSize: theme.type.size.feed, color: theme.palette.concrete }}>
          <span>{loggedRuns} run{loggedRuns === 1 ? '' : 's'} logged this browser</span>
          <button onClick={exportDemoLogAsFile} disabled={loggedRuns === 0} style={{ ...buttonStyle, padding: '4px 10px', fontSize: theme.type.size.feed, opacity: loggedRuns === 0 ? 0.5 : 1 }}>
            EXPORT JSON
          </button>
        </div>
      )}
    </div>
  )
}

const CONTROLS_HEIGHT = 40

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
    heldItem: run.state.heldItem,
    effectBanner: run.itemEffectBanner && run.tick < run.itemEffectBanner.untilTick ? run.itemEffectBanner.item : null,
    walletOutcome: run.state.walletOutcome,
    walletAmount: run.state.walletAmount,
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
        height: HUD_HEIGHT,
        background: pal.ink,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 6px',
        fontFamily: theme.type.family,
        fontSize: theme.type.size.body,
        color: pal.pale,
        pointerEvents: 'none',
      }}
    >
      <span style={{ display: 'flex', gap: 2 }}>
        {[0, 1, 2].map((i) => <PixelIcon key={i} name={i < hud.lives ? 'heartFull' : 'heartEmpty'} scale={2} />)}
      </span>
      <span>{hud.timeLeft}s</span>
      <span>{hud.crossed} / {ESCAPE_AT}</span>
    </div>
  )
}

const HUD_HEIGHT = 24

const buttonStyle: CSSProperties = {
  fontFamily: theme.type.family,
  background: theme.palette.amber,
  color: theme.palette.ink,
  border: `1px solid ${theme.palette.ink}`,
  boxShadow: `inset 1px 1px 0 ${theme.palette.gold}, inset -1px -1px 0 ${theme.palette.amberDp}`,
  padding: '6px 14px',
  cursor: 'pointer',
  fontSize: theme.type.size.body,
}
