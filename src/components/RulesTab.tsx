import { theme } from '@/design/theme'
import { DURATION_S, ESCAPE_AT, LIVES_MAX, WINDOW_S } from '@/game/heistRun'

const pal = theme.palette

export default function RulesTab() {
  return (
    <div style={{ fontFamily: theme.type.family, color: pal.pale, fontSize: theme.type.size.body, lineHeight: theme.type.lineHeight.read }}>
      <p>Cross traffic for {DURATION_S} seconds — there&apos;s no limit on crossings, only survival. {ESCAPE_AT} crossings opens a {WINDOW_S}-second window: escape inside it and you keep the ticket, not what you&apos;re carrying. Let it run out and you&apos;re committed — no more escape, but hold to the end of the {DURATION_S} seconds and you keep the ticket and everything you&apos;re carrying, including anything picked up after the window opened. Get caught or lose all {LIVES_MAX} hearts, before or after committing, and you keep nothing.</p>

      <h3 style={{ color: pal.amber, marginTop: 12, fontSize: theme.type.size.body, fontWeight: 700 }}>Wallet odds</h3>
      <p style={{ color: pal.concrete }}>
        Points, not real money — there is no payment system yet. A wallet
        pays out nothing, your stake back, or double — about 54% of runs
        come out ahead. Revealed only at the end of the run.
      </p>

      <h3 style={{ color: pal.amber, marginTop: 12, fontSize: theme.type.size.body, fontWeight: 700 }}>The painting</h3>
      <p style={{ color: pal.concrete }}>
        The NFT drop — genuinely rare (a real cross-player counter needs the
        phase-3 backend). What it actually is stays unrevealed for now.
      </p>

      <h3 style={{ color: pal.amber, marginTop: 12, fontSize: theme.type.size.body, fontWeight: 700 }}>Police</h3>
      <p>They trail you the whole run. Push your lead too far and they call in backup — once, hard.</p>

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
