// POST { username } -> claims it for the session's address. Free, unique,
// permanent (see DECISIONS.md P2): rejects outright if this address
// already has one set, rather than overwriting — there's no "rename" path
// by design, the client should never show one. Uniqueness is enforced
// twice: a pre-check here (for a clean error message) and the DB's own
// unique index on lower(username) (profiles_username_unique — the actual
// guarantee under a race, since two requests could both pass the
// pre-check before either commits).
import { NextResponse } from 'next/server'
import { isReservedUsername } from '@/game/reservedUsernames'
import { getSessionAddress } from '@/lib/requireSession'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

const MIN_LEN = 3
const MAX_LEN = 20
const VALID = /^[A-Za-z0-9_]+$/

export async function POST(req: Request) {
  const address = await getSessionAddress()
  if (!address) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Not configured on this deployment (SUPABASE_SERVICE_ROLE_KEY).' }, { status: 503 })

  let username: unknown
  try {
    ;({ username } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 })
  }
  if (typeof username !== 'string') return NextResponse.json({ error: 'username is required.' }, { status: 400 })
  const trimmed = username.trim()
  if (trimmed.length < MIN_LEN || trimmed.length > MAX_LEN) {
    return NextResponse.json({ error: `Username must be ${MIN_LEN}-${MAX_LEN} characters.` }, { status: 400 })
  }
  if (!VALID.test(trimmed)) {
    return NextResponse.json({ error: 'Letters, numbers and underscore only.' }, { status: 400 })
  }
  if (isReservedUsername(trimmed)) {
    return NextResponse.json({ error: 'That name is reserved.' }, { status: 409 })
  }

  const { data: existing, error: readErr } = await admin.from('profiles').select('username').eq('address', address).maybeSingle()
  if (readErr) return NextResponse.json({ error: 'Lookup failed.' }, { status: 500 })
  if (existing?.username) {
    return NextResponse.json({ error: 'This address already has a permanent username set.' }, { status: 409 })
  }

  const { data: taken } = await admin
    .from('profiles')
    .select('address')
    .not('username', 'is', null)
    .ilike('username', trimmed)
    .maybeSingle()
  if (taken) return NextResponse.json({ error: 'That name is taken.' }, { status: 409 })

  const { error: writeErr } = await admin.from('profiles').upsert({ address, username: trimmed, updated_at: new Date().toISOString() })
  if (writeErr) {
    // Unique-index violation lands here under a genuine race — same message either way.
    return NextResponse.json({ error: 'That name is taken.' }, { status: 409 })
  }
  return NextResponse.json({ username: trimmed })
}
