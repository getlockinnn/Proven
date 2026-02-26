import { Response } from 'express';
import { Prisma, SubmissionStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { supabase, SUPABASE_URL_VALUE } from '../../lib/supabase';
import { cache } from '../../lib/cache';
import { getChallengeDayBoundary, getChallengeDayNumber, getChallengeTotalDays } from '../../utils/timeUtils';

/**
 * Get proofs for admin review with filters
 * @route GET /api/admin/proofs
 * @access Private (Admin only)
 */
export const getProofs = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string || 'PENDING';
    const challengeId = req.query.challengeId as string;
    const search = req.query.search as string;
    const skip = (page - 1) * limit;

    // Build where condition
    const whereCondition: Prisma.SubmissionWhereInput = {};

    if (status && status !== 'all') {
      const normalizedStatus = status.toUpperCase();
      if (normalizedStatus === SubmissionStatus.PENDING || normalizedStatus === SubmissionStatus.APPROVED || normalizedStatus === SubmissionStatus.REJECTED) {
        whereCondition.status = normalizedStatus;
      }
    }

    if (challengeId) {
      whereCondition.challengeId = challengeId;
    }

    if (search) {
      whereCondition.OR = [
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { challenge: { title: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [proofs, totalCount] = await Promise.all([
      prisma.submission.findMany({
        where: whereCondition,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              walletAddress: true,
            },
          },
          challenge: {
            select: {
              id: true,
              title: true,
              startDate: true,
              endDate: true,
            },
          },
          userChallenge: {
            select: {
              id: true,
              progress: true,
              stakeAmount: true,
              startDate: true,
            },
          },
        },
        orderBy: { submissionDate: status === 'PENDING' ? 'asc' : 'desc' },
        skip,
        take: limit,
      }),
      prisma.submission.count({ where: whereCondition }),
    ]);

    const challengeDateKey = getChallengeDayBoundary().getClientDateKey;

    // Enrich proofs with computed data
    const enrichedProofs = await Promise.all(
      proofs.map(async (proof) => {
        const challengeStart = new Date(proof.challenge.startDate);
        const challengeEnd = new Date(proof.challenge.endDate);
        const submissionDate = new Date(proof.submissionDate);
        const totalDays = getChallengeTotalDays(challengeStart, challengeEnd, challengeDateKey);
        const dayNumber = getChallengeDayNumber(
          challengeStart,
          submissionDate,
          challengeDateKey,
          totalDays
        );

        // Calculate time since submission
        const msSinceSubmission = Date.now() - submissionDate.getTime();
        const hoursSince = Math.floor(msSinceSubmission / (1000 * 60 * 60));
        const submittedAt =
          hoursSince < 1
            ? `${Math.floor(msSinceSubmission / (1000 * 60))} min ago`
            : hoursSince < 24
            ? `${hoursSince} hours ago`
            : `${Math.floor(hoursSince / 24)} days ago`;

        // Resolve image URL
        let resolvedUrl = proof.imageUrl;
        if (typeof resolvedUrl === 'string' && !/^https?:\/\//i.test(resolvedUrl)) {
          const cacheKey = `signed:${resolvedUrl}`;
          const cachedUrl = cache.get<string>(cacheKey);
          if (cachedUrl) {
            resolvedUrl = cachedUrl;
          } else {
            try {
              if (supabase) {
                const { data: signed } = await supabase.storage
                  .from('proof-submission')
                  .createSignedUrl(resolvedUrl, 60 * 60);
                resolvedUrl = signed?.signedUrl || resolvedUrl;
              }
              if (!/^https?:\/\//i.test(resolvedUrl)) {
                resolvedUrl = `${SUPABASE_URL_VALUE}/storage/v1/object/public/proof-submission/${resolvedUrl}`;
              }
              cache.set(cacheKey, resolvedUrl, 55 * 60 * 1000);
            } catch {
              // Keep original URL on error
            }
          }
        }

        // Determine proof type from URL
        const proofType = resolvedUrl.match(/\.(mp4|mov|webm)$/i) ? 'video' : 'image';

        return {
          id: proof.id,
          user: proof.user.name || proof.user.email?.split('@')[0] || 'Unknown',
          userAvatar: proof.user.image || '',
          userId: proof.user.id,
          walletAddress: proof.user.walletAddress,
          challenge: proof.challenge.title,
          challengeId: proof.challenge.id,
          dayNumber,
          submittedAt,
          submissionDate: proof.submissionDate,
          proofType,
          thumbnailUrl: resolvedUrl,
          status: proof.status.toLowerCase() as 'pending' | 'approved' | 'rejected',
          description: proof.description,
          reviewComments: proof.reviewComments,
          reviewedAt: proof.reviewedAt,
        };
      })
    );

    const totalPages = Math.ceil(totalCount / limit);

    // Calculate summary stats
    const pendingCount = status === 'PENDING' ? totalCount : 0;
    const urgentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const urgentCount = enrichedProofs.filter(
      (p) => p.status === 'pending' && new Date(p.submissionDate) < urgentCutoff
    ).length;

    res.json({
      success: true,
      data: {
        proofs: enrichedProofs,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          limit,
        },
        summary: {
          total: totalCount,
          pending: pendingCount,
          urgent: urgentCount,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching proofs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch proofs',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
