// Reads a real, on-chain USDG balance for a given address — the header
// wallet display (P8 follow-up) reads this, separate from the off-chain
// ledger balance /api/wallet already returns (which is internal game
// accounting, currently always 0 while PLAY_PRICE_USDG is 0). This is a
// plain public read: no signing, no server secret, same chain/token
// verified in DECISIONS.md P10 and contracts/scripts/verifyToken.js.
import { createPublicClient, formatUnits, http, isAddress } from 'viem'

const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com'
const USDG_ADDRESS = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168' as const
const ROBINHOOD_CHAIN_ID = 4663

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const

const client = createPublicClient({
  chain: { id: ROBINHOOD_CHAIN_ID, name: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } },
  transport: http(RPC_URL),
})

/** Real USDG balance for `address`, as a plain number (not raw units) —
 *  decimals read from the token itself, never hardcoded (P10). Returns
 *  null on any failure (RPC unreachable, bad address) rather than
 *  throwing, so a caller can degrade to "—" instead of a 500. */
export async function getOnchainUsdgBalance(address: string): Promise<number | null> {
  if (!isAddress(address)) return null
  try {
    const [raw, decimals] = await Promise.all([
      client.readContract({ address: USDG_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }),
      client.readContract({ address: USDG_ADDRESS, abi: ERC20_ABI, functionName: 'decimals' }),
    ])
    return Number(formatUnits(raw, decimals))
  } catch {
    return null
  }
}
