'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useState } from 'react'
import WindowChrome, { type TabId } from '@/components/WindowChrome'
import HeistGame from '@/components/HeistGame'
import RulesTab from '@/components/RulesTab'
import MyHaulTab from '@/components/MyHaulTab'
import DrawTab from '@/components/DrawTab'
import ProfileTab from '@/components/ProfileTab'
import FeedWindow from '@/components/FeedWindow'
import SplashScreen from '@/components/SplashScreen'
import WalletHeaderBadge from '@/components/WalletHeaderBadge'
import { getIdentity } from '@/game/identity'

export default function Home() {
  const [tab, setTab] = useState<TabId>('play')
  const { login, authenticated } = usePrivy()

  // "Cliquer sur PROFILE ouvre la connexion wallet" (P1) — PLAY's own gate
  // lives in HeistGame.tsx (it also has to cover RUN AGAIN mid-session);
  // this is the same idea for the tab switch itself, so arriving at
  // PROFILE disconnected doesn't just show a CONNECT button, it opens the
  // login right away. Still lands on the tab either way, so dismissing
  // the modal isn't a dead end. Skipped when already `authenticated` —
  // Privy has nothing left to do at that point (AuthSync.tsx is still
  // exchanging the session, or retrying after a hiccup), and calling
  // login() again here was a real bug: it left a mid-sync session stuck
  // with no visible way forward from this tab.
  const changeTab = (t: TabId) => {
    setTab(t)
    if (t === 'profile' && !getIdentity() && !authenticated) login()
  }

  return (
    // Bottom padding reserves room below the window so the feed window —
    // fixed to the viewport corner — never ends up sharing a spot with the
    // page's own last content on a short viewport, at any scroll position.
    <div style={{ paddingBottom: 64 }}>
      <SplashScreen />
      <WindowChrome active={tab} onChange={changeTab} headerExtra={<WalletHeaderBadge />}>
        {tab === 'play' && <HeistGame key="play" />}
        {tab === 'rules' && <RulesTab />}
        {tab === 'haul' && <MyHaulTab />}
        {tab === 'draw' && <DrawTab />}
        {tab === 'profile' && <ProfileTab />}
      </WindowChrome>
      <FeedWindow />
    </div>
  )
}
