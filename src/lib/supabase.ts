// The one Supabase client, created lazily. Returns null when the env vars
// aren't set (local dev without .env.local, or a deployment that hasn't
// configured them yet) — every caller must handle that by falling back to
// local-only behavior, same stubbing pattern as identity.ts's Privy stub.
// See DECISIONS.md P1 for the schema this talks to and README.md for the
// required env vars.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null | undefined

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  client = url && key ? createClient(url, key) : null
  return client
}

export function isSupabaseConfigured(): boolean {
  return getSupabase() !== null
}
