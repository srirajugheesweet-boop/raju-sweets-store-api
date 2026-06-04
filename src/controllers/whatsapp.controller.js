import twilio from 'twilio';

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

