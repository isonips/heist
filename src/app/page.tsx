'use client'

import { useState } from 'react'
import WindowChrome, { type TabId } from '@/components/WindowChrome'
import HeistGame from '@/components/HeistGame'
import RulesTab from '@/components/RulesTab'
import ProfileTab from '@/components/ProfileTab'
import FeedWindow from '@/components/FeedWindow'

export default function Home() {
  const [tab, setTab] = useState<TabId>('play')

  return (
    // Bottom padding reserves room below the window so the feed window —
    // fixed to the viewport corner — never ends up sharing a spot with the
    // page's own last content on a short viewport, at any scroll position.
    <div style={{ paddingBottom: 64 }}>
      <WindowChrome active={tab} onChange={setTab}>
        {tab === 'play' && <HeistGame key="play" />}
        {tab === 'demo' && <HeistGame key="demo" demo />}
        {tab === 'rules' && <RulesTab />}
        {tab === 'profile' && <ProfileTab />}
      </WindowChrome>
      <FeedWindow />
    </div>
  )
}
