const admin = require("firebase-admin");
const dotenv = require("dotenv");
const path = require("path");

// .env.local 로드
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

console.log("PROJECT_ID:", process.env.FIREBASE_PROJECT_ID);
console.log("CLIENT_EMAIL:", process.env.FIREBASE_CLIENT_EMAIL);
const key = process.env.FIREBASE_PRIVATE_KEY;
console.log("PRIVATE_KEY exists:", !!key);

if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: key?.replace(/\\n/g, "\n"),
            }),
        });
        console.log("Admin initialized successfully");
    } catch (error) {
        console.error("Initialization Error:", error.message);
        process.exit(1);
    }
}

const auth = admin.auth();
const db = admin.firestore();

async function simulateCreate() {
    const id = "test_server_001";
    const name = "서버테스트";
    const email = id + "@school.com";

    try {
        console.log("Attempting to create user in Auth...");
        const userRecord = await auth.createUser({
            uid: id,
            email: email,
            password: "password123",
            displayName: name
        });
        console.log("Auth User Created:", userRecord.uid);

        console.log("Attempting to save to Firestore...");
        await db.collection("users").doc(id).set({
            id, name, role: "student", createdAt: new Date().toISOString()
        });
        console.log("Firestore User Saved!");
    } catch (error) {
        console.error("SIMULATION ERROR:", error.code, error.message);
    }
}

simulateCreate();
