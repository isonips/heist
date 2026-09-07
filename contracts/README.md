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
controls `playPrice`/`treasuryBps`/`treasury`/`operator` — a different,
presumably colder key than `operator`, so the day-to-day payout key
can't also rewrite the economics.

Wiring this into the app once deployed: `/api/play/start` would need the
player's `play()` transaction (or its hash) as a precondition before
issuing a ticket, and `/api/play/finish` would call `HeistPlay.payout()`
(via `operator`) alongside its existing off-chain ledger writes rather
than instead of them — the off-chain ledger stays the source of truth
for accounting either way, the contract is the custody/settlement layer
underneath it. Not built yet — no deployed address to call.

## Known gap: the `deposit` path's debit function

`Vault.sol` still has no function that lets the backend **debit** a
player's on-chain balance to pay for a game (P7's `deposit` path: "chaque
partie débite le registre"). Given the user's direction above settles on
`perRun` (via `HeistPlay`) as the actual path being built, this gap is
lower-priority now, but still real if `deposit` is wanted later — same
open question as before: what role can move a player's custodied funds
without a fresh signature, and how does it reconcile with the off-chain
ledger.
