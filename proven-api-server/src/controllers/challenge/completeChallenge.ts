import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { ChallengeStatus, TransactionType, TransactionStatus } from '@prisma/client';

/**
 * Complete a challenge and distribute rewards
 * @route POST /api/challenges/:challengeId/complete
 * @access Private (requires authentication - admin only for now)
 */
export const completeChallenge = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { challengeId } = req.params;
    const { completionThreshold = 80 } = req.body; // Default 80% completion required
    
    if (!challengeId) {
      res.status(400).json({
        success: false,
        message: 'Challenge ID is required'
      });
      return;
    }
    
    if (!req.user || !req.user.id) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }
    
    const adminId = req.user.id;
    
    // Get challenge with all participants
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        userChallenges: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });
    
    if (!challenge) {
      res.status(404).json({
        success: false,
        message: 'Challenge not found'
      });
      return;
    }
    
    // Check if challenge is already completed
    if (challenge.isCompleted) {
      res.status(400).json({
        success: false,
        message: 'Challenge has already been completed'
      });
      return;
    }
    
    // Check if challenge has ended
    if (challenge.endDate > new Date()) {
      res.status(400).json({
        success: false,
        message: 'Challenge has not ended yet',
        data: {
          endDate: challenge.endDate,
          daysRemaining: Math.ceil((challenge.endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        }
      });
      return;
    }
    
    // Separate winners and losers based on completion threshold
    const winners = challenge.userChallenges.filter(uc => uc.progress >= completionThreshold);
    const losers = challenge.userChallenges.filter(uc => uc.progress < completionThreshold);
    
    // Calculate total stakes
    const totalStaked = challenge.userChallenges.reduce((sum, uc) => sum + uc.stakeAmount, 0);
    const totalLoserStakes = losers.reduce((sum, uc) => sum + uc.stakeAmount, 0);
    const totalWinnerStakes = winners.reduce((sum, uc) => sum + uc.stakeAmount, 0);
    
    // Calculate rewards for winners
    const rewardPool = totalLoserStakes; // Losers' stakes go to winners
    const individualRewardShare = winners.length > 0 ? rewardPool / winners.length : 0;

    // Execute completion in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const transactions = [];
      const updatedUserChallenges = [];
      
      // Process winners - they get their stake back + share of reward pool
      for (const winner of winners) {
        const totalReward = winner.stakeAmount + individualRewardShare;
        
        // Update user challenge status to COMPLETED
        const updatedUserChallenge = await tx.userChallenge.update({
          where: { id: winner.id },
          data: {
            status: ChallengeStatus.COMPLETED,
            endDate: new Date()
          }
        });
        updatedUserChallenges.push(updatedUserChallenge);
        
        // Create reward transaction
        const rewardTransaction = await tx.transaction.create({
          data: {
            userId: winner.userId,
            challengeId: challengeId,
            transactionType: TransactionType.REWARD,
            amount: totalReward,
            description: `Challenge completed! Stake returned + reward for "${challenge.title}"`,
            status: TransactionStatus.COMPLETED,
            metadata: {
              challengeTitle: challenge.title,
              stakeReturned: winner.stakeAmount,
              bonusReward: individualRewardShare,
              completionRate: winner.progress,
              rank: 'winner'
            }
          }
        });
        transactions.push(rewardTransaction);
      }
      
      // Process losers - they lose their stake (no transactions needed as they don't get anything back)
      for (const loser of losers) {
        // Update user challenge status to FAILED
        const updatedUserChallenge = await tx.userChallenge.update({
          where: { id: loser.id },
          data: {
            status: ChallengeStatus.FAILED,
            endDate: new Date()
          }
        });
        updatedUserChallenges.push(updatedUserChallenge);
        
        // Create a record transaction showing the loss
        const lossTransaction = await tx.transaction.create({
          data: {
            userId: loser.userId,
            challengeId: challengeId,
            transactionType: TransactionType.STAKE,
            amount: -loser.stakeAmount, // Negative amount to show loss
            description: `Challenge not completed. Stake forfeited for "${challenge.title}"`,
            status: TransactionStatus.COMPLETED,
            metadata: {
              challengeTitle: challenge.title,
              stakeLost: loser.stakeAmount,
              completionRate: loser.progress,
              rank: 'loser',
              requiredProgress: completionThreshold
            }
          }
        });
        transactions.push(lossTransaction);
      }
      
      // Mark challenge as completed
      const updatedChallenge = await tx.challenge.update({
        where: { id: challengeId },
        data: {
          isCompleted: true,
          completedAt: new Date(),
        }
      });
      
      return {
        updatedChallenge,
        updatedUserChallenges,
        transactions,
        winners: winners.map(w => ({
          userId: w.userId,
          userName: w.user.name,
          progress: w.progress,
          stakeAmount: w.stakeAmount,
          totalReward: w.stakeAmount + individualRewardShare
        })),
        losers: losers.map(l => ({
          userId: l.userId,
          userName: l.user.name,
          progress: l.progress,
          stakeAmount: l.stakeAmount
        }))
      };
    });

    res.json({
      success: true,
      message: `Challenge "${challenge.title}" completed successfully`,
      data: {
        challenge: {
          id: challenge.id,
          title: challenge.title,
          endDate: challenge.endDate,
          completionThreshold: `${completionThreshold}%`
        },
        results: {
          totalParticipants: challenge.userChallenges.length,
          winners: result.winners,
          losers: result.losers,
          statistics: {
            totalStaked,
            totalRewardsDistributed: result.winners.reduce((sum, w) => sum + w.totalReward, 0),
            averageCompletionRate: challenge.userChallenges.reduce((sum, uc) => sum + uc.progress, 0) / challenge.userChallenges.length,
            successRate: `${((result.winners.length / challenge.userChallenges.length) * 100).toFixed(1)}%`
          }
        },
        transactionsSummary: {
          rewardTransactions: result.transactions.filter(t => t.transactionType === 'REWARD').length,
          lossRecords: result.transactions.filter(t => t.transactionType === 'STAKE' && t.amount < 0).length
        }
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to complete challenge',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
}; 
