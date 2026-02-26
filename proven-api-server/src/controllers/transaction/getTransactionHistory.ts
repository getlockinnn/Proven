import { Request, Response } from 'express';
import prisma from '../../lib/prisma';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';

/**
 * Get transaction history for the authenticated user
 * Returns only essential transaction data with minimal challenge details
 */
export const getTransactionHistory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get user ID from authenticated request
    const userId = req.user?.id;
    
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    // Get all transactions for the user with minimal challenge details
    const transactions = await prisma.transaction.findMany({
      where: {
        userId: userId,
      },
      select: {
        challengeId: true,
        transactionType: true,
        amount: true,
        timestamp: true,
        status: true,
        transactionSignature: true,
        metadata: true,
        challenge: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    res.status(200).json({
      success: true,
      transactions,
    });
    return;
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction history',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return;
  }
};
