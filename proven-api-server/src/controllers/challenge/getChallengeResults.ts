import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';

/**
 * Get challenge results and leaderboard
 * @route GET /api/challenges/:challengeId/results
 * @access Private (requires authentication)
 */
export const getChallengeResults = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { challengeId } = req.params;
    
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
    
    // Get challenge with participants and their results
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        userChallenges: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true
              }
            },
            submissions: {
              where: {
                status: 'APPROVED'
              },
              select: {
                id: true,
                submissionDate: true
              }
            }
          },
          orderBy: {
            progress: 'desc' // Highest progress first
          }
        },
        transactions: {
          where: {
            transactionType: {
              in: ['REWARD', 'STAKE']
            }
          },
          include: {
            user: {
              select: {
                id: true,
                name: true
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
    
    // Check if challenge has any completed participants
    const isCompleted = challenge.userChallenges.some(uc => 
      uc.status === 'COMPLETED' || uc.status === 'FAILED'
    );
    
    if (!isCompleted) {
      res.status(400).json({
        success: false,
        message: 'Challenge has not been completed yet',
        data: {
          status: 'active',
          endDate: challenge.endDate,
          participantCount: challenge.userChallenges.length
        }
      });
      return;
    }
    
    // Separate winners and losers
    const winners = challenge.userChallenges.filter(uc => uc.status === 'COMPLETED');
    const losers = challenge.userChallenges.filter(uc => uc.status === 'FAILED');
    
    // Calculate statistics
    const totalParticipants = challenge.userChallenges.length;
    const totalStaked = challenge.userChallenges.reduce((sum, uc) => sum + uc.stakeAmount, 0);
    const averageProgress = challenge.userChallenges.reduce((sum, uc) => sum + uc.progress, 0) / totalParticipants;
    
    // Get reward transactions
    const rewardTransactions = challenge.transactions.filter(t => t.transactionType === 'REWARD');
    const totalRewardsDistributed = rewardTransactions.reduce((sum, t) => sum + t.amount, 0);
    
    // Build leaderboard with rankings
    const leaderboard = challenge.userChallenges.map((userChallenge, index) => {
      const approvedSubmissions = userChallenge.submissions.length;
      const rewardTransaction = rewardTransactions.find(t => t.userId === userChallenge.userId);
      
      return {
        rank: index + 1,
        user: {
          id: userChallenge.user.id,
          name: userChallenge.user.name,
          email: userChallenge.user.email,
          image: userChallenge.user.image
        },
        performance: {
          progress: userChallenge.progress,
          progressFormatted: `${userChallenge.progress.toFixed(1)}%`,
          status: userChallenge.status,
          approvedSubmissions,
          stakeAmount: userChallenge.stakeAmount,
          startDate: userChallenge.startDate,
          endDate: userChallenge.endDate
        },
        reward: rewardTransaction ? {
          amount: rewardTransaction.amount,
          description: rewardTransaction.description,
          receivedAt: rewardTransaction.timestamp
        } : null
      };
    });
    
    // Get user's own result if they participated
    const userResult = challenge.userChallenges.find(uc => uc.userId === req.user!.id);

    res.json({
      success: true,
      data: {
        challenge: {
          id: challenge.id,
          title: challenge.title,
          description: challenge.description,
          startDate: challenge.startDate,
          endDate: challenge.endDate,
          image: challenge.image
        },
        results: {
          isCompleted: true,
          statistics: {
            totalParticipants,
            winners: winners.length,
            losers: losers.length,
            successRate: `${((winners.length / totalParticipants) * 100).toFixed(1)}%`,
            averageProgress: `${averageProgress.toFixed(1)}%`,
            totalStaked,
            totalRewardsDistributed
          },
          leaderboard,
          winners: winners.map(w => ({
            userId: w.userId,
            userName: w.user.name,
            progress: w.progress,
            reward: rewardTransactions.find(t => t.userId === w.userId)?.amount || 0
          })),
          losers: losers.map(l => ({
            userId: l.userId,
            userName: l.user.name,
            progress: l.progress,
            stakeLost: l.stakeAmount
          }))
        },
        userResult: userResult ? {
          participated: true,
          rank: leaderboard.findIndex(l => l.user.id === userResult.userId) + 1,
          progress: userResult.progress,
          status: userResult.status,
          stakeAmount: userResult.stakeAmount,
          reward: rewardTransactions.find(t => t.userId === userResult.userId)?.amount || 0,
          message: userResult.status === 'COMPLETED' 
            ? '🎉 Congratulations! You completed the challenge!' 
            : '😔 You didn\'t complete this challenge, but don\'t give up!'
        } : {
          participated: false,
          message: 'You did not participate in this challenge'
        }
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch challenge results',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
}; 