'use client'

import { getSupabase } from '@/lib/supabase'
import { lines, type EventType } from '@/design/lines'
import { getIdentity } from './identity'

export type FeedEntry = {
  id: number
  type: EventType
  text: string
  self: boolean
  at: number
}

type Listener = (entry: FeedEntry) => void

const listeners = new Set<Listener>()
let nextId = -1 // negative, local-only IDs — never collide with the server's bigint identity column

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

/** P1: real player events (self=true) are pushed to the shared feed_events
 *  table (fire-and-forget) so every viewer's wire — not just this tab —
 *  eventually shows them, and /embed has real activity to read. Ambient/
 *  system placeholder lines (self=false, see FeedWindow.tsx's AMBIENT
 *  array) are never written to shared storage — they aren't real plays. */
function pushToServer(type: EventType, text: string) {
  const supabase = getSupabase()
  if (!supabase) return
  const identity = getIdentity()
  void supabase.from('feed_events').insert({ type, text, address: identity?.address ?? null, self: true }).then(() => {})
}

export function postFeedEvent(type: EventType, tokens: Record<string, string | number>, self = false): void {
  const text = drawLine(type, tokens)
  const entry: FeedEntry = { id: nextId--, type, text, self, at: Date.now() }
  for (const l of listeners) l(entry)
  if (self) pushToServer(type, text)
}

export function subscribeFeed(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

type FeedRow = { id: number; type: string; text: string; address: string | null; created_at: string }

/** The shared wire's recent history — used to seed FeedWindow/embed on
 *  mount and to poll for what happened elsewhere. Empty array (not a
 *  throw) when Supabase isn't configured or the request fails: a feed with
 *  nothing real yet is a normal, renderable state, not an error one. */
export async function fetchRecentFeedEvents(limit: number): Promise<FeedEntry[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('feed_events')
      .select('id,type,text,address,created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    const mine = getIdentity()?.address
    return (data as FeedRow[]).map((row) => ({
      id: row.id,
      type: row.type as EventType,
      text: row.text,
      self: mine !== undefined && row.address === mine,
      at: new Date(row.created_at).getTime(),
    }))
  } catch {
    return []
  }
}
