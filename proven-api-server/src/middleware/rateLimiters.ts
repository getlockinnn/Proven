import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

function keyByUserOrIp(req: Request): string {
  const userId: string | undefined = (req as any)?.user?.id;
  if (userId) return userId;
  

  return ipKeyGenerator(req as any);
}

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  skip: (req) => req.method === 'OPTIONS' || req.path === '/health',
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
  },
});