import express from 'express';
import { requestUSDC, getFaucetStatus } from '../controllers/faucet/usdcFaucet';
import { rateLimit } from 'express-rate-limit';

const router = express.Router();

// Rate limiting for faucet requests (max 3 requests per 5 minutes per IP)
const faucetRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // max 3 requests per window per IP
  message: {
    success: false,
    message: 'Too many faucet requests. Please wait 5 minutes before trying again.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to USDC requests
router.post('/usdc', faucetRateLimit, requestUSDC);

// Faucet status endpoint (no rate limiting)
router.get('/status', getFaucetStatus);

export default router;