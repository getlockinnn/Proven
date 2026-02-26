import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { supabase, SUPABASE_URL_VALUE } from '../../lib/supabase';
import { cache } from '../../lib/cache';

/**
 * Get pending submissions for admin review
 * @route GET /api/submissions/pending
 * @access Private (requires authentication - admin only for now)
 */
export const getPendingSubmissions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }
    
    // Get query parameters for pagination and filtering
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const challengeId = req.query.challengeId as string;
    const skip = (page - 1) * limit;
    
    // Build where condition
    const whereCondition: any = {
      status: 'PENDING'
    };
    
    if (challengeId) {
      whereCondition.challengeId = challengeId;
    }
    
    // Get pending submissions with user and challenge details
    const [submissions, totalCount] = await Promise.all([
      prisma.submission.findMany({
        where: whereCondition,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          },
          challenge: {
            select: {
              id: true,
              title: true,
              description: true,
              endDate: true
            }
          },
          userChallenge: {
            select: {
              id: true,
              progress: true,
              startDate: true,
              stakeAmount: true
            }
          }
        },
        orderBy: {
          submissionDate: 'asc' // Oldest submissions first for review
        },
        skip: skip,
        take: limit
      }),
      prisma.submission.count({
        where: whereCondition
      })
    ]);
    
    // Calculate additional metadata for each submission
    const enrichedSubmissions = await Promise.all(submissions.map(async submission => {
      const daysSinceSubmission = Math.floor(
        (new Date().getTime() - new Date(submission.submissionDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      
      const urgency = daysSinceSubmission > 2 ? 'high' : daysSinceSubmission > 1 ? 'medium' : 'low';
      // Resolve image URL (signed or public) for admin preview
      let resolvedUrl = submission.imageUrl as unknown as string;
      if (typeof resolvedUrl === 'string' && !/^https?:\/\//i.test(resolvedUrl)) {
        const key = `signed:${resolvedUrl}`;
        const cachedUrl = cache.get<string>(key);
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
            cache.set(key, resolvedUrl, 55 * 60 * 1000);
          } catch (_) {
            // leave as-is on error
          }
        }
      }
      
      return {
        id: submission.id,
        imageUrl: resolvedUrl,
        description: submission.description,
        submissionDate: submission.submissionDate,
        daysSinceSubmission,
        urgency,
        user: {
          id: submission.user.id,
          name: submission.user.name,
          email: submission.user.email,
          image: submission.user.image
        },
        challenge: {
          id: submission.challenge.id,
          title: submission.challenge.title,
          description: submission.challenge.description,
          endDate: submission.challenge.endDate
        },
        userChallenge: {
          id: submission.userChallenge.id,
          currentProgress: submission.userChallenge.progress,
          stakeAmount: submission.userChallenge.stakeAmount,
          startDate: submission.userChallenge.startDate
        }
      };
    }));
    
    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      success: true,
      data: {
        submissions: enrichedSubmissions,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage,
          hasPrevPage,
          limit
        },
        summary: {
          totalPending: totalCount,
          highUrgency: enrichedSubmissions.filter(s => s.urgency === 'high').length,
          mediumUrgency: enrichedSubmissions.filter(s => s.urgency === 'medium').length,
          lowUrgency: enrichedSubmissions.filter(s => s.urgency === 'low').length
        }
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending submissions',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
}; 