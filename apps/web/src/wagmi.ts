import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { celo, celoAlfajores } from '@reown/appkit/networks';
import { REOWN_PROJECT_ID } from './env';

// Reown AppKit + Wagmi — the same stack the GoodDollar SDKs use (Section 13),
// so wiring identity/payment SDKs later is least-friction.
const networks = [celoAlfajores, celo] as const;

export const wagmiAdapter = new WagmiAdapter({
  networks: [...networks],
  projectId: REOWN_PROJECT_ID,
});

export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks: [...networks],
  projectId: REOWN_PROJECT_ID,
  metadata: {
    name: 'Owo',
    description: 'Spend and trade G$ in Nigeria.',
    url: 'https://owo.example',
    icons: [],
  },
  features: { analytics: false },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
