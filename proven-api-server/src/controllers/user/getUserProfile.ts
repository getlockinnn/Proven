import { Request, Response } from 'express';
import prisma from '../../lib/prisma';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { Prisma } from '@prisma/client';
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../../config';
import { addDaysToDateKey, diffDateKeys, getChallengeDayBoundary } from '../../utils/timeUtils';

const connection = new Connection(config.solana.rpcUrl, 'confirmed');
const usdcMint = new PublicKey(config.solana.usdcMint);

/**
 * Get current user's profile
 * @route GET /api/users/me
 * @access Private (requires authentication)
 * @description Retrieves the authenticated user's profile information including their stats
 */
export const getUserProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // The authenticate middleware ensures req.user exists
    const userId = req.user!.id;
    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    const userEmail = req.user?.email?.toLowerCase().trim();
    const isAdmin =
      !!req.user?.isAdmin ||
      (!!userEmail && adminEmails.length > 0 && adminEmails.includes(userEmail));
    await fetchAndReturnUserProfile(userId, isAdmin, res);
    return;
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user profile' });
    return;
  }
};

/**
 * Get current user's profile stats
 * @route GET /api/users/me/stats
 * @access Private (requires authentication)
 */
export const getUserStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const userId = req.user.id;

    const [pendingProofs, approvedProofs, rejectedProofs, streak] = await Promise.all([
      prisma.submission.count({
        where: {
          userId,
          status: 'PENDING',
        },
      }),
      prisma.submission.count({
        where: {
          userId,
          status: 'APPROVED',
        },
      }),
      prisma.submission.count({
        where: {
          userId,
          status: 'REJECTED',
        },
      }),
      calculateApprovedSubmissionStreak(userId),
    ]);

    const proofsSubmitted = pendingProofs + approvedProofs + rejectedProofs;

    res.json({
      streak,
      proofsSubmitted,
      proofBreakdown: {
        pending: pendingProofs,
        approved: approvedProofs,
        rejected: rejectedProofs,
      },
    });
    return;
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user stats' });
    return;
  }
};

/**
 * Helper function to fetch and return a user's profile
 * @private
 */
async function fetchAndReturnUserProfile(userId: string, isAdmin: boolean, res: Response) {
  try {
    const [user, pendingProofs, approvedProofs, rejectedProofs] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          preferredName: true,
          bio: true,
          email: true,
          image: true,
          walletAddress: true,
          createdAt: true,
          updatedAt: true,
          // Count for active and completed challenges
          userChallenges: {
            select: {
              status: true
            }
          }
        }
      }),
      prisma.submission.count({
        where: {
          userId,
          status: 'PENDING',
        },
      }),
      prisma.submission.count({
        where: {
          userId,
          status: 'APPROVED',
        },
      }),
      prisma.submission.count({
        where: {
          userId,
          status: 'REJECTED',
        },
      }),
    ]);

    const proofsSubmitted = pendingProofs + approvedProofs + rejectedProofs;
    
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const resolvedWalletAddress = user.walletAddress || await resolveWalletAddressFromLatestStake(userId);
    const walletBalanceUsdc = await getWalletUsdcBalance(resolvedWalletAddress);
    
    // Count active and completed challenges
    const stats = {
      active: 0,
      completed: 0,
      proofsSubmitted,
      proofBreakdown: {
        pending: pendingProofs,
        approved: approvedProofs,
        rejected: rejectedProofs,
      },
    };
    
    user.userChallenges.forEach(challenge => {
      if (challenge.status === 'ACTIVE') {
        stats.active++;
      } else if (challenge.status === 'COMPLETED') {
        stats.completed++;
      }
    });
    
    // Remove the raw userChallenges from the response
    const { userChallenges, ...userData } = user;
    
    res.json({
      ...userData,
      walletAddress: resolvedWalletAddress,
      walletBalanceUsdc,
      stats,
      isAdmin,
    });
    return;
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user profile' });
    return;
  }
}

async function resolveWalletAddressFromLatestStake(userId: string): Promise<string | null> {
  const latestStake = await prisma.transaction.findFirst({
    where: {
      userId,
      transactionType: 'STAKE',
      status: 'COMPLETED',
      metadata: { not: Prisma.AnyNull },
    },
    orderBy: { createdAt: 'desc' },
    select: { metadata: true },
  });

  if (!latestStake?.metadata || typeof latestStake.metadata !== 'object' || Array.isArray(latestStake.metadata)) {
    return null;
  }

  const candidate = (latestStake.metadata as Record<string, unknown>).userWalletAddress;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

async function getWalletUsdcBalance(walletAddress: string | null): Promise<number> {
  if (!walletAddress) return 0;

  try {
    const owner = new PublicKey(walletAddress);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, { mint: usdcMint });

    const totalBalance = tokenAccounts.value.reduce((sum, tokenAccount) => {
      const tokenAmount = tokenAccount.account.data.parsed.info.tokenAmount;
      const uiAmount =
        typeof tokenAmount.uiAmount === 'number'
          ? tokenAmount.uiAmount
          : parseFloat(tokenAmount.uiAmountString || '0');

      return Number.isFinite(uiAmount) ? sum + uiAmount : sum;
    }, 0);

    return Number(totalBalance.toFixed(6));
  } catch (error) {
    console.warn('[users/me] Failed to fetch on-chain USDC balance:', error);
    return 0;
  }
}

async function calculateApprovedSubmissionStreak(userId: string): Promise<number> {
  const challengeDayBoundary = getChallengeDayBoundary();
  const toDateKey = challengeDayBoundary.getClientDateKey;

  const approvedSubmissions = await prisma.submission.findMany({
    where: {
      userId,
      status: 'APPROVED',
    },
    orderBy: {
      submissionDate: 'desc',
    },
    select: {
      submissionDate: true,
    },
  });

  if (approvedSubmissions.length === 0) return 0;

  const uniqueDateKeys = [...new Set(
    approvedSubmissions.map((submission) => toDateKey(new Date(submission.submissionDate)))
  )];

  if (uniqueDateKeys.length === 0) return 0;

  const todayKey = challengeDayBoundary.todayStr;
  const yesterdayKey = addDaysToDateKey(todayKey, -1);
  if (uniqueDateKeys[0] !== todayKey && uniqueDateKeys[0] !== yesterdayKey) {
    return 0;
  }

  let streak = 1;
  for (let i = 1; i < uniqueDateKeys.length; i++) {
    const previousKey = uniqueDateKeys[i - 1];
    const currentKey = uniqueDateKeys[i];
    if (diffDateKeys(currentKey, previousKey) === 1) {
      streak += 1;
      continue;
    }
    break;
  }

  return streak;
}
