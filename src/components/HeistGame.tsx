'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { theme } from '@/design/theme'
import { ESCAPE_AT, H, HeistRun, SCALE, TICK_MS, W, type ItemKey, type Mode } from '@/game/heistRun'
import { buildRun } from '@/game/buildRun'
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

// Level -1/0..4 skin for the police-distance banner (relief, far, mid, near,
// critical/reinforcement) — colours lifted straight from the palette, same
// mapping the original prototype used.
const ALERT_SKIN = [
  { bg: theme.palette.verge, fg: theme.palette.white, right: 'KEEP GOING' },
  { bg: theme.palette.amberDp, fg: theme.palette.gold, right: 'KEEP CROSSING' },
  { bg: theme.palette.amberDk, fg: theme.palette.ink, right: 'KEEP CROSSING' },
  { bg: theme.palette.sirenRed, fg: theme.palette.white, right: 'KEEP CROSSING' },
  { bg: theme.palette.sirenRed, fg: theme.palette.ink, right: 'RUN' },
]

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
  // True once runRef holds a run actually built for the current mode (its
  // painting/item rolls resolved — see buildRun.ts/P2) — false during that
  // one async gap right after picking PLAY/DEMO or hitting RUN AGAIN. Starts
  // true because nothing needs loading before a mode is even chosen.
  const [ready, setReady] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const runRef = useRef<HeistRun>(new HeistRun())
  const nameRef = useRef<string>(getUsername() ?? `guest${Math.floor(Math.random() * 900 + 100)}`)
  const reportedRef = useRef(false)
  const [hud, setHud] = useState(() => snapshot(runRef.current))
  const [loggedRuns, setLoggedRuns] = useState(0)
  useEffect(() => { if (demo) setLoggedRuns(getDemoLog().length) }, [demo])

  const startMode = useCallback(async (m: 'play' | 'demo') => {
    setMode(m)
    setReady(false)
    const run = await buildRun(m === 'demo')
    runRef.current = run
    reportedRef.current = false
    setHud(snapshot(run))
    setReady(true)
  }, [])

  const restart = useCallback(async () => {
    setReady(false)
    const run = await buildRun(demo)
    runRef.current = run
    reportedRef.current = false
    setHud(snapshot(run))
    setReady(true)
  }, [demo])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        runRef.current.useItem()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (!e.repeat) runRef.current.setSprinting(true)
        return
      }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
      e.preventDefault()
      runRef.current.onKey(e.key)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Enter') runRef.current.setSprinting(false)
    }
    // Releases a stuck sprint if the tab loses focus mid-hold (alt-tab,
    // switching windows) — otherwise a keyup that never arrives would pin
    // sprint on for the rest of the run.
    const onBlur = () => runRef.current.setSprinting(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useEffect(() => {
    if (!ready) return // runRef may still be the pre-buildRun() placeholder — nothing to tick yet
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    const id = window.setInterval(() => {
      const run = runRef.current
      // Always tick, even once caught — collide()/law()/etc self-gate on
      // live() internally, but the caught->lost transition (1.6s after the
      // arrest) only fires inside advance(). Gating the call itself here
      // froze the run on the flashing red "caught" frame forever.
      run.advance()
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
            seed: run.seed,
            startedAt: new Date(run.startedAtMs).toISOString(),
            crossings: run.state.crossed,
            heartsLost: 3 - run.lives(),
            lootAvailable: Object.keys(run.lootPlan).length > 0,
            lootPickedUp: run.pickedUpLootEver,
            lootKept: run.state.mode === 'paid' && run.state.hands !== 'ticket',
            result: { mode: run.state.mode, outcome: run.state.outcome },
            ticks: run.tick,
            inputs: run.inputLog,
            actions: run.actionLog,
          })
          setLoggedRuns(total.length)
        } else {
          reportResult(nameRef.current, run.state.mode, run.state.outcome, run.state.crossed, run.state.hands)
        }
      }
    }, TICK_MS)

    return () => window.clearInterval(id)
  }, [mode, demo, ready])

  const ended = hud.mode === 'paid' || hud.mode === 'lost'
  const windowOpen = hud.mode === 'armed'
  const committed = hud.mode === 'committed'
  const carrying = hud.hands !== 'ticket' || hud.heldItem !== null

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
        <button onClick={() => void startMode('play')} style={{ ...buttonStyle, width: 200, fontSize: theme.type.size.display, padding: '14px 0' }}>PLAY</button>
        <button onClick={() => void startMode('demo')} style={{ ...buttonStyle, width: 200, fontSize: theme.type.size.display, padding: '14px 0' }}>DEMO</button>
      </div>
    )
  }

  if (!ready) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0', fontFamily: theme.type.family, fontSize: theme.type.size.body, color: theme.palette.concrete }}>
        SHUFFLING THE DECK…
      </div>
    )
  }

  const showBanner = hud.mode === 'caught' || (hud.live && hud.started)
  const skin = ALERT_SKIN[Math.max(0, hud.alertLevel)] ?? ALERT_SKIN[1]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {windowOpen ? (
        <div
          style={{
            width: W * SCALE,
            maxWidth: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            background: hud.tick % 2 === 0 ? theme.palette.sirenRed : theme.palette.amberDp,
            color: theme.palette.white,
            border: `2px solid ${theme.palette.ink}`,
            padding: '4px 8px',
            marginBottom: 4,
            fontFamily: theme.type.family,
            fontSize: theme.type.size.feed,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PixelIcon name="siren" scale={2} />
            {hud.windowLeft}s — ESCAPE NOW · ticket
          </span>
          <span>HOLD · ticket + loot</span>
        </div>
      ) : committed ? (
        <div
          style={{
            width: W * SCALE,
            maxWidth: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            background: theme.palette.amberDk,
            color: theme.palette.ink,
            border: `2px solid ${theme.palette.ink}`,
            padding: '4px 8px',
            marginBottom: 4,
            fontFamily: theme.type.family,
            fontSize: theme.type.size.feed,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PixelIcon name="siren" scale={2} />
            NO WAY OUT — COMMITTED
          </span>
          <span>HOLD FOR TICKET + LOOT</span>
        </div>
      ) : showBanner ? (
        <div
          style={{
            width: W * SCALE,
            maxWidth: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            background: hud.mode === 'caught' ? theme.palette.sirenRed : skin.bg,
            color: hud.mode === 'caught' ? theme.palette.white : skin.fg,
            border: `2px solid ${theme.palette.ink}`,
            padding: '4px 8px',
            marginBottom: 4,
            fontFamily: theme.type.family,
            fontSize: theme.type.size.feed,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PixelIcon name={hud.mode !== 'caught' && hud.alertLevel === 0 ? 'escape' : 'siren'} scale={2} />
            {hud.mode === 'caught' ? 'THEY HAVE YOU' : hud.alertMsg ?? 'YOU CAN HEAR THE SIRENS'}
          </span>
          <span>{hud.mode === 'caught' ? 'NO ROAD LEFT' : skin.right}</span>
        </div>
      ) : null}
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
        {hud.mode === 'caught' && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              padding: 10,
              background: theme.palette.amberDp,
              borderTop: `2px solid ${theme.palette.amber}`,
              textAlign: 'center',
              fontFamily: theme.type.family,
              fontSize: theme.type.size.body,
              color: theme.palette.white,
              pointerEvents: 'none',
            }}
          >
            AH SHIT, HERE WE GO AGAIN
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
          {windowOpen && (
            <button onClick={() => runRef.current.escapeNow()} style={buttonStyle}>
              ESCAPE NOW · TICKET
            </button>
          )}
          {windowOpen && carrying && (
            <span style={{ fontFamily: theme.type.family, fontSize: theme.type.size.feed, color: theme.palette.gold }}>
              hold for ticket + loot
            </span>
          )}
          {committed && (
            <span style={{ fontFamily: theme.type.family, fontSize: theme.type.size.feed, color: theme.palette.sirenRed }}>
              no way out — hold to the end
            </span>
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
          onSprintChange={(held: boolean) => runRef.current.setSprinting(held)}
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
    tick: run.tick,
    lives: run.lives(),
    crossed: run.state.crossed,
    timeLeft: run.state.timeLeft,
    windowLeft: run.state.windowLeft,
    staminaPct: run.state.staminaPct,
    winded: run.state.winded,
    mode: run.state.mode,
    outcome: run.state.outcome,
    hands: run.state.hands,
    alertMsg: run.alertMsg,
    alertLevel: run.alertLevel,
    live: run.live(),
    started: run.started,
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
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 3,
        padding: '3px 6px',
        fontFamily: theme.type.family,
        fontSize: theme.type.size.body,
        color: pal.pale,
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', gap: 2 }}>
          {[0, 1, 2].map((i) => <PixelIcon key={i} name={i < hud.lives ? 'heartFull' : 'heartEmpty'} scale={2} />)}
        </span>
        <span>{hud.timeLeft}s</span>
        <span>{hud.crossed} / {ESCAPE_AT}</span>
      </div>
      {hud.started && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <PixelIcon name="running" scale={2} />
          <div style={{ flex: 1, height: 4, background: pal.chrome, border: `1px solid ${pal.ink}` }}>
            <div
              style={{
                width: `${Math.round(hud.staminaPct * 100)}%`,
                height: '100%',
                background: hud.winded ? pal.sirenRed : pal.amber,
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

const HUD_HEIGHT = 34

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
