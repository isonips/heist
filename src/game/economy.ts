// Central economy config — see DECISIONS.md P3/P5/P7. Every write that
// touches money (the ledger, a game's cost) reads from here, never a
// literal, so there's exactly one place to change.
//
// PLAY_PRICE_USDG is 0 until HeistPlay is deployed and wired in (P7) —
// the plumbing (ledger writes, the 'play' reason, the pot contribution
// RPC) is real today, the amount just isn't yet.
//
// The percentages are the target allocation of the entry price, final
// (P3, corrected — see CALIBRATION.md's P3 section): 45% in-game
// retribution / 45% lucky draw / 10% treasury. This is NOT a promise
// that the retribution line pays out in full every game, or even in
// expectation — the wallet is only banked roughly one game in nine, so
// most of it never leaves the till on any given run; the leftover funds
// incentives rather than sitting idle. The wallet payout table itself
// (nothing/refund/double, 45/43/12%, in heistRun.ts) is unrelated to
// this split and does not change to try to make it "close" — it never
// needed to.
export const PLAY_PRICE_USDG = 0
export const LOOT_BUDGET_PCT = 0.45
export const POT_PCT = 0.45
export const TREASURY_PCT = 0.1

export const BONUS_MAX_PCT = 100
export const BONUS_WIN_PCT = 10
export const BONUS_DECAY_PCT_PER_DAY = 20

// Codes (P4): "un code débloque un compte à vie et le démarre à 50% de
// bonus" — true immediately, for every code source (manual, ten_wins,
// referral alike; see /api/codes/redeem). WINS_TO_ISSUE_CODE is the
// win count that earns a player their own code to give out.
// REFERRAL_VOLUME_USDG is a *separate* mechanism: once a referred
// address's own play volume crosses it, their referrer earns a new code
// to distribute — it is not a condition on the referred address's own
// unlock. Both are real thresholds today even though volume is always 0
// while PLAY_PRICE_USDG is — same "plumbing now, amount later" as
// everything else this round.
export const BONUS_START_WITH_CODE_PCT = 50
export const WINS_TO_ISSUE_CODE = 10
export const REFERRAL_VOLUME_USDG = 500
