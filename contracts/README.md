# HEIST contracts

`Vault.sol` (USDG custody: deposit/withdraw, permissionless withdrawal,
no owner), `HaulLedger.sol` (append-only batch log, recorder role with
a 2-step handoff), and `HeistPlay.sol` (the `perRun` payment path: pay
`playPrice` USDG per game in one signed transaction, treasury cut moves
immediately, the rest pools for operator-authorized loot/prize payouts)
— see `DECISIONS.md` P10/P7 in the repo root for the design rationale.
**Not deployed anywhere.** Target chain (verify before ever deploying):
Robinhood Chain, an Arbitrum Orbit L2, chainId 4663, RPC
`https://rpc.mainnet.chain.robinhood.com`.

This is a separate npm project (own `package.json`, own `node_modules`) —
it isn't part of the Next.js app's build or dependency tree.

## Why this doesn't use plain `hardhat compile` / `hardhat test`

Hardhat's built-in compile task downloads the solc binary from
`binaries.soliditylang.org`, which this environment's egress allowlist
blocks (`registry.npmjs.org` is allowed, that domain isn't). Working
around it:

- `scripts/compile.js` compiles with the `solc` **npm package** instead
  (fetched from the npm registry, not `binaries.soliditylang.org`) —
  standard-JSON input, resolving `@openzeppelin/...` imports from
  `node_modules` by hand.
- `scripts/runTests.js` is a small hand-rolled test runner (not Mocha via
  `hardhat test`, which also auto-compiles first) run via
  `hardhat run scripts/runTests.js --no-compile` — `--no-compile` is the
  part that matters, it's what stops Hardhat from trying the blocked
  download. Everything else about it is a normal Hardhat script: real EVM
  semantics (revert reasons, gas, `block.timestamp`) via Hardhat's
  built-in in-process network, contracts deployed from the ABI/bytecode
  `compile.js` produced.

If a future environment (or your own machine) has normal internet access,
plain `npx hardhat compile` and a real Mocha `test/` suite work exactly as
usual — nothing here fights that, this is purely a workaround for what
this sandbox can reach.

## Run the tests

```
npm install
npm test
```

## HeistPlay — the perRun path

Per the user's own design direction: the player signs one transaction
per game (10 USDG), sent straight to `HeistPlay`, which splits it —
`treasuryBps` moves to `treasury` immediately, the rest stays pooled in
the contract itself. It does **not** maintain separate on-chain balances
for the draw pot vs. the loot budget — both stay pooled together, and
the off-chain `ledger` table (P5, `reason` = `loot`/`prize`) is what
actually tracks which portion of the pool is earmarked for what. That
mirrors how the off-chain ledger already works (one table, `reason`
distinguishes the movement) rather than trying to make the contract
independently re-derive "today's pot," which it has no way to compute
correctly anyway — that requires knowing every game's outcome, and only
server-side `replay()` (P5) determines that.

`operator` (backend-held key) is the only thing that can call `payout()`
— always *after* the backend has independently verified a game's outcome
via `replay()`, never on a client's say-so. `owner` (2-step transfer)
controls `playPrice`/`treasuryBps`/`operator`/payout caps — a different,
presumably colder key (a hardware wallet) than `operator`, so the
day-to-day payout key can't also rewrite the economics.

### Three roles, three keys (P7, corrected this round)

`owner`, `operator`, and `treasury` are deliberately separate:
- `owner` — the project's hardware wallet, never on a server.
- `operator` — a dedicated, generated server key (never the deployer's),
  lives in Vercel env vars, signs every `payout()` call. It's a **hot**
  key by design, so it's bounded rather than trusted: `maxPayoutPerTx`
  and `maxPayoutPerDay` (both `owner`-only to change, via
  `setPayoutLimits`) cap what a compromised copy of it can actually move
  — one over-cap transaction, or one day's worth, never the whole pool.
  Enforced on-chain in `payout()`, tracked per UTC day
  (`block.timestamp / 1 days`) in `payoutsByDay`.
- `treasury` — a 2-of-N multisig that **does not exist yet** at deploy
  time. The constructor accepts `address(0)` for it on purpose; `play()`
  simply refuses to run while it's unset. There is no single-step
  setter for `treasury`, ever — only `proposeTreasury`/`acceptTreasury`,
  the same 2-step pattern `owner` and HaulLedger's `recorder` already
  use, so it can never be hardcoded or silently swapped in one call.

`owner` and `operator` are enforced distinct everywhere a role can
change (constructor, `setOperator`, `proposeOwner`) — a stolen or
misconfigured key can never end up wearing both hats.

**Solvency invariant**: `payout()` checks `usdg.balanceOf(address(this))`
against the requested amount and reverts (`InsufficientPool`) rather
than relying on `SafeERC20`'s own implicit revert — an explicit,
independent guard that the pool can never be asked to pay out more than
it actually holds, on top of (not instead of) the per-tx/daily caps.

Wiring this into the app once deployed: `/api/play/start` would need the
player's `play()` transaction (or its hash) as a precondition before
issuing a ticket, and `/api/play/finish` would call `HeistPlay.payout()`
(via `operator`) alongside its existing off-chain ledger writes rather
than instead of them — the off-chain ledger stays the source of truth
for accounting either way, the contract is the custody/settlement layer
underneath it. Not built yet — no deployed address to call.

## USDG: 6 decimals, verified on-chain (P10)

Confirmed this session against Robinhood Chain mainnet
(`https://rpc.mainnet.chain.robinhood.com`, chainId 4663): USDG lives at
`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (Global Dollar, symbol
`USDG`, **6 decimals**, an EIP-1967 proxy). Paxos's USDG is a multi-chain
token with a distinct address per network — Ethereum's address is a
different value and **has no contract at all on chainId 4663**; it must
never appear in this repo, not even as a comment, and doesn't.

`HeistPlay.sol` itself has no opinion on decimals — it stores and moves
raw token units only, so a 10 USDG entry fee is whatever the caller
passes in (`10_000_000` at 6dp, not `10 * 10^18`). The mocks used in
tests default to the ERC20 standard's 18 decimals (`MockUSDG`) *except*
`MockUSDG6`, which mirrors the real token (6dp, symbol `USDG`) — the
"6-decimal token" test block in `runTests.js` runs the same play/payout
flow against it and checks the raw unit amounts, specifically to catch
a future edit that silently assumes 18 decimals somewhere.

**`scripts/verifyToken.js` is a mandatory pre-deploy guard** — run it
(`npm run verify-token`) before any deployment that takes a token
address as a constructor arg. It checks, against a live RPC: the chainId
matches, the address has bytecode at all, `symbol()` returns `"USDG"`,
and `decimals()` returns `6` — aborting (non-zero exit) on any mismatch
rather than letting a deploy proceed on an assumption. A mis-addressed
token is this project's one genuinely irreversible risk (Ethereum's
USDG address, for instance, would fail this exact way — no bytecode on
this chain — which is exactly what the guard is for). This sandbox's own
egress allowlist blocks `rpc.mainnet.chain.robinhood.com`, so the script
can't self-verify from here; run it from an environment with real
network access before the actual deploy.

## Known gap: the `deposit` path's debit function

`Vault.sol` still has no function that lets the backend **debit** a
player's on-chain balance to pay for a game (P7's `deposit` path: "chaque
partie débite le registre"). Given the user's direction above settles on
`perRun` (via `HeistPlay`) as the actual path being built, this gap is
lower-priority now, but still real if `deposit` is wanted later — same
open question as before: what role can move a player's custodied funds
without a fresh signature, and how does it reconcile with the off-chain
ledger.
