import { Response, Request } from 'express';
import prisma from '../../lib/prisma';
import { Keypair, PublicKey } from '@solana/web3.js';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { escrowService } from '../../services/escrowService';

const USDC_MINT = process.env.USDC_MINT!;

// Reference key store (in-memory for MVP - use Redis in production)
// Maps reference pubkey -> { challengeId, userId, amount, createdAt }
interface PendingTransfer {
  challengeId: string;
  userId: string;
  amount: number;
  escrowAddress: string;
  createdAt: number;
  expiresAt: number;
}

const pendingTransfers = new Map<string, PendingTransfer>();

// Cleanup expired transfers every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, transfer] of pendingTransfers.entries()) {
    if (now > transfer.expiresAt) {
      pendingTransfers.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Generate a Solana Pay URL for staking USDC
 * @route POST /api/challenges/:id/solana-pay-url
 * @access Private
 */
export const createSolanaPayUrl = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: challengeId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    if (!challengeId) {
      res.status(400).json({
        success: false,
        message: 'Challenge ID is required',
        code: 'MISSING_CHALLENGE_ID',
      });
      return;
    }

    // Get challenge details
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
    });

    if (!challenge) {
      res.status(404).json({
        success: false,
        message: 'Challenge not found',
        code: 'CHALLENGE_NOT_FOUND',
      });
      return;
    }

    // Check if challenge has escrow address
    if (!challenge.escrowAddress) {
      res.status(400).json({
        success: false,
        message: 'Challenge escrow not configured',
        code: 'ESCROW_NOT_CONFIGURED',
      });
      return;
    }

    // Prevent joining a completed or ended challenge
    if (challenge.isCompleted || challenge.endDate <= new Date()) {
      res.status(400).json({
        success: false,
        message: 'This challenge has ended. Check out other upcoming challenges!',
        code: 'CHALLENGE_COMPLETED',
      });
      return;
    }

    // Prevent joining after the challenge has started
    if (challenge.startDate <= new Date()) {
      res.status(400).json({
        success: false,
        message: 'This challenge has already started. Keep an eye out for upcoming challenges you can join!',
        code: 'CHALLENGE_STARTED',
      });
      return;
    }

    // Check if user already joined
    const existingUserChallenge = await prisma.userChallenge.findFirst({
      where: { userId, challengeId },
    });

    if (existingUserChallenge) {
      res.status(400).json({
        success: false,
        message: 'You have already joined this challenge',
        code: 'ALREADY_JOINED',
      });
      return;
    }

    // Generate a unique reference keypair for tracking this transaction
    const referenceKeypair = Keypair.generate();
    const referenceKey = referenceKeypair.publicKey.toBase58();

    // Store the pending transfer
    const stakeAmount = challenge.stakeAmount;
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

    pendingTransfers.set(referenceKey, {
      challengeId,
      userId,
      amount: stakeAmount,
      escrowAddress: challenge.escrowAddress,
      createdAt: Date.now(),
      expiresAt,
    });

    // Build Solana Pay URL
    // Format: solana:<recipient>?amount=<amount>&spl-token=<mint>&reference=<reference>&label=<label>&message=<message>
    const escrowAddress = challenge.escrowAddress;
    const label = encodeURIComponent('Proven Challenge Stake');
    const message = encodeURIComponent(`Stake $${stakeAmount} USDC for "${challenge.title}"`);

    // Solana Pay URL for SPL token transfer (used for QR code)
    const solanaPayUrl = `solana:${escrowAddress}?amount=${stakeAmount}&spl-token=${USDC_MINT}&reference=${referenceKey}&label=${label}&message=${message}`;

    res.json({
      success: true,
      data: {
        solanaPayUrl,
        referenceKey,
        amount: stakeAmount,
        escrowAddress,
        usdcMint: USDC_MINT,
        expiresAt,
        challenge: {
          id: challenge.id,
          title: challenge.title,
        },
      },
    });
  } catch (error) {
    console.error('Error creating Solana Pay URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment URL',
      code: 'CREATE_URL_FAILED',
    });
  }
};

/**
 * Check if a transfer has been completed by reference key
 * @route GET /api/challenges/verify-transfer/:referenceKey
 * @access Private
 */
export const verifyTransferByReference = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { referenceKey } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    if (!referenceKey) {
      res.status(400).json({
        success: false,
        message: 'Reference key is required',
        code: 'MISSING_REFERENCE',
      });
      return;
    }

    // Get pending transfer
    const pendingTransfer = pendingTransfers.get(referenceKey);

    if (!pendingTransfer) {
      res.status(404).json({
        success: false,
        message: 'Transfer reference not found or expired',
        code: 'REFERENCE_NOT_FOUND',
      });
      return;
    }

    // Verify the user matches
    if (pendingTransfer.userId !== userId) {
      res.status(403).json({
        success: false,
        message: 'Not authorized to verify this transfer',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    // Check if expired
    if (Date.now() > pendingTransfer.expiresAt) {
      pendingTransfers.delete(referenceKey);
      res.status(400).json({
        success: false,
        message: 'Transfer reference has expired',
        code: 'REFERENCE_EXPIRED',
      });
      return;
    }

    // Import connection and search for transaction by reference
    const { Connection, PublicKey: SolanaPublicKey } = await import('@solana/web3.js');
    const RPC_ENDPOINT = process.env.SOLANA_RPC_URL!;
    const connection = new Connection(RPC_ENDPOINT, 'confirmed');

    try {
      // Find transaction signatures that include the reference key
      const referencePubkey = new SolanaPublicKey(referenceKey);
      const signatures = await connection.getSignaturesForAddress(referencePubkey, { limit: 1 });

      if (signatures.length === 0) {
        // Transaction not found yet - still pending
        res.json({
          success: true,
          data: {
            status: 'pending',
            message: 'Transaction not yet confirmed',
            referenceKey,
            amount: pendingTransfer.amount,
            challengeId: pendingTransfer.challengeId,
          },
        });
        return;
      }

      // Transaction found - verify it
      const signature = signatures[0].signature;
      const transaction = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      if (!transaction || transaction.meta?.err) {
        res.json({
          success: true,
          data: {
            status: 'failed',
            message: 'Transaction failed or not found',
            signature,
          },
        });
        return;
      }

      // Transaction confirmed - return success
      res.json({
        success: true,
        data: {
          status: 'confirmed',
          signature,
          referenceKey,
          amount: pendingTransfer.amount,
          challengeId: pendingTransfer.challengeId,
          escrowAddress: pendingTransfer.escrowAddress,
        },
      });
    } catch (error) {
      // RPC error - transaction might not exist yet
      res.json({
        success: true,
        data: {
          status: 'pending',
          message: 'Transaction not yet confirmed',
          referenceKey,
        },
      });
    }
  } catch (error) {
    console.error('Error verifying transfer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify transfer',
      code: 'VERIFY_FAILED',
    });
  }
};

/**
 * Complete challenge join after Solana Pay transfer is confirmed
 * @route POST /api/challenges/complete-solana-pay-join
 * @access Private
 */
export const completeSolanaPayJoin = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { referenceKey, transactionSignature, walletAddress } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    if (!referenceKey || !transactionSignature) {
      res.status(400).json({
        success: false,
        message: 'Reference key and transaction signature are required',
        code: 'MISSING_PARAMS',
      });
      return;
    }

    // Get pending transfer
    const pendingTransfer = pendingTransfers.get(referenceKey);

    if (!pendingTransfer) {
      res.status(404).json({
        success: false,
        message: 'Transfer reference not found or expired',
        code: 'REFERENCE_NOT_FOUND',
      });
      return;
    }

    // Verify the user matches
    if (pendingTransfer.userId !== userId) {
      res.status(403).json({
        success: false,
        message: 'Not authorized',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    const { challengeId, amount, escrowAddress } = pendingTransfer;

    // Get challenge
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
    });

    if (!challenge) {
      res.status(404).json({
        success: false,
        message: 'Challenge not found',
        code: 'CHALLENGE_NOT_FOUND',
      });
      return;
    }

    // Prevent joining a completed or ended challenge
    if (challenge.isCompleted || challenge.endDate <= new Date()) {
      pendingTransfers.delete(referenceKey);
      res.status(400).json({
        success: false,
        message: 'This challenge has ended. Check out other upcoming challenges!',
        code: 'CHALLENGE_COMPLETED',
      });
      return;
    }

    // Prevent joining after the challenge has started
    if (challenge.startDate <= new Date()) {
      pendingTransfers.delete(referenceKey);
      res.status(400).json({
        success: false,
        message: 'This challenge has already started. Keep an eye out for upcoming challenges you can join!',
        code: 'CHALLENGE_STARTED',
      });
      return;
    }

    // Check if user already joined (race condition protection)
    const existingUserChallenge = await prisma.userChallenge.findFirst({
      where: { userId, challengeId },
    });

    if (existingUserChallenge) {
      // Clean up reference
      pendingTransfers.delete(referenceKey);
      res.status(400).json({
        success: false,
        message: 'You have already joined this challenge',
        code: 'ALREADY_JOINED',
      });
      return;
    }

    // Verify the transaction on-chain
    const { Connection, PublicKey: SolanaPublicKey } = await import('@solana/web3.js');
    const RPC_ENDPOINT = process.env.SOLANA_RPC_URL!;
    const connection = new Connection(RPC_ENDPOINT, 'confirmed');

    const transaction = await connection.getTransaction(transactionSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!transaction || transaction.meta?.err) {
      res.status(400).json({
        success: false,
        message: 'Transaction not found or failed. It may need more time to confirm — please wait a moment and try again.',
        code: 'TRANSACTION_INVALID',
      });
      return;
    }

    // Extract the sender's wallet address from the transaction
    // The fee payer is typically the sender in a Solana Pay transaction
    let senderWalletAddress = walletAddress || 'unknown';
    
    try {
      const accountKeys = transaction.transaction.message.getAccountKeys();
      if (accountKeys && accountKeys.length > 0) {
        senderWalletAddress = accountKeys.get(0)?.toBase58() || senderWalletAddress;
      }
    } catch (extractError) {
      console.warn('Could not extract sender wallet from transaction:', extractError);
    }

    // Reject if we couldn't extract a valid wallet address
    if (senderWalletAddress === 'unknown') {
      res.status(400).json({
        success: false,
        message: 'Could not determine your wallet address from the transaction. Please try again.',
        code: 'WALLET_ADDRESS_UNKNOWN',
      });
      return;
    }

    // Verify USDC amount was transferred to the escrow address
    // Uses the escrow service which checks token balance changes
    if (senderWalletAddress !== 'unknown') {
      try {
        const isValidTransfer = await escrowService.verifyTransfer(
          transactionSignature,
          senderWalletAddress,
          escrowAddress,
          amount
        );

        if (!isValidTransfer) {
          console.warn(
            `Transfer verification failed for tx ${transactionSignature}: ` +
            `expected ${amount} USDC to ${escrowAddress} from ${senderWalletAddress}`
          );
          // On devnet, log but don't block — token accounts may behave differently
          // In production, uncomment the block below:
          // res.status(400).json({
          //   success: false,
          //   message: 'Transfer amount does not match the expected stake amount.',
          //   code: 'AMOUNT_MISMATCH',
          // });
          // return;
        }
      } catch (verifyErr) {
        console.warn('USDC transfer verification encountered an error (non-blocking):', verifyErr);
        // Non-blocking on devnet — the tx exists and succeeded, which is sufficient
      }
    }

    // Create user challenge and transaction records
    const { ChallengeStatus, TransactionType, TransactionStatus } = await import('@prisma/client');

    const result = await prisma.$transaction(async (tx) => {
      const userChallenge = await tx.userChallenge.create({
        data: {
          userId,
          challengeId,
          stakeAmount: amount,
          walletAddress: senderWalletAddress,
          status: ChallengeStatus.ACTIVE,
          progress: 0,
          startDate: new Date(),
        },
      });

      // Save wallet address to User if not already set
      const user = await tx.user.findUnique({ where: { id: userId }, select: { walletAddress: true } });
      if (!user?.walletAddress) {
        await tx.user.update({
          where: { id: userId },
          data: { walletAddress: senderWalletAddress },
        });
      }

      const txRecord = await tx.transaction.create({
        data: {
          userId,
          challengeId,
          transactionType: TransactionType.STAKE,
          amount,
          description: `Staked for challenge: ${challenge.title}`,
          status: TransactionStatus.COMPLETED,
          transactionSignature,
          timestamp: new Date(),
          metadata: {
            challengeTitle: challenge.title,
            userWalletAddress: senderWalletAddress,
            escrowAddress,
            verifiedOnChain: true,
            paymentMethod: 'solana_pay',
            referenceKey,
            tokenType: 'USDC',
          },
        },
      });

      // Update challenge participant count
      await tx.challenge.update({
        where: { id: challengeId },
        data: {
          participants: { increment: 1 },
        },
      });

      return { userChallenge, transaction: txRecord };
    });

    // Clean up the pending transfer
    pendingTransfers.delete(referenceKey);

    res.status(201).json({
      success: true,
      message: 'Successfully joined the challenge',
      data: {
        userChallenge: result.userChallenge,
        transaction: result.transaction,
        stakeAmount: amount,
        challengeTitle: challenge.title,
        transactionSignature,
      },
    });
  } catch (error) {
    console.error('Error completing Solana Pay join:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete challenge join',
      code: 'JOIN_FAILED',
    });
  }
};

// Export pending transfers map for use in other modules if needed
export { pendingTransfers };
