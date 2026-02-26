import { Request, Response } from 'express';
import prisma from '../../lib/prisma';
import { cache } from '../../lib/cache';

/**
 * Get all challenges
 * @route GET /api/challenges
 * @access Public (with authentication)
 */
export const getAllChallenges = async (req: Request, res: Response) => {
  try {
    const cached = cache.get<any[]>('challenges:all');
    if (cached) {
      res.json(cached);
      return;
    }

    const challenges = await prisma.challenge.findMany({
      include: {
        creator: true
      },
    });

    // Transform the data to match the frontend interface
    const transformedChallenges = challenges.map(challenge => ({
      id: challenge.id,
      title: challenge.title,
      type: challenge.verificationType,
      sponsor: challenge.sponsor || challenge.creator?.name || 'Unknown',
      hostType: challenge.hostType || 'PERSONAL',
      duration: `${Math.ceil((challenge.endDate.getTime() - challenge.startDate.getTime()) / (1000 * 60 * 60 * 24))} days`,
      difficulty: challenge.difficulty,
      userStake: challenge.stakeAmount,
      stakeAmount: challenge.stakeAmount, // Alias for client consistency
      totalPrizePool: challenge.totalPrizePool || challenge.stakeAmount * 2,
      participants: challenge.participants || 0,
      metrics: challenge.metrics,
      trackingMetrics: challenge.trackingMetrics || challenge.rules || [],
      image: challenge.image || process.env.DEFAULT_CHALLENGE_IMAGE_URL,
      description: challenge.description || '',
      rules: challenge.rules || [],
      startDate: challenge.startDate.toISOString(),
      endDate: challenge.endDate.toISOString(),
      escrowAddress: challenge.escrowAddress || undefined,
      isCompleted: challenge.isCompleted,
      tokenType: 'USDC' as const,
      creator: {
        id: challenge.creator?.id || '',
        name: challenge.creator?.name || 'Unknown',
        image: challenge.creator?.image || ''
      }
    }));

    // Cache for 30s to smooth out bursts
    cache.set('challenges:all', transformedChallenges, 30_000);
    res.json(transformedChallenges);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
};
