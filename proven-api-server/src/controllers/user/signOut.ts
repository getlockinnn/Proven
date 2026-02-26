import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';

/**
 * Sign out a user (invalidate session)
 * @route POST /api/users/signout
 * @access Private (requires authentication)
 * @description Signs out a user by invalidating their session and tokens for Google Auth
 */
export const signOutUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({ 
        success: false, 
        message: 'Not authenticated' 
      });
      return;
    }
    
    // Get the user ID from the authenticated request
    const userId = req.user.id;
    
    // 1. Delete all active sessions for this user
    await prisma.session.deleteMany({
      where: { userId }
    });
    
    // 2. Revoke OAuth tokens by updating them to empty strings
    // This prevents them from being used again
    await prisma.account.updateMany({
      where: { userId },
      data: {
        access_token: null,
        refresh_token: null,
        id_token: null,
        expires_at: 0,
      }
    });
    
    // 3. Create a token blacklist entry
    // In a production app, you would use Redis for this, but for now we'll use the database
    await prisma.verificationToken.create({
      data: {
        identifier: userId,
        token: `REVOKED_${Date.now()}`,
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) // 7 days
      }
    });
    
    // 4. Update the user's lastSignOut timestamp
    await prisma.user.update({
      where: { id: userId },
      data: {
        updatedAt: new Date() // Update the timestamp to mark session as invalid
      }
    });
    
    // 5. Set cookies to expire
    res.setHeader('Set-Cookie', [
      `next-auth.session-token=; Path=/; Expires=${new Date(0).toUTCString()}; HttpOnly; SameSite=Lax`,
      `next-auth.callback-url=; Path=/; Expires=${new Date(0).toUTCString()}; HttpOnly; SameSite=Lax`,
      `next-auth.csrf-token=; Path=/; Expires=${new Date(0).toUTCString()}; HttpOnly; SameSite=Lax`
    ]);
    
    // Return instructions for the client to clear local storage/cookies
    res.json({ 
      success: true, 
      message: 'Successfully signed out',
      actions: [
        'Clear localStorage token',
        'Clear authentication cookies',
        'Redirect to login page'
      ]
    });
    return;
    
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Failed to sign out' 
    });
    return;
  }
};