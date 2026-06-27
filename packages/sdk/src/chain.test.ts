import { describe, it, expect } from 'vitest';
import { chainFor, CELO_MAINNET_ID, CELO_ALFAJORES_ID } from './chain.js';

describe('chainFor', () => {
  it('maps mainnet id to Celo (42220)', () => {
    expect(chainFor(CELO_MAINNET_ID).id).toBe(42220);
  });

  it('maps alfajores id to the testnet (44787)', () => {
    expect(chainFor(CELO_ALFAJORES_ID).id).toBe(44787);
  });
});
