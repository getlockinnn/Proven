import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { logAdminAction } from '../../services/auditService';

/**
 * Export audit logs as CSV or JSON
 * @route GET /api/admin/audit-logs/export
 * @access Private (Admin only)
 */
export const exportAuditLogs = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const format = (req.query.format as string) || 'csv';
    const action = req.query.action as string;
    const actorId = req.query.actorId as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    // Build where condition
    const whereCondition: any = {};

    if (action) {
      whereCondition.action = action;
    }

    if (actorId) {
      whereCondition.actorId = actorId;
    }

    if (startDate || endDate) {
      whereCondition.createdAt = {};
      if (startDate) {
        whereCondition.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        whereCondition.createdAt.lte = new Date(endDate);
      }
    }

    // Fetch all audit logs matching criteria
    const logs = await prisma.auditLog.findMany({
      where: whereCondition,
      orderBy: { createdAt: 'desc' },
    });

    // Process logs data
    const exportData = logs.map((log) => ({
      id: log.id,
      action: log.action,
      actor: log.actor,
      actorId: log.actorId || '',
      target: log.target,
      details: log.details,
      type: log.type,
      createdAt: log.createdAt.toISOString(),
      metadata: log.metadata ? JSON.stringify(log.metadata) : '',
    }));

    // Log the export action
    await logAdminAction({
      action: 'audit_logs_exported',
      actor: req.user?.email || 'unknown',
      actorId: req.user?.id,
      target: 'audit_logs',
      details: `Exported ${exportData.length} audit log entries`,
      type: 'INFO',
      metadata: {
        count: exportData.length,
        format,
        filters: { action, actorId, startDate, endDate },
      },
    });

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-logs-export.json');
      res.json({
        success: true,
        exportedAt: new Date().toISOString(),
        totalRecords: exportData.length,
        data: exportData,
      });
      return;
    }

    // Default: CSV format
    const csvHeaders = [
      'ID',
      'Action',
      'Actor',
      'Actor ID',
      'Target',
      'Details',
      'Type',
      'Created At',
      'Metadata',
    ];

    const csvRows = exportData.map((log) => [
      log.id,
      `"${log.action.replace(/"/g, '""')}"`,
      `"${log.actor.replace(/"/g, '""')}"`,
      log.actorId,
      `"${log.target.replace(/"/g, '""')}"`,
      `"${log.details.replace(/"/g, '""').replace(/\n/g, ' ')}"`,
      log.type,
      log.createdAt,
      `"${log.metadata.replace(/"/g, '""')}"`,
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map((row) => row.join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-logs-export.csv');
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting audit logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export audit logs',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
