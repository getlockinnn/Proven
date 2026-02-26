import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { requireAdmin } from '../middleware/adminGuard';
import { validateRequest } from '../middleware/validateRequest';

// Import controllers (will be created next)
import {
  getStats,
  getChallenges,
  getChallengeDetails,
  createChallenge,
  updateChallenge,
  pauseChallenge,
  endChallenge,
  deleteChallenge,
  getParticipants,
  getProgress,
  getProofs,
  approveProof,
  rejectProof,
  flagProof,
  getUsers,
  getUserDetails,
  flagUser,
  blockUser,
  exportUsers,
  getEscrow,
  getDisputes,
  getDisputeDetails,
  resolveDispute,
  getAuditLogs,
  exportAuditLogs,
  getSettings,
  updateSettings,
} from '../controllers/admin';

// Settlement & payout controllers
import {
  triggerDailySettlement,
  settleDay,
  getFailedPayouts,
  retryPayout,
  retryAllPayouts,
  getPayoutStatus,
  closeChallenge,
} from '../controllers/admin/settlementController';

// Import validation schemas
import {
  CreateChallengeSchema,
  UpdateChallengeSchema,
  PauseChallengeSchema,
  EndChallengeSchema,
  RejectProofSchema,
  FlagUserSchema,
  ResolveDisputeSchema,
  UpdateSettingsSchema,
} from '../schemas/admin';

const router = Router();

// All admin routes require authentication and admin privileges
router.use(authenticate, requireAdmin);

// Dashboard
router.get('/stats', getStats);

// Challenges
router.get('/challenges', getChallenges);
router.post('/challenges', validateRequest(CreateChallengeSchema), createChallenge);
router.get('/challenges/:id', getChallengeDetails);
router.patch('/challenges/:id', validateRequest(UpdateChallengeSchema), updateChallenge);
router.post('/challenges/:id/close', closeChallenge);
router.post('/challenges/:id/pause', validateRequest(PauseChallengeSchema), pauseChallenge);
router.post('/challenges/:id/end', validateRequest(EndChallengeSchema), endChallenge);
router.delete('/challenges/:id', deleteChallenge);
router.get('/challenges/:id/participants', getParticipants);
router.get('/challenges/:id/progress', getProgress);

// Proofs
router.get('/proofs', getProofs);
router.post('/proofs/:id/approve', approveProof);
router.post('/proofs/:id/reject', validateRequest(RejectProofSchema), rejectProof);
router.post('/proofs/:id/flag', flagProof);

// Users
router.get('/users', getUsers);
router.get('/users/export', exportUsers);
router.get('/users/:id', getUserDetails);
router.post('/users/:id/flag', validateRequest(FlagUserSchema), flagUser);
router.post('/users/:id/block', blockUser);

// Escrow
router.get('/escrow', getEscrow);

// Settlements & Payouts
router.post('/settlements/run', triggerDailySettlement);
router.post('/settlements/:challengeId/:dayDate', settleDay);
router.get('/payouts/failed', getFailedPayouts);
router.get('/payouts/status', getPayoutStatus);
router.post('/payouts/:jobId/retry', retryPayout);
router.post('/payouts/retry-all', retryAllPayouts);

// Disputes
router.get('/disputes', getDisputes);
router.get('/disputes/:id', getDisputeDetails);
router.post('/disputes/:id/resolve', validateRequest(ResolveDisputeSchema), resolveDispute);

// Audit Logs
router.get('/audit-logs', getAuditLogs);
router.get('/audit-logs/export', exportAuditLogs);

// Settings
router.get('/settings', getSettings);
router.patch('/settings', validateRequest(UpdateSettingsSchema), updateSettings);

export default router;
