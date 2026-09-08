'use client'

// Header wallet balance (real on-chain USDG, not the internal ledger —
// see /api/wallet and src/lib/onchainUsdg.ts) + a "Need USDG?" swap
// link. Only renders once signed in; local-only guests have no address
// to read a balance for.
//
// The swap link is a placeholder: it isn't wired to LI.FI's actual
// fee-sharing yet. That needs the fee-receiving wallet address (and
// confirmation of a LI.FI integrator registration, or help getting one)
// from the user directly — not something to guess at, since a wrong
// integrator/fee config would mean fees silently never arrive. Points at
// plain Jumper.exchange for now so the button still does something
// useful today.
import { useCallback, useEffect, useState } from 'react'
import { theme } from '@/design/theme'
import { getIdentity, onIdentityChange } from '@/game/identity'

const pal = theme.palette
const NEED_USDG_URL = 'https://jumper.exchange'

export default function WalletHeaderBadge() {
  const [identity, setIdentityState] = useState(getIdentity())
  const [balance, setBalance] = useState<number | null>(null)

  const refresh = useCallback(() => {
    const id = getIdentity()
    setIdentityState(id)
    if (!id) { setBalance(null); return }
    fetch('/api/wallet')
      .then((res) => res.json())
      .then((data) => setBalance(typeof data.onchainUsdg === 'number' ? data.onchainUsdg : null))
      .catch(() => setBalance(null))
  }, [])

  useEffect(() => {
    refresh()
    return onIdentityChange(refresh)
  }, [refresh])

  if (!identity) return null

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: theme.type.size.feed, whiteSpace: 'nowrap' }}>
      <span style={{ color: pal.gold }}>{balance === null ? '— USDG' : `${balance.toFixed(2)} USDG`}</span>
      <a
        href={NEED_USDG_URL}
        target="_blank"
        rel="noreferrer"
        style={{
          background: pal.amber,
          color: pal.ink,
          border: `1px solid ${pal.ink}`,
          padding: '1px 6px',
          fontSize: theme.type.size.feed,
          textDecoration: 'none',
        }}
      >
        NEED USDG?
      </a>
    </span>
  )
}
