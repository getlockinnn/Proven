import { Response, Request } from 'express';
import prisma from '../../lib/prisma';
import crypto from 'crypto';

// Quote cache (in-memory for MVP). Use Redis in production.
const QUOTE_TTL_MS = 60_000; // 60 seconds
const quoteStore = new Map<string, { challengeId: string; amountLamports: number; escrowPubkey: string; expiresAt: number }>();

export const getStakeQuote = async (req: Request, res: Response) => {
  try {
    const { id: challengeId } = req.params;
    if (!challengeId) {
      res.status(400).json({ success: false, message: 'Challenge ID is required' });
      return;
    }

    const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!challenge) {
      res.status(404).json({ success: false, message: 'Challenge not found' });
      return;
    }

    // Stake amount in USDC (6 decimals)
    const amountUSDC = challenge.stakeAmount || 0;

    // Use the challenge's escrow address
    const escrowPubkey = challenge.escrowAddress;
    if (!escrowPubkey) {
      res.status(400).json({ success: false, message: 'Challenge escrow not configured' });
      return;
    }

    const quoteId = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + QUOTE_TTL_MS;
    quoteStore.set(quoteId, { challengeId, amountLamports: amountUSDC * 1_000_000, escrowPubkey, expiresAt });

    res.json({
      success: true,
      data: {
        quoteId,
        amount: amountUSDC,
        escrowAddress: escrowPubkey,
        expiresAt
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create stake quote' });
  }
};

export const useStakeQuote = (quoteId: string) => {
  const q = quoteStore.get(quoteId);
  if (!q) return null;
  if (Date.now() > q.expiresAt) {
    quoteStore.delete(quoteId);
    return null;
  }
  // Consume quote
  quoteStore.delete(quoteId);
  return q;
};






