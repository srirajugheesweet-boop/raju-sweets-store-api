import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Initialize Firebase Admin SDK (once) ────────────────────────────────────
let adminInitialized = false;

function ensureAdminInitialized() {
  if (adminInitialized || admin.apps.length > 0) {
    adminInitialized = true;
    return;
  }

  // Option 1: Path to service account JSON file
  const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (saPath) {
    const resolvedPath = resolve(__dirname, '../../', saPath);
    if (existsSync(resolvedPath)) {
      const serviceAccount = JSON.parse(readFileSync(resolvedPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      adminInitialized = true;
      console.log('✅ Firebase Admin initialized from service account file');
      return;
    }
  }

  // Option 2: Service account JSON as env variable (for Vercel/serverless)
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (saJson) {
    try {
      const serviceAccount = JSON.parse(saJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      adminInitialized = true;
      console.log('✅ Firebase Admin initialized from env JSON');
      return;
    } catch (e) {
      console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
    }
  }

  console.warn('⚠️  Firebase Admin NOT initialized — set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON in .env');
}

// ─── Firestore client via Admin SDK ──────────────────────────────────────────
function getFirestore() {
  ensureAdminInitialized();
  return admin.firestore();
}

function getMessaging() {
  ensureAdminInitialized();
  return admin.messaging();
}

// ─── Notification message templates ──────────────────────────────────────────
const buildNotificationPayload = (eventType, data) => {
  switch (eventType) {
    case 'item_moved_to_store':
      return {
        title: '🏪 Items Arrived at Store',
        body: `${data.itemName || 'Item'} (${data.quantity || ''}) for Order #${data.orderId || ''} has been moved to ${data.storeName || 'the store'}`,
        icon: '/logo.png',
        tag: `store-${data.storeId}-order-${data.orderId}`
      };

    case 'order_assigned_to_munit':
      return {
        title: '🏭 New Order Assigned',
        body: `Order #${data.orderId || ''} for ${data.customerName || 'a customer'} has been assigned to your manufacturing unit`,
        icon: '/logo.png',
        tag: `munit-${data.mUnitId}-order-${data.orderId}`
      };

    case 'item_moved_to_packing':
      return {
        title: '📦 Item Ready for Packing',
        body: `${data.itemName || 'Item'} (${data.quantity || ''}) for Order #${data.orderId || ''} is ready and moved to your packing unit`,
        icon: '/logo.png',
        tag: `punit-${data.pUnitId}-order-${data.orderId}`
      };

    default:
      return {
        title: '🔔 Raju Ghee Sweets',
        body: data.message || 'You have a new update',
        icon: '/logo.png',
        tag: `general-${Date.now()}`
      };
  }
};

// ─── Query users by their access field ───────────────────────────────────────
async function getUserTokensForEvent(eventType, entityId) {
  const db = getFirestore();
  let accessField;

  switch (eventType) {
    case 'item_moved_to_store':
      accessField = 'access.stores';
      break;
    case 'order_assigned_to_munit':
      accessField = 'access.mUnits';
      break;
    case 'item_moved_to_packing':
      accessField = 'access.pUnits';
      break;
    default:
      return [];
  }

  // Query users matching: specific access, role = admin, or access contains 'all'
  const [snapshot, adminSnapshot, allSnapshot] = await Promise.all([
    db.collection('users').where(accessField, 'array-contains', entityId).get(),
    db.collection('users').where('role', '==', 'admin').get(),
    db.collection('users').where(accessField, 'array-contains', 'all').get()
  ]);

  const tokens = [];
  const addTokensFromSnap = (snap) => {
    snap.forEach(doc => {
      const userData = doc.data();
      const userTokens = userData.fcmTokens || [];
      tokens.push(...userTokens.filter(t => !!t));
    });
  };

  addTokensFromSnap(snapshot);
  addTokensFromSnap(adminSnapshot);
  addTokensFromSnap(allSnapshot);

  return [...new Set(tokens)]; // deduplicate
}

// ─── Send FCM notifications in batches of 500 ────────────────────────────────
async function sendFCMMessages(tokens, notification, data = {}) {
  if (!tokens || tokens.length === 0) {
    console.log('📭 No tokens to send notifications to');
    return { successCount: 0, failureCount: 0 };
  }

  const messaging = getMessaging();
  let successCount = 0;
  let failureCount = 0;
  const invalidTokens = [];

  // FCM multicast supports up to 500 tokens per request
  const batchSize = 500;
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    
    const message = {
      tokens: batch,
      notification: {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.icon
      },
      webpush: {
        headers: {
          Urgency: 'high'
        },
        notification: {
          title: notification.title,
          body: notification.body,
          icon: notification.icon || '/logo.png',
          badge: '/logo.png',
          tag: notification.tag,
          requireInteraction: true,
          actions: [
            { action: 'open', title: '👀 Open App' }
          ]
        },
        fcmOptions: {
          link: '/'
        }
      },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      )
    };

    try {
      const response = await messaging.sendEachForMulticast(message);
      successCount += response.successCount;
      failureCount += response.failureCount;

      // Collect invalid/expired tokens for cleanup
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (
            errorCode === 'messaging/registration-token-not-registered' ||
            errorCode === 'messaging/invalid-registration-token'
          ) {
            invalidTokens.push(batch[idx]);
          }
          console.warn(`FCM error for token ${batch[idx]?.substring(0, 20)}...: ${resp.error?.message}`);
        }
      });
    } catch (err) {
      console.error('FCM batch send error:', err);
      failureCount += batch.length;
    }
  }

  // Cleanup invalid tokens from Firestore in background
  if (invalidTokens.length > 0) {
    cleanupInvalidTokens(invalidTokens).catch(console.error);
  }

  console.log(`📬 FCM sent — ✅ ${successCount} success, ❌ ${failureCount} failed`);
  return { successCount, failureCount };
}

// ─── Remove invalid/expired FCM tokens from user docs ────────────────────────
async function cleanupInvalidTokens(invalidTokens) {
  if (!invalidTokens || invalidTokens.length === 0) return;
  
  try {
    const db = getFirestore();
    const tokenSet = new Set(invalidTokens);
    const snapshot = await db.collection('users').get();
    
    const updates = [];
    snapshot.forEach(docSnap => {
      const userData = docSnap.data();
      const existingTokens = userData.fcmTokens || [];
      const cleanedTokens = existingTokens.filter(t => !tokenSet.has(t));
      
      if (cleanedTokens.length !== existingTokens.length) {
        updates.push(
          docSnap.ref.update({ fcmTokens: cleanedTokens })
        );
      }
    });
    
    await Promise.all(updates);
    console.log(`🧹 Cleaned up ${invalidTokens.length} invalid FCM tokens`);
  } catch (err) {
    console.error('Token cleanup error:', err);
  }
}

// ─── Main Controller ──────────────────────────────────────────────────────────

/**
 * POST /api/notifications/send
 * Body: { eventType, entityId, data }
 *
 * eventType: 'item_moved_to_store' | 'order_assigned_to_munit' | 'item_moved_to_packing'
 * entityId:  storeId | mUnitId | pUnitId  (the entity the user must have access to)
 * data:      { orderId, customerName, itemName, quantity, storeName, ... }
 */
export const sendNotification = async (req, res) => {
  const { eventType, entityId, data = {} } = req.body;

  if (!eventType || !entityId) {
    return res.status(400).json({
      success: false,
      message: 'eventType and entityId are required'
    });
  }

  try {
    ensureAdminInitialized();

    if (!adminInitialized && admin.apps.length === 0) {
      return res.status(503).json({
        success: false,
        message: 'Firebase Admin not initialized — add service account credentials'
      });
    }

    // 1. Find relevant user tokens
    const tokens = await getUserTokensForEvent(eventType, entityId);
    console.log(`🔍 Found ${tokens.length} FCM tokens for event "${eventType}" on entity "${entityId}"`);

    if (tokens.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No users with tokens found for this entity',
        sent: 0
      });
    }

    // 2. Build notification payload
    const notification = buildNotificationPayload(eventType, { ...data, entityId });

    // 3. Send FCM messages
    const { successCount, failureCount } = await sendFCMMessages(tokens, notification, {
      eventType,
      entityId,
      ...data
    });

    return res.status(200).json({
      success: true,
      message: `Notifications sent`,
      sent: successCount,
      failed: failureCount,
      totalTokens: tokens.length
    });

  } catch (error) {
    console.error('sendNotification error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to send notifications'
    });
  }
};
