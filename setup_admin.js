import { adminAuth } from "./src/lib/firebase-admin";

async function checkAdmin() {
    try {
        const id = "teacher1";
        const email = "teacher1@school.com";

        let user;
        try {
            user = await adminAuth.getUserByEmail(email);
            console.log("Admin user found:", user.uid);
        } catch (e) {
            console.log("Admin user not found. Creating...");
            user = await adminAuth.createUser({
                uid: id,
                email: email,
                password: "password123",
                displayName: "관리자"
            });
        }

        // 비밀번호를 'password123'으로 초기화 (테스트용)
        await adminAuth.updateUser(user.uid, {
            password: "password123"
        });
        console.log("Admin password reset to: password123");
    } catch (error) {
        console.error("Error:", error);
    }
}

checkAdmin();
