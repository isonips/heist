// Central economy config — see DECISIONS.md P3/P5/P7. Every write that
// touches money (the ledger, a game's cost) reads from here, never a
// literal, so there's exactly one place to change when the P3 calibration
// question gets resolved.
//
// PLAY_PRICE_USDG is 0 until the Vault contract is live and wired in
// (P7) — the plumbing (ledger writes, the 'play' reason) is real today,
// the amount just isn't yet. The percentages document the target split
// (P3's brief: "Budget butin 45% / Pot du tirage 45% / Trésorerie 10%")
// but are NOT wired into a live payout table yet — see CALIBRATION.md's
// P3 section for why (the wallet payout table can't hit 45% at current
// spawn/keep rates without a real-money decision this session flagged
// rather than guessed at).
export const PLAY_PRICE_USDG = 0
export const LOOT_BUDGET_PCT = 0.45
export const POT_PCT = 0.45
export const TREASURY_PCT = 0.1

export const BONUS_MAX_PCT = 100
export const BONUS_WIN_PCT = 10
export const BONUS_DECAY_PCT_PER_DAY = 20

// Codes (P4): "un code débloque un compte à vie et le démarre à 50% de
// bonus." WINS_TO_ISSUE_CODE/REFERRAL_VOLUME_USDG are both real
// thresholds today even though volume is always 0 while PLAY_PRICE_USDG
// is — same "plumbing now, amount later" as everything else this round.
export const BONUS_START_WITH_CODE_PCT = 50
export const WINS_TO_ISSUE_CODE = 10
export const REFERRAL_VOLUME_USDG = 500
