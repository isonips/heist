# HEIST contracts

`Vault.sol` (USDG custody: deposit/withdraw, permissionless withdrawal,
no owner) and `HaulLedger.sol` (append-only batch log, recorder role with
a 2-step handoff) — see `DECISIONS.md` P10 in the repo root for the design
rationale. **Not deployed anywhere.** Target chain (verify before ever
deploying): Robinhood Chain, an Arbitrum Orbit L2, chainId 4663, RPC
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

## Known gap, deliberately not solved here

Neither contract has any function that lets the backend **debit** a
player's on-chain Vault balance to pay for a game under the `deposit`
payment path (P7: "chaque partie débite le registre"). That's an
intentional scope cut, not an oversight — deciding who can move a
player's custodied funds without a fresh signature (a trusted operator
role? what limits it? how does it reconcile with the off-chain ledger?)
is exactly the kind of real-money design call this session's standing
rule says to flag rather than guess at. Today, the actual "debit" for a
game happens entirely in the off-chain ledger (P5) — the on-chain Vault
only custodies deposits and honors withdrawals against the on-chain
balance, which for now is not yet wired to decrease when a game is
played. This has to be resolved before the `deposit` payment path can go
live; `perRun` (pay on-chain per game) doesn't need it at all.
