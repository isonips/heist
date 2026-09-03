'use client'

import { lines, type EventType } from '@/design/lines'

export type FeedEntry = {
  id: number
  type: EventType
  text: string
  self: boolean
  at: number
}

type Listener = (entry: FeedEntry) => void

const listeners = new Set<Listener>()
let nextId = 1

// Bag randomness: shuffle each event's variants, drain before reshuffling, so
// the same line never repeats back-to-back — per lines.ts's own contract.
const bags = new Map<EventType, string[]>()
function drawLine(type: EventType, tokens: Record<string, string | number>): string {
  let bag = bags.get(type)
  if (!bag || bag.length === 0) {
    bag = [...lines[type]]
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[bag[i], bag[j]] = [bag[j], bag[i]]
    }
    bags.set(type, bag)
  }
  const template = bag.pop()!
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(tokens[key] ?? ''))
}

export function postFeedEvent(type: EventType, tokens: Record<string, string | number>, self = false): void {
  const entry: FeedEntry = { id: nextId++, type, text: drawLine(type, tokens), self, at: Date.now() }
  for (const l of listeners) l(entry)
}

export function subscribeFeed(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
