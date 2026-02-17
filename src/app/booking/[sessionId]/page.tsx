"use client";

import { useState, useEffect, use } from "react";
import { db, auth } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, runTransaction, getDoc, getDocs, collection, query, where } from "firebase/firestore";
import { useRouter } from "next/navigation";

interface Seat {
    id: string;
    r: number;
    c: number;
    active: boolean;
}

export default function BookingPage({ params }: { params: Promise<{ sessionId: string }> }) {
    const { sessionId } = use(params);
    const router = useRouter();
    const [layout, setLayout] = useState<Seat[]>([]);
    const [reservations, setReservations] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [booking, setBooking] = useState(false);

    const [studentsMap, setStudentsMap] = useState<Record<string, { id: string, name: string }>>({});
    const [unassignedStudents, setUnassignedStudents] = useState<any[]>([]);
    const [columnGaps, setColumnGaps] = useState<number[]>([]);
    const [userData, setUserData] = useState<any>(null);
    const [classId, setClassId] = useState("");
    const [accessError, setAccessError] = useState("");

    // 내 정보 및 권한 확인
    useEffect(() => {
        const fetchMe = async () => {
            const user = auth.currentUser;
            if (user) {
                const snap = await getDoc(doc(db, "users", user.uid));
                if (snap.exists()) setUserData(snap.data());
            }
        };
        fetchMe();
    }, []);

    useEffect(() => {
        if (!sessionId) return;

        const sessionRef = doc(db, "sessions", sessionId);
        const unsubscribe = onSnapshot(sessionRef, async (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setLayout(data.layout || []);
                setReservations(data.reservations || {});
                setClassId(data.classId);

                // 상시 오픈이 아닌 경우 시간 체크
                if (data.status === "scheduled" && data.scheduledOpenAt) {
                    const openTime = new Date(data.scheduledOpenAt);
                    if (openTime > new Date()) {
                        setAccessError(`이 세션은 ${openTime.toLocaleString()}에 오픈 예정입니다. 조금만 기다려주세요.`);
                        setLoading(false);
                        return;
                    }
                }
                setAccessError("");

                // 학생 정보(학번, 이름) 매핑 데이터 불러오기
                const usersSnap = await getDocs(collection(db, "users"));
                const mapping: Record<string, { id: string, name: string }> = {};
                const allStus: any[] = [];

                usersSnap.forEach(uDoc => {
                    const uData = uDoc.data();
                    if (uData.role === 'student') {
                        mapping[uDoc.id] = { id: uData.id, name: uData.name };
                        allStus.push({ uid: uDoc.id, ...uData });
                    }
                });
                setStudentsMap(mapping);

                // 미배정 학생 필터링 (해당 수업 소속 학생 중)
                if (data.classId) {
                    const classSnap = await getDoc(doc(db, "classes", data.classId));
                    if (classSnap.exists()) {
                        const classData = classSnap.data();
                        setColumnGaps(classData.columnGaps || []);
                        const assignedUids = Object.values(data.reservations || {}) as string[];
                        const unassigned = allStus.filter(s =>
                            classData.studentIds.includes(s.id) && !assignedUids.includes(s.uid)
                        );
                        setUnassignedStudents(unassigned);
                    }
                }
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [sessionId]);

    const handleSeatClick = async (seatId: string) => {
        if (booking || userData?.role === 'teacher') return;
        const user = auth.currentUser;
        if (!user) return;

        setBooking(true);
        try {
            const sessionRef = doc(db, "sessions", sessionId);
            await runTransaction(db, async (transaction) => {
                const sDoc = await transaction.get(sessionRef);
                if (!sDoc.exists()) return;
                const currentRes = sDoc.data().reservations || {};
                if (currentRes[seatId] && currentRes[seatId] !== user.uid) {
                    alert("이미 예약된 좌석입니다.");
                    return;
                }
                const newRes = { ...currentRes };
                Object.keys(newRes).forEach(key => {
                    if (newRes[key] === user.uid) delete newRes[key];
                });
                newRes[seatId] = user.uid;
                transaction.update(sessionRef, { reservations: newRes });
            });
        } catch (e) {
            console.error(e);
            alert("예약 중 오류가 발생했습니다.");
        } finally {
            setBooking(false);
        }
    };

    // --- 드래그 앤 드롭 핸들러 (교사 전용) ---
    const onDragStart = (e: React.DragEvent, data: any) => {
        e.dataTransfer.setData("application/json", JSON.stringify(data));
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const onDropOnSeat = async (e: React.DragEvent, targetSeatId: string) => {
        e.preventDefault();
        if (userData?.role !== 'teacher') return;

        const sourceDataString = e.dataTransfer.getData("application/json");
        if (!sourceDataString) return;
        const sourceData = JSON.parse(sourceDataString);
        const sessionRef = doc(db, "sessions", sessionId);

        try {
            await runTransaction(db, async (transaction) => {
                const sDoc = await transaction.get(sessionRef);
                if (!sDoc.exists()) return;
                const currentRes = { ...(sDoc.data().reservations || {}) };

                if (sourceData.type === 'new') {
                    const studentUid = sourceData.uid;
                    Object.keys(currentRes).forEach(k => { if (currentRes[k] === studentUid) delete currentRes[k]; });
                    currentRes[targetSeatId] = studentUid;
                } else if (sourceData.type === 'move') {
                    const fromSeatId = sourceData.seatId;
                    const fromUid = currentRes[fromSeatId];
                    const toUid = currentRes[targetSeatId];

                    if (toUid) {
                        currentRes[fromSeatId] = toUid;
                        currentRes[targetSeatId] = fromUid;
                    } else {
                        delete currentRes[fromSeatId];
                        currentRes[targetSeatId] = fromUid;
                    }
                }
                transaction.update(sessionRef, { reservations: currentRes });
            });
        } catch (err) {
            console.error("배정 변경 오류:", err);
        }
    };

    if (loading) return <div>좌석 정보를 불러오는 중...</div>;
    if (accessError) return (
        <div className="card" style={{ textAlign: 'center', margin: '2rem auto', maxWidth: '500px' }}>
            <h2 style={{ color: 'var(--error)' }}>입장 불가</h2>
            <p style={{ marginTop: '1rem' }}>{accessError}</p>
            <button
                onClick={() => router.push('/')}
                className="btn-primary"
                style={{ marginTop: '1.5rem' }}
            >
                홈으로 돌아가기
            </button>
        </div>
    );

    const isTeacher = userData?.role === 'teacher';

    return (
        <div className="container" style={{ display: 'flex', flexDirection: isTeacher ? 'row' : 'column', gap: '2rem', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, width: '100%' }}>
                <div className="card" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                    <h2 style={{ color: 'var(--primary)' }}>좌석 신청 및 배정 현황</h2>
                    <p style={{ fontSize: '0.875rem', color: 'var(--secondary)' }}>
                        {isTeacher ? "학생을 드래그하여 배치하거나 자리를 옮길 수 있습니다." : "원하는 빈 좌석을 터치하여 예약하세요."}
                    </p>
                </div>

                <div style={{
                    margin: '0 auto 1.5rem',
                    width: '120px',
                    height: '40px',
                    background: '#94a3b8',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                    fontSize: '0.875rem',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                    교탁
                </div>

                <div style={{
                    overflowX: 'auto',
                    background: '#f1f5f9',
                    padding: '30px',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    marginBottom: '1.5rem'
                }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: (() => {
                            const maxC = layout.length > 0 ? Math.max(...layout.map(s => s.c)) : 0;
                            const cols = maxC + 1;
                            return Array.from({ length: cols }).map((_, i) =>
                                i === cols - 1 ? '58px' : `58px ${columnGaps[i] !== undefined ? columnGaps[i] : 12}px`
                            ).join(' ');
                        })(),
                        rowGap: '12px',
                        justifyContent: 'center',
                        width: 'fit-content',
                        margin: '0 auto'
                    }}>
                        {layout.map(seat => {
                            if (!seat.active) {
                                return <div key={seat.id} style={{ gridColumn: seat.c * 2 + 1, gridRow: seat.r + 1, width: '58px', height: '58px' }}></div>;
                            }

                            const studentUid = reservations[seat.id];
                            const studentInfo = studentUid ? studentsMap[studentUid] : null;
                            const isMine = studentUid === auth.currentUser?.uid;

                            return (
                                <div
                                    key={seat.id}
                                    onClick={() => handleSeatClick(seat.id)}
                                    onDragOver={onDragOver}
                                    onDrop={(e) => onDropOnSeat(e, seat.id)}
                                    draggable={isTeacher && !!studentUid}
                                    onDragStart={(e) => onDragStart(e, { type: 'move', seatId: seat.id, uid: studentUid })}
                                    style={{
                                        gridColumn: seat.c * 2 + 1,
                                        gridRow: seat.r + 1,
                                        width: '58px',
                                        height: '58px',
                                        background: isMine ? 'var(--primary)' : studentUid ? '#cbd5e1' : 'white',
                                        color: isMine ? 'white' : 'var(--text)',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.65rem',
                                        fontWeight: 'bold',
                                        cursor: (studentUid && !isMine && !isTeacher) ? 'not-allowed' : 'pointer',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                        transition: 'all 0.2s',
                                        border: isMine ? 'none' : studentUid ? 'none' : '1px solid var(--primary)',
                                        textAlign: 'center',
                                        lineHeight: '1.2',
                                        padding: '2px'
                                    }}
                                >
                                    {studentInfo ? (
                                        (isTeacher || isMine) ? (
                                            <>
                                                <div style={{ fontSize: '0.6rem', opacity: 0.8 }}>{studentInfo.id}</div>
                                                <div style={{ fontSize: '0.75rem' }}>{studentInfo.name}</div>
                                            </>
                                        ) : (
                                            <div style={{ fontSize: '0.75rem' }}>예약됨</div>
                                        )
                                    ) : (
                                        <div style={{ opacity: 0.5 }}>{seat.r + 1}-{seat.c + 1}</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '14px', height: '14px', background: 'white', border: '1px solid var(--primary)', borderRadius: '3px' }}></div>
                        <span style={{ fontSize: '0.75rem' }}>공석</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '14px', height: '14px', background: '#cbd5e1', borderRadius: '3px' }}></div>
                        <span style={{ fontSize: '0.75rem' }}>예약됨</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '14px', height: '14px', background: 'var(--primary)', borderRadius: '3px' }}></div>
                        <span style={{ fontSize: '0.75rem' }}>내 예약</span>
                    </div>
                </div>
            </div>

            {isTeacher && (
                <div className="card" style={{ width: '280px', minHeight: '500px', position: 'sticky', top: '20px' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '1rem', borderBottom: '2px solid var(--border)', paddingBottom: '0.5rem' }}>
                        미배정 학생 ({unassignedStudents.length})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {unassignedStudents.map(student => (
                            <div
                                key={student.uid}
                                draggable
                                onDragStart={(e) => onDragStart(e, { type: 'new', uid: student.uid })}
                                style={{
                                    padding: '0.75rem',
                                    background: 'white',
                                    border: '1px solid var(--border)',
                                    borderRadius: '6px',
                                    cursor: 'grab',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: '0.875rem',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                }}
                            >
                                <span style={{ fontWeight: 'bold' }}>{student.name}</span>
                                <span style={{ color: 'var(--secondary)', fontSize: '0.75rem' }}>{student.id}</span>
                            </div>
                        ))}
                        {unassignedStudents.length === 0 && (
                            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem', marginTop: '2rem' }}>
                                모든 학생이 배정되었습니다.
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
