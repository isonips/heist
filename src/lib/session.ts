// Server-only. The one thing every write path in P5 depends on: a session
// cookie that actually proves who's asking, instead of trusting an address
// a client could put in a request body. Stateless HMAC token (address +
// expiry, signed with SESSION_SECRET) rather than a DB-backed session table
// — no extra round-trip to verify a request, and nothing to garbage-collect.
// Revocation isn't needed at this scope: logout clears the cookie
// client-side, and a leaked token is bounded by SESSION_TTL_S regardless.
//
// SESSION_SECRET must be set in the deployment (any long random string,
// consistent across all instances) — see .env.example. Missing it isn't a
// silent-degrade case like isSupabaseConfigured(): a session token that
// can't be verified means every server-authoritative write in P5 has to
// refuse instead of trusting an unverified address, so signSession()/
// verifySessionToken() throw rather than returning something that reads as
// "logged out" but is actually "misconfigured".
import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'heist_session'
const SESSION_TTL_S = 60 * 60 * 24 * 30 // 30 days — this is an identity session, not a payment approval

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET is not set — see .env.example. Refusing to mint or verify sessions without it.')
  return s
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

/** address is expected already-lowercased (see privyServer.ts) — this
 *  doesn't normalize it, so every write path downstream can compare
 *  addresses byte-for-byte without a second lowercase() call. */
export function signSession(address: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S
  const payload = `${address}.${exp}`
  return `${payload}.${sign(payload)}`
}

/** Returns the verified address, or null for anything that doesn't check
 *  out — missing cookie, bad signature, expired, malformed. Every caller
 *  treats null the same way: not logged in. */
export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [address, expStr, sig] = parts
  const payload = `${address}.${expStr}`
  const expected = sign(payload)
  // Constant-time compare — this is a bearer credential, timing leaks on
  // the signature check are exactly the kind of thing worth not risking.
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null
  return address
}
