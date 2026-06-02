import express from 'express';
import healthRouter from './health.routes.js';
import whatsappRouter from './whatsapp.routes.js';

const router = express.Router();

// Health Check
router.use('/health', healthRouter);

// WhatsApp Messaging
router.use('/whatsapp', whatsappRouter);

// Add other routes here, for example:
// router.use('/auth', authRouter);
// router.use('/products', productsRouter);

export default router;
