import type { CSSProperties } from 'react'
import { theme } from '@/design/theme'
import { DURATION_S, ESCAPE_AT, LIVES_MAX, REIN_FROM, REIN_LEAD_S } from '@/game/heistRun'

const pal = theme.palette
const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${pal.chrome}` }

export default function RulesTab() {
  return (
    <div style={{ fontFamily: theme.type.family, color: pal.pale, fontSize: theme.type.size.body, lineHeight: theme.type.lineHeight.read }}>
      <p>Cross traffic for {DURATION_S} seconds. {ESCAPE_AT} crossings arms the door — escape and you keep the ticket, not what you&apos;re carrying. Survive the clock with the door armed and you keep both. Short of {ESCAPE_AT}, get caught, or lose all {LIVES_MAX} hearts, and you keep nothing.</p>

      <h3 style={{ color: pal.amber, marginTop: 12, fontSize: theme.type.size.body, fontWeight: 700 }}>Wallet odds</h3>
      <p style={{ color: pal.concrete }}>Points, not real money — there is no payment system yet. Revealed only at the end of the run:</p>
      <div style={row}><span>Nothing</span><span>45%</span></div>
      <div style={row}><span>Refund</span><span>43%</span></div>
      <div style={row}><span>Double</span><span>11%</span></div>

      <h3 style={{ color: pal.amber, marginTop: 12, fontSize: theme.type.size.body, fontWeight: 700 }}>The painting</h3>
      <p style={{ color: pal.concrete }}>
        The NFT drop — genuinely rare, roughly one every 50 to 150 games
        across this browser (a real cross-player counter needs the phase-3
        backend). What it actually is stays unrevealed — MY HAUL shows it as
        a &quot;?&quot;, coming soon.
      </p>

      <h3 style={{ color: pal.amber, marginTop: 12, fontSize: theme.type.size.body, fontWeight: 700 }}>Mystery items</h3>
      <p style={{ color: pal.concrete }}>
        Appear at bus stops from crossing {6} on — one per run at most, odds
        matching their rarity. Kept only if you survive the clock, same as a
        wallet or a painting. The Old Man, The Pile-Up and The Shortcut do
        something the moment you use them; The Safe and The Haul are
        collectible now, their effects wait on the bonus system in phase 3.
        Real drops should come from a counter shared across every player, not
        your own performance — that needs the same backend as the wallet, so
        for now each run rolls independently in your browser.
      </p>

      <h3 style={{ color: pal.amber, marginTop: 12, fontSize: theme.type.size.body, fontWeight: 700 }}>Police</h3>
      <p>They trail you by a fixed head start. Lead them too far (past crossing {REIN_FROM}, by more than {REIN_LEAD_S}s) and reinforcements close the gap once, hard.</p>

      <h3 style={{ color: pal.amber, marginTop: 12, fontSize: theme.type.size.body, fontWeight: 700 }}>Calibration</h3>
      <p style={{ color: pal.concrete }}>
        Return-to-player and difficulty numbers are not final — the engine and
        its calibration harness are built (see the repo&apos;s CALIBRATION.md),
        but the density/speed table is still being tuned against real play.
        No real money moves in this build.
      </p>

      <p style={{ color: pal.concrete, marginTop: 12 }}>18+. Play responsibly.</p>
    </div>
  )
}
