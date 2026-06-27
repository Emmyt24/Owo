import { celo, celoAlfajores } from 'viem/chains';
import {
  createPublicClient,
  http,
  formatUnits,
  type Address,
  type PublicClient,
  type Chain,
} from 'viem';

export { celo, celoAlfajores };

/** Celo mainnet chain id (Section 1). Alfajores is the staging testnet. */
export const CELO_MAINNET_ID = 42220 as const;
export const CELO_ALFAJORES_ID = 44787 as const;

export type SupportedChainId = typeof CELO_MAINNET_ID | typeof CELO_ALFAJORES_ID;

export function chainFor(chainId: SupportedChainId): Chain {
  return chainId === CELO_MAINNET_ID ? celo : celoAlfajores;
}

/** Build a read-only client for a Celo network. */
export function createCeloPublicClient(chainId: SupportedChainId, rpcUrl?: string): PublicClient {
  const chain = chainFor(chainId);
  return createPublicClient({ chain, transport: http(rpcUrl) });
}

/** Minimal ERC-20 balanceOf/decimals ABI — enough to read a G$ balance. */
export const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

export interface TokenBalance {
  raw: bigint;
  decimals: number;
  /** Human-readable, fixed-point formatted balance. */
  formatted: string;
}

/**
 * Read an address's G$ (or any ERC-20) balance. Powers the Sprint 1 exit criterion:
 * "a user connects a wallet and sees their real G$ balance".
 */
export async function readTokenBalance(
  client: PublicClient,
  token: Address,
  account: Address,
): Promise<TokenBalance> {
  const [raw, decimals] = await Promise.all([
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [account],
    }),
    client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
  ]);
  return { raw, decimals, formatted: formatUnits(raw, decimals) };
}
