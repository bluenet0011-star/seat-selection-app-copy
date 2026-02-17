"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc, query, orderBy, onSnapshot } from "firebase/firestore";

interface Session {
    id: string;
    title: string;
    status: "open" | "closed" | "scheduled";
    createdAt: string;
    scheduledOpenAt?: string;
    layout: any[];
}

export default function SessionManagement() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [classes, setClasses] = useState<any[]>([]);
    const [selectedClassId, setSelectedClassId] = useState("");
    const [newTitle, setNewTitle] = useState("");
    const [scheduledOpenAt, setScheduledOpenAt] = useState("");
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    // 세션 삭제
    const handleDeleteSession = async (sessionId: string) => {
        if (!confirm("정말로 이 세션을 삭제하시겠습니까? 관련 예약 데이터가 모두 영구 삭제됩니다.")) return;
        try {
            await deleteDoc(doc(db, "sessions", sessionId));
            alert("세션이 삭제되었습니다.");
        } catch (error) {
            console.error("세션 삭제 중 오류:", error);
            alert("오류가 발생했습니다.");
        }
    };

    // 초기 데이터 로드
    useEffect(() => {
        const unsubSessions = onSnapshot(collection(db, "sessions"), (snapshot) => {
            const sessionData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Session[];

            sessionData.sort((a, b) => {
                const dateA = a.createdAt || "";
                const dateB = b.createdAt || "";
                return dateB.localeCompare(dateA);
            });
            setSessions(sessionData);
            setLoading(false);
        });

        const fetchClasses = async () => {
            const snap = await getDocs(collection(db, "classes"));
            setClasses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        };
        fetchClasses();

        return () => unsubSessions();
    }, []);

    // 새 세션 생성
    const handleCreateSession = async () => {
        if (!selectedClassId) {
            alert("대상 수업을 선택해주세요.");
            return;
        }
        if (!newTitle.trim()) {
            alert("세션 제목을 입력해주세요.");
            return;
        }

        setCreating(true);
        try {
            // 1. 선택된 수업의 레이아웃 가져오기
            const classRef = doc(db, "classes", selectedClassId);
            const classSnap = await getDoc(classRef);

            if (!classSnap.exists() || !classSnap.data().layout || classSnap.data().layout.length === 0) {
                alert("해당 수업의 좌석 배치도가 설정되지 않았습니다. 좌석 배치도 설정 페이지에서 먼저 레이아웃을 저장해주세요.");
                return;
            }

            const classData = classSnap.data();

            // 2. 새로운 세션 문서 생성
            const status = scheduledOpenAt ? "scheduled" : "open";

            await addDoc(collection(db, "sessions"), {
                title: newTitle,
                classId: selectedClassId,
                className: classData.name,
                layout: classData.layout,
                status: status,
                scheduledOpenAt: scheduledOpenAt || null,
                reservations: {},
                createdAt: new Date().toISOString()
            });

            alert(status === "scheduled" ? "세션 오픈이 예약되었습니다." : "새로운 예약 세션이 오픈되었습니다.");
            setNewTitle("");
            setSelectedClassId("");
            setScheduledOpenAt("");
        } catch (error) {
            console.error("세션 생성 중 오류:", error);
            alert("세션 생성 중 오류가 발생했습니다.");
        } finally {
            setCreating(false);
        }
    };

    // 세션 종료(닫기)
    const handleCloseSession = async (sessionId: string) => {
        if (!confirm("정말로 이 세션을 종료하시겠습니까? (학생들이 더 이상 신청할 수 없습니다)")) return;
        try {
            const sessionRef = doc(db, "sessions", sessionId);
            await updateDoc(sessionRef, { status: "closed" });
            alert("세션이 종료되었습니다.");
        } catch (error) {
            console.error("세션 종료 중 오류:", error);
            alert("오류가 발생했습니다.");
        }
    };

    // 세션 재개
    const handleResumeSession = async (sessionId: string) => {
        try {
            const sessionRef = doc(db, "sessions", sessionId);
            await updateDoc(sessionRef, { status: "open" });
            alert("세션이 다시 오픈되었습니다.");
        } catch (error) {
            console.error("세션 재개 중 오류:", error);
            alert("오류가 발생했습니다.");
        }
    };

    if (loading) return <div className="card">세션 정보를 불러오는 중...</div>;

    return (
        <div className="card">
            <h2>예약 세션 관리</h2>
            <p style={{ color: 'var(--secondary)', marginBottom: '2rem' }}>
                학생들이 좌석을 신청할 수 있는 세션을 생성하고 상태를 관리합니다.
            </p>

            {/* 세션 생성 영역 */}
            <div style={{
                background: '#f8fafc',
                padding: '1.5rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                marginBottom: '2rem'
            }}>
                <h3>신규 세션 오픈</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <select
                            value={selectedClassId}
                            onChange={(e) => setSelectedClassId(e.target.value)}
                            style={{ flex: 1, padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                        >
                            <option value="">-- 대상 수업 선택 --</option>
                            {classes.map(cls => (
                                <option key={cls.id} value={cls.id}>{cls.name}</option>
                            ))}
                        </select>
                        <input
                            type="text"
                            placeholder="예: 7교시 자율학습 좌석 신청"
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            style={{ flex: 2, padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <label style={{ fontSize: '0.875rem', fontWeight: 'bold' }}>오픈 예정 시간(선택):</label>
                        <input
                            type="datetime-local"
                            value={scheduledOpenAt}
                            onChange={(e) => setScheduledOpenAt(e.target.value)}
                            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>* 입력하지 않으면 즉시 오픈됩니다.</span>
                    </div>
                    <button
                        onClick={handleCreateSession}
                        disabled={creating}
                        style={{
                            background: scheduledOpenAt ? 'var(--accent)' : 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            padding: '0.8rem 1.5rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            opacity: creating ? 0.6 : 1
                        }}
                    >
                        {creating ? "생성 중..." : scheduledOpenAt ? "세션 오픈 예약하기" : "세션 즉시 오픈하기"}
                    </button>
                </div>
            </div>

            {/* 세션 목록 영역 */}
            <div>
                <h3>세션 목록</h3>
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {sessions.length === 0 ? (
                        <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--secondary)' }}>생성된 세션이 없습니다.</p>
                    ) : (
                        sessions.map(session => (
                            <div key={session.id} style={{
                                padding: '1rem',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: session.status === 'open' ? '#f0fdf4' : 'white'
                            }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{
                                            fontSize: '0.7rem',
                                            background: '#e2e8f0',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontWeight: 'bold'
                                        }}>
                                            {(session as any).className || '수업 정보 없음'}
                                        </span>
                                        <span style={{ fontWeight: 'bold' }}>{session.title}</span>
                                        <span style={{
                                            fontSize: '0.75rem',
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            background: session.status === 'open' ? 'var(--success)' : session.status === 'scheduled' ? 'var(--accent)' : '#94a3b8',
                                            color: 'white'
                                        }}>
                                            {session.status === 'open' ? '진행 중' : session.status === 'scheduled' ? '예약됨' : '종료됨'}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--secondary)', marginTop: '0.25rem' }}>
                                        {session.status === 'scheduled' && session.scheduledOpenAt && (
                                            <span style={{ color: 'var(--accent)', fontWeight: 'bold', marginRight: '1rem' }}>
                                                오픈 예정: {new Date(session.scheduledOpenAt).toLocaleString()}
                                            </span>
                                        )}
                                        생성일: {new Date(session.createdAt).toLocaleString()}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {session.status !== 'closed' ? (
                                        <button
                                            onClick={() => handleCloseSession(session.id)}
                                            style={{
                                                background: 'var(--error)',
                                                color: 'white',
                                                border: 'none',
                                                padding: '0.5rem 1rem',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontSize: '0.875rem'
                                            }}
                                        >
                                            세션 종료
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleResumeSession(session.id)}
                                            style={{
                                                background: 'var(--primary)',
                                                color: 'white',
                                                border: 'none',
                                                padding: '0.5rem 1rem',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontSize: '0.875rem'
                                            }}
                                        >
                                            세션 재개
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleDeleteSession(session.id)}
                                        style={{
                                            background: 'none',
                                            color: 'var(--error)',
                                            border: '1px solid var(--error)',
                                            padding: '0.5rem 1rem',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontSize: '0.875rem'
                                        }}
                                    >
                                        삭제
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
