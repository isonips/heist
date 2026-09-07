// Usernames are free, unique, and permanent (see DECISIONS.md P2) — no
// second chance to fix an impersonating or offensive one, so the reserved
// list is the only backstop. Checked case-insensitively against a
// normalized (lowercased, non-alphanumerics stripped) form of the
// candidate, so "He1st", "he-ist" and "HEIST" all collide with "heist".
// Not exhaustive — extend as real names surface at review.
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  // The game/brand itself and its own UI vocabulary
  'heist', 'heistgame', 'heistwire', 'play', 'demo', 'admin', 'administrator',
  'mod', 'moderator', 'official', 'staff', 'team', 'support', 'help',
  'system', 'server', 'bot', 'null', 'undefined', 'none', 'guest', 'anon',
  'anonymous', 'user', 'test', 'deleted', 'banned', 'unknown',
  // Roles this app itself uses as labels elsewhere (feed/profile copy)
  'thief', 'police', 'cop', 'winner', 'draw', 'jackpot', 'house',
  // Common impersonation targets
  'root', 'owner', 'founder', 'ceo', 'dev', 'developer', 'security',
])

/** he1st -> heist, he-ist -> heist, HEIST_99 stays HEIST_99 (digits kept —
 *  otherwise every "official123" variant would need listing separately). */
export function normalizeUsername(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function isReservedUsername(name: string): boolean {
  return RESERVED_USERNAMES.has(normalizeUsername(name))
}
