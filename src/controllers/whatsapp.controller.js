import twilio from 'twilio';
import { generatePdfBuffer } from '../utils/invoicePdf.js';
import { 
  uploadPrivatePdf, 
  getPrivateSignedUrl,
  uploadPrivateInvoiceImage,
  getPrivateSignedImageUrl
} from '../utils/cloudinary.js';

/**
 * Shared helper to send a WhatsApp message using Twilio
 */
const sendWhatsAppHelper = async ({ to, message, contentSid, contentVariables }) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;

  // Validate Twilio Credentials configuration
  if (
    !accountSid || 
    !authToken || 
    !fromNumber || 
    accountSid.includes('your_twilio') || 
    authToken.includes('your_twilio')
  ) {
    const configError = new Error('Twilio credentials are not configured or are still using default placeholders in the .env file.');
    configError.statusCode = 500;
    throw configError;
  }

  // Format the recipient phone number to Twilio's WhatsApp standard: "whatsapp:+<country_code><number>"
  let formattedTo = to.trim().replace(/[\s-()]/g, '');
  if (!formattedTo.startsWith('whatsapp:')) {
    if (/^\d{10}$/.test(formattedTo)) {
      formattedTo = '+91' + formattedTo;
    } else if (!formattedTo.startsWith('+')) {
      formattedTo = '+' + formattedTo;
    }
    formattedTo = `whatsapp:${formattedTo}`;
  }

  // Ensure the sender number is prefixed with "whatsapp:"
  let formattedFrom = fromNumber.trim();
  if (!formattedFrom.startsWith('whatsapp:')) {
    formattedFrom = `whatsapp:${formattedFrom}`;
  }

  // Initialize Twilio client
  const client = twilio(accountSid, authToken);

  // Prepare payload options
  const messageOptions = {
    from: formattedFrom,
    to: formattedTo
  };

  if (contentSid) {
    messageOptions.contentSid = contentSid;
    if (contentVariables) {
      messageOptions.contentVariables = typeof contentVariables === 'string'
        ? contentVariables
        : JSON.stringify(contentVariables);
    }
  } else {
    messageOptions.body = message;
  }

  // Send the message
  console.log("Twilio client.messages.create payload:", messageOptions);
  return await client.messages.create(messageOptions);
};

/**
 * Controller to send a freeform WhatsApp message using Twilio
 * POST /api/whatsapp/send
 */
export const sendWhatsAppMessage = async (req, res, next) => {
  try {
    const { to, message } = req.body;

    // Validate inputs
    if (!to || !to.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Recipient number "to" is required.'
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message body "message" is required.'
      });
    }

    const twilioResponse = await sendWhatsAppHelper({ to, message });

    return res.status(200).json({
      success: true,
      message: 'WhatsApp message sent successfully.',
      data: {
        sid: twilioResponse.sid,
        status: twilioResponse.status,
        to: twilioResponse.to,
        from: twilioResponse.from,
        dateCreated: twilioResponse.dateCreated
      }
    });

  } catch (error) {
    console.error("WhatsApp Message Error:", error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

/**
 * Controller to send the "Order Ready" WhatsApp template
 * POST /api/whatsapp/send-order-ready
 */
export const sendOrderReadyNotification = async (req, res, next) => {
  try {
    const { to, customerName, boxes, pendingAmount, paymentStatus } = req.body;

    // Validate inputs
    if (!to || !to.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Recipient number "to" is required.'
      });
    }

    if (!customerName || !customerName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Customer name "customerName" is required.'
      });
    }

    if (boxes === undefined || boxes === null || String(boxes).trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Number of boxes "boxes" is required.'
      });
    }

    if (!pendingAmount || !pendingAmount.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Pending amount "pendingAmount" is required.'
      });
    }

    if (!paymentStatus || !paymentStatus.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Payment status "paymentStatus" is required.'
      });
    }

    const templateSid = process.env.TWILIO_WHATSAPP_TEMPLATE_SID;
    let twilioResponse;

    if (templateSid && templateSid !== 'your_approved_template_content_sid_here') {
      // Send message using approved WhatsApp template to allow sending outside the 24h messaging window
      const contentVariables = {
        "1": customerName.trim(),
        "2": String(boxes).trim(),
        "3": pendingAmount.trim(),
        "4": paymentStatus.trim()
      };
      twilioResponse = await sendWhatsAppHelper({
        to,
        contentSid: templateSid,
        contentVariables
      });
    } else {
      // Fallback: Construct the exact approved WhatsApp template body (fails outside 24h window)
      const message = `Hello ${customerName.trim()} 👋,

Greetings from RAJU GHEE SWEETS!

Your order is ready for delivery. 🚚

📦 Boxes: ${String(boxes).trim()}
💰 Pending Amount: ${pendingAmount.trim()}
💳 Payment Status: ${paymentStatus.trim()}

Please be ready to receive the delivery.

Thank you for your business! 😊`.replace(/\r\n/g, '\n');

      twilioResponse = await sendWhatsAppHelper({ to, message });
    }

    return res.status(200).json({
      success: true,
      message: 'WhatsApp "Order Ready" template message sent successfully.',
      data: {
        sid: twilioResponse.sid,
        status: twilioResponse.status,
        to: twilioResponse.to,
        from: twilioResponse.from,
        dateCreated: twilioResponse.dateCreated
      }
    });

  } catch (error) {
    console.error("Order Ready Notification Error:", error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

/**
 * Controller to send the "Order Confirmed" WhatsApp template with private PDF Invoice
 * POST /api/whatsapp/send-order-confirmation
 */
export const sendOrderConfirmationNotification = async (req, res, next) => {
  try {
    const { order, invoiceImage } = req.body;
    if (!order) {
      return res.status(400).json({
        success: false,
        message: 'Order details "order" is required.'
      });
    }

    const to = order.customerPhone || '';
    if (!to || !to.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Customer phone is required on the order.'
      });
    }

    let invoiceUrl = '';

    // If base64 invoice image is sent, upload it as private image
    if (invoiceImage && invoiceImage.trim().startsWith('data:image')) {
      try {
        console.log("Uploading base64 invoice image to Cloudinary for order:", order.orderId);
        const uploadResult = await uploadPrivateInvoiceImage(invoiceImage, order.orderId);
        console.log("Cloudinary image upload successful:", uploadResult.public_id);

        // Get signed URL for the image
        invoiceUrl = getPrivateSignedImageUrl(order.orderId);
        console.log("Generated secure Cloudinary invoice image URL:", invoiceUrl);
      } catch (imageUploadError) {
        console.error("Failed to upload invoice image to Cloudinary:", imageUploadError.message);
      }
    }

    // Fallback to generating and uploading PDF if image upload failed or was not provided
    if (!invoiceUrl) {
      try {
        // 1. Generate PDF buffer
        console.log("Generating invoice PDF buffer for order:", order.orderId);
        const pdfBuffer = await generatePdfBuffer(order);

        // 2. Upload to Cloudinary
        console.log("Uploading invoice PDF to Cloudinary...");
        const uploadResult = await uploadPrivatePdf(pdfBuffer, order.orderId);
        console.log("Cloudinary upload successful:", uploadResult.public_id);
        
        // 3. Get signed URL
        invoiceUrl = getPrivateSignedUrl(order.orderId);
        console.log("Generated secure Cloudinary invoice URL:", invoiceUrl);
      } catch (uploadError) {
        console.error("Failed to generate/upload PDF to Cloudinary:", uploadError.message);
        // Fallback placeholder URL so Twilio doesn't fail
        invoiceUrl = `https://raju-sweets-store.vercel.app/orders/${order.orderId}`;
      }
    }

    // 4. Send Twilio template message
    const templateSid = 'HX33743d99c66dcb635a0c596900549cca';
    
    const balance = Math.max(0, (order.totalAmount || 0) - (order.receivedAmount || 0));
    const contentVariables = {
      "1": order.customerName || 'Customer',
      "2": "Raju Ghee sweets",
      "3": order.orderId,
      "4": String(order.items?.length || 0),
      "5": `${order.deliveryDate || ''} ${order.deliveryTime || ''}`.trim() || 'N/A',
      "6": Number(order.totalAmount || 0).toFixed(2),
      "7": Number(order.receivedAmount || 0).toFixed(2),
      "8": Number(balance).toFixed(2),
      "9": invoiceUrl
    };

    console.log("Sending WhatsApp order confirmation template:", contentVariables);
    const twilioResponse = await sendWhatsAppHelper({
      to,
      contentSid: templateSid,
      contentVariables
    });

    return res.status(200).json({
      success: true,
      message: 'WhatsApp order confirmation message sent successfully.',
      data: {
        sid: twilioResponse.sid,
        status: twilioResponse.status,
        to: twilioResponse.to,
        from: twilioResponse.from,
        dateCreated: twilioResponse.dateCreated,
        invoiceUrl
      }
    });

  } catch (error) {
    console.error("Order Confirmation Notification Error:", error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

