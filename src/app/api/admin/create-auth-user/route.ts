import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { users } = body; // Expecting an array of users for bulk or a single user object
    const userDataArray = Array.isArray(users) ? users : [body];

    const results = [];

    for (const user of userDataArray) {
      const { id, name, email, password = "123456" } = user;

      if (!id || !name || !email) {
        results.push({ id, status: "error", message: "Missing required fields" });
        continue;
      }

      try {
        // 1. Firebase Auth 사용자 생성 또는 조회
        let userRecord;
        try {
          userRecord = await adminAuth.getUserByEmail(email);
        } catch (e: any) {
          if (e.code === 'auth/user-not-found') {
            userRecord = await adminAuth.createUser({
              uid: id,
              email,
              password,
              displayName: name,
            });
          } else {
            throw e;
          }
        }

        // 2. Firestore 사용자 프로필 생성/업데이트
        const userRef = adminDb.collection("users").doc(id);
        const existingDoc = await userRef.get();
        const existingPoints = existingDoc.exists ? (existingDoc.data()?.points ?? 10000) : 10000;

        await userRef.set({
          id,
          name,
          role: "student",
          isFirstLogin: true,
          email,
          points: existingPoints,
          createdAt: new Date().toISOString()
        }, { merge: true });

        results.push({ id, status: "success", uid: userRecord.uid });
      } catch (error: any) {
        console.error(`Error creating user ${id}:`, error);
        results.push({ id, status: "error", message: error.message });
      }
    }

    const successCount = results.filter(r => r.status === "success").length;
    const errors = results.filter(r => r.status === "error");

    return NextResponse.json({
      success: true,
      results,
      message: `${successCount}명의 학생 계정이 처리되었습니다. (초기 비밀번호: 123456, 초기 포인트: 10,000P)`,
      errorDetail: errors.length > 0 ? errors[0].message : null
    });
  } catch (error: any) {
    console.error("Critical error in create-auth-user API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}