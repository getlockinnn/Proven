import { Response } from 'express';
import prisma from '../../lib/prisma';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';

/**
 * Update user's profile
 * @route PUT /api/users/me
 * @access Private (requires authentication)
 * @description Updates the authenticated user's profile information
 */
export const updateUserProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // The authenticate middleware ensures req.user exists
    const userId = req.user!.id;
    await updateAndReturnUserProfile(userId, req.body, res);
    return;
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Failed to update user profile' 
    });
  }
};

/**
 * Helper function to update and return a user's profile
 * @private
 */
async function updateAndReturnUserProfile(userId: string, data: any, res: Response) {
  try {
    const { name, preferredName, bio, image, walletAddress } = data;

    // Prepare update data - only include fields that were provided
    const updateData: any = {};
    if (name !== undefined && name !== null) updateData.name = name;
    if (preferredName !== undefined && preferredName !== null) updateData.preferredName = preferredName;
    if (bio !== undefined && bio !== null) updateData.bio = bio;
    if (image !== undefined && image !== null) updateData.image = image;
    if (walletAddress !== undefined && walletAddress !== null) updateData.walletAddress = walletAddress;
    
    
    // Check if any valid fields were provided BEFORE attempting update
    if (Object.keys(updateData).length === 0) {
      res.status(400).json({
        success: false,
        error: 'No valid fields provided for update',
        message: 'Please provide at least one field to update (name, preferredName, bio, image, or walletAddress)',
        received: data
      });
      return;
    }
    
    // Update user profile in database
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        preferredName: true,
        bio: true,
        email: true,
        image: true,
        walletAddress: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser,
      updated_fields: Object.keys(updateData)
    });
    return;
  } catch (error: any) {
    
    // Handle specific Prisma errors
    if (error.code === 'P2002') {
      res.status(400).json({ 
        success: false,
        error: 'A field with this value already exists' 
      });
      return;
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to update user profile',
      details: error.message
    });
    return;
  }
}