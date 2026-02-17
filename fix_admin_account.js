const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// .env.local 정교하게 파싱
function parseEnv() {
    const envPath = path.join(__dirname, ".env.local");
    const content = fs.readFileSync(envPath, "utf8");
    const lines = content.split(/\r?\n/);
    const env = {};
    lines.forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            let value = match[2] || "";
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.substring(1, value.length - 1);
            } else if (value.startsWith("'") && value.endsWith("'")) {
                value = value.substring(1, value.length - 1);
            }
            env[match[1]] = value.replace(/\\n/g, "\n");
        }
    });
    return env;
}

const env = parseEnv();

const serviceAccount = {
    project_id: env["FIREBASE_PROJECT_ID"],
    client_email: env["FIREBASE_CLIENT_EMAIL"],
    private_key: env["FIREBASE_PRIVATE_KEY"],
};

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const auth = admin.auth();
const db = admin.firestore();

async function fixAdmin() {
    try {
        console.log("Checking admin account...");

        // 1. Firestore에서 role이 teacher인 사용자 찾기
        const usersSnap = await db.collection("users").where("role", "==", "teacher").get();
        if (usersSnap.empty) {
            console.log("No teacher found in Firestore. Creating one...");
            const uid = "admin-uid-temporary"; // 기본 UID
            await db.collection("users").doc(uid).set({
                id: "admin",
                name: "관리자",
                role: "teacher",
                email: "admin@school.com",
                createdAt: new Date().toISOString()
            });
            console.log("Created admin in Firestore.");
        }

        const usersSnapFinal = await db.collection("users").where("role", "==", "teacher").get();
        for (const adminDoc of usersSnapFinal.docs) {
            const adminData = adminDoc.data();
            const uid = adminDoc.id;

            console.log(`Syncing admin: UID=${uid}, currentID=${adminData.id}`);

            // ID를 'admin'으로 업데이트
            if (adminData.id !== "admin") {
                await adminDoc.ref.update({ id: "admin" });
                console.log(`Updated Firestore ID to 'admin'`);
            }

            // Auth 계정 생성/업데이트
            try {
                await auth.updateUser(uid, {
                    email: "admin@school.com",
                    password: "123456",
                    displayName: adminData.name || "관리자"
                });
                console.log("Updated Auth account: email=admin@school.com, password=123456");
            } catch (e) {
                if (e.code === 'auth/user-not-found') {
                    await auth.createUser({
                        uid: uid,
                        email: "admin@school.com",
                        password: "123456",
                        displayName: adminData.name || "관리자"
                    });
                    console.log("Created missing Auth account.");
                } else {
                    console.error("Auth update error:", e.message);
                }
            }
        }

        console.log("Admin account fix completed successfully.");
    } catch (error) {
        console.error("Critical error fixing admin:", error);
    } finally {
        process.exit();
    }
}

fixAdmin();
