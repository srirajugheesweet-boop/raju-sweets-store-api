import express from 'express';
import { sendWhatsAppMessage, sendOrderReadyNotification } from '../controllers/whatsapp.controller.js';

const router = express.Router();

// Route to send a WhatsApp message
router.post('/send', sendWhatsAppMessage);

// Route to send the "Order Ready" template
router.post('/send-order-ready', sendOrderReadyNotification);

export default router;
