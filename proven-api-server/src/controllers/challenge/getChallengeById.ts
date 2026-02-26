import { Request, Response } from 'express';
import prisma from '../../lib/prisma';

/**
 * Get a single challenge by ID
 * @route GET /api/challenges/:id
 * @access Public
 */
export const getChallengeById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      res.status(400).json({
        success: false,
        message: 'Challenge ID is required'
      });
      return;
    }

    const challenge = await prisma.challenge.findUnique({
      where: { id },
      include: {
        creator: true
      },
    });

    if (!challenge) {
      res.status(404).json({
        success: false,
        message: 'Challenge not found'
      });
      return;
    }

    // Transform the data to match the frontend interface
    const transformedChallenge = {
      id: challenge.id,
      title: challenge.title,
      type: challenge.verificationType,
      sponsor: challenge.sponsor || challenge.creator?.name || '',
      hostType: challenge.hostType || '',
      duration: `${Math.ceil((challenge.endDate.getTime() - challenge.startDate.getTime()) / (1000 * 60 * 60 * 24))} days`,
      difficulty: challenge.difficulty,
      userStake: challenge.stakeAmount,
      stakeAmount: challenge.stakeAmount, // Alias for blockchain compatibility
      totalPrizePool: challenge.totalPrizePool,
      participants: challenge.participants || 0,
      metrics: challenge.metrics,
      trackingMetrics: challenge.trackingMetrics || challenge.rules || [],
      image: challenge.image,
      description: challenge.description || '',
      rules: challenge.rules || [],
      startDate: challenge.startDate.toISOString(),
      endDate: challenge.endDate.toISOString(),
      isCompleted: challenge.isCompleted,
      escrowAddress: challenge.escrowAddress || undefined, // Escrow wallet address
      blockchainId: (challenge as any).blockchainId || undefined, // Deprecated - use escrowAddress
      tokenType: 'USDC' as const, // Default to USDC for blockchain challenges
      creator: {
        id: challenge.creator?.id || '',
        name: challenge.creator?.name || '',
        image: challenge.creator?.image || ''
      }
    };

    res.json(transformedChallenge);
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch challenge' 
    });
  }
}; 