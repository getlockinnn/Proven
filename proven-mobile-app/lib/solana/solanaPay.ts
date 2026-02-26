/**
 * Solana Pay Types
 * Type definitions for Solana Pay integration
 */

export interface SolanaPayData {
  solanaPayUrl: string;
  referenceKey: string;
  amount: number;
  escrowAddress: string;
  usdcMint: string;
  expiresAt: number;
  challenge: {
    id: string;
    title: string;
  };
}

export interface TransferVerificationResult {
  status: 'pending' | 'confirmed' | 'failed';
  signature?: string;
  referenceKey?: string;
  amount?: number;
  challengeId?: string;
  escrowAddress?: string;
  message?: string;
}
