// Address-based identity. Two connection paths, one shape (Identity) —
// see DECISIONS.md #4 for why this exists and what's real vs. stubbed here.
//
// connectInjected() is real: any EIP-1193 wallet (MetaMask, Rabby, Coinbase
// Wallet's extension, ...) needs no API key, just window.ethereum, which is
// either there or it isn't.
//
// connectPrivy() is a stub: Privy's embedded-wallet flow needs an app ID
// (NEXT_PUBLIC_PRIVY_APP_ID) this environment doesn't have configured. The
// function has the real one's exact shape and failure mode (a rejected
// Promise), so swapping in @privy-io/react-auth later is a body swap here,
// not a change at any of profile.ts's or ProfileTab.tsx's call sites.
export type WalletSource = 'injected' | 'privy'
export type Identity = { address: string; source: WalletSource }

const ACTIVE_KEY = 'heist-active-identity-v1'

type InjectedProvider = { request: (args: { method: string }) => Promise<string[]> }

export function getIdentity(): Identity | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ACTIVE_KEY)
    return raw ? (JSON.parse(raw) as Identity) : null
  } catch {
    return null
  }
}

function setIdentity(identity: Identity | null) {
  if (typeof window === 'undefined') return
  try {
    if (identity) window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(identity))
    else window.localStorage.removeItem(ACTIVE_KEY)
  } catch {
    // unavailable
  }
}

export function hasInjectedWallet(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean((window as unknown as { ethereum?: InjectedProvider }).ethereum)
}

export async function connectInjected(): Promise<Identity> {
  const eth = (window as unknown as { ethereum?: InjectedProvider }).ethereum
  if (!eth) throw new Error('No injected wallet found — install MetaMask or a similar browser wallet.')
  const accounts = await eth.request({ method: 'eth_requestAccounts' })
  const address = accounts[0]?.toLowerCase()
  if (!address) throw new Error('The wallet returned no account.')
  const identity: Identity = { address, source: 'injected' }
  setIdentity(identity)
  return identity
}

/** STUBBED — see file comment. Always rejects. */
export async function connectPrivy(): Promise<Identity> {
  return Promise.reject(new Error('Privy is not configured in this environment (no NEXT_PUBLIC_PRIVY_APP_ID). See DECISIONS.md #4.'))
}

export function disconnect(): void {
  setIdentity(null)
}
