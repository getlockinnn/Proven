import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { supabase, SUPABASE_URL_VALUE } from '../../lib/supabase';
import { sendNotification, getChallengeProgress } from '../../services/notificationService';
import { NotificationType } from '@prisma/client';
import { getChallengeDayBoundary, getChallengeTotalDays, addDaysToDateKey } from '../../utils/timeUtils';

/**
 * Submit daily proof for a challenge
 * @route POST /api/submissions/submit
 * @access Private (requires authentication)
 */
export const submitProof = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userChallengeId, imageUrl, imagePath, description, walletAddress } = req.body;

    if (!userChallengeId || (!imageUrl && !imagePath)) {
      res.status(400).json({
        success: false,
        message: 'Please provide both the challenge and proof image to continue.',
        code: 'MISSING_REQUIRED_FIELDS',
      });
      return;
    }

    if (!req.user || !req.user.id) {
      res.status(401).json({
        success: false,
        message: 'Please sign in to submit your proof.',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    const userId = req.user.id;

    // Verify the user challenge exists and belongs to the authenticated user
    const userChallenge = await prisma.userChallenge.findFirst({
      where: {
        id: userChallengeId,
        userId: userId
      },
      include: {
        challenge: {
          select: {
            id: true,
            title: true,
            startDate: true,
            endDate: true
          }
        }
      }
    });

    if (!userChallenge) {
      res.status(404).json({
        success: false,
        message: 'You need to join this challenge before submitting proof.',
        code: 'NOT_ENROLLED',
      });
      return;
    }

    const {
      todayStr,
      todayMidnightUTC,
      tomorrowMidnightUTC,
      getClientDateKey
    } = getChallengeDayBoundary();

    // Determine user's active window in canonical challenge day context (IST)
    const chStartStr = getClientDateKey(new Date(userChallenge.challenge.startDate));
    const chEndExclusiveStr = getClientDateKey(new Date(userChallenge.challenge.endDate));
    const durationDays = getChallengeTotalDays(
      new Date(userChallenge.challenge.startDate),
      new Date(userChallenge.challenge.endDate),
      getClientDateKey
    );

    const ucStartStr = getClientDateKey(new Date(userChallenge.startDate));
    const ucEndExclusiveStr = userChallenge.endDate
      ? getClientDateKey(new Date(userChallenge.endDate))
      : addDaysToDateKey(ucStartStr, durationDays);

    // Ensure submission is within user's active period in canonical challenge timezone.
    if (todayStr < ucStartStr) {
      res.status(400).json({
        success: false,
        message: "Your challenge hasn't started yet. You'll be able to submit proof once it begins.",
        code: 'CHALLENGE_NOT_STARTED',
      });
      return;
    }
    if (todayStr >= ucEndExclusiveStr || todayStr >= chEndExclusiveStr) {
      res.status(400).json({
        success: false,
        message: 'The submission period for this challenge has ended.',
        code: 'CHALLENGE_ENDED',
      });
      return;
    }

    // Check if user already submitted proof for today (client timezone day range)
    const existingSubmission = await prisma.submission.findFirst({
      where: {
        userId: userId,
        userChallengeId: userChallengeId,
        submissionDate: {
          gte: todayMidnightUTC,
          lt: tomorrowMidnightUTC
        }
      }
    });

    if (existingSubmission) {
      res.status(400).json({
        success: false,
        message: "You've already submitted proof for today. Great job staying on track!",
        code: 'ALREADY_SUBMITTED',
        data: {
          existingSubmission: {
            id: existingSubmission.id,
            status: existingSubmission.status,
            submissionDate: existingSubmission.submissionDate
          }
        }
      });
      return;
    }

    // Prefer storage path; if not provided, try to extract from URL
    let storedPath: string = imagePath;
    if (!storedPath && typeof imageUrl === 'string') {
      // Try to derive storage path from a public/signed URL
      const match = imageUrl.match(/\/object\/(?:sign|public)\/proof-submission\/(.*)$/);
      storedPath = match?.[1] || imageUrl; // fallback to original
    }

    // Create the submission
    const submission = await prisma.submission.create({
      data: {
        userId: userId,
        challengeId: userChallenge.challengeId,
        userChallengeId: userChallengeId,
        imageUrl: storedPath,
        description: description || null,
        metadata: {
          userAgent: req.headers['user-agent'],
          ip: req.ip,
          submissionTimestamp: new Date().toISOString()
        }
      },
      include: {
        challenge: {
          select: {
            title: true,
            blockchainId: true
          }
        }
      }
    });

    // DESIGN DECISION: Off-chain proof storage for V1
    // Rationale:
    // - Financial transactions (stakes/payouts) are on-chain ✅
    // - Proof verification is manual review (admin approval)
    // - On-chain recording would add: complexity, latency, cost per submission
    // - Current DB storage provides sufficient audit trail (timestamp, IP, metadata)
    //
    // V2 Enhancement Options:
    // 1. Merkle tree batching (daily root hash on-chain)
    // 2. Event logging for proof submissions
    // 3. Full on-chain proof recording via Solana program
    //
    // For now: Database storage is sufficient and appropriate

    // Since bucket is public, generate public URL directly
    let previewUrl: string | undefined;
    if (supabase && submission.imageUrl && /^\w|\//.test(submission.imageUrl)) {
      const { data: { publicUrl } } = supabase.storage
        .from('proof-submission')
        .getPublicUrl(submission.imageUrl);
      previewUrl = publicUrl;
    }

    // Send "Proof Received" notification (async, don't block response)
    getChallengeProgress(userId, userChallenge.challengeId)
      .then(progress => {
        sendNotification({
          userId,
          type: NotificationType.PROOF_RECEIVED,
          data: {
            challengeTitle: submission.challenge.title,
            dayNumber: progress.dayNumber,
            totalDays: progress.totalDays,
          },
          challengeId: userChallenge.challengeId,
          submissionId: submission.id,
        }).catch(() => { }); // Ignore notification errors
      })
      .catch(() => { }); // Ignore progress errors

    res.status(201).json({
      success: true,
      message: 'Proof submitted successfully and is pending review',
      data: {
        submission: {
          id: submission.id,
          imageUrl: previewUrl || submission.imageUrl,
          description: submission.description,
          status: submission.status,
          submissionDate: submission.submissionDate,
          challengeTitle: submission.challenge.title
        }
      }
    });

  } catch (error) {
    console.error('Error submitting proof:', error);
    res.status(500).json({
      success: false,
      message: "We couldn't save your proof right now. Please check your connection and try again.",
      code: 'SUBMISSION_FAILED',
      ...(process.env.NODE_ENV === 'development' && { debug: error }),
    });
  }
}; 
