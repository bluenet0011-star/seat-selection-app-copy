"use client";
import { useState, useEffect, use } from "react";
import { db, auth } from "@/lib/firebase";
import { doc, onSnapshot, runTransaction, updateDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

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

interface AuctionData {
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

export default function AuctionPage({ params }: { params: Promise<{ auctionId: string }> }) {
  const { auctionId } = use(params);
  const { userData, user } = useAuth();
  const router = useRouter();
  const [auction, setAuction] = useState<AuctionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState<number>(100);
  const [bidding, setBidding] = useState(false);
  const [myPoints, setMyPoints] = useState<number>(0);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) setMyPoints(snap.data().points ?? 0);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!auctionId) return;
    const unsubscribe = onSnapshot(doc(db, "auctions", auctionId), (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as AuctionData;
        setAuction(data);
        const currentSeat = data.seats[data.currentSeatIndex];
        if (currentSeat && currentSeat.status === "active") {
          setBidAmount(currentSeat.currentBid + 100);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [auctionId]);

  const handleBid = async () => {
    if (!auction || !user || !userData) return;
    const currentSeat = auction.seats[auction.currentSeatIndex];
    if (!currentSeat || currentSeat.status !== "active") return;
    if (bidAmount <= currentSeat.currentBid) {
      alert("현재 최고 입찰가보다 높은 금액을 입력하세요.");
      return;
    }
    if (bidAmount > myPoints) {
      alert("보유 포인트가 부족합니다.");
      return;
    }
    setBidding(true);
    try {
      await runTransaction(db, async (transaction) => {
        const aDoc = await transaction.get(doc(db, "auctions", auctionId));
        if (!aDoc.exists()) throw new Error("경매를 찾을 수 없습니다.");
        const aData = aDoc.data();
        const seats = [...aData.seats];
        const seat = seats[aData.currentSeatIndex];
        if (seat.status !== "active") throw new Error("현재 진행 중인 경매가 아닙니다.");
        if (bidAmount <= seat.currentBid) throw new Error("입찰가가 너무 낮습니다.");
        seats[aData.currentSeatIndex] = {
          ...seat,
          currentBid: bidAmount,
          currentBidderUid: user.uid,
          currentBidderName: userData.name,
        };
        transaction.update(doc(db, "auctions", auctionId), { seats });
      });
      alert(bidAmount.toLocaleString() + "P로 입찰했습니다!");
    } catch (e: any) {
      alert("입찰 오류: " + e.message);
    } finally {
      setBidding(false);
    }
  };

  const handleNextSeat = async () => {
    if (!auction || userData?.role !== "teacher") return;
    try {
      await runTransaction(db, async (transaction) => {
        const aDoc = await transaction.get(doc(db, "auctions", auctionId));
        if (!aDoc.exists()) return;
        const aData = aDoc.data();
        const seats = [...aData.seats];
        const seat = seats[aData.currentSeatIndex];
        if (seat.currentBidderUid) {
          seats[aData.currentSeatIndex] = {
            ...seat,
            status: "closed",
            winnerId: seat.currentBidderUid,
            winnerName: seat.currentBidderName,
            winningBid: seat.currentBid,
          };
          const winnerRef = doc(db, "users", seat.currentBidderUid);
          const winnerSnap = await transaction.get(winnerRef);
          if (winnerSnap.exists()) {
            const winnerPoints = winnerSnap.data().points ?? 0;
            transaction.update(winnerRef, { points: winnerPoints - seat.currentBid });
          }
          if (aData.sessionId) {
            const sessionRef = doc(db, "sessions", aData.sessionId);
            const sessionSnap = await transaction.get(sessionRef);
            if (sessionSnap.exists()) {
              const reservations = { ...(sessionSnap.data().reservations || {}) };
              reservations[seat.seatId] = seat.currentBidderUid;
              transaction.update(sessionRef, { reservations });
            }
          }
        } else {
          seats[aData.currentSeatIndex] = { ...seat, status: "closed" };
        }
        const nextIndex = aData.currentSeatIndex + 1;
        if (nextIndex < seats.length) {
          seats[nextIndex] = { ...seats[nextIndex], status: "active" };
          transaction.update(doc(db, "auctions", auctionId), { seats, currentSeatIndex: nextIndex });
        } else {
          transaction.update(doc(db, "auctions", auctionId), { seats, status: "closed" });
        }
      });
    } catch (e: any) {
      alert("오류: " + e.message);
    }
  };

  const handleStartAuction = async () => {
    if (!auction || userData?.role !== "teacher") return;
    const seats = [...auction.seats];
    if (seats.length === 0) { alert("경매할 자리가 없습니다."); return; }
    seats[0] = { ...seats[0], status: "active" };
    await updateDoc(doc(db, "auctions", auctionId), { status: "active", seats, currentSeatIndex: 0 });
  };

  if (loading) return <div className="card" style={{padding: "2rem"}}>경매 정보를 불러오는 중...</div>;
  if (!auction) return <div className="card" style={{padding: "2rem"}}>경매를 찾을 수 없습니다.</div>;

  const currentSeat = auction.seats[auction.currentSeatIndex];
  const isTeacher = userData?.role === "teacher";
  const isMyBid = currentSeat?.currentBidderUid === user?.uid;

  return (
    <div>
      <div className="card" style={{ marginBottom: "1.5rem", background: "linear-gradient(135deg, #7c3aed, #a78bfa)", color: "white" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🏷️ {auction.title}</h1>
        <p style={{ opacity: 0.9 }}>{auction.className} · 좌석 경매</p>
        {!isTeacher && (
          <div style={{ marginTop: "0.75rem", background: "rgba(255,255,255,0.2)", borderRadius: "8px", padding: "0.5rem 1rem", display: "inline-block" }}>
            💰 내 포인트: <strong>{myPoints.toLocaleString()}P</strong>
          </div>
        )}
      </div>
      {auction.status === "waiting" && isTeacher && (
        <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ marginBottom: "1rem", color: "var(--secondary)" }}>경매가 아직 시작되지 않았습니다.</p>
          <button onClick={handleStartAuction} style={{ background: "#7c3aed", color: "white", border: "none", padding: "0.75rem 2rem", borderRadius: "8px", cursor: "pointer", fontSize: "1rem", fontWeight: "bold" }}>
            경매 시작하기
          </button>
        </div>
      )}
      {auction.status === "waiting" && !isTeacher && (
        <div className="card" style={{ textAlign: "center", padding: "2rem", color: "var(--secondary)" }}>
          선생님이 경매를 시작할 때까지 기다려주세요...
        </div>
      )}
      {auction.status === "active" && currentSeat && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          <div className="card" style={{ borderTop: "4px solid #7c3aed" }}>
            <h3 style={{ color: "#7c3aed", marginBottom: "1rem" }}>현재 경매 중인 자리</h3>
            <div style={{ textAlign: "center", padding: "1.5rem", background: "#f5f3ff", borderRadius: "12px", marginBottom: "1rem" }}>
              <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#7c3aed" }}>{currentSeat.seatLabel}</div>
              <div style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "var(--secondary)" }}>
                {auction.currentSeatIndex + 1} / {auction.seats.length} 번째 자리
              </div>
            </div>
            <div style={{ background: "#faf5ff", borderRadius: "8px", padding: "1rem", marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.875rem", color: "var(--secondary)" }}>현재 최고 입찰가</div>
              <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#7c3aed" }}>{currentSeat.currentBid.toLocaleString()}P</div>
              {currentSeat.currentBidderName && (
                <div style={{ marginTop: "0.25rem", fontSize: "0.875rem", color: isMyBid ? "#7c3aed" : "var(--text)", fontWeight: isMyBid ? "bold" : "normal" }}>
                  최고 입찰자: {isMyBid ? "✅ 나" : currentSeat.currentBidderName}
                </div>
              )}
            </div>
            {!isTeacher && (
              <div>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <input type="number" value={bidAmount} onChange={(e) => setBidAmount(Number(e.target.value))}
                    min={currentSeat.currentBid + 100} step={100}
                    style={{ flex: 1, padding: "0.75rem", borderRadius: "8px", border: "2px solid #7c3aed", fontSize: "1.1rem", fontWeight: "bold" }} />
                  <span style={{ display: "flex", alignItems: "center", fontWeight: "bold", color: "#7c3aed" }}>P</span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                  {[100, 500, 1000, 2000].map(add => (
                    <button key={add} onClick={() => setBidAmount(prev => prev + add)}
                      style={{ flex: 1, padding: "0.4rem", background: "#f5f3ff", border: "1px solid #7c3aed", borderRadius: "6px", cursor: "pointer", fontSize: "0.75rem", color: "#7c3aed" }}>
                      +{add}
                    </button>
                  ))}
                </div>
                <button onClick={handleBid} disabled={bidding || isMyBid}
                  style={{ width: "100%", padding: "0.85rem", background: isMyBid ? "#94a3b8" : "#7c3aed", color: "white", border: "none", borderRadius: "8px", cursor: isMyBid ? "not-allowed" : "pointer", fontWeight: "bold", fontSize: "1rem" }}>
                  {bidding ? "입찰 중..." : isMyBid ? "✅ 현재 최고 입찰자" : "입찰하기"}
                </button>
              </div>
            )}
            {isTeacher && (
              <button onClick={handleNextSeat}
                style={{ width: "100%", padding: "0.85rem", background: "#7c3aed", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", fontSize: "1rem" }}>
                {currentSeat.currentBidderName ? currentSeat.currentBidderName + "님 낙찰 → 다음 자리" : "유찰 → 다음 자리"}
              </button>
            )}
          </div>
          <div className="card">
            <h3 style={{ marginBottom: "1rem" }}>전체 자리 목록</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {auction.seats.map((seat, idx) => (
                <div key={seat.seatId} style={{
                  padding: "0.75rem", borderRadius: "8px",
                  background: idx === auction.currentSeatIndex ? "#f5f3ff" : seat.status === "closed" ? "#f0fdf4" : "#f8fafc",
                  border: "1px solid " + (idx === auction.currentSeatIndex ? "#7c3aed" : seat.status === "closed" ? "#86efac" : "var(--border)"),
                  display: "flex", justifyContent: "space-between", alignItems: "center"
                }}>
                  <div>
                    <span style={{ fontWeight: "bold", color: idx === auction.currentSeatIndex ? "#7c3aed" : "inherit" }}>
                      {idx === auction.currentSeatIndex ? "🔥 " : ""}{seat.seatLabel}
                    </span>
                    {seat.winnerName && <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem", color: "#16a34a" }}>→ {seat.winnerName}</span>}
                  </div>
                  <div style={{ fontSize: "0.8rem" }}>
                    {seat.status === "closed" && seat.winningBid && <span style={{ color: "#16a34a", fontWeight: "bold" }}>{seat.winningBid.toLocaleString()}P</span>}
                    {seat.status === "active" && <span style={{ color: "#7c3aed", fontWeight: "bold" }}>{seat.currentBid.toLocaleString()}P</span>}
                    {seat.status === "waiting" && <span style={{ color: "var(--secondary)" }}>대기</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {auction.status === "closed" && (
        <div className="card">
          <h3 style={{ marginBottom: "1rem", color: "#16a34a" }}>🎉 경매 종료 - 낙찰 결과</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {auction.seats.map(seat => (
              <div key={seat.seatId} style={{
                padding: "0.75rem", borderRadius: "8px",
                background: seat.winnerId ? "#f0fdf4" : "#f8fafc",
                border: "1px solid " + (seat.winnerId ? "#86efac" : "var(--border)"),
                display: "flex", justifyContent: "space-between", alignItems: "center"
              }}>
                <div>
                  <span style={{ fontWeight: "bold" }}>{seat.seatLabel}</span>
                  {seat.winnerName && <span style={{ marginLeft: "0.75rem", color: "#16a34a" }}>→ {seat.winnerName}</span>}
                  {!seat.winnerId && <span style={{ marginLeft: "0.75rem", color: "var(--secondary)" }}>유찰</span>}
                </div>
                {seat.winningBid && <span style={{ fontWeight: "bold", color: "#16a34a" }}>{seat.winningBid.toLocaleString()}P</span>}
              </div>
            ))}
          </div>
          <button onClick={() => router.push("/")} style={{ marginTop: "1.5rem", background: "#7c3aed", color: "white", border: "none", padding: "0.75rem 1.5rem", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}>
            홈으로 돌아가기
          </button>
        </div>
      )}
    </div>
  );
}