import express from 'express';
import {
  getAllChallenges,
  getChallengeById,
  joinChallenge,
  getUserChallenges,
  createChallenge,
  checkUserChallenge,
  completeChallenge,
  getChallengeResults,
  getStakeQuote,
  createSolanaPayUrl,
  verifyTransferByReference,
  completeSolanaPayJoin,
} from '../controllers/challenge';
import { CreateChallengeSchema, JoinChallengeSchema } from '../schemas/challenge';
import { validateRequest } from '../middleware/validateRequest';
import { authenticate } from '../middleware/authMiddleware';
import { requireAdmin } from '../middleware/adminGuard';

const router = express.Router();

// Public routes
router.get('/', getAllChallenges);

// User routes (require authentication)
router.get('/user', authenticate, getUserChallenges);
router.post('/join', authenticate, validateRequest(JoinChallengeSchema), joinChallenge);
router.get('/:id/stake-quote', authenticate, getStakeQuote);
router.get('/:challengeId/check', authenticate, checkUserChallenge);
router.get('/:challengeId/results', authenticate, getChallengeResults);

// Solana Pay routes
router.post('/:id/solana-pay-url', authenticate, createSolanaPayUrl);
router.get('/verify-transfer/:referenceKey', authenticate, verifyTransferByReference);
router.post('/complete-solana-pay-join', authenticate, completeSolanaPayJoin);

// Admin routes (require authentication and admin privileges)
router.post('/create', authenticate, requireAdmin, validateRequest(CreateChallengeSchema), createChallenge);
router.post('/:challengeId/complete', authenticate, requireAdmin, completeChallenge);
// Legacy payout routes removed — payouts now handled via PayoutJob queue
// Settlement: POST /admin/settlements/run or /admin/settlements/:challengeId/:dayDate
// Close: POST /admin/challenges/:id/close

// Public dynamic route (must be last to avoid conflicts)
router.get('/:id', getChallengeById);

export default router; 