import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authMiddleware';
import prisma from '../lib/prisma';
import { AdminRoleType } from '@prisma/client';

// Admin emails loaded from environment variable (ADMIN_EMAILS)
// Format: ADMIN_EMAILS=admin1@domain.com,admin2@domain.com
// NOTE: This is for backwards compatibility - prefer using database-backed AdminRole
const getAdminEmails = (): string[] => {
  const adminEmailsEnv = process.env.ADMIN_EMAILS || '';
  if (!adminEmailsEnv) {
    return [];
  }
  return adminEmailsEnv.split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
};

/**
 * Extended request type with admin role info
 */
export interface AdminRequest extends AuthenticatedRequest {
  adminRole?: {
    role: AdminRoleType;
    twoFactorVerified: boolean;
  };
}

/**
 * Check if user is admin via database
 */
async function checkDatabaseAdmin(userId: string): Promise<{ isAdmin: boolean; role?: AdminRoleType }> {
  const adminRole = await prisma.adminRole.findUnique({
    where: { userId },
    select: { role: true, isActive: true },
  });

  if (adminRole?.isActive) {
    return { isAdmin: true, role: adminRole.role };
  }

  return { isAdmin: false };
}

/**
 * Middleware to require admin access
 * Checks database first, then falls back to email whitelist for backwards compatibility.
 * Also validates that the request comes from the guardian client (not the mobile app).
 */
export async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Please sign in to access this feature.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  // Reject requests from the mobile app client - admin routes are guardian-only
  if (req.clientType === 'proven-app') {
    res.status(403).json({
      success: false,
      message: 'This feature is not available from this application.',
      code: 'CLIENT_NOT_ALLOWED',
    });
    return;
  }

  try {
    // 1. Check database-backed admin role (preferred)
    const dbCheck = await checkDatabaseAdmin(req.user.id);
    if (dbCheck.isAdmin) {
      req.adminRole = {
        role: dbCheck.role!,
        twoFactorVerified: false, // Will be set by 2FA middleware if needed
      };
      next();
      return;
    }

    // 2. Check legacy isAdmin flag on user
    if (req.user.isAdmin) {
      req.adminRole = {
        role: 'ADMIN' as AdminRoleType,
        twoFactorVerified: false,
      };
      next();
      return;
    }

    // 3. Fall back to email whitelist (backwards compatibility)
    const userEmail = req.user.email?.toLowerCase().trim();
    const adminEmails = getAdminEmails();
    if (userEmail && adminEmails.length > 0 && adminEmails.includes(userEmail)) {
      req.adminRole = {
        role: 'ADMIN' as AdminRoleType,
        twoFactorVerified: false,
      };
      next();
      return;
    }

    res.status(403).json({
      success: false,
      message: 'This feature requires administrator access. If you believe you should have access, please contact support.',
      code: 'ADMIN_REQUIRED',
    });
  } catch (error) {
    console.error('Error checking admin status:', error);
    res.status(500).json({
      success: false,
      message: 'We encountered an issue verifying your access. Please try again.',
      code: 'VERIFICATION_ERROR',
    });
  }
}

/**
 * Middleware to require specific admin role or higher
 */
export function requireRole(requiredRole: AdminRoleType) {
  const roleHierarchy: Record<AdminRoleType, number> = {
    MODERATOR: 1,
    ADMIN: 2,
    SUPER_ADMIN: 3,
  };

  return async (req: AdminRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Please sign in to access this feature.',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    try {
      const dbCheck = await checkDatabaseAdmin(req.user.id);

      if (!dbCheck.isAdmin || !dbCheck.role) {
        res.status(403).json({
          success: false,
          message: 'This feature requires administrator access.',
          code: 'ADMIN_REQUIRED',
        });
        return;
      }

      if (roleHierarchy[dbCheck.role] < roleHierarchy[requiredRole]) {
        res.status(403).json({
          success: false,
          message: "You don't have sufficient permissions for this action. Please contact a senior administrator if you need access.",
          code: 'INSUFFICIENT_ROLE',
        });
        return;
      }

      req.adminRole = {
        role: dbCheck.role,
        twoFactorVerified: false,
      };
      next();
    } catch (error) {
      console.error('Error checking admin role:', error);
      res.status(500).json({
        success: false,
        message: 'We encountered an issue verifying your access. Please try again.',
        code: 'VERIFICATION_ERROR',
      });
    }
  };
}

/**
 * Middleware to require 2FA verification for sensitive operations
 */
export async function require2FA(req: AdminRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Please sign in to access this feature.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  try {
    // Check if user has 2FA enabled
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { twoFactorEnabled: true },
    });

    if (!user?.twoFactorEnabled) {
      // 2FA not enabled - require setup for admin users
      res.status(403).json({
        success: false,
        message: 'For security, please enable two-factor authentication to access admin features.',
        code: '2FA_SETUP_REQUIRED',
      });
      return;
    }

    // Check session for 2FA verification
    // In production, you'd check a session token or JWT claim
    const twoFactorVerified = req.headers['x-2fa-verified'] === 'true';

    if (!twoFactorVerified) {
      res.status(403).json({
        success: false,
        message: 'Please verify your identity with your authenticator app to continue.',
        code: '2FA_VERIFICATION_REQUIRED',
      });
      return;
    }

    if (req.adminRole) {
      req.adminRole.twoFactorVerified = true;
    }

    next();
  } catch (error) {
    console.error('Error checking 2FA status:', error);
    res.status(500).json({
      success: false,
      message: 'We encountered an issue verifying your security settings. Please try again.',
      code: 'VERIFICATION_ERROR',
    });
  }
}
