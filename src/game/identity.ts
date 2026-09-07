// Address-based identity — the local cache of "who's connected", read
// synchronously all over the app (profile.ts, feedBus.ts). This is a UX
// cache only, never a trust boundary: the real proof of address lives in
// the httpOnly session cookie the server mints in /api/auth/privy, which
// this cache is set from — see DECISIONS.md P2 for why a raw injected
// wallet address is never trusted on its own (falsifiable) and Privy's
// identity token is what the server actually verifies.
export type WalletSource = 'privy'
export type Identity = { address: string; source: WalletSource }

const ACTIVE_KEY = 'heist-active-identity-v1'

export function getIdentity(): Identity | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ACTIVE_KEY)
    return raw ? (JSON.parse(raw) as Identity) : null
  } catch {
    return null
  }
}

export function setIdentity(identity: Identity | null): void {
  if (typeof window === 'undefined') return
  try {
    if (identity) window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(identity))
    else window.localStorage.removeItem(ACTIVE_KEY)
  } catch {
    // unavailable
  }
}

export function disconnect(): void {
  setIdentity(null)
}
