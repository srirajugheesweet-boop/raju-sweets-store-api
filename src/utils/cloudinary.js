import dotenv from 'dotenv';
dotenv.config();
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

// Configure Cloudinary using environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Uploads a PDF Buffer to Cloudinary as a private resource.
 * 
 * @param {Buffer} pdfBuffer The binary buffer of the generated PDF.
 * @param {string} orderId The unique order ID.
 * @returns {Promise<Object>} The Cloudinary upload result.
 */
export const uploadPrivatePdf = (pdfBuffer, orderId) => {
  return new Promise((resolve, reject) => {
    // Check configuration
    if (!process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME === 'your_cloudinary_cloud_name') {
      return reject(new Error('Cloudinary is not configured.'));
    }

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'invoices',
        public_id: `invoice_${orderId}`,
        resource_type: 'raw', // Since it's a PDF document
        type: 'private' // Ensures the file is private and requires a signature to download
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          return reject(error);
        }
        resolve(result);
      }
    );

    // Convert Buffer to readable stream and pipe to upload stream
    const readable = new Readable();
    readable._read = () => {};
    readable.push(pdfBuffer);
    readable.push(null);
    readable.pipe(stream);
  });
};

/**
 * Generates a signed, expiring URL for downloading a private raw asset.
 * 
 * @param {string} orderId The unique order ID.
 * @returns {string} The signed private download URL.
 */
export const getPrivateSignedUrl = (orderId) => {
  const publicId = `invoices/invoice_${orderId}`;
  
  // Create a signature that expires in 7 days
  const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); 

  return cloudinary.utils.private_download_url(publicId, 'raw', {
    resource_type: 'raw',
    expires_at: expiresAt
  });
};

/**
 * Uploads a base64 image string to Cloudinary as a private resource.
 * 
 * @param {string} base64Image The base64 data URI of the image.
 * @param {string} orderId The unique order ID.
 * @returns {Promise<Object>} The Cloudinary upload result.
 */
export const uploadPrivateInvoiceImage = (base64Image, orderId) => {
  return new Promise((resolve, reject) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME === 'your_cloudinary_cloud_name') {
      return reject(new Error('Cloudinary is not configured.'));
    }

    cloudinary.uploader.upload(
      base64Image,
      {
        folder: 'invoices',
        public_id: `invoice_${orderId}`,
        resource_type: 'image',
        type: 'private'
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary image upload error:", error);
          return reject(error);
        }
        resolve(result);
      }
    );
  });
};

/**
 * Generates a signed URL for a private image.
 * 
 * @param {string} orderId The unique order ID.
 * @returns {string} The signed image URL.
 */
export const getPrivateSignedImageUrl = (orderId) => {
  return cloudinary.url(`invoices/invoice_${orderId}`, {
    sign_url: true,
    type: 'private',
    secure: true,
    resource_type: 'image'
  });
};
