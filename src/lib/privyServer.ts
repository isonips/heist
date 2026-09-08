// Server-only. Both login paths (email, injected wallet) go through Privy
// client-side — see DECISIONS.md P2 for why this replaces a hand-rolled
// SIWE nonce dance rather than running one alongside Privy: Privy already
// requires a signature to link an external wallet, and mints its own
// embedded wallet (custody backed by Privy's infrastructure, not a
// signature at all) for email users. Re-verifying its identity token here
// is the equivalent trust boundary a self-hosted nonce/signature check
// would give — this is the one place either path's proof actually gets
// checked, not a second one layered on top.
import { PrivyClient, type User } from '@privy-io/server-auth'

let client: PrivyClient | null | undefined

function getClient(): PrivyClient | null {
  if (client !== undefined) return client
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const appSecret = process.env.PRIVY_APP_SECRET
  client = appId && appSecret ? new PrivyClient(appId, appSecret) : null
  return client
}

export function isPrivyConfigured(): boolean {
  return getClient() !== null
}

/** The one address the rest of the app treats identically regardless of
 *  how the user logged in — Privy's own "most recently linked wallet",
 *  which is populated for wallet logins (the wallet they connected) and
 *  for email logins too, provided the Privy dashboard has embedded
 *  wallets set to auto-create for users without one (see README). Lower-
 *  cased once, here, so every downstream comparison is byte-for-byte. */
export function addressFromPrivyUser(user: User): string | null {
  return user.wallet?.address ? user.wallet.address.toLowerCase() : null
}

/** Verifies a Privy identity token (client's usePrivy().identityToken) and
 *  returns the address it resolves to, or null for anything that doesn't
 *  check out — unconfigured, invalid token, no linked wallet yet. Decoding
 *  an identity token is local/fast (no Privy API call, no rate limit),
 *  unlike verifyAuthToken()+getUser(userId) — see the getUser({idToken})
 *  doc comment in @privy-io/server-auth. */
export async function verifyPrivyIdentityToken(idToken: string): Promise<string | null> {
  const privy = getClient()
  if (!privy) return null
  try {
    const user = await privy.getUser({ idToken })
    return addressFromPrivyUser(user)
  } catch {
    return null
  }
}

/** Fallback path, used only when the identity token itself couldn't be
 *  obtained client-side (see AuthSync.tsx — real bug found live: a
 *  session's identity token can come back null indefinitely, on every
 *  path tried, for reasons outside this app's control). Verifies Privy's
 *  standard session access token instead (usePrivy().getAccessToken() —
 *  a different, always-issued token, not the identity-token feature) via
 *  local JWT signature verification (verifyAuthToken, no network call
 *  after its verification key is first fetched and cached), then
 *  resolves the user via `getUser(userId)`. That last call IS one of the
 *  strictly-rate-limited legacy endpoints per @privy-io/server-auth's own
 *  doc comment — acceptable here specifically because this path only
 *  runs when the (rate-limit-friendly) idToken path has already failed,
 *  so it's a rare fallback, not the hot path. */
export async function verifyPrivyAccessToken(accessToken: string): Promise<string | null> {
  const privy = getClient()
  if (!privy) return null
  try {
    const claims = await privy.verifyAuthToken(accessToken)
    const user = await privy.getUser(claims.userId)
    return addressFromPrivyUser(user)
  } catch {
    return null
  }
}
