import { Router } from 'express';
import { 
  submitProof,
  reviewSubmission,
  getPendingSubmissions,
  getUserSubmissions,
  getChallengeProofs
} from '../controllers/submission';
import { authenticate } from '../middleware/authMiddleware'; 
import { validateRequest } from '../middleware/validateRequest';
import { SubmitProofSchema, ReviewSubmissionSchema } from '../schemas/submission';

const router = Router();

// User endpoints
router.post('/submit', authenticate, validateRequest(SubmitProofSchema), submitProof);
router.get('/my-submissions', authenticate, getUserSubmissions);
router.get('/challenge/:challengeId/calendar', authenticate, getChallengeProofs);

// Admin endpoints (for now, any authenticated user can review - you can add admin middleware later)
router.get('/pending', authenticate, getPendingSubmissions);
router.put('/:submissionId/review', authenticate, validateRequest(ReviewSubmissionSchema), reviewSubmission);

export default router; 