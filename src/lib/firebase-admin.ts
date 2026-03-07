import * as admin from "firebase-admin";

let adminApp: admin.app.App | null = null;

if (!admin.apps.length) {
      const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY
            ?.replace(/^"(.*)"$/, '$1')
            ?.replace(/\\n/g, "\n");

      if (projectId && clientEmail && privateKey) {
            try {
                  adminApp = admin.initializeApp({
                        credential: admin.credential.cert({
                              projectId,
                              clientEmail,
                              privateKey,
                        }),
                  });
            } catch (error) {
                  console.error("Firebase Admin initialization error", error);
            }
      } else {
            console.warn("Firebase Admin SDK environment variables not set. Admin features will be disabled.");
      }
} else {
      adminApp = admin.apps[0] || null;
}

export const adminAuth = adminApp ? adminApp.auth() : null;
export const adminDb = adminApp ? adminApp.firestore() : null;
