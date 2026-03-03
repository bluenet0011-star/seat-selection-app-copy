"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

interface Student {
    id: string; // 학번
    uid: string; // auth uid
    name: string;
    email: string;
    points: number;
}

export default function AdminUsersPage() {
    const router = useRouter();
    const { userData, loading: authLoading } = useAuth();
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);

    const [editUid, setEditUid] = useState<string | null>(null);
    const [editPoints, setEditPoints] = useState<number | "">("");

    useEffect(() => {
        if (authLoading) return;
        if (!userData || userData.role !== 'teacher') {
            router.push('/');
            return;
        }

        const q = query(collection(db, "users"), where("role", "==", "student"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const list: Student[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                list.push({
                    uid: doc.id,
                    id: data.id || doc.id,
                    name: data.name || "이름 없음",
                    email: data.email || "",
                    points: data.points !== undefined ? data.points : 0
                });
            });
            // 학번 순 정렬
            list.sort((a, b) => a.id.localeCompare(b.id));
            setStudents(list);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [userData, authLoading, router]);

    const handleSavePoints = async (uid: string) => {
        if (editPoints === "" || editPoints < 0) {
            alert("유효한 포인트를 입력하세요.");
            return;
        }

        try {
            await updateDoc(doc(db, "users", uid), {
                points: Number(editPoints)
            });
            setEditUid(null);
            setEditPoints("");
        } catch (error) {
            console.error(error);
            alert("포인트 수정 중 오류가 발생했습니다.");
        }
    };

    if (authLoading || loading) return <div className="p-8 text-center">불러오는 중...</div>;

    return (
        <div className="container">
            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ color: 'var(--primary)' }}>학생 포인트 관리 (실시간 현황)</h2>
                    <button onClick={() => router.push('/admin/sessions')} className="btn-secondary">이전으로</button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--border)' }}>
                                <th style={{ padding: '12px', width: '15%' }}>학번</th>
                                <th style={{ padding: '12px', width: '25%' }}>이름</th>
                                <th style={{ padding: '12px', width: '35%' }}>현재 포인트</th>
                                <th style={{ padding: '12px', width: '25%' }}>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.map((student) => (
                                <tr key={student.uid} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '12px', color: 'var(--secondary)' }}>{student.id}</td>
                                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{student.name}</td>
                                    <td style={{ padding: '12px' }}>
                                        {editUid === student.uid ? (
                                            <input
                                                type="number"
                                                value={editPoints}
                                                onChange={(e) => setEditPoints(Number(e.target.value))}
                                                style={{ padding: '6px', width: '120px', borderRadius: '4px', border: '1px solid var(--primary)' }}
                                            />
                                        ) : (
                                            <span style={{ fontSize: '1.1rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                                                {student.points.toLocaleString()} <span style={{ fontSize: '0.8rem', color: 'var(--text)' }}>P</span>
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        {editUid === student.uid ? (
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button onClick={() => handleSavePoints(student.uid)} className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>저장</button>
                                                <button onClick={() => setEditUid(null)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>취소</button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => { setEditUid(student.uid); setEditPoints(student.points); }}
                                                className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                                                포인트 수정
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {students.length === 0 && (
                                <tr>
                                    <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--secondary)' }}>
                                        등록된 학생이 없습니다.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
