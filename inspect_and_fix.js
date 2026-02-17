const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

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

async function inspectAndFix() {
    try {
        console.log("Listing all Auth users...");
        const listUsersResult = await admin.auth().listUsers();
        listUsersResult.users.forEach((user) => {
            console.log(`Auth User: UID=${user.uid}, Email=${user.email}, DisplayName=${user.displayName}`);
        });

        const adminEmail = "admin@school.com";
        let conflictUser = null;
        try {
            conflictUser = await admin.auth().getUserByEmail(adminEmail);
            console.log(`Conflict User Found: UID=${conflictUser.uid}, Email=${conflictUser.email}`);
        } catch (e) { }

        // 만약 충돌 계정이 있고, 그 계정이 'admin' UID가 아니라면 삭제 (또는 이메일 변경)
        if (conflictUser && conflictUser.uid !== "admin") {
            console.log(`Deleting conflict user ${conflictUser.uid} to reclaim ${adminEmail}`);
            await admin.auth().deleteUser(conflictUser.uid);
            console.log("Conflict user deleted.");
        }

        // 이제 'admin' UID 계정 생성/업데이트
        try {
            await admin.auth().updateUser("admin", {
                email: adminEmail,
                password: "123456",
                displayName: "관리자"
            });
            console.log("Updated 'admin' account.");
        } catch (e) {
            if (e.code === 'auth/user-not-found') {
                await admin.auth().createUser({
                    uid: "admin",
                    email: adminEmail,
                    password: "123456",
                    displayName: "관리자"
                });
                console.log("Created 'admin' account.");
            } else {
                console.error("Error with 'admin' account:", e.message);
            }
        }

        // Firestore 동기화
        const db = admin.firestore();
        await db.collection("users").doc("admin").set({
            id: "admin",
            name: "관리자",
            role: "teacher",
            email: adminEmail,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log("Firestore synced for 'admin'.");

    } catch (error) {
        console.error("Inspection failed:", error);
    } finally {
        process.exit();
    }
}

inspectAndFix();
