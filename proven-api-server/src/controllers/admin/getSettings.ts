import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';

/**
 * Get system settings
 * @route GET /api/admin/settings
 * @access Private (Admin only)
 */
export const getSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get or create default settings
    let settings = await prisma.systemSettings.findUnique({
      where: { id: 'global' },
    });

    if (!settings) {
      settings = await prisma.systemSettings.create({
        data: {
          id: 'global',
          proofCutoffTime: '23:00',
          reviewWindowHours: 24,
          maxProofsPerDay: 1,
          allowedFileTypes: ['jpg', 'png', 'heic', 'mp4', 'mov', 'webp'],
          emergencyPause: false,
        },
      });
    }

    // Get admin users for role management
    const adminUsers = await prisma.user.findMany({
      where: { isAdmin: true },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    });

    res.json({
      success: true,
      data: {
        settings: {
          proofCutoffTime: settings.proofCutoffTime,
          reviewWindowHours: settings.reviewWindowHours,
          maxProofsPerDay: settings.maxProofsPerDay,
          allowedFileTypes: settings.allowedFileTypes,
          emergencyPause: settings.emergencyPause,
          updatedAt: settings.updatedAt,
          updatedBy: settings.updatedBy,
        },
        adminUsers,
      },
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
