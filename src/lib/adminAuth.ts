// Server-only. Gates the /admin panel and its API route to a small,
// explicit allowlist of addresses — the deployer/owner wallet and,
// later, the treasury multisig once it exists (see DECISIONS.md P7).
// Configured via env, not hardcoded, so the treasury address can be
// added later without a code change; ADMIN_WALLETS is a comma-separated
// list, falling back to the owner wallet on record if unset.
const DEFAULT_ADMIN_WALLETS = ['0xDa784752645C951622021D09a44e3E5CD2296613']

function adminWallets(): string[] {
  const raw = process.env.ADMIN_WALLETS
  const list = raw ? raw.split(',').map((a) => a.trim()) : DEFAULT_ADMIN_WALLETS
  return list.filter(Boolean).map((a) => a.toLowerCase())
}

export function isAdminAddress(address: string | null): boolean {
  if (!address) return false
  return adminWallets().includes(address.toLowerCase())
}
