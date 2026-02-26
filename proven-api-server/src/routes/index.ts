// imported required modules
import { Router } from 'express';
import challengeRoutes from './challengeRoutes';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes';
import transactionRoutes from './transactionRoutes';
import submissionRoutes from './submissionRoutes';
import storageRoutes from './storageRoutes';
import faucetRoutes from './faucetRoutes';
import adminRoutes from './adminRoutes';
import leaderboardRoutes from './leaderboardRoutes';
import notificationRoutes from './notificationRoutes';


// intlise the router
const router = Router();

router.use('/challenges', challengeRoutes); // challenge routes
router.use('/auth', authRoutes); // auth routes
router.use('/users', userRoutes); // user routes
router.use('/transactions', transactionRoutes); // transaction routes
router.use('/submissions', submissionRoutes); // submission routes
router.use('/storage', storageRoutes); // storage proxy routes
router.use('/faucet', faucetRoutes);  // faucet routes
router.use('/admin', adminRoutes);  // admin routes
router.use('/leaderboard', leaderboardRoutes);  // leaderboard routes
router.use('/notifications', notificationRoutes);  // notification routes

export default router; 