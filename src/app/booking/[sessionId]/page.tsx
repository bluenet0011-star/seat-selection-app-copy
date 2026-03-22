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

    // 새 기능: 과거 짝꿍 데이터
    const [partnerHistory, setPartnerHistory] = useState<Array<{ id: string, student1: string, student2: string }>>([]);

    // 입찰 모달 관련 상태
    const [selectedSeatForBid, setSelectedSeatForBid] = useState<Seat | null>(null);
    const [bidAmount, setBidAmount] = useState<number | "">("");
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [isPrintMode, setIsPrintMode] = useState(false);

    // 새 기능: 블라인드 모드 상태
    const [sessionStatus, setSessionStatus] = useState<string>("open");
    const [isBlindMode, setIsBlindMode] = useState<boolean>(false);
    const [blindBids, setBlindBids] = useState<Record<string, { studentId: string, name: string, points: number, submittedAt: string }>>({});
    const [selectionOrder, setSelectionOrder] = useState<any[]>([]);
    const [currentSelectionIndex, setCurrentSelectionIndex] = useState<number>(0);

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

        // Fetch Partner History Once
        const fetchPartnerHistory = async () => {
            try {
                const snap = await getDoc(doc(db, "settings", "partner_history"));
                if (snap.exists()) {
                    setPartnerHistory(snap.data().pairs || []);
                }
            } catch (err) {
                console.error("짝꿍 기록 불러오기 실패:", err);
            }
        };
        fetchPartnerHistory();

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
                setIsAnonymous(!!data.isAnonymous);

                // 블라인드 모드 데이터 동기화
                setSessionStatus(data.status || "open");
                setIsBlindMode(!!data.isBlindMode);
                setBlindBids(data.blindBids || {});
                setSelectionOrder(data.selectionOrder || []);
                setCurrentSelectionIndex(data.currentSelectionIndex || 0);

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
        if (userData?.role === 'teacher') return;
        if (reservations[seatId]) return; // 이미 확정된 자리

        // 블라인드 모드 - 순차 선택 처리
        if (isBlindMode && sessionStatus === 'selection') {
            const currentTurnUser = selectionOrder[currentSelectionIndex];
            if (!currentTurnUser || currentTurnUser.uid !== userData?.id) {
                alert("아직 본인의 차례가 아닙니다.");
                return;
            }

            if (!confirm(`이 자리를 선택하시겠습니까? (입찰한 ${currentTurnUser.points}P가 차감됩니다)`)) return;
            setBooking(true);
            try {
                const sessionRef = doc(db, "sessions", sessionId);
                await runTransaction(db, async (transaction) => {
                    const sDoc = await transaction.get(sessionRef);
                    if (!sDoc.exists()) throw "Session doesn't exist";
                    const data = sDoc.data();
                    const currentRes = data.reservations || {};
                    if (currentRes[seatId]) throw "이미 선택된 자리입니다.";

                    const userRef = doc(db, "users", userData.id);
                    const uDoc = await transaction.get(userRef);
                    if (!uDoc.exists()) throw "User missing";

                    const currentPoints = uDoc.data().points || 0;
                    if (currentPoints < currentTurnUser.points) throw "잔여 포인트가 부족합니다.";

                    transaction.update(userRef, { points: currentPoints - currentTurnUser.points });

                    const newRes = { ...currentRes };
                    newRes[seatId] = userData.id;

                    const nextIndex = (data.currentSelectionIndex || 0) + 1;
                    transaction.update(sessionRef, { reservations: newRes, currentSelectionIndex: nextIndex });
                });
                alert("자리 선택이 완료되었습니다!");
            } catch (e: any) {
                console.error(e);
                alert(typeof e === 'string' ? e : "자리 선택 중 오류가 발생했습니다.");
            } finally {
                setBooking(false);
            }
            return;
        }

        if (isBlindMode) return; // 블라인드 모드에서는 일반 좌석 클릭 입찰 막음

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

    // 현재는 사용 가능한 전체 포인트를 기준으로 입찰 가능 (새로운 자리에 입찰 시 이전 입찰은 자동 취소됨)
    const myCurrentBid = Object.values(bids).find(b => b.uid === userData?.id);
    const availablePoints = userData?.points ?? 0;

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

        // --- 과거 짝꿍 제한 검사 로직 ---
        const isPartnerForbidden = (uid1: string, uid2: string) => {
            return partnerHistory.some(p =>
                (p.student1 === uid1 && p.student2 === uid2) ||
                (p.student1 === uid2 && p.student2 === uid1)
            );
        };

        // 현재 선택한 자리의 r, c
        const myR = selectedSeatForBid.r;
        const myC = selectedSeatForBid.c;

        // 좌/우 (c - 1, c + 1) 인접 좌석 찾기
        const adjacentSeats = layout.filter(s => s.active && s.r === myR && Math.abs(s.c - myC) === 1);

        for (const adjSeat of adjacentSeats) {
            let adjUserUid = reservations[adjSeat.id] || bids[adjSeat.id]?.uid;

            if (adjUserUid && isPartnerForbidden(userData.id, adjUserUid)) {
                alert(`경고: 옆 자리(${adjUserUid === reservations[adjSeat.id] ? "배정 완료" : "입찰 중"}) 학생과는 이전에 짝이었습니다.\n해당 학생의 옆자리에는 입찰할 수 없습니다.`);
                return;
            }
        }
        // --- 검사 끝 ---

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

    const cancelBid = async () => {
        if (!selectedSeatForBid || !userData || booking) return;
        const seatId = selectedSeatForBid.id;

        if (!confirm("정말 현재 좌석의 입찰을 취소하시겠습니까? (포인트는 100% 반환됩니다)")) return;

        setBooking(true);
        try {
            const sessionRef = doc(db, "sessions", sessionId);
            await runTransaction(db, async (transaction) => {
                const sDoc = await transaction.get(sessionRef);
                if (!sDoc.exists()) throw "Session doesn't exist";
                const data = sDoc.data();
                const currentBids = data.bids || {};

                // 내가 최고 입찰자인지 검증
                if (!currentBids[seatId] || currentBids[seatId].uid !== userData.id) {
                    throw "현재 좌석의 최고 입찰자만 취소할 수 있습니다.";
                }

                const newBids = { ...currentBids };
                delete newBids[seatId];

                transaction.update(sessionRef, { bids: newBids });
            });
            alert("입찰이 성공적으로 취소되었습니다.");
            setSelectedSeatForBid(null);
        } catch (e: any) {
            console.error(e);
            alert(typeof e === 'string' ? e : "입찰 취소 중 오류가 발생했습니다.");
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

    // --- 블라인드 모드 전용 함수 ---
    const submitBlindBid = async () => {
        if (!userData || booking) return;
        const amount = Number(bidAmount);
        if (!amount || amount <= 0) {
            alert("올바른 포인트를 입력하세요.");
            return;
        }
        if (amount > availablePoints) {
            alert(`사용 가능한 포인트가 부족합니다. (현재 가용: ${availablePoints}P)`);
            return;
        }

        setBooking(true);
        try {
            const sessionRef = doc(db, "sessions", sessionId);
            await runTransaction(db, async (transaction) => {
                const sDoc = await transaction.get(sessionRef);
                if (!sDoc.exists()) throw "Session doesn't exist";
                const data = sDoc.data();
                if (data.status !== 'open') throw "입찰 기간이 종료되었습니다.";

                const currentBlindBids = data.blindBids || {};
                currentBlindBids[userData.id] = {
                    studentId: userData.id,
                    name: userData.name || "",
                    points: amount,
                    submittedAt: new Date().toISOString()
                };
                transaction.update(sessionRef, { blindBids: currentBlindBids });
            });
            alert("블라인드 입찰이 완료되었습니다!");
            setBidAmount("");
        } catch (e: any) {
            console.error(e);
            alert(typeof e === 'string' ? e : "입찰 중 오류가 발생했습니다.");
        } finally {
            setBooking(false);
        }
    };

    const endBiddingAndRank = async () => {
        if (!confirm("입찰을 종료하고 순위를 부여하시겠습니까? (이후 학생들은 입찰할 수 없습니다)")) return;
        setBooking(true);
        try {
            const sessionRef = doc(db, "sessions", sessionId);
            await runTransaction(db, async (transaction) => {
                const sDoc = await transaction.get(sessionRef);
                if (!sDoc.exists()) throw "Session doesn't exist";
                const data = sDoc.data();
                const currentBlindBids = data.blindBids || {};

                // Sort by points desc, then by time asc
                const order = Object.values(currentBlindBids).sort((a: any, b: any) => {
                    if (b.points !== a.points) return b.points - a.points;
                    return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
                }).map((bid: any, index: number) => ({
                    ...bid, // uid is essentially studentId
                    uid: bid.studentId,
                    rank: index + 1
                }));

                transaction.update(sessionRef, {
                    selectionOrder: order,
                    status: "ready_to_select"
                });
            });
            alert("순위 부여 완료!");
        } catch (e: any) {
            console.error(e);
            alert(typeof e === 'string' ? e : "순위 부여 중 오류가 발생했습니다.");
        } finally {
            setBooking(false);
        }
    };

    const startSeatSelection = async () => {
        if (!confirm("실시간 자리 선택을 시작하시겠습니까?")) return;
        try {
            await updateDoc(doc(db, "sessions", sessionId), { status: "selection", currentSelectionIndex: 0 });
            alert("자리 선택 시작!");
        } catch (e) {
            console.error(e);
        }
    };

    const skipTurn = async () => {
        if (!confirm("현재 차례를 건너뛰시겠습니까?")) return;
        try {
            const nextIndex = currentSelectionIndex + 1;
            await updateDoc(doc(db, "sessions", sessionId), { currentSelectionIndex: nextIndex });
        } catch (e) {
            console.error(e);
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

    // --- 일괄 짝꿍 등록 로직 (교사 전용) ---
    const handleAutoRegisterPartners = async () => {
        if (!confirm("현재 좌석 배치도의 양 옆에 앉은 학생들을 통째로 스캔하여 '과거 짝꿍' 리스트에 추가합니다.\n진행하시겠습니까? (이미 추가된 짝꿍은 중복 등록되지 않습니다)")) return;

        setBooking(true);
        try {
            const settingsRef = doc(db, "settings", "partner_history");
            let newPairsCount = 0;

            await runTransaction(db, async (transaction) => {
                const snap = await transaction.get(settingsRef);
                const currentPairs: Array<any> = snap.exists() ? (snap.data().pairs || []) : [];
                const updatedPairs = [...currentPairs];

                // 행(R)별로 좌석을 묶고, 열(C)을 기준으로 정렬
                const rowMap: Record<number, Seat[]> = {};
                layout.forEach(seat => {
                    if (!seat.active) return;
                    if (!rowMap[seat.r]) rowMap[seat.r] = [];
                    rowMap[seat.r].push(seat);
                });

                // 각 행을 순회하면서 인접한 학생 짝 찾기
                Object.values(rowMap).forEach(rowSeats => {
                    rowSeats.sort((a, b) => a.c - b.c); // 열 순서대로 정렬

                    for (let i = 0; i < rowSeats.length - 1; i++) {
                        const currentSeat = rowSeats[i];
                        const nextSeat = rowSeats[i + 1];

                        // 두 좌석이 물리적으로 인접해 있는지 확인 (c 차이가 1)
                        if (Math.abs(currentSeat.c - nextSeat.c) === 1) {
                            const uid1 = reservations[currentSeat.id];
                            const uid2 = reservations[nextSeat.id];

                            if (uid1 && uid2 && uid1 !== uid2) {
                                // 둘 다 학생이 배정되어 있는 경우에만 짝꿍으로 인정
                                const exists = updatedPairs.some(p =>
                                    (p.student1 === uid1 && p.student2 === uid2) ||
                                    (p.student1 === uid2 && p.student2 === uid1)
                                );

                                if (!exists) {
                                    const student1Info = studentsMap[uid1];
                                    const student2Info = studentsMap[uid2];

                                    if (student1Info && student2Info) {
                                        updatedPairs.push({
                                            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                                            student1: uid1,
                                            student1Name: student1Info.name,
                                            student2: uid2,
                                            student2Name: student2Info.name
                                        });
                                        newPairsCount++;
                                    }
                                }
                            }
                        }
                    }
                });

                transaction.update(settingsRef, { pairs: updatedPairs });
            });

            alert(`스캔 완료! 총 ${newPairsCount}쌍의 새로운 짝꿍이 성공적으로 등록되었습니다.`);

            // 로컬 상태 동기화를 위해 즉시 다시 불러오기 (혹은 위의 로직에서 수동 갱신)
            const snap = await getDoc(doc(db, "settings", "partner_history"));
            if (snap.exists()) {
                setPartnerHistory(snap.data().pairs || []);
            }

        } catch (e: any) {
            console.error("일괄 짝꿍 등록 오류:", e);
            alert("오류가 발생했습니다: " + e.message);
        } finally {
            setBooking(false);
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
        <div className="container" style={{ display: 'flex', flexDirection: isTeacher && !isPrintMode ? 'row' : 'column', gap: '2rem', alignItems: 'flex-start' }}>
            <style>
                {`
                    @media print {
                        body * { visibility: hidden; }
                        .print-area, .print-area * { visibility: visible; }
                        .print-area {
                            position: absolute;
                            left: 0;
                            top: 0;
                            width: 100%;
                            padding: 0;
                            margin: 0;
                        }
                        .no-print { display: none !important; }
                        .card { box-shadow: none !important; border: none !important; }
                    }
                `}
            </style>
            <div className="no-print">
                <Toaster position="bottom-right" />
            </div>
            <div className="print-area" style={{ flex: 1, width: '100%' }}>
                <div className="card" style={{ marginBottom: '1.5rem', textAlign: 'center', position: 'relative' }}>
                    <h2 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>
                        {isPrintMode ? "좌석 배치도 (교탁 시점)" : "좌석 신청 및 배정 현황"}
                    </h2>
                    <p className="no-print" style={{ fontSize: '0.875rem', color: 'var(--secondary)' }}>
                        {isTeacher ? "학생을 드래그하여 배치하거나 자리를 옮길 수 있습니다." : "원하는 빈 좌석을 터치하여 예약하세요."}
                    </p>

                    {isTeacher && (
                        <div className="no-print" style={{ position: 'absolute', right: '1.5rem', top: '1.5rem', display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={() => {
                                    if (!isPrintMode) setIsPrintMode(true);
                                    else { setIsPrintMode(false); }
                                }}
                                style={{
                                    padding: '0.5rem 1rem', background: isPrintMode ? '#475569' : 'var(--primary)',
                                    color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
                                }}
                            >
                                {isPrintMode ? "일반 모드로 복귀" : "🖨️ 인쇄용 교탁 시점"}
                            </button>
                            {isPrintMode && (
                                <button
                                    onClick={() => window.print()}
                                    style={{
                                        padding: '0.5rem 1rem', background: '#10b981',
                                        color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
                                    }}
                                >
                                    인쇄하기
                                </button>
                            )}
                        </div>
                    )}
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

                {/* --- 블라인드 모드 UI --- */}
                {isBlindMode && (
                    <div className="no-print" style={{ marginBottom: "2rem", padding: "1.5rem", background: "white", borderRadius: "12px", border: "1px solid var(--primary)", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }}>
                        <h3 style={{ color: "var(--primary)", borderBottom: "2px solid #e2e8f0", paddingBottom: "0.5rem", marginBottom: "1rem" }}>
                            🙈 블라인드 입찰 및 순위별 순차 선택 현황
                        </h3>

                        {/* 1. 입찰 단계 */}
                        {sessionStatus === 'open' && (
                            <div>
                                {isTeacher ? (
                                    <div>
                                        <p style={{ marginBottom: "1rem", fontWeight: "bold" }}>현재 입찰 건수: {Object.keys(blindBids).length}건</p>
                                        <button onClick={endBiddingAndRank} disabled={booking} className="btn-primary" style={{ width: "100%", padding: "1rem", fontSize: "1.1rem" }}>
                                            ⏱️ 입찰 마감 및 순위 부여
                                        </button>
                                        <div style={{ marginTop: "1rem", maxHeight: "200px", overflowY: "auto" }}>
                                            {Object.values(blindBids).map((b: any, i) => (
                                                <div key={i} style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
                                                    <span>{b.name} ({b.studentId})</span>
                                                    <span style={{ fontWeight: "bold", color: "var(--primary)" }}>{b.points}P</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ textAlign: "center" }}>
                                        {blindBids[userData?.id || ""] ? (
                                            <div style={{ padding: "1.5rem", background: "#f0fdf4", borderRadius: "8px", border: "1px solid #10b981", color: "#047857" }}>
                                                <h4 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>✅ 입찰 완료</h4>
                                                <p>나의 일괄 입찰가: <strong>{blindBids[userData?.id || ""].points}P</strong></p>
                                                <p style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>선생님이 입찰을 마감하고 순위를 부여할 때까지 잠시 대기해주세요.</p>
                                            </div>
                                        ) : (
                                            <div>
                                                <p style={{ marginBottom: "1rem" }}>이번 세션의 자리 선택 순위를 결정하기 위해 블라인드 입찰을 진행합니다.<br />가용 포인트 내에서 자유롭게 입찰하세요. 최고 입찰자부터 자리 선택 권한을 얻습니다.</p>
                                                <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
                                                    <input
                                                        type="number"
                                                        value={bidAmount}
                                                        onChange={(e) => setBidAmount(e.target.value === "" ? "" : Number(e.target.value))}
                                                        placeholder="입찰할 포인트 입력"
                                                        style={{ padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border)", width: "200px", fontSize: "1.1rem", textAlign: "center" }}
                                                    />
                                                    <button onClick={submitBlindBid} disabled={booking} className="btn-primary" style={{ padding: "0.75rem 1.5rem" }}>
                                                        입찰하기
                                                    </button>
                                                </div>
                                                <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "var(--secondary)" }}>내 보유 포인트: {availablePoints}P</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 2. 순위 부여 완료 (자리 선택 대기) */}
                        {sessionStatus === 'ready_to_select' && (
                            <div>
                                {isTeacher ? (
                                    <div>
                                        <p style={{ marginBottom: "1rem", fontWeight: "bold", color: "var(--primary)" }}>순위 부여완료. 학생 화면에 공유되었습니다.</p>
                                        <button onClick={startSeatSelection} disabled={booking} className="btn-primary" style={{ width: "100%", padding: "1rem", fontSize: "1.1rem", background: "#10b981", border: "none" }}>
                                            🎯 순위별 실시간 자리 선택 시작
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ textAlign: "center" }}>
                                        <h4 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>🏆 최종 순위결과 발표</h4>
                                        <p style={{ marginBottom: "1rem" }}>곧 선생님이 자리선택을 오픈할 예정입니다. 내 순위는 <strong>{selectionOrder.find(o => o.uid === userData?.id)?.rank || "-"}등</strong> 입니다.</p>
                                    </div>
                                )}
                                <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "0.5rem" }}>
                                    {selectionOrder.map((user: any) => (
                                        <div key={user.uid} style={{ padding: "0.5rem", background: "#f8fafc", border: "2px solid", borderColor: user.uid === userData?.id ? "var(--primary)" : "var(--border)", borderRadius: "6px", textAlign: "center", fontWeight: "bold", opacity: user.uid === userData?.id ? 1 : 0.65 }}>
                                            <div style={{ color: "var(--primary)", fontSize: "0.9rem" }}>{user.rank}등</div>
                                            <div style={{ fontSize: "1.1rem", padding: "0.2rem 0" }}>{user.name}</div>
                                            <div style={{ fontSize: "0.75rem", color: "var(--secondary)" }}>{user.points}P</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 3. 자리 선택 진행 중 */}
                        {sessionStatus === 'selection' && (
                            <div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", background: "#f8fafc", padding: "1rem", borderRadius: "8px", border: "2px solid var(--primary)" }}>
                                    <div>
                                        <h4 style={{ fontSize: "1.2rem", color: "var(--text)", margin: 0 }}>
                                            📢 현재 자리 선택 차례: <span style={{ fontSize: "1.6rem", color: "var(--primary)", marginLeft: "0.5rem" }}>{selectionOrder[currentSelectionIndex]?.name || "모든 선택 종료"} ({selectionOrder[currentSelectionIndex]?.rank || "-"}등)</span>
                                        </h4>
                                        {selectionOrder[currentSelectionIndex]?.uid === userData?.id && (
                                            <p style={{ color: "#ef4444", fontWeight: "bold", marginTop: "0.5rem", marginBottom: 0 }}>👆 지금 하단의 좌석 배치도에서 원하는 빈 자리를 클릭하세요! ({selectionOrder[currentSelectionIndex].points}P 사용)</p>
                                        )}
                                    </div>
                                    {isTeacher && (
                                        <button onClick={skipTurn} disabled={booking || currentSelectionIndex >= selectionOrder.length} style={{ background: "#ef4444", color: "white", padding: "0.75rem 1rem", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>
                                            ⏭️ 다음 차례로 스킵
                                        </button>
                                    )}
                                </div>
                                <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
                                    {selectionOrder.map((user: any, idx: number) => {
                                        const isPast = idx < currentSelectionIndex;
                                        const isCurrent = idx === currentSelectionIndex;
                                        return (
                                            <div key={user.uid} style={{
                                                flexShrink: 0, padding: "0.5rem", minWidth: "65px", textAlign: "center", borderRadius: "6px",
                                                background: isCurrent ? "var(--primary)" : isPast ? "#e2e8f0" : "white",
                                                color: isCurrent ? "white" : isPast ? "#94a3b8" : "var(--text)",
                                                border: isCurrent ? "none" : "1px solid var(--border)",
                                                fontWeight: isCurrent ? "bold" : "normal",
                                                boxShadow: isCurrent ? "0 4px 6px -1px rgba(0,0,0,0.1)" : "none",
                                                transform: isCurrent ? "scale(1.05)" : "scale(1)",
                                                transition: "all 0.2s"
                                            }}>
                                                <div style={{ fontSize: "0.75rem" }}>{user.rank}등</div>
                                                <div style={{ marginTop: "0.2rem" }}>{user.name}</div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
                {/* --- 블라인드 모드 UI 끝 --- */}

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

                            // 인쇄 모드일 경우 gap 배열도 뒤집어야 함
                            const activeGaps = isPrintMode ? [...columnGaps].reverse() : columnGaps;

                            return Array.from({ length: cols }).map((_, i) =>
                                i === cols - 1 ? '58px' : `58px ${activeGaps[i] !== undefined ? activeGaps[i] : 12}px`
                            ).join(' ');
                        })(),
                        rowGap: '12px',
                        justifyContent: 'center',
                        width: 'fit-content',
                        margin: '0 auto'
                    }}>
                        {layout.map(seat => {
                            // 교사 시점 인쇄 모드: 좌우, 상하 반전 (거상)
                            const maxR = layout.length > 0 ? Math.max(...layout.map(s => s.r)) : 0;
                            const maxC = layout.length > 0 ? Math.max(...layout.map(s => s.c)) : 0;

                            const renderR = isPrintMode ? maxR - seat.r : seat.r;
                            const renderC = isPrintMode ? maxC - seat.c : seat.c;

                            if (!seat.active) {
                                return <div key={seat.id} style={{ gridColumn: renderC * 2 + 1, gridRow: renderR + 1, width: '58px', height: '58px' }}></div>;
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
                                        gridColumn: renderC * 2 + 1,
                                        gridRow: renderR + 1,
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
                                            <div style={{ fontSize: '0.6rem', opacity: 0.9 }}>
                                                {isAnonymous && !isTeacher && !isMyBid ? "익명" : currentBid.name}
                                            </div>
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

                <div className="no-print" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
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

            {isTeacher && !isPrintMode && (
                <div className="card no-print" style={{ width: '280px', minHeight: '500px', position: 'sticky', top: '20px' }}>
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

                    <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '2px dashed var(--border)', textAlign: 'center' }}>
                        <p style={{ fontSize: '0.8rem', color: 'var(--secondary)', marginBottom: '0.75rem', lineHeight: '1.4' }}>
                            모든 자리가 확정되었다면 아래 버튼을 눌러 양 옆으로 앉은 학생들을 관리자 설정의 '과거 짝꿍 목록'에 영구 등록합니다.
                        </p>
                        <button
                            onClick={handleAutoRegisterPartners}
                            disabled={booking}
                            style={{
                                width: '100%', padding: '0.75rem', background: 'var(--primary)',
                                color: 'white', border: 'none', borderRadius: '4px', cursor: booking ? 'wait' : 'pointer', fontWeight: 'bold'
                            }}
                        >
                            {booking ? "스캔 중..." : "👥 현재 짝꿍 일괄 등록"}
                        </button>
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
                                    <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '0.5rem' }}>
                                        ({isAnonymous && !isTeacher && bids[selectedSeatForBid.id].uid !== userData?.id ? "익명" : bids[selectedSeatForBid.id].name})
                                    </span>
                                </div>
                            ) : (
                                <div style={{ color: '#94a3b8' }}>입찰 없음</div>
                            )}
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text)' }}>
                                나의 입찰액 (보유 포인트: {(userData?.points ?? 0).toLocaleString()}P)
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
                                닫기
                            </button>
                            {bids[selectedSeatForBid.id]?.uid === userData?.id ? (
                                <button
                                    onClick={cancelBid}
                                    disabled={booking}
                                    style={{ flex: 1, padding: '0.75rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: booking ? 'not-allowed' : 'pointer', opacity: booking ? 0.7 : 1 }}
                                >
                                    {booking ? "처리 중..." : "입찰 포기"}
                                </button>
                            ) : (
                                <button
                                    onClick={submitBid}
                                    disabled={booking}
                                    style={{ flex: 1, padding: '0.75rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: booking ? 'not-allowed' : 'pointer', opacity: booking ? 0.7 : 1 }}
                                >
                                    {booking ? "처리 중..." : "입찰하기"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
