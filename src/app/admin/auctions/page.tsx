"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, onSnapshot, deleteDoc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

interface AuctionSeat {
  seatId: string;
  seatLabel: string;
  status: "waiting" | "active" | "closed";
  currentBid: number;
  currentBidderUid: string | null;
  currentBidderName: string | null;
  winnerId: string | null;
  winnerName: string | null;
  winningBid: number | null;
}

interface Auction {
  id: string;
  title: string;
  classId: string;
  className: string;
  status: "waiting" | "active" | "closed";
  seats: AuctionSeat[];
  currentSeatIndex: number;
  createdAt: string;
  sessionId?: string;
}

export default function AuctionManagement() {
  const router = useRouter();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [sessionLayout, setSessionLayout] = useState<any[]>([]);

  useEffect(() => {
    const unsubAuctions = onSnapshot(collection(db, "auctions"), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Auction[];
      data.sort((a, b) => b.createdAt?.localeCompare(a.createdAt ?? "") ?? 0);
      setAuctions(data);
      setLoading(false);
    });
    const fetchSessions = async () => {
      const snap = await getDocs(collection(db, "sessions"));
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((s: any) => s.status === "open" || s.status === "closed"));
    };
    fetchSessions();
    return () => unsubAuctions();
  }, []);

  const handleSessionSelect = async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setSelectedSeatIds([]);
    if (!sessionId) { setSessionLayout([]); return; }
    const snap = await getDoc(doc(db, "sessions", sessionId));
    if (snap.exists()) {
      setSessionLayout(snap.data().layout || []);
    }
  };

  const toggleSeat = (seatId: string) => {
    setSelectedSeatIds(prev => prev.includes(seatId) ? prev.filter(s => s !== seatId) : [...prev, seatId]);
  };

  const handleCreateAuction = async () => {
    if (!newTitle.trim()) { alert("경매 제목을 입력하세요."); return; }
    if (!selectedSessionId) { alert("세션을 선택하세요."); return; }
    if (selectedSeatIds.length === 0) { alert("경매할 자리를 선택하세요."); return; }
    setCreating(true);
    try {
      const sessionSnap = await getDoc(doc(db, "sessions", selectedSessionId));
      if (!sessionSnap.exists()) throw new Error("세션을 찾을 수 없습니다.");
      const sessionData = sessionSnap.data();

      const seats: AuctionSeat[] = selectedSeatIds.map(seatId => {
        const seat = sessionLayout.find((s: any) => s.id === seatId);
        return {
          seatId,
          seatLabel: seat ? `${seat.r + 1}행 ${seat.c + 1}열` : seatId,
          status: "waiting",
          currentBid: 0,
          currentBidderUid: null,
          currentBidderName: null,
          winnerId: null,
          winnerName: null,
          winningBid: null,
        };
      });

      const auctionRef = await addDoc(collection(db, "auctions"), {
        title: newTitle,
        classId: sessionData.classId,
        className: sessionData.className || "",
        sessionId: selectedSessionId,
        status: "waiting",
        seats,
        currentSeatIndex: 0,
        createdAt: new Date().toISOString(),
      });

      alert("경매가 생성되었습니다!");
      setNewTitle("");
      setSelectedSessionId("");
      setSelectedSeatIds([]);
      setSessionLayout([]);
      router.push(`/auction/${auctionRef.id}`);
    } catch (e: any) {
      alert("오류: " + e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 경매를 삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, "auctions", id));
  };

  const activeSeatLayout = sessionLayout.filter((s: any) => s.active);
  const maxRow = activeSeatLayout.length > 0 ? Math.max(...activeSeatLayout.map((s: any) => s.r)) + 1 : 0;
  const maxCol = activeSeatLayout.length > 0 ? Math.max(...activeSeatLayout.map((s: any) => s.c)) + 1 : 0;

  if (loading) return <div className="card">로딩 중...</div>;

  return (
    <div className="card">
      <h2>🏷️ 좌석 경매 관리</h2>
      <p style={{ color: "var(--secondary)", marginBottom: "2rem" }}>
        선택한 세션의 자리를 포인트 경매로 배정합니다. 학생들은 보유 포인트로 입찰하며 최고 입찰자가 낙찰됩니다.
      </p>

      <div style={{ background: "#f8fafc", padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--border)", marginBottom: "2rem" }}>
        <h3>새 경매 만들기</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          <input type="text" placeholder="경매 제목 (예: 3월 1주차 좌석 경매)" value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            style={{ padding: "0.75rem", borderRadius: "4px", border: "1px solid var(--border)" }} />

          <select value={selectedSessionId} onChange={e => handleSessionSelect(e.target.value)}
            style={{ padding: "0.75rem", borderRadius: "4px", border: "1px solid var(--border)" }}>
            <option value="">-- 연결할 세션 선택 --</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.className ? `[${s.className}] ` : ""}{s.title}</option>
            ))}
          </select>

          {activeSeatLayout.length > 0 && (
            <div>
              <p style={{ fontSize: "0.875rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
                경매할 자리 선택 ({selectedSeatIds.length}개 선택됨):
              </p>
              <div style={{ overflowX: "auto", background: "#f1f5f9", padding: "1rem", borderRadius: "8px" }}>
                <div style={{ display: "inline-grid", gridTemplateColumns: `repeat(${maxCol}, 52px)`, gap: "6px" }}>
                  {Array.from({ length: maxRow }).map((_, r) =>
                    Array.from({ length: maxCol }).map((_, c) => {
                      const seat = activeSeatLayout.find((s: any) => s.r === r && s.c === c);
                      if (!seat) return <div key={`${r}-${c}`} style={{ width: "52px", height: "44px" }} />;
                      const selected = selectedSeatIds.includes(seat.id);
                      return (
                        <div key={seat.id} onClick={() => toggleSeat(seat.id)} style={{
                          width: "52px", height: "44px", background: selected ? "#7c3aed" : "white",
                          color: selected ? "white" : "inherit", border: `1px solid ${selected ? "#7c3aed" : "var(--border)"}`,
                          borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", fontSize: "0.7rem", fontWeight: "bold"
                        }}>
                          {r + 1}-{c + 1}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          <button onClick={handleCreateAuction} disabled={creating}
            style={{ background: "#7c3aed", color: "white", border: "none", padding: "0.8rem 1.5rem", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", opacity: creating ? 0.6 : 1 }}>
            {creating ? "생성 중..." : "경매 생성하기"}
          </button>
        </div>
      </div>

      <h3>경매 목록</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
        {auctions.length === 0 ? (
          <p style={{ textAlign: "center", padding: "2rem", color: "var(--secondary)" }}>생성된 경매가 없습니다.</p>
        ) : (
          auctions.map(auction => (
            <div key={auction.id} style={{
              padding: "1rem", border: "1px solid var(--border)", borderRadius: "8px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: auction.status === "active" ? "#faf5ff" : "white"
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                  <span style={{ fontWeight: "bold" }}>{auction.title}</span>
                  <span style={{ fontSize: "0.75rem", padding: "2px 8px", borderRadius: "12px", color: "white",
                    background: auction.status === "active" ? "#7c3aed" : auction.status === "waiting" ? "var(--accent)" : "#94a3b8" }}>
                    {auction.status === "active" ? "진행 중" : auction.status === "waiting" ? "대기 중" : "종료됨"}
                  </span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--secondary)" }}>
                  {auction.className} · 자리 {auction.seats?.length ?? 0}개 · {new Date(auction.createdAt).toLocaleString()}
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button onClick={() => router.push(`/auction/${auction.id}`)}
                  style={{ background: "#7c3aed", color: "white", border: "none", padding: "0.5rem 1rem", borderRadius: "4px", cursor: "pointer", fontSize: "0.875rem" }}>
                  {auction.status === "waiting" ? "경매 시작" : "경매 보기"}
                </button>
                <button onClick={() => handleDelete(auction.id)}
                  style={{ background: "none", color: "var(--error)", border: "1px solid var(--error)", padding: "0.5rem 1rem", borderRadius: "4px", cursor: "pointer", fontSize: "0.875rem" }}>
                  삭제
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}