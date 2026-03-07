import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(request: Request) {
    try {
        const { uid } = await request.json();

        if (!uid) {
            return NextResponse.json({ error: "초기화할 사용자 ID(UID)가 필요합니다." }, { status: 400 });
        }

        if (!adminAuth || !adminDb) {
            return NextResponse.json({ error: "Firebase Admin SDK 설정 에러: Vercel 환경 변수(FIREBASE_PRIVATE_KEY)를 확인해주세요." }, { status: 500 });
        }

        const email = `${uid}@school.com`;
        let authUid = uid;

        // 학생 ID(uid 변수)와 실제 Firebase Auth UID가 다를 수 있으므로 이메일로 검색
        try {
            const userRecord = await adminAuth.getUserByEmail(email);
            authUid = userRecord.uid;
        } catch (e: any) {
            // 이메일로 못 찾으면 원래 uid로 시도
            if (e.code !== "auth/user-not-found") {
                throw e;
            }
        }

        // 1. Firebase Admin SDK를 사용하여 비밀번호를 123456으로 강제 업데이트
        await adminAuth.updateUser(authUid, {
            password: "123456"
        });

        // 2. Firestore의 isFirstLogin 필드를 true로 설정하여 다음 로그인 시 비밀번호 변경 유도
        await adminDb.collection("users").doc(uid).update({
            isFirstLogin: true,
            updatedAt: new Date().toISOString()
        });
        return NextResponse.json({
            success: true,
            message: "비밀번호가 123456으로 초기화되었으며, 다음 로그인 시 비밀번호 변경이 필요합니다."
        });

    } catch (error: any) {
        console.error("Error in reset-password API:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
