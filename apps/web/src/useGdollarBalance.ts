import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { readTokenBalance, type TokenBalance } from '@owo/sdk';
import type { Address, PublicClient } from 'viem';
import { GDOLLAR_TOKEN_ADDRESS } from './env';

/**
 * Read the connected wallet's G$ balance — the Sprint 1 web exit criterion.
 * Disabled until both an address and a token address are present.
 */
export function useGdollarBalance(address?: Address) {
  const client = usePublicClient();
  return useQuery<TokenBalance>({
    queryKey: ['gdollar-balance', address, GDOLLAR_TOKEN_ADDRESS],
    enabled: Boolean(client && address && GDOLLAR_TOKEN_ADDRESS),
    queryFn: () =>
      readTokenBalance(client as PublicClient, GDOLLAR_TOKEN_ADDRESS, address as Address),
  });
}
