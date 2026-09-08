// Mandatory pre-deploy guard (DECISIONS.md P10): a mis-addressed token is
// this project's one irreversible risk — Ethereum's USDG address has no
// contract at all on Robinhood Chain, and a wrong address would fail
// silently rather than reverting. Run this before ever deploying anything
// that takes a token address as a constructor arg, and abort the deploy
// if it doesn't pass.
//
//   node scripts/verifyToken.js
//   RPC_URL=... USDG_ADDRESS=... node scripts/verifyToken.js   # override for a non-default network
//
// Checks, in order: the address has bytecode at all, symbol() === "USDG",
// decimals() === 6. Any failure exits 1 with a clear reason instead of
// letting a deploy script proceed on a guess.
const { ethers } = require('ethers')

// Robinhood Chain mainnet — confirmed this session: eth_chainId returns
// 4663, and this address resolves to Global Dollar / USDG, 6 decimals,
// via Paxos's own multi-chain USDG (docs.paxos.com/guides/stablecoin/usdg
// — each network has its own address; this is NOT the Ethereum address,
// which has no contract on this chain at all and must never be used here).
const DEFAULT_RPC_URL = 'https://rpc.mainnet.chain.robinhood.com'
const DEFAULT_USDG_ADDRESS = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'
const EXPECTED_CHAIN_ID = 4663n
const EXPECTED_SYMBOL = 'USDG'
const EXPECTED_DECIMALS = 6

const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]

async function verifyToken(rpcUrl, tokenAddress) {
  const provider = new ethers.JsonRpcProvider(rpcUrl)

  const network = await provider.getNetwork()
  if (network.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`chainId mismatch: RPC returned ${network.chainId}, expected ${EXPECTED_CHAIN_ID}. Wrong network — abort.`)
  }

  const code = await provider.getCode(tokenAddress)
  if (code === '0x') {
    throw new Error(`No bytecode at ${tokenAddress} on chainId ${network.chainId}. Wrong address — abort.`)
  }

  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider)

  const symbol = await token.symbol()
  if (symbol !== EXPECTED_SYMBOL) {
    throw new Error(`symbol() returned "${symbol}", expected "${EXPECTED_SYMBOL}". Wrong token — abort.`)
  }

  const decimals = await token.decimals()
  if (Number(decimals) !== EXPECTED_DECIMALS) {
    throw new Error(`decimals() returned ${decimals}, expected ${EXPECTED_DECIMALS}. Treating this as ${EXPECTED_DECIMALS}dp when it isn't moves every amount by a wrong power of ten — abort.`)
  }

  return { chainId: network.chainId, symbol, decimals: Number(decimals) }
}

async function main() {
  const rpcUrl = process.env.RPC_URL || DEFAULT_RPC_URL
  const tokenAddress = process.env.USDG_ADDRESS || DEFAULT_USDG_ADDRESS
  console.log(`Verifying token ${tokenAddress} on ${rpcUrl} ...`)
  const result = await verifyToken(rpcUrl, tokenAddress)
  console.log(`OK — chainId ${result.chainId}, symbol ${result.symbol}, decimals ${result.decimals}`)
}

module.exports = { verifyToken }

if (require.main === module) {
  main().catch((err) => {
    console.error(`ABORT: ${err.message}`)
    process.exit(1)
  })
}
