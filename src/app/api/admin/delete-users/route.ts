import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(request: Request) {
    try {
        const { userIds } = await request.json();

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return NextResponse.json({ error: "삭제할 사용자 ID 목록이 필요합니다." }, { status: 400 });
        }

        const results = {
            authSuccess: 0,
            authFailure: 0,
            firestoreSuccess: 0,
            firestoreFailure: 0
        };

        // 1. Firebase Auth 계정 삭제
        const deleteUsersResult = await adminAuth.deleteUsers(userIds);
        results.authSuccess = userIds.length - deleteUsersResult.failureCount;
        results.authFailure = deleteUsersResult.failureCount;

        // 2. Firestore 문서 삭제 (Batch 사용)
        const batch = adminDb.batch();
        userIds.forEach(uid => {
            batch.delete(adminDb.collection("users").doc(uid));
        });

        await batch.commit(); // 커밋 실패 시 에러 발생하여 catch로 이동하게 함
        results.firestoreSuccess = userIds.length;

        // 3. 수업(Classes) 배정 정보에서도 해당 학생 ID 삭제
        const classesSnap = await adminDb.collection("classes").get();
        const classBatch = adminDb.batch();
        let classUpdated = false;

        classesSnap.forEach(classDoc => {
            const data = classDoc.data();
            const studentIds = data.studentIds || [];
            const filteredIds = studentIds.filter((id: string) => !userIds.includes(id));

            if (filteredIds.length !== studentIds.length) {
                classBatch.update(classDoc.ref, { studentIds: filteredIds });
                classUpdated = true;
            }
        });

        if (classUpdated) {
            await classBatch.commit();
        }

        // 4. 모든 세션(Sessions)의 예약 정보에서도 해당 학생 ID 삭제
        const sessionsSnap = await adminDb.collection("sessions").get();
        const sessionBatch = adminDb.batch();
        let sessionUpdated = false;

        sessionsSnap.forEach(sessionDoc => {
            const data = sessionDoc.data();
            const currentRes = data.reservations || {};
            const newRes = { ...currentRes };
            let changed = false;

            Object.keys(newRes).forEach(seatId => {
                if (userIds.includes(newRes[seatId])) {
                    delete newRes[seatId];
                    changed = true;
                }
            });

            if (changed) {
                sessionBatch.update(sessionDoc.ref, { reservations: newRes });
                sessionUpdated = true;
            }
        });

        if (sessionUpdated) {
            await sessionBatch.commit();
        }

        return NextResponse.json({
            success: true,
            message: `${results.authSuccess}명의 계정 및 관련 정보가 삭제되었습니다.`,
            results
        });

    } catch (error: any) {
        console.error("Error in delete-users API:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
