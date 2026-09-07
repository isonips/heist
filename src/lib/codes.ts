// Server-only. Generates the redeemable string for an auto-issued code
// (ten_wins/referral — see DECISIONS.md P4). Manual/partner codes are a
// different path entirely (a human picks the text, including its
// traceable prefix) and don't go through this.
import { randomInt } from 'node:crypto'

// Excludes 0/O/1/I — ambiguous on a screen or read aloud, exactly the
// kind of thing that turns "share this with a friend" into a support
// request.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomSegment(len: number): string {
  let out = ''
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(0, ALPHABET.length)]
  return out
}

export function generateCode(): string {
  return `${randomSegment(4)}-${randomSegment(4)}`
}
