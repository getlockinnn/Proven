import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { logAdminAction, AuditActions, formatWallet } from '../../services/auditService';
import { getChallengeDayBoundary, getChallengeDayNumber } from '../../utils/timeUtils';

const getMetadataObject = (value: Prisma.JsonValue | null): Prisma.JsonObject => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Prisma.JsonObject;
};

/**
 * Flag a proof for additional review
 * @route POST /api/admin/proofs/:id/flag
 * @access Private (Admin only)
 */
export const flagProof = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    const submission = await prisma.submission.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, walletAddress: true },
        },
        challenge: {
          select: { id: true, title: true, startDate: true },
        },
      },
    });

    if (!submission) {
      res.status(404).json({
        success: false,
        message: 'Submission not found',
      });
      return;
    }

    const challengeDateKey = getChallengeDayBoundary().getClientDateKey;
    const challengeStart = new Date(submission.challenge.startDate);
    const submissionDate = new Date(submission.submissionDate);
    const dayNumber = getChallengeDayNumber(challengeStart, submissionDate, challengeDateKey);

    // Update submission with flag note in metadata
    const currentMetadata = getMetadataObject(submission.metadata);
    const result = await prisma.submission.update({
      where: { id },
      data: {
        metadata: {
          ...currentMetadata,
          flagged: true,
          flaggedBy: req.user?.id,
          flaggedAt: new Date().toISOString(),
          flagNote: note,
        },
      },
    });

    // Log admin action
    await logAdminAction({
      action: AuditActions.PROOF_FLAGGED,
      actor: req.user?.email || 'unknown',
      actorId: req.user?.id,
      target: formatWallet(submission.user.walletAddress || submission.user.id),
      details: `Flagged Day ${dayNumber} proof for ${submission.challenge.title} for re-review`,
      type: 'WARNING',
      metadata: {
        submissionId: id,
        challengeId: submission.challenge.id,
        userId: submission.user.id,
        dayNumber,
        note,
      },
    });

    res.json({
      success: true,
      message: 'Proof flagged for review',
      data: {
        id: result.id,
        flagged: true,
      },
    });
  } catch (error) {
    console.error('Error flagging proof:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to flag proof',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
