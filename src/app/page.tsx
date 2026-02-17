"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

interface Session {
    id: string;
    title: string;
    status: "open" | "closed" | "scheduled";
    createdAt: string;
    scheduledOpenAt?: string;
}

export default function HomePage() {
    const { userData } = useAuth();
    const router = useRouter();
    const [openSessions, setOpenSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [now, setNow] = useState(new Date());

    // 실시간 타이머 (예약 세션 자동 오픈용)
    useEffect(() => {
        const timer = setInterval(() => {
            setNow(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // 1. 학생의 소속 수업 목록 가져오기
    const [myClassIds, setMyClassIds] = useState<string[]>([]);

    useEffect(() => {
        if (!userData || userData.role !== "student") return;

        const q = query(
            collection(db, "classes"),
            where("studentIds", "array-contains", userData.id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMyClassIds(snapshot.docs.map(doc => doc.id));
        });

        return () => unsubscribe();
    }, [userData]);

    // 2. 활성 세션 실시간 구독 (수업 기반 필터링 포함)
    useEffect(() => {
        if (!userData) return;

        const sessionsQuery = query(
            collection(db, "sessions"),
            where("status", "in", ["open", "scheduled"])
        );

        const unsubscribe = onSnapshot(sessionsQuery, (snapshot) => {
            let sessions = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Session));

            if (userData.role === "student") {
                sessions = sessions.filter(s => myClassIds.includes((s as any).classId));
            }

            // 안전한 정렬 (createdAt 누락 대응)
            sessions.sort((a, b) => {
                const dateA = a.createdAt || "";
                const dateB = b.createdAt || "";
                return dateB.localeCompare(dateA);
            });

            setOpenSessions(sessions);
            setLoading(false);
        }, (error) => {
            console.error("세션 로드 오류:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [userData, myClassIds]);

    return (
        <div>
            <div className="card" style={{ marginBottom: '2rem', background: 'linear-gradient(135deg, var(--primary), #60a5fa)', color: 'white' }}>
                <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>반갑습니다, {userData?.name}님!</h1>
                <p>오늘의 좌석 신청 현황을 확인하거나 새로운 예약을 진행하세요.</p>
            </div>

            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                <div className="card" style={{ borderTop: '4px solid var(--primary)' }}>
                    <h3>현재 진행 중인 세션</h3>
                    <p style={{ color: 'var(--secondary)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                        지금 참여하여 좌석을 신청할 수 있는 세션들입니다.
                    </p>

                    <div style={{ marginTop: '1.5rem' }}>
                        {loading ? (
                            <p style={{ textAlign: 'center', color: 'var(--secondary)' }}>로딩 중...</p>
                        ) : openSessions.length === 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--secondary)', padding: '1rem' }}>
                                현재 진행 중인 좌석 신청 세션이 없습니다.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {openSessions.map(session => {
                                    const isScheduled = session.status === "scheduled";
                                    const isLocked = isScheduled && session.scheduledOpenAt && new Date(session.scheduledOpenAt) > now;

                                    return (
                                        <button
                                            key={session.id}
                                            onClick={() => !isLocked && router.push(`/booking/${session.id}`)}
                                            disabled={isLocked}
                                            style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                padding: '1rem',
                                                borderRadius: '8px',
                                                border: isLocked ? '1px solid var(--border)' : '1px solid var(--primary)',
                                                background: isLocked ? '#f8fafc' : 'white',
                                                cursor: isLocked ? 'not-allowed' : 'pointer',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                transition: 'transform 0.2s, box-shadow 0.2s',
                                                opacity: isLocked ? 0.8 : 1
                                            }}
                                            onMouseOver={(e) => {
                                                if (!isLocked) {
                                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(59, 130, 246, 0.2)';
                                                }
                                            }}
                                            onMouseOut={(e) => {
                                                if (!isLocked) {
                                                    e.currentTarget.style.transform = 'none';
                                                    e.currentTarget.style.boxShadow = 'none';
                                                }
                                            }}
                                        >
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                <span style={{ fontWeight: '600', color: isLocked ? 'var(--secondary)' : 'var(--primary)' }}>{session.title}</span>
                                                {isLocked && session.scheduledOpenAt && (
                                                    <span style={{ fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 'bold', marginTop: '0.25rem' }}>
                                                        ⏰ {new Date(session.scheduledOpenAt).toLocaleString()} 오픈 예정
                                                    </span>
                                                )}
                                            </div>
                                            <span style={{
                                                fontSize: '0.75rem',
                                                color: 'white',
                                                background: isLocked ? '#94a3b8' : 'var(--primary)',
                                                padding: '2px 8px',
                                                borderRadius: '12px'
                                            }}>
                                                {isLocked ? '대기 중' : '입장하기'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {userData?.role === 'teacher' && (
                    <div className="card" style={{ borderTop: '4px solid var(--accent)' }}>
                        <h3>관리자 빠른 메뉴</h3>
                        <ul style={{ listStyle: 'none', marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <li>
                                <button
                                    onClick={() => router.push('/admin/students')}
                                    style={{ width: '100%', textAlign: 'left', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}
                                >
                                    📂 학생 계정(DB) 관리
                                </button>
                            </li>
                            <li>
                                <button
                                    onClick={() => router.push('/admin/classes')}
                                    style={{ width: '100%', textAlign: 'left', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}
                                >
                                    🏫 수업(학급) 설정 및 학생 배정
                                </button>
                            </li>
                            <li>
                                <button
                                    onClick={() => router.push('/admin/layout-editor')}
                                    style={{ width: '100%', textAlign: 'left', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}
                                >
                                    📐 좌석 배치도 설정
                                </button>
                            </li>
                            <li>
                                <button
                                    onClick={() => router.push('/admin/sessions')}
                                    style={{ width: '100%', textAlign: 'left', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}
                                >
                                    ⏰ 예약 세션 관리 (오픈/종료)
                                </button>
                            </li>
                        </ul>
                    </div>
                )}
            </section>
        </div>
    );
}
