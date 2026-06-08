import express from 'express';
import { sendNotification } from '../controllers/notification.controller.js';

const router = express.Router();

// POST /api/notifications/send
// Body: { eventType, entityId, data }
router.post('/send', sendNotification);

export default router;
