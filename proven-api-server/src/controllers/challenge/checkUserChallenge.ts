import { Response } from 'express';
import { AuthenticatedRequest } from "../../middleware/authMiddleware";
import prisma from '../../lib/prisma';

/**
 * Check if a user has already joined a challenge
 * @route GET /api/challenges/:challengeId/check
 * @access Private (requires authentication)
 */
export const checkUserChallenge = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { challengeId } = req.params;
    
    if (!challengeId) {
      res.status(400).json({ 
        success: false, 
        message: 'Challenge ID is required' 
      });
      return;
    }
    
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }
    
    // Get the authenticated user's ID
    const userId = req.user.id;
    
    // Check if user already joined this challenge
    const existingUserChallenge = await prisma.userChallenge.findFirst({
      where: {
        userId: userId,
        challengeId: challengeId,
      },
    });
    
    res.status(200).json({
      success: true,
      hasJoined: existingUserChallenge ? true : false,
      userChallenge: existingUserChallenge || null
    });
    return;
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to check user challenge status' 
    });
    return;
  }
};