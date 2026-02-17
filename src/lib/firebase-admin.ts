import * as admin from "firebase-admin";

if (!admin.apps.length) {
    try {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY
            ?.replace(/^"(.*)"$/, '$1') // 따옴표 제거
            ?.replace(/\\n/g, "\n");   // 이스케이프된 줄바꿈 처리

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: privateKey,
            }),
        });
    } catch (error) {
        console.error("Firebase Admin initialization error", error);
    }
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();
