import prisma from '../lib/prisma';
import { AuditLogType } from '@prisma/client';
import { logger } from '../lib/logger';

/**
 * Audit Logging Service
 * Tracks all admin actions for accountability and debugging
 */

export interface AuditLogParams {
  action: string;
  actor: string;
  actorId?: string;
  target: string;
  details: string;
  type?: AuditLogType;
  metadata?: Record<string, any>;
}

/**
 * Log an admin action to the audit log
 */
export async function logAdminAction(params: AuditLogParams): Promise<void> {
  const { action, actor, actorId, target, details, type = 'INFO', metadata } = params;

  try {
    await prisma.auditLog.create({
      data: {
        action,
        actor,
        actorId,
        target,
        details,
        type,
        metadata: metadata ?? undefined,
      },
    });

    logger.info('Admin action logged', {
      action,
      actor,
      target,
      type,
    });
  } catch (error) {
    // Don't throw - audit logging should not break main functionality
    logger.error('Failed to log admin action', {
      error,
      action,
      actor,
      target,
    });
  }
}

/**
 * Pre-defined action types for consistency
 */
export const AuditActions = {
  // Proof actions
  PROOF_APPROVED: 'proof_approved',
  PROOF_REJECTED: 'proof_rejected',
  PROOF_FLAGGED: 'proof_flagged',

  // Challenge actions
  CHALLENGE_CREATED: 'challenge_created',
  CHALLENGE_UPDATED: 'challenge_updated',
  CHALLENGE_PAUSED: 'challenge_paused',
  CHALLENGE_RESUMED: 'challenge_resumed',
  CHALLENGE_ENDED: 'challenge_ended',
  CHALLENGE_FINALIZED: 'challenge_finalized',
  CHALLENGE_DELETED: 'challenge_deleted',

  // User actions
  USER_FLAGGED: 'user_flagged',
  USER_UNFLAGGED: 'user_unflagged',
  USER_BLOCKED: 'user_blocked',
  USER_UNBLOCKED: 'user_unblocked',

  // Dispute actions
  DISPUTE_RESOLVED: 'dispute_resolved',

  // Settings actions
  SETTINGS_UPDATED: 'settings_updated',

  // System actions
  EMERGENCY_PAUSE_ENABLED: 'emergency_pause_enabled',
  EMERGENCY_PAUSE_DISABLED: 'emergency_pause_disabled',
} as const;

/**
 * Helper to format wallet addresses for display
 */
export function formatWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Helper to create standard audit log details
 */
export function createAuditDetails(
  action: string,
  context: Record<string, any>
): string {
  switch (action) {
    case AuditActions.PROOF_APPROVED:
      return `Approved Day ${context.dayNumber} proof for ${context.challengeTitle}`;
    case AuditActions.PROOF_REJECTED:
      return `Rejected Day ${context.dayNumber} proof for ${context.challengeTitle}: ${context.reason}`;
    case AuditActions.PROOF_FLAGGED:
      return `Flagged Day ${context.dayNumber} proof for ${context.challengeTitle} for re-review`;
    case AuditActions.USER_FLAGGED:
      return `Flagged user for suspicious activity: ${context.reason}`;
    case AuditActions.USER_BLOCKED:
      return `Blocked user from submitting proofs`;
    case AuditActions.CHALLENGE_FINALIZED:
      return `Finalized challenge "${context.challengeTitle}" - ${context.finishers} finishers, $${context.payoutPerUser} each`;
    case AuditActions.DISPUTE_RESOLVED:
      return `Resolved dispute: ${context.resolution}`;
    case AuditActions.SETTINGS_UPDATED:
      return `Updated system settings: ${context.changes}`;
    default:
      return JSON.stringify(context);
  }
}
