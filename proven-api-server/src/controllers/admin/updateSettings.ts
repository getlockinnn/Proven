import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { logAdminAction, AuditActions } from '../../services/auditService';

/**
 * Update system settings
 * @route PATCH /api/admin/settings
 * @access Private (Admin only)
 */
export const updateSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      proofCutoffTime,
      reviewWindowHours,
      maxProofsPerDay,
      allowedFileTypes,
      emergencyPause,
    } = req.body;

    // Get current settings for comparison
    const currentSettings = await prisma.systemSettings.findUnique({
      where: { id: 'global' },
    });

    // Build update data
    const updateData: any = {
      updatedBy: req.user?.id,
    };

    const changes: string[] = [];

    if (proofCutoffTime !== undefined) {
      updateData.proofCutoffTime = proofCutoffTime;
      if (currentSettings?.proofCutoffTime !== proofCutoffTime) {
        changes.push(`cutoff time: ${proofCutoffTime}`);
      }
    }

    if (reviewWindowHours !== undefined) {
      updateData.reviewWindowHours = reviewWindowHours;
      if (currentSettings?.reviewWindowHours !== reviewWindowHours) {
        changes.push(`review window: ${reviewWindowHours}h`);
      }
    }

    if (maxProofsPerDay !== undefined) {
      updateData.maxProofsPerDay = maxProofsPerDay;
      if (currentSettings?.maxProofsPerDay !== maxProofsPerDay) {
        changes.push(`max proofs: ${maxProofsPerDay}`);
      }
    }

    if (allowedFileTypes !== undefined) {
      updateData.allowedFileTypes = allowedFileTypes;
      changes.push(`file types updated`);
    }

    if (emergencyPause !== undefined) {
      updateData.emergencyPause = emergencyPause;
      if (currentSettings?.emergencyPause !== emergencyPause) {
        changes.push(emergencyPause ? 'emergency pause enabled' : 'emergency pause disabled');
      }
    }

    // Upsert settings
    const settings = await prisma.systemSettings.upsert({
      where: { id: 'global' },
      update: updateData,
      create: {
        id: 'global',
        ...updateData,
      },
    });

    // Log admin action
    if (changes.length > 0) {
      const isEmergencyAction =
        emergencyPause !== undefined && emergencyPause !== currentSettings?.emergencyPause;

      await logAdminAction({
        action: isEmergencyAction
          ? emergencyPause
            ? AuditActions.EMERGENCY_PAUSE_ENABLED
            : AuditActions.EMERGENCY_PAUSE_DISABLED
          : AuditActions.SETTINGS_UPDATED,
        actor: req.user?.email || 'unknown',
        actorId: req.user?.id,
        target: 'system',
        details: `Updated system settings: ${changes.join(', ')}`,
        type: isEmergencyAction ? 'DESTRUCTIVE' : 'INFO',
        metadata: {
          changes,
          newSettings: updateData,
        },
      });
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
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
      },
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
