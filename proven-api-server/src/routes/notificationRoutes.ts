import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import {
  registerToken,
  removeToken,
  getPreferences,
  updatePreferences,
  getHistory,
  markAsRead,
  sendTestNotification,
  triggerJobs,
} from '../controllers/notification';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Push token management
router.post('/push-token', registerToken);
router.delete('/push-token', removeToken);

// Notification preferences
router.get('/preferences', getPreferences);
router.put('/preferences', updatePreferences);

// Notification history
router.get('/history', getHistory);
router.put('/:notificationId/read', markAsRead);

// Testing endpoints
router.post('/test', sendTestNotification);
router.post('/trigger-jobs', triggerJobs);

export default router;
