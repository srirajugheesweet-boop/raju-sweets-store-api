import express from 'express';
import { sendWhatsAppMessage, sendOrderReadyNotification, sendOrderConfirmationNotification } from '../controllers/whatsapp.controller.js';

const router = express.Router();

// Route to send a WhatsApp message
router.post('/send', sendWhatsAppMessage);

// Route to send the "Order Ready" template
router.post('/send-order-ready', sendOrderReadyNotification);

// Route to send the "Order Confirmed" template with PDF Invoice upload
router.post('/send-order-confirmation', sendOrderConfirmationNotification);

export default router;
