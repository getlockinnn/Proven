/**
 * Solana Configuration
 * Network settings, token mints, and RPC endpoints
 */

import { Commitment, PublicKey } from '@solana/web3.js';

// Network configuration
export const NETWORK = (process.env.EXPO_PUBLIC_SOLANA_NETWORK || 'devnet') as 'devnet' | 'mainnet-beta';

// RPC Endpoints
export const RPC_ENDPOINTS = {
  devnet: process.env.EXPO_PUBLIC_SOLANA_RPC_DEVNET!,
  'mainnet-beta': process.env.EXPO_PUBLIC_SOLANA_RPC_MAINNET!,
} as const;

// USDC Mint addresses per network
export const USDC_MINTS = {
  devnet: new PublicKey(process.env.EXPO_PUBLIC_USDC_MINT_DEVNET!),
  'mainnet-beta': new PublicKey(process.env.EXPO_PUBLIC_USDC_MINT_MAINNET!),
} as const;

// Current configuration based on NETWORK
export const SOLANA_CONFIG = {
  network: NETWORK,
  rpcEndpoint: RPC_ENDPOINTS[NETWORK],
  usdcMint: USDC_MINTS[NETWORK],
  commitment: 'confirmed' as Commitment,
  // USDC has 6 decimals
  usdcDecimals: 6,
};

/**
 * Convert USDC amount to lamports (smallest unit)
 * USDC has 6 decimals, so 1 USDC = 1,000,000 lamports
 */
export function usdcToLamports(amount: number): number {
  return Math.floor(amount * Math.pow(10, SOLANA_CONFIG.usdcDecimals));
}

/**
 * Truncate a public key for display
 * e.g., "7VKN9w7h...7N"
 */
export function truncateAddress(address: string, chars: number = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
