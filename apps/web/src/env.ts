/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_REOWN_PROJECT_ID: string;
    readonly VITE_CELO_CHAIN_ID?: string;
    readonly VITE_GDOLLAR_TOKEN_ADDRESS?: string;
    readonly VITE_CELO_RPC_URL?: string;
    readonly VITE_API_BASE_URL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

/** G$ token address — Alfajores default can be overridden via env. */
export const GDOLLAR_TOKEN_ADDRESS = (import.meta.env.VITE_GDOLLAR_TOKEN_ADDRESS ??
  '') as `0x${string}`;
export const REOWN_PROJECT_ID = import.meta.env.VITE_REOWN_PROJECT_ID ?? '';
export const CELO_CHAIN_ID = Number(import.meta.env.VITE_CELO_CHAIN_ID ?? '44787');
export const CELO_RPC_URL = import.meta.env.VITE_CELO_RPC_URL;
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';
