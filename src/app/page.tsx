'use client'

import { useState } from 'react'
import WindowChrome, { type TabId } from '@/components/WindowChrome'
import HeistGame from '@/components/HeistGame'
import RulesTab from '@/components/RulesTab'
import MyHaulTab from '@/components/MyHaulTab'
import FeedWindow from '@/components/FeedWindow'

export default function Home() {
  const [tab, setTab] = useState<TabId>('play')

  return (
    <>
      <WindowChrome active={tab} onChange={setTab}>
        {tab === 'play' && <HeistGame key="play" />}
        {tab === 'demo' && <HeistGame key="demo" demo />}
        {tab === 'rules' && <RulesTab />}
        {tab === 'haul' && <MyHaulTab />}
      </WindowChrome>
      <FeedWindow />
    </>
  )
}
