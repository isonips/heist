import type { CSSProperties } from 'react'
import { theme } from '@/design/theme'
import { DURATION_S, ESCAPE_AT, LIVES_MAX, REIN_FROM, REIN_LEAD_S } from '@/game/heistRun'

const pal = theme.palette
const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${pal.chrome}` }

export default function RulesTab() {
  return (
    <div style={{ fontFamily: theme.type.family, color: pal.pale, fontSize: 12, lineHeight: 1.6 }}>
      <p>Cross traffic for {DURATION_S} seconds. {ESCAPE_AT} crossings arms the door out — or just survive the clock. Get caught, or lose all {LIVES_MAX} hearts, and you keep nothing.</p>

      <h3 style={{ color: pal.amber, marginTop: 12 }}>Wallet odds (revealed at the end of a run)</h3>
      <div style={row}><span>Nothing</span><span>45%</span></div>
      <div style={row}><span>Refund</span><span>43%</span></div>
      <div style={row}><span>Double</span><span>11%</span></div>

      <h3 style={{ color: pal.amber, marginTop: 12 }}>Mystery items</h3>
      <p>Drop from a global counter across every run — never from your own performance. One item of each kind exists per pool; skill cannot buy one.</p>

      <h3 style={{ color: pal.amber, marginTop: 12 }}>Police</h3>
      <p>They trail you by a fixed head start. Lead them too far (past crossing {REIN_FROM}, by more than {REIN_LEAD_S}s) and reinforcements close the gap once, hard.</p>

      <h3 style={{ color: pal.amber, marginTop: 12 }}>Calibration</h3>
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
