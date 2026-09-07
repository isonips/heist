'use client'

// The single client-side auth front door for both login paths — email and
// injected wallet (see DECISIONS.md P2). Privy's modal handles both; an
// email-only user gets an embedded wallet minted automatically
// (embeddedWallets.createOnLogin), so every authenticated user ends up with
// exactly one address regardless of which path they took. Falls through to
// a plain passthrough when NEXT_PUBLIC_PRIVY_APP_ID isn't set, so the app
// still builds and runs (DEMO mode, no PLAY/PROFILE gating) on a deployment
// that hasn't configured Privy yet.
import { PrivyProvider } from '@privy-io/react-auth'
import type { ReactNode } from 'react'
import AuthSync from './AuthSync'

export default function PrivyClientProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  if (!appId) return <>{children}</>

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['email', 'wallet'],
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
        appearance: { theme: 'dark' },
      }}
    >
      <AuthSync />
      {children}
    </PrivyProvider>
  )
}
