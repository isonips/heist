// Thin wrapper every server-authoritative route handler calls first: reads
// and verifies the session cookie, returns the address or null. Kept
// separate from session.ts (pure HMAC logic, no Next.js dependency) so
// that file stays usable from a future non-Route-Handler context (a cron
// job, say) without dragging next/headers along.
import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifySessionToken } from './session'

export async function getSessionAddress(): Promise<string | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  try {
    return verifySessionToken(token)
  } catch {
    // SESSION_SECRET unset — treat as logged out, not authenticated.
    return null
  }
}
