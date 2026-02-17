
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env.local 파일 로드
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function createAccount(id, name, role, password) {
    const email = `${id}@school.com`;
    console.log(`생성 중: ${email} (${role})...`);

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        await setDoc(doc(db, "users", uid), {
            id: id,
            name: name,
            role: role,
            email: email,
            createdAt: new Date().toISOString()
        });

        console.log(`성공: ${id} 계정이 생성되었습니다.`);
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            console.log(`알림: ${id} 계정은 이미 존재합니다.`);
        } else {
            console.error(`오류 (${id}):`, error.message);
        }
    }
}

async function main() {
    // 교사 계정
    await createAccount("teacher1", "관리교사", "teacher", "password123");
    // 학생 계정
    await createAccount("30201", "홍길동", "student", "password123");

    console.log("모든 작업이 완료되었습니다.");
    process.exit(0);
}

main();
