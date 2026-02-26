import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';

/**
 * Get audit logs
 * @route GET /api/admin/audit-logs
 * @access Private (Admin only)
 */
export const getAuditLogs = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const action = req.query.action as string;
    const actorId = req.query.actorId as string;
    const search = req.query.search as string;
    const skip = (page - 1) * limit;

    // Build where condition
    const whereCondition: any = {};

    if (action) {
      whereCondition.action = action;
    }

    if (actorId) {
      whereCondition.actorId = actorId;
    }

    if (search) {
      whereCondition.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { actor: { contains: search, mode: 'insensitive' } },
        { target: { contains: search, mode: 'insensitive' } },
        { details: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [logs, totalCount] = await Promise.all([
      prisma.auditLog.findMany({
        where: whereCondition,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where: whereCondition }),
    ]);

    const enrichedLogs = logs.map((log) => {
      // Calculate relative time
      const msSinceCreated = Date.now() - log.createdAt.getTime();
      const hoursSince = Math.floor(msSinceCreated / (1000 * 60 * 60));
      const timestamp =
        hoursSince < 1
          ? `${Math.floor(msSinceCreated / (1000 * 60))} min ago`
          : hoursSince < 24
          ? `${hoursSince} hours ago`
          : `${Math.floor(hoursSince / 24)} days ago`;

      return {
        id: log.id,
        action: log.action,
        actor: log.actor,
        actorId: log.actorId,
        target: log.target,
        details: log.details,
        timestamp,
        createdAt: log.createdAt,
        type: log.type.toLowerCase() as 'success' | 'destructive' | 'warning' | 'info',
        metadata: log.metadata,
      };
    });

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: {
        logs: enrichedLogs,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          limit,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch audit logs',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
