require("dotenv").config({ path: ".env.local" });
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/^["']|["']$/g, '')?.replace(/\\n/g, "\n");

try {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
} catch (e) {
    if (!/already exists/.test(e.message)) {
        console.error("Firebase initialization error", e);
        process.exit(1);
    }
}

const db = getFirestore();

async function checkUsers() {
    const snapshot = await db.collection("users").get();
    console.log("Total users:", snapshot.size);
    snapshot.forEach(doc => {
        console.log(`Doc ID: ${doc.id}, Data:`, doc.data());
    });
}

checkUsers().catch(console.error);
