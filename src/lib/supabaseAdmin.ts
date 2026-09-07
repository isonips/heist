// Server-only. Every write P5 calls "server-authoritative" — balance,
// ticket, bonus, loot, item, draw entry — goes through this client, which
// carries the service-role key and so bypasses RLS entirely. This is the
// *only* legitimate way for this codebase's own server code (not Supabase
// Auth) to write past the RLS policies that (once P5's RLS tightening
// lands) block anon/authenticated writes outright — see DECISIONS.md P5.
// Never import this from a 'use client' file or a component: the service
// role key must never reach the browser. Route Handlers and Server Actions
// only.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null | undefined

export function getSupabaseAdmin(): SupabaseClient | null {
  if (client !== undefined) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
  return client
}

export function isSupabaseAdminConfigured(): boolean {
  return getSupabaseAdmin() !== null
}
