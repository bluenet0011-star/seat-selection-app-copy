"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection, addDoc, getDocs, doc, getDoc,
  updateDoc, deleteDoc, onSnapshot, query, where
} from "firebase/firestore";
import { useRouter } from "next/navigation";

interface Session {
  id: string;
  title: string;
  status: "open" | "closed" | "scheduled";
  createdAt: string;
  scheduledOpenAt?: string;
  layout: any[];
  auctionId?: string;
  isAnonymous?: boolean;
}

export default function SessionManagement() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [scheduledOpenAt, setScheduledOpenAt] = useState("");
  const [isAnonymousMode, setIsAnonymousMode] = useState(false);
  const [isBlindMode, setIsBlindMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const router = useRouter();



  useEffect(() => {
    const unsubSessions = onSnapshot(collection(db, "sessions"), (snapshot) => {
      const sessionData = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Session[];
      sessionData.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setSessions(sessionData);
      setLoading(false);
    });
    const fetchClasses = async () => {
      const snap = await getDocs(collection(db, "classes"));
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchClasses();
    return () => unsubSessions();
  }, []);

  const handleCreateSession = async (openNow: boolean) => {
    if (!selectedClassId) { alert("대상 수업을 선택해주세요."); return; }
    if (!newTitle.trim()) { alert("세션 제목을 입력해주세요."); return; }
    setCreating(true);
    try {
      const classRef = doc(db, "classes", selectedClassId);
      const classSnap = await getDoc(classRef);
      if (!classSnap.exists() || !classSnap.data().layout?.length) {
        alert("해당 수업의 좌석 배치도가 설정되지 않았습니다.");
        return;
      }
      const classData = classSnap.data();
      const status = openNow ? "open" : (scheduledOpenAt ? "scheduled" : "open");

      // 세션 생성
      const sessionRef = await addDoc(collection(db, "sessions"), {
        title: newTitle,
        classId: selectedClassId,
        className: classData.name,
        layout: classData.layout,
        status,
        scheduledOpenAt: (!openNow && scheduledOpenAt) ? scheduledOpenAt : null,
        reservations: {},
        isAnonymous: isAnonymousMode,
        isBlindMode: isBlindMode,
        blindBids: {},
        selectionOrder: [],
        currentSelectionIndex: 0,
        createdAt: new Date().toISOString(),
      });

      // 경매 자동 생성
      const seats = classData.layout
        .filter((cell: any) => cell.type === "seat")
        .map((cell: any) => ({
          id: cell.id,
          label: cell.label || cell.id,
          row: cell.row,
          col: cell.col,
          bids: {},
          topBid: 0,
          topBidder: null,
          winner: null,
        }));

      await addDoc(collection(db, "auctions"), {
        title: newTitle,
        sessionId: sessionRef.id,
        classId: selectedClassId,
        className: classData.name,
        status: status === "open" ? "active" : "waiting",
        seats,
        createdAt: new Date().toISOString(),
      });

      alert(status === "scheduled"
        ? "세션 오픈이 예약되었습니다. 경매도 함께 예약됩니다."
        : "세션이 오픈되었습니다! 경매가 자동으로 시작됩니다.");

      setNewTitle("");
      setSelectedClassId("");
      setScheduledOpenAt("");
    } catch (error) {
      console.error("세션 생성 중 오류:", error);
      alert("오류가 발생했습니다.");
    } finally {
      setCreating(false);
    }
  };

  const handleCloseSession = async (sessionId: string) => {
    if (!confirm("정말로 이 세션을 종료하시겠습니까?")) return;
    try {
      await updateDoc(doc(db, "sessions", sessionId), { status: "closed" });

      const auctionsQuery = query(collection(db, "auctions"), where("sessionId", "==", sessionId));
      const auctionsSnap = await getDocs(auctionsQuery);
      auctionsSnap.forEach(async (auctionDoc) => {
        await updateDoc(doc(db, "auctions", auctionDoc.id), { status: "closed" });
      });

      alert("세션이 종료되었습니다.");
    } catch (error) { console.error("세션 종료 중 오류:", error); }
  };

  const handleResumeSession = async (sessionId: string) => {
    try {
      await updateDoc(doc(db, "sessions", sessionId), { status: "open" });

      const auctionsQuery = query(collection(db, "auctions"), where("sessionId", "==", sessionId));
      const auctionsSnap = await getDocs(auctionsQuery);
      auctionsSnap.forEach(async (auctionDoc) => {
        await updateDoc(doc(db, "auctions", auctionDoc.id), { status: "active" });
      });

      alert("세션이 다시 오픈되었습니다.");
    } catch (error) { console.error("세션 재개 중 오류:", error); }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm("정말로 이 세션을 삭제하시겠습니까? 관련 데이터가 모두 지워집니다.")) return;
    try {
      // 1. 활성 세션일 경우 삭제가 거부될 수 있으므로 먼저 종료 처리 (Firestore Rule 우회 및 안전장치)
      await updateDoc(doc(db, "sessions", sessionId), { status: "closed" });

      // 2. 관련된 경매문서를 먼저 모두 삭제 (비동기 대기)
      const auctionsQuery = query(collection(db, "auctions"), where("sessionId", "==", sessionId));
      const auctionsSnap = await getDocs(auctionsQuery);
      const deletePromises = auctionsSnap.docs.map(auctionDoc => deleteDoc(doc(db, "auctions", auctionDoc.id)));
      await Promise.all(deletePromises);

      // 3. 통신이 완료된 후 최종적으로 세션 문서 삭제
      await deleteDoc(doc(db, "sessions", sessionId));

      alert("세션이 삭제되었습니다.");
    } catch (error) {
      console.error("세션 삭제 중 오류:", error);
      alert("삭제 중 오류가 발생했습니다: " + (error as any).message);
    }
  };

  if (loading) return <div className="card">세션 정보를 불러오는 중...</div>;

  return (
    <div className="card">
      <h2>예약 세션 관리</h2>
      <p style={{ color: "var(--secondary)", marginBottom: "2rem" }}>
        세션을 생성하면 경매가 자동으로 시작됩니다.
      </p>

      {/* 세션 생성 */}
      <div style={{ background: "#f8fafc", padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--border)", marginBottom: "2rem" }}>
        <h3>신규 세션 오픈</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          <div style={{ display: "flex", gap: "1rem" }}>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              style={{ flex: 1, padding: "0.75rem", borderRadius: "4px", border: "1px solid var(--border)" }}
            >
              <option value="">-- 대상 수업 선택 --</option>
              {classes.map(cls => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="세션 제목 (예: 7교시 자율학습)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              style={{ flex: 2, padding: "0.75rem", borderRadius: "4px", border: "1px solid var(--border)" }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <label style={{ fontSize: "0.875rem", fontWeight: "bold", whiteSpace: "nowrap" }}>예약 오픈 시간(선택):</label>
            <input
              type="datetime-local"
              value={scheduledOpenAt}
              onChange={(e) => setScheduledOpenAt(e.target.value)}
              style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)" }}
            />
            <span style={{ fontSize: "0.75rem", color: "var(--secondary)" }}>비워두면 즉시 오픈</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem", marginBottom: "0.5rem" }}>
            <input
              type="checkbox"
              id="anonymousMode"
              checked={isAnonymousMode}
              onChange={(e) => setIsAnonymousMode(e.target.checked)}
              style={{ width: "1.2rem", height: "1.2rem", cursor: "pointer" }}
            />
            <label htmlFor="anonymousMode" style={{ fontSize: "1rem", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              🕵️ 익명 입찰 모드 활성화 (학생 화면에서 이름 숨김)
            </label>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
            <input
              type="checkbox"
              id="blindMode"
              checked={isBlindMode}
              onChange={(e) => setIsBlindMode(e.target.checked)}
              style={{ width: "1.2rem", height: "1.2rem", cursor: "pointer" }}
            />
            <label htmlFor="blindMode" style={{ fontSize: "1rem", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              🙈 블라인드 경매 모드 (학생들이 블라인드로 입찰 후 순위 순서대로 자리 선택)
            </label>
          </div>
          <div style={{ display: "flex", gap: "1rem" }}>
            <button
              onClick={() => handleCreateSession(true)}
              disabled={creating}
              style={{
                flex: 1, background: "var(--primary)", color: "white",
                border: "none", padding: "0.8rem 1.5rem", borderRadius: "4px",
                cursor: "pointer", fontWeight: "bold", opacity: creating ? 0.6 : 1,
                fontSize: "1rem"
              }}
            >
              {creating ? "생성 중..." : "⚡ 세션 즉시 오픈 + 경매 시작"}
            </button>
            <button
              onClick={() => handleCreateSession(false)}
              disabled={creating || !scheduledOpenAt}
              style={{
                flex: 1, background: "var(--accent)", color: "white",
                border: "none", padding: "0.8rem 1.5rem", borderRadius: "4px",
                cursor: creating || !scheduledOpenAt ? "not-allowed" : "pointer",
                fontWeight: "bold", opacity: (creating || !scheduledOpenAt) ? 0.4 : 1
              }}
            >
              ⏰ 예약 오픈하기
            </button>
          </div>
        </div>
      </div>

      {/* 세션 목록 */}
      <div>
        <h3>세션 목록</h3>
        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {sessions.length === 0 ? (
            <p style={{ textAlign: "center", padding: "2rem", color: "var(--secondary)" }}>생성된 세션이 없습니다.</p>
          ) : (
            sessions.map(session => (
              <div key={session.id} style={{
                padding: "1rem", border: "1px solid var(--border)", borderRadius: "8px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: session.status === "open" ? "#f0fdf4" : "white"
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.7rem", background: "#e2e8f0", padding: "2px 6px", borderRadius: "4px", fontWeight: "bold" }}>
                      {(session as any).className || "수업 없음"}
                    </span>
                    <span style={{ fontWeight: "bold" }}>{session.title}</span>
                    <span style={{
                      fontSize: "0.75rem", padding: "2px 8px", borderRadius: "12px",
                      background: session.status === "open" ? "var(--success)" : session.status === "scheduled" ? "var(--accent)" : "#94a3b8",
                      color: "white"
                    }}>
                      {session.status === "open" ? "진행 중" : session.status === "scheduled" ? "예약됨" : "종료됨"}
                    </span>
                    {session.isAnonymous && (
                      <span style={{
                        fontSize: "0.75rem", padding: "2px 8px", borderRadius: "12px",
                        background: "#475569", color: "white"
                      }}>
                        🕵️ 익명 모드
                      </span>
                    )}
                    {(session as any).isBlindMode && (
                      <span style={{
                        fontSize: "0.75rem", padding: "2px 8px", borderRadius: "12px",
                        background: "#8b5cf6", color: "white", marginLeft: "4px"
                      }}>
                        🙈 블라인드 모드
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--secondary)", marginTop: "0.25rem" }}>
                    생성: {new Date(session.createdAt).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {session.status !== "closed" ? (
                    <button onClick={() => handleCloseSession(session.id)}
                      style={{ background: "var(--error)", color: "white", border: "none", padding: "0.5rem 1rem", borderRadius: "4px", cursor: "pointer", fontSize: "0.875rem" }}>
                      종료
                    </button>
                  ) : (
                    <button onClick={() => handleResumeSession(session.id)}
                      style={{ background: "var(--primary)", color: "white", border: "none", padding: "0.5rem 1rem", borderRadius: "4px", cursor: "pointer", fontSize: "0.875rem" }}>
                      재개
                    </button>
                  )}
                  <button onClick={() => handleDeleteSession(session.id)}
                    style={{ background: "none", color: "var(--error)", border: "1px solid var(--error)", padding: "0.5rem 1rem", borderRadius: "4px", cursor: "pointer", fontSize: "0.875rem" }}>
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
