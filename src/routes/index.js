import express from 'express';
import healthRouter from './health.routes.js';
import whatsappRouter from './whatsapp.routes.js';
import notificationRouter from './notification.routes.js';

const router = express.Router();

// Health Check
router.use('/health', healthRouter);

// WhatsApp Messaging
router.use('/whatsapp', whatsappRouter);

// Push Notifications (FCM)
router.use('/notifications', notificationRouter);

export default router;
