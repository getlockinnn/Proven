import express, { Response } from 'express';
import { saveUser, getCurrentUser, verifyToken } from '../controllers/auth/authController';
import { exchangeGoogleAuthCode, googleAuthCallback, startGoogleAuth } from '../controllers/auth/googleAuthController';
import { authenticate, AuthenticatedRequest } from '../middleware/authMiddleware';
import { requireAdmin, AdminRequest } from '../middleware/adminGuard';
import * as twoFactorService from '../services/twoFactorService';
import * as adminRoleService from '../services/adminRoleService';
import prisma from '../lib/prisma';
import { logAdminAction } from '../services/auditService';

const router = express.Router();

// ==================== GOOGLE OAUTH (MOBILE FIRST-PARTY AUTH) ====================

/**
 * Start Google OAuth in a browser session
 * @route GET /api/auth/google?redirect_uri&state
 */
router.get('/google', startGoogleAuth);

/**
 * Google OAuth callback (redirect_uri registered in Google Cloud Console)
 * @route GET /api/auth/google/callback
 */
router.get('/google/callback', googleAuthCallback);

/**
 * Exchange one-time code for an API access token
 * @route POST /api/auth/google
 */
router.post('/google', exchangeGoogleAuthCode);

// Existing routes
router.post('/save-user', authenticate, saveUser);
router.post('/verify-token', verifyToken);
router.get('/me', authenticate, getCurrentUser);

// ==================== ADMIN STATUS ====================

/**
 * Get current user's admin status and 2FA status
 * @route GET /api/auth/admin-status
 */
router.get('/admin-status', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const adminInfo = await adminRoleService.getAdminRole(req.user.id);
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { twoFactorEnabled: true },
    });

    res.json({
      success: true,
      data: {
        isAdmin: !!adminInfo,
        role: adminInfo?.role || null,
        twoFactorEnabled: user?.twoFactorEnabled || false,
        twoFactorRequired: !!adminInfo && !user?.twoFactorEnabled,
      },
    });
  } catch (error) {
    console.error('Error getting admin status:', error);
    res.status(500).json({ success: false, message: 'Failed to get admin status' });
  }
});

// ==================== TWO-FACTOR AUTHENTICATION ====================

/**
 * Setup 2FA - generates secret and QR code
 * @route POST /api/auth/2fa/setup
 */
router.post('/2fa/setup', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const result = await twoFactorService.setup2FA(req.user.id);

    res.json({
      success: true,
      message: 'Scan the QR code with your authenticator app, then verify with a code',
      data: {
        qrCodeUrl: result.qrCodeUrl,
        otpauthUrl: result.otpauthUrl,
        backupCodes: result.backupCodes,
      },
    });
  } catch (error: any) {
    console.error('Error setting up 2FA:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to setup 2FA',
    });
  }
});

/**
 * Verify 2FA setup with a code from authenticator app
 * @route POST /api/auth/2fa/verify-setup
 */
router.post('/2fa/verify-setup', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, message: 'Token is required' });
      return;
    }

    const isValid = await twoFactorService.verify2FASetup(req.user.id, token);

    if (!isValid) {
      res.status(400).json({ success: false, message: 'Invalid verification code' });
      return;
    }

    await logAdminAction({
      action: '2fa_enabled',
      actor: req.user.email || 'unknown',
      actorId: req.user.id,
      target: req.user.id,
      details: 'Two-factor authentication enabled',
      type: 'SUCCESS',
    });

    res.json({
      success: true,
      message: '2FA has been enabled successfully',
    });
  } catch (error: any) {
    console.error('Error verifying 2FA setup:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to verify 2FA',
    });
  }
});

/**
 * Verify 2FA code during login
 * @route POST /api/auth/2fa/verify
 */
router.post('/2fa/verify', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, message: 'Token is required' });
      return;
    }

    const result = await twoFactorService.verify2FALogin(req.user.id, token);

    if (!result.valid) {
      await prisma.authenticationLog.create({
        data: {
          userId: req.user.id,
          email: req.user.email || '',
          success: false,
          method: 'TWO_FACTOR',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          failureReason: '2fa_failed',
        },
      });

      res.status(400).json({ success: false, message: 'Invalid verification code' });
      return;
    }

    await prisma.authenticationLog.create({
      data: {
        userId: req.user.id,
        email: req.user.email || '',
        success: true,
        method: 'TWO_FACTOR',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        twoFactorUsed: true,
      },
    });

    res.json({
      success: true,
      message: '2FA verification successful',
      data: {
        verified: true,
        usedBackupCode: result.usedBackupCode,
      },
    });
  } catch (error: any) {
    console.error('Error verifying 2FA:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to verify 2FA',
    });
  }
});

/**
 * Disable 2FA (requires current 2FA code)
 * @route POST /api/auth/2fa/disable
 */
router.post('/2fa/disable', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, message: 'Current 2FA code is required' });
      return;
    }

    const result = await twoFactorService.verify2FALogin(req.user.id, token);

    if (!result.valid) {
      res.status(400).json({ success: false, message: 'Invalid verification code' });
      return;
    }

    await twoFactorService.disable2FA(req.user.id);

    await logAdminAction({
      action: '2fa_disabled',
      actor: req.user.email || 'unknown',
      actorId: req.user.id,
      target: req.user.id,
      details: 'Two-factor authentication disabled',
      type: 'WARNING',
    });

    res.json({
      success: true,
      message: '2FA has been disabled',
    });
  } catch (error: any) {
    console.error('Error disabling 2FA:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to disable 2FA',
    });
  }
});

/**
 * Regenerate backup codes
 * @route POST /api/auth/2fa/regenerate-backup-codes
 */
router.post('/2fa/regenerate-backup-codes', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      res.status(400).json({ success: false, message: 'Current 2FA code is required' });
      return;
    }

    const result = await twoFactorService.verify2FALogin(req.user.id, token);

    if (!result.valid) {
      res.status(400).json({ success: false, message: 'Invalid verification code' });
      return;
    }

    const backupCodes = await twoFactorService.regenerateBackupCodes(req.user.id);

    await logAdminAction({
      action: '2fa_backup_codes_regenerated',
      actor: req.user.email || 'unknown',
      actorId: req.user.id,
      target: req.user.id,
      details: 'Regenerated 2FA backup codes',
      type: 'WARNING',
    });

    res.json({
      success: true,
      message: 'New backup codes generated. Save them securely!',
      data: {
        backupCodes,
      },
    });
  } catch (error: any) {
    console.error('Error regenerating backup codes:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to regenerate backup codes',
    });
  }
});

// ==================== ADMIN ROLE MANAGEMENT ====================

/**
 * Get all admins (super admin only)
 * @route GET /api/auth/admins
 */
router.get('/admins', authenticate, requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (req.adminRole?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ success: false, message: 'Super admin access required' });
      return;
    }

    const admins = await adminRoleService.getAllAdmins();

    res.json({
      success: true,
      data: { admins },
    });
  } catch (error) {
    console.error('Error getting admins:', error);
    res.status(500).json({ success: false, message: 'Failed to get admins' });
  }
});

/**
 * Grant admin role (super admin only)
 * @route POST /api/auth/admins/grant
 */
router.post('/admins/grant', authenticate, requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (req.adminRole?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ success: false, message: 'Super admin access required' });
      return;
    }

    const { userId, role } = req.body;

    if (!userId || !role) {
      res.status(400).json({ success: false, message: 'userId and role are required' });
      return;
    }

    if (!['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
      res.status(400).json({ success: false, message: 'Invalid role' });
      return;
    }

    await adminRoleService.grantAdminRole(userId, role, req.user!.id);

    res.json({
      success: true,
      message: 'Admin role granted successfully',
    });
  } catch (error: any) {
    console.error('Error granting admin role:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to grant admin role',
    });
  }
});

/**
 * Revoke admin role (super admin only)
 * @route POST /api/auth/admins/revoke
 */
router.post('/admins/revoke', authenticate, requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (req.adminRole?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ success: false, message: 'Super admin access required' });
      return;
    }

    const { userId } = req.body;

    if (!userId) {
      res.status(400).json({ success: false, message: 'userId is required' });
      return;
    }

    if (userId === req.user!.id) {
      res.status(400).json({ success: false, message: 'Cannot revoke your own admin role' });
      return;
    }

    await adminRoleService.revokeAdminRole(userId, req.user!.id);

    res.json({
      success: true,
      message: 'Admin role revoked successfully',
    });
  } catch (error: any) {
    console.error('Error revoking admin role:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to revoke admin role',
    });
  }
});

export default router;
