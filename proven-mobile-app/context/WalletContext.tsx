/**
 * Wallet Context
 *
 * Provides wallet state. Phantom SDK is optional and may not be available
 * in Expo Go development builds.
 */

import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react';

export interface WalletContextType {
  // State
  publicKey: PublicKey | null;
  publicKeyString: string | null;
  connected: boolean;
  connecting: boolean;

  // Balances
  usdcBalance: number;
  solBalance: number;
  loadingBalances: boolean;

  // Display helpers
  truncatedAddress: string | null;

  // Actions
  connect: () => Promise<void>;
  connectWithGoogle: () => Promise<void>;
  connectWithApple: () => Promise<void>;
  disconnect: () => Promise<void>;
  signAndSendTransaction: (transaction: Transaction | VersionedTransaction) => Promise<string>;
  refreshBalances: () => Promise<void>;

  // Modal control
  openModal: () => void;
  closeModal: () => void;
  isModalOpen: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Truncate address helper
function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

/**
 * WalletProvider - Simplified version without Phantom SDK
 * 
 * Since we're using Solana Pay (QR code / manual transfer) for staking,
 * we don't need Phantom SDK integration for the core flow.
 */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [publicKeyString, setPublicKeyString] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [solBalance, setSolBalance] = useState(0);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const publicKey = publicKeyString ? new PublicKey(publicKeyString) : null;
  const truncatedAddr = publicKeyString ? truncateAddress(publicKeyString) : null;

  // Stub implementations - Phantom SDK not available in Expo Go
  const connect = useCallback(async () => {
    console.log('Wallet connect not available - using Solana Pay for transactions');
  }, []);

  const connectWithGoogle = useCallback(async () => {
    console.log('Google wallet connect not available - using Solana Pay for transactions');
  }, []);

  const connectWithApple = useCallback(async () => {
    console.log('Apple wallet connect not available - using Solana Pay for transactions');
  }, []);

  const disconnect = useCallback(async () => {
    setPublicKeyString(null);
    setConnected(false);
    setUsdcBalance(0);
    setSolBalance(0);
  }, []);

  const signAndSendTransaction = useCallback(
    async (transaction: Transaction | VersionedTransaction): Promise<string> => {
      throw new Error('Transaction signing not available - use Solana Pay instead');
    },
    []
  );

  const refreshBalances = useCallback(async () => {
    // No-op without wallet connection
  }, []);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const contextValue: WalletContextType = {
    publicKey,
    publicKeyString,
    connected,
    connecting,
    usdcBalance,
    solBalance,
    loadingBalances,
    truncatedAddress: truncatedAddr,
    connect,
    connectWithGoogle,
    connectWithApple,
    disconnect,
    signAndSendTransaction,
    refreshBalances,
    openModal,
    closeModal,
    isModalOpen,
  };

  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextType {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
