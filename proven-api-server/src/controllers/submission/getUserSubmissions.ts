import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';

/**
 * Get user's own submissions
 * @route GET /api/submissions/my-submissions
 * @access Private (requires authentication)
 */
export const getUserSubmissions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }
    
    const userId = req.user.id;
    
    // Get query parameters
    const userChallengeId = req.query.userChallengeId as string;
    const status = req.query.status as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    
    // Build where condition
    const whereCondition: any = {
      userId: userId
    };
    
    if (userChallengeId) {
      whereCondition.userChallengeId = userChallengeId;
    }
    
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      whereCondition.status = status;
    }
    
    // Get user submissions
    const [submissions, totalCount] = await Promise.all([
      prisma.submission.findMany({
        where: whereCondition,
        include: {
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
              stakeAmount: true
            }
          }
        },
        orderBy: {
          submissionDate: 'desc' // Most recent first
        },
        skip: skip,
        take: limit
      }),
      prisma.submission.count({
        where: whereCondition
      })
    ]);
    
    // Enrich submissions with additional metadata
    const enrichedSubmissions = submissions.map(submission => {
      const daysSinceSubmission = Math.floor(
        (new Date().getTime() - new Date(submission.submissionDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      
      let statusMessage = '';
      switch (submission.status) {
        case 'PENDING':
          statusMessage = 'Waiting for review';
          break;
        case 'APPROVED':
          statusMessage = 'Approved - Progress updated';
          break;
        case 'REJECTED':
          statusMessage = 'Rejected - Please try again';
          break;
      }
      
      return {
        id: submission.id,
        imageUrl: submission.imageUrl,
        description: submission.description,
        submissionDate: submission.submissionDate,
        status: submission.status,
        statusMessage,
        reviewComments: submission.reviewComments,
        reviewedAt: submission.reviewedAt,
        daysSinceSubmission,
        challenge: {
          id: submission.challenge.id,
          title: submission.challenge.title,
          endDate: submission.challenge.endDate
        },
        userChallenge: {
          id: submission.userChallenge.id,
          currentProgress: submission.userChallenge.progress,
          stakeAmount: submission.userChallenge.stakeAmount
        }
      };
    });
    
    // Calculate status counts
    const statusCounts = await prisma.submission.groupBy({
      by: ['status'],
      where: { userId: userId },
      _count: {
        status: true
      }
    });
    
    const statusSummary = {
      pending: statusCounts.find(s => s.status === 'PENDING')?._count.status || 0,
      approved: statusCounts.find(s => s.status === 'APPROVED')?._count.status || 0,
      rejected: statusCounts.find(s => s.status === 'REJECTED')?._count.status || 0
    };
    
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
          totalSubmissions: totalCount,
          ...statusSummary
        }
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch submissions',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
}; 