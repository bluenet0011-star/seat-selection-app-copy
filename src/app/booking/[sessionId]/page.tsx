"use client";

import { useState, useEffect, use, useRef } from "react";
import { db, auth } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, runTransaction, getDoc, getDocs, collection, query, where } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import confetti from "canvas-confetti";
import toast, { Toaster } from "react-hot-toast";
import { Howl } from "howler";

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
    const [bids, setBids] = useState<Record<string, { uid: string, studentId: string, name: string, points: number }>>({});
    const [loading, setLoading] = useState(true);
    const [booking, setBooking] = useState(false);

    // 입찰 모달 관련 상태
    const [selectedSeatForBid, setSelectedSeatForBid] = useState<Seat | null>(null);
    const [bidAmount, setBidAmount] = useState<number | "">("");

    const [studentsMap, setStudentsMap] = useState<Record<string, { id: string, name: string }>>({});
    const [unassignedStudents, setUnassignedStudents] = useState<any[]>([]);
    const [columnGaps, setColumnGaps] = useState<number[]>([]);
    const [classId, setClassId] = useState("");
    const [accessError, setAccessError] = useState("");

    const { userData } = useAuth();

    // 이전 상태 추적용 ref (효과 발생용)
    const prevBidsRef = useRef<Record<string, any>>({});
    const prevResRef = useRef<Record<string, string>>({});
    const soundsRef = useRef<{ bid?: Howl, outbid?: Howl, award?: Howl }>({});

    // 효과음 초기화
    useEffect(() => {
        soundsRef.current = {
            bid: new Howl({ src: ['https://actions.google.com/sounds/v1/cartoon/pop.ogg'], volume: 0.5 }),
            outbid: new Howl({ src: ['https://actions.google.com/sounds/v1/alarms/buzzer_alarm.ogg'], volume: 0.3 }),
            award: new Howl({ src: ['https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg'], volume: 0.6 })
        };
    }, []);

    useEffect(() => {
        if (!sessionId) return;

        const sessionRef = doc(db, "sessions", sessionId);
        const unsubscribe = onSnapshot(sessionRef, async (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const currentUserData = auth.currentUser;
                const activeUid = currentUserData?.uid; // or userData?.id depending on context, we'll try to find it
                const myId = activeUid || "";

                // --- 이벤트 감지 및 효과 트리거 ---
                const oldBids = prevBidsRef.current;
                const newBids = data.bids || {};
                const oldRes = prevResRef.current;
                const newRes = data.reservations || {};

                // 1. 낙찰 감지 (새로운 reservation 추가됨)
                Object.keys(newRes).forEach(seatId => {
                    if (!oldRes[seatId]) {
                        // 새로운 낙찰 발생!
                        if (soundsRef.current.award) soundsRef.current.award.play();
                        confetti({
                            particleCount: 100,
                            spread: 70,
                            origin: { y: 0.6 }
                        });
                        toast.success(`좌석 낙찰 완료!`, { icon: '🎉' });
                    }
                });

                // 2. 입찰 감지 및 상위 입찰 추월(Outbid) 감지
                Object.keys(newBids).forEach(seatId => {
                    const oldBid = oldBids[seatId];
                    const newBid = newBids[seatId];

                    if (!oldBid && newBid) {
                        // 완전히 새로운 입찰
                        if (soundsRef.current.bid) soundsRef.current.bid.play();
                        toast(`${newBid.name}님이 ${newBid.points}P 입찰!`, { icon: '💰' });
                    } else if (oldBid && newBid && newBid.points > oldBid.points) {
                        // 누군가 이전 입찰을 덮어씀 (갱신됨)
                        if (soundsRef.current.bid) soundsRef.current.bid.play();
                        toast(`${newBid.name}님이 ${newBid.points}P로 최고 입찰 갱신!`, { icon: '🔥' });

                        // 만약 밀려난 사람이 '나'라면 알림 및 효과음
                        if (oldBid.uid === myId && newBid.uid !== myId) {
                            if (soundsRef.current.outbid) soundsRef.current.outbid.play();
                            toast.error("다른 학생이 더 높은 포인트를 입찰했습니다!", { duration: 4000 });
                        }
                    }
                });

                // ref 업데이트
                prevBidsRef.current = newBids;
                prevResRef.current = newRes;

                setLayout(data.layout || []);
                setReservations(newRes);
                setBids(newBids);
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

    const handleSeatClick = (seatId: string) => {
        if (userData?.role === 'teacher') return;
        if (reservations[seatId]) return; // 이미 확정된 자리

        // 낙찰된 학생은 추가 입찰 불가
        const isAlreadyAwarded = Object.values(reservations).includes(userData?.id);
        if (isAlreadyAwarded) {
            alert("이미 좌석이 배정되어 추가 입찰이 불가능합니다.");
            return;
        }

        const seat = layout.find(s => s.id === seatId);
        if (seat) {
            setSelectedSeatForBid(seat);
            setBidAmount("");
        }
    };

    // 내가 입찰 중인 포인트 계산 (묶인 포인트)
    const myCurrentBid = Object.values(bids).find(b => b.uid === userData?.id);
    const lockedPoints = myCurrentBid ? myCurrentBid.points : 0;
    const availablePoints = (userData?.points ?? 0) - lockedPoints;

    const submitBid = async () => {
        if (!selectedSeatForBid || !userData || booking) return;
        const amount = Number(bidAmount);
        if (!amount || amount <= 0) {
            alert("올바른 포인트를 입력하세요.");
            return;
        }
        if (amount > availablePoints) {
            alert(`사용 가능한 포인트가 부족합니다. (현재 가용: ${availablePoints}P)`);
            return;
        }

        const seatId = selectedSeatForBid.id;

        // 다른 자리에 최고 입찰자로 있는 경우, 입찰 불가 처리 (1인 1좌석 룰 강화)
        if (myCurrentBid && Object.keys(bids).find(key => bids[key].uid === userData.id) !== seatId) {
            alert("이미 다른 좌석에 최고 입찰자로 등록되어 있습니다. 다른 학생이 상위 입찰을 하여 밀려나기 전까지는 다른 자리에 입찰할 수 없습니다.");
            return;
        }
        setBooking(true);
        try {
            const sessionRef = doc(db, "sessions", sessionId);
            await runTransaction(db, async (transaction) => {
                const sDoc = await transaction.get(sessionRef);
                if (!sDoc.exists()) throw "Session doesn't exist";
                const data = sDoc.data();
                const currentBids = data.bids || {};
                const currentRes = data.reservations || {};

                if (currentRes[seatId]) {
                    throw "이미 낙찰된 좌석입니다.";
                }

                const isAlreadyAwarded = Object.values(currentRes).includes(userData.id);
                if (isAlreadyAwarded) {
                    throw "이미 다른 좌석에 배정되어 입찰할 수 없습니다.";
                }

                if (currentBids[seatId] && currentBids[seatId].points >= amount) {
                    throw "현재 최고 입찰가보다 높은 포인트를 입력해야 합니다.";
                }

                const newBids = { ...currentBids };
                // 1인 1좌석 룰: 이전 입찰 내역 삭제
                Object.keys(newBids).forEach(key => {
                    if (newBids[key].uid === userData.id) {
                        delete newBids[key];
                    }
                });

                newBids[seatId] = {
                    uid: userData.id,
                    studentId: userData.id,
                    name: userData.name || "",
                    points: amount
                };

                transaction.update(sessionRef, { bids: newBids });
            });
            setSelectedSeatForBid(null);
        } catch (e: any) {
            console.error(e);
            alert(typeof e === 'string' ? e : "입찰 중 오류가 발생했습니다.");
        } finally {
            setBooking(false);
        }
    };

    const handleAwardSeat = async (seatId: string) => {
        if (userData?.role !== 'teacher' || booking) return;
        const bidInfo = bids[seatId];
        if (!bidInfo) return;

        if (!confirm(`${bidInfo.name} 학생에게 ${bidInfo.points} 포인트로 이 좌석을 낙찰하시겠습니까?`)) return;

        setBooking(true);
        try {
            const sessionRef = doc(db, "sessions", sessionId);
            await runTransaction(db, async (transaction) => {
                const sDoc = await transaction.get(sessionRef);
                if (!sDoc.exists()) throw "Session missing";
                const data = sDoc.data();

                const currentBids = data.bids || {};
                const currentRes = data.reservations || {};
                const actualBid = currentBids[seatId];

                if (!actualBid) throw "입찰 정보가 없습니다.";
                if (actualBid.points !== bidInfo.points || actualBid.uid !== bidInfo.uid) {
                    throw "그 사이 입찰 상황이 변경되었습니다. 화면을 확인하고 다시 시도하세요.";
                }
                if (currentRes[seatId]) throw "이미 낙찰된 자리입니다.";

                const userRef = doc(db, "users", actualBid.uid);
                const uDoc = await transaction.get(userRef);
                if (!uDoc.exists()) throw "User missing";

                const currentPoints = uDoc.data().points || 0;
                if (currentPoints < actualBid.points) throw "해당 학생의 잔여 포인트가 부족합니다.";

                // 차감
                transaction.update(userRef, { points: currentPoints - actualBid.points });

                // 낙찰 처리
                const newRes = { ...currentRes };
                newRes[seatId] = actualBid.uid;

                const newBids = { ...currentBids };
                delete newBids[seatId];

                transaction.update(sessionRef, { reservations: newRes, bids: newBids });
            });
            alert("낙찰 완료!");
        } catch (e: any) {
            console.error(e);
            alert(typeof e === 'string' ? e : "낙찰 처리 중 오류가 발생했습니다.");
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
            <Toaster position="bottom-right" />
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
                            const isMine = studentUid === userData?.id;

                            const currentBid = bids[seat.id];
                            const isMyBid = currentBid?.uid === userData?.id;

                            // 색상 로직:
                            // 1. 낙찰(내 자리): primary
                            // 2. 낙찰(남의 자리): 회색
                            // 3. 입찰 진행 중(내 입찰): 주황 계열
                            // 4. 입찰 진행 중(남의 입찰): 자주/보라 계열
                            // 5. 공석: 흰색
                            let bg = 'white';
                            let textCol = 'var(--text)';
                            let border = '1px solid var(--primary)';

                            if (isMine) { bg = 'var(--primary)'; textCol = 'white'; border = 'none'; }
                            else if (studentUid) { bg = '#cbd5e1'; textCol = 'var(--text)'; border = 'none'; }
                            else if (isMyBid) { bg = '#f59e0b'; textCol = 'white'; border = 'none'; } // 내 입찰
                            else if (currentBid) { bg = '#fde68a'; textCol = '#b45309'; border = '1px solid #f59e0b'; } // 다른 사람 입찰 중

                            return (
                                <div
                                    key={seat.id}
                                    onClick={() => handleSeatClick(seat.id)}
                                    onDragOver={onDragOver}
                                    onDrop={(e) => onDropOnSeat(e, seat.id)}
                                    draggable={isTeacher && !!studentUid}
                                    onDragStart={(e) => onDragStart(e, { type: 'move', seatId: seat.id, uid: studentUid })}
                                    style={{
                                        position: 'relative',
                                        gridColumn: seat.c * 2 + 1,
                                        gridRow: seat.r + 1,
                                        width: '58px',
                                        height: '58px',
                                        background: bg,
                                        color: textCol,
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
                                        border: border,
                                        textAlign: 'center',
                                        lineHeight: '1.2',
                                        padding: '2px'
                                    }}
                                >
                                    {isTeacher && currentBid && !studentUid && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleAwardSeat(seat.id); }}
                                            style={{
                                                position: 'absolute', top: '-8px', right: '-8px',
                                                background: '#ef4444', color: 'white', border: 'none',
                                                borderRadius: '50%', width: '24px', height: '24px',
                                                fontSize: '0.6rem', cursor: 'pointer', zIndex: 10,
                                                boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                                            }}
                                            title="낙찰"
                                        >
                                            낙찰
                                        </button>
                                    )}

                                    {studentInfo ? (
                                        (isTeacher || isMine) ? (
                                            <>
                                                <div style={{ fontSize: '0.6rem', opacity: 0.8 }}>{studentInfo.id}</div>
                                                <div style={{ fontSize: '0.75rem' }}>{studentInfo.name}</div>
                                            </>
                                        ) : (
                                            <div style={{ fontSize: '0.75rem' }}>배정됨</div>
                                        )
                                    ) : currentBid ? (
                                        <>
                                            <div style={{ fontSize: '0.6rem', opacity: 0.9 }}>{currentBid.name}</div>
                                            <div style={{ fontSize: '0.7rem' }}>{currentBid.points}P</div>
                                        </>
                                    ) : (
                                        <div style={{ opacity: 0.5 }}>{seat.r + 1}-{seat.c + 1}</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '14px', height: '14px', background: 'white', border: '1px solid var(--primary)', borderRadius: '3px' }}></div>
                        <span style={{ fontSize: '0.75rem' }}>공석</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '14px', height: '14px', background: '#cbd5e1', borderRadius: '3px' }}></div>
                        <span style={{ fontSize: '0.75rem' }}>배정됨</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '14px', height: '14px', background: 'var(--primary)', borderRadius: '3px' }}></div>
                        <span style={{ fontSize: '0.75rem' }}>내 자리</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '14px', height: '14px', background: '#f59e0b', borderRadius: '3px' }}></div>
                        <span style={{ fontSize: '0.75rem' }}>내 입찰</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '14px', height: '14px', background: '#fde68a', border: '1px solid #f59e0b', borderRadius: '3px' }}></div>
                        <span style={{ fontSize: '0.75rem' }}>경쟁 입찰</span>
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
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontWeight: 'bold' }}>{student.name}</span>
                                    <span style={{ color: 'var(--secondary)', fontSize: '0.75rem' }}>{student.id}</span>
                                </div>
                                <span style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '0.85rem' }}>
                                    {(student.points || 0).toLocaleString()}P
                                </span>
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

            {/* 입찰 모달 */}
            {selectedSeatForBid && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem'
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '350px', background: 'white', borderRadius: '12px' }}>
                        <h3 style={{ marginBottom: '1rem', textAlign: 'center', color: 'var(--primary)' }}>좌석 {selectedSeatForBid.r + 1}-{selectedSeatForBid.c + 1} 입찰</h3>

                        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.875rem', color: 'var(--secondary)', marginBottom: '0.5rem' }}>현재 최고 입찰</div>
                            {bids[selectedSeatForBid.id] ? (
                                <div>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#f59e0b' }}>{bids[selectedSeatForBid.id].points}P</span>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '0.5rem' }}>({bids[selectedSeatForBid.id].name})</span>
                                </div>
                            ) : (
                                <div style={{ color: '#94a3b8' }}>입찰 없음</div>
                            )}
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text)' }}>
                                나의 입찰액 (가용: {availablePoints.toLocaleString()}P / 총: {(userData?.points ?? 0).toLocaleString()}P)
                            </label>
                            <input
                                type="number"
                                value={bidAmount}
                                onChange={e => setBidAmount(Number(e.target.value) || "")}
                                placeholder={bids[selectedSeatForBid.id] ? `${bids[selectedSeatForBid.id].points + 1} 이상 입력` : `포인트 입력`}
                                style={{
                                    width: '100%', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '6px',
                                    fontSize: '1rem', outline: 'none'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={() => setSelectedSeatForBid(null)}
                                style={{ flex: 1, padding: '0.75rem', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                            >
                                취소
                            </button>
                            <button
                                onClick={submitBid}
                                disabled={booking}
                                style={{ flex: 1, padding: '0.75rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: booking ? 'not-allowed' : 'pointer', opacity: booking ? 0.7 : 1 }}
                            >
                                {booking ? "처리 중..." : "입찰하기"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
