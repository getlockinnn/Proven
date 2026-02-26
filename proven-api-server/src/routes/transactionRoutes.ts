import express from 'express';
import { getTransactionHistory } from '../controllers/transaction/getTransactionHistory';
import { authenticate } from '../middleware/authMiddleware'; // Re-imported

const router = express.Router();

// Get transaction history (requires authentication)
router.get('/history', authenticate, getTransactionHistory);

export default router;