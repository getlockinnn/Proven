import { Router } from 'express';
import { getLeaderboard, getAllLeaderboards, getCurrentUserRank } from '../controllers/leaderboard';
import { authenticate, optionalAuthenticate } from '../middleware/authMiddleware';

const router = Router();

// Public routes (optional auth to mark current user)
router.get('/', optionalAuthenticate, getLeaderboard);
router.get('/all', optionalAuthenticate, getAllLeaderboards);

// Private routes
router.get('/me', authenticate, getCurrentUserRank);

export default router;
