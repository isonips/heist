'use client'

// The single client-side auth front door for both login paths — email and
// injected wallet (see DECISIONS.md P2). Privy's modal handles both; an
// email-only user gets an embedded wallet minted automatically
// (embeddedWallets.createOnLogin), so every authenticated user ends up with
// exactly one address regardless of which path they took. Falls through to
// a plain passthrough when NEXT_PUBLIC_PRIVY_APP_ID isn't set, so the app
// still builds and runs (DEMO mode, no PLAY/PROFILE gating) on a deployment
// that hasn't configured Privy yet.
//
// Mounted-gate, not just 'use client': this file being a client component
// doesn't stop Next.js from still rendering it once during SSR/static
// prerendering (that's what produces the initial HTML) — 'use client'
// only means "also hydrate on the client," not "server never touches
// it." Privy's SDK does browser-only setup (storage, crypto) that has no
// business running during that server-side pass, so the real
// <PrivyProvider> only mounts after a client-only effect confirms we're
// actually in the browser — before that, `children` render directly and
// immediately, so nothing about the page's initial HTML/SSR output
// changes. usePrivy() elsewhere in the tree already tolerates having no
// provider (returns a safe default), so the brief window before this
// effect fires is a non-issue.
import { PrivyProvider } from '@privy-io/react-auth'
import { useEffect, useState, type ReactNode } from 'react'
import AuthSync from './AuthSync'

export default function PrivyClientProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  if (!mounted || !appId) return <>{children}</>

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
