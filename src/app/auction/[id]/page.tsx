"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, getDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";

interface Bid {
  amount: number;
  bidderName: string;
  bidderId: string;
  time: string;
}

interface Seat {
  id: string;
  label: string;
  row: number;
  col: number;
  bids: { [userId: string]: Bid };
  topBid: number;
  topBidder: string | null;
  topBidderName: string | null;
  winner: string | null;
  winnerName: string | null;
}

interface Auction {
  id: string;
  title: string;
  sessionId: string;
  classId: string;
  className: string;
  status: "waiting" | "active" | "closed";
  seats: Seat[];
  createdAt: string;
}

interface Notification {
  id: number;
  msg: string;
  color: string;
}

function getSeatColor(topBid: number, winner: string | null) {
  if (winner) return { bg: "#ffd700", border: "#f59e0b", glow: "0 0 16px #fbbf24" };
  if (topBid === 0) return { bg: "#f8fafc", border: "#e2e8f0", glow: "none" };
  if (topBid < 500) return { bg: "#dbeafe", border: "#3b82f6", glow: "none" };
  if (topBid < 1000) return { bg: "#bbf7d0", border: "#22c55e", glow: "0 0 8px #4ade80" };
  if (topBid < 2000) return { bg: "#fef3c7", border: "#f59e0b", glow: "0 0 10px #fbbf24" };
  if (topBid < 3000) return { bg: "#fed7aa", border: "#f97316", glow: "0 0 12px #fb923c" };
  return { bg: "#fecaca", border: "#ef4444", glow: "0 0 16px #f87171" };
}

export default function AuctionPage() {
  const params = useParams();
  const auctionId = params.id as string;
  const { userData } = useAuth();
  const router = useRouter();
  const isTeacher = userData?.role === "teacher";

  const [auction, setAuction] = useState<Auction | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidAmounts, setBidAmounts] = useState<{ [seatId: string]: number }>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notifIdRef = useRef(0);
  const prevSeatsRef = useRef<{ [seatId: string]: number }>({});
  const audioCtxRef = useRef<AudioContext | null>(null);

  const addNotif = useCallback((msg: string, color = "#7c3aed") => {
    const id = ++notifIdRef.current;
    setNotifications(prev => [...prev.slice(-4), { id, msg, color }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  }, []);

  const playBidSound = useCallback((freq = 880) => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  }, []);

  const playWinSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioCtxRef.current;
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
        gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.12 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.35);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.35);
      });
    } catch (e) {}
  }, []);

  useEffect(() => {
    const ref = doc(db, "auctions", auctionId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) { setLoading(false); return; }
      const data = { id: snap.id, ...snap.data() } as Auction;
      if (data.seats && prevSeatsRef.current) {
        data.seats.forEach(seat => {
          const prevTop = prevSeatsRef.current[seat.id] ?? 0;
          if (seat.topBid > prevTop) {
            playBidSound(660 + seat.topBid / 10);
            addNotif(
              `🔥 ${seat.label}번 자리 — ${seat.topBidderName || "누군가"}님이 ${seat.topBid.toLocaleString()}P 입찰!`,
              seat.topBid >= 2000 ? "#ef4444" : seat.topBid >= 1000 ? "#f97316" : "#7c3aed"
            );
          }
          if (seat.winner && !(prevSeatsRef.current as any)[`w_${seat.id}`]) {
            playWinSound();
            addNotif(`🏆 ${seat.label}번 자리 낙찰! → ${seat.winnerName}님`, "#f59e0b");
            (prevSeatsRef.current as any)[`w_${seat.id}`] = 1;
          }
          prevSeatsRef.current[seat.id] = seat.topBid;
        });
      }
      setAuction(data);
      setLoading(false);
    });
    return () => unsub();
  }, [auctionId, addNotif, playBidSound, playWinSound]);

  const handleBid = async (seat: Seat) => {
    if (!userData) return;
    const amount = bidAmounts[seat.id] || 0;
    if (amount <= 0) { addNotif("입찰 금액을 입력하세요.", "#ef4444"); return; }
    if (amount > (userData.points ?? 0)) { addNotif("포인트가 부족합니다!", "#ef4444"); return; }
    if (amount <= seat.topBid) { addNotif(`현재 최고가(${seat.topBid.toLocaleString()}P)보다 높게 입찰해야 합니다.`, "#ef4444"); return; }
    if (seat.winner) { addNotif("이미 낙찰된 자리입니다.", "#ef4444"); return; }
    setSubmitting(seat.id);
    try {
      const aRef = doc(db, "auctions", auctionId);
      const snap = await getDoc(aRef);
      if (!snap.exists()) return;
      const cur = snap.data() as Auction;
      const updatedSeats = cur.seats.map(s => {
        if (s.id !== seat.id) return s;
        const newBids: { [userId: string]: Bid } = {
          ...s.bids,
          [userData.id]: { amount, bidderName: userData.name, bidderId: userData.id, time: new Date().toISOString() }
        };
        const bidValues = Object.values(newBids) as Bid[];
        const topEntry = bidValues.reduce((a: Bid, b: Bid) => a.amount >= b.amount ? a : b);
        return { ...s, bids: newBids, topBid: topEntry.amount, topBidder: topEntry.bidderId, topBidderName: topEntry.bidderName };
      });
      await updateDoc(aRef, { seats: updatedSeats });
      setBidAmounts(prev => ({ ...prev, [seat.id]: 0 }));
      addNotif(`✅ ${seat.label}번 자리에 ${amount.toLocaleString()}P 입찰 완료!`, "#22c55e");
    } catch (e) {
      addNotif("입찰 중 오류가 발생했습니다.", "#ef4444");
    } finally {
      setSubmitting(null);
    }
  };

  const handleSettle = async (seat: Seat) => {
    if (!seat.topBidder) { alert("입찰자가 없습니다."); return; }
    if (!confirm(`${seat.label}번 자리를 ${seat.topBidderName}님(${seat.topBid.toLocaleString()}P)께 낙찰하시겠습니까?`)) return;
    try {
      const aRef = doc(db, "auctions", auctionId);
      const snap = await getDoc(aRef);
      if (!snap.exists()) return;
      const cur = snap.data() as Auction;
      const updatedSeats = cur.seats.map(s => s.id !== seat.id ? s : { ...s, winner: s.topBidder, winnerName: s.topBidderName });
      await updateDoc(aRef, { seats: updatedSeats });
      const userRef = doc(db, "users", seat.topBidder!);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const pts = userSnap.data().points ?? 0;
        await updateDoc(userRef, { points: Math.max(0, pts - seat.topBid) });
      }
      addNotif(`🏆 ${seat.label}번 낙찰! ${seat.topBidderName}님 -${seat.topBid.toLocaleString()}P`, "#f59e0b");
    } catch (e) { alert("오류가 발생했습니다."); }
  };

  if (loading) return <div className="card" style={{ textAlign: "center", padding: "3rem" }}>경매 정보를 불러오는 중...</div>;
  if (!auction) return <div className="card">경매를 찾을 수 없습니다.</div>;

  const maxRow = Math.max(...auction.seats.map(s => s.row), 0) + 1;
  const maxCol = Math.max(...auction.seats.map(s => s.col), 0) + 1;
  const seatMap: { [key: string]: Seat } = {};
  auction.seats.forEach(s => { seatMap[`${s.row}-${s.col}`] = s; });
  const myBid = (seat: Seat) => seat.bids?.[userData?.id ?? ""]?.amount ?? 0;
  const isTopBidder = (seat: Seat) => seat.topBidder === userData?.id;

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", color: "white", padding: "1.5rem", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 9999, display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "360px" }}>
        {notifications.map(n => (
          <div key={n.id} style={{ background: n.color, color: "white", padding: "0.75rem 1rem", borderRadius: "12px", fontWeight: "bold", fontSize: "0.9rem", boxShadow: "0 4px 20px rgba(0,0,0,0.4)", animation: "slideIn 0.3s ease" }}>{n.msg}</div>
        ))}
      </div>
      <style>{`
        @keyframes slideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
        .seat-btn { transition: all 0.25s ease; }
        .seat-btn:hover { transform: scale(1.05); }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <button onClick={() => router.back()} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "white", padding: "0.4rem 0.8rem", borderRadius: "8px", cursor: "pointer", marginRight: "1rem" }}>← 뒤로</button>
          <span style={{ fontSize: "1.4rem", fontWeight: "bold" }}>🏷️ {auction.title}</span>
          <span style={{ marginLeft: "1rem", fontSize: "0.8rem", background: auction.status === "active" ? "#22c55e" : "#94a3b8", padding: "2px 10px", borderRadius: "12px", color: "white" }}>
            {auction.status === "active" ? "🔴 LIVE" : "대기 중"}
          </span>
        </div>
        {!isTeacher && (
          <div style={{ background: "rgba(255,255,255,0.1)", padding: "0.5rem 1.2rem", borderRadius: "12px", textAlign: "right" }}>
            <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>내 포인트</div>
            <div style={{ fontSize: "1.3rem", fontWeight: "bold", color: "#fbbf24" }}>💰 {(userData?.points ?? 0).toLocaleString()}P</div>
          </div>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "inline-grid", gridTemplateColumns: `repeat(${maxCol}, minmax(110px, 1fr))`, gap: "0.75rem", minWidth: "min-content" }}>
          {Array.from({ length: maxRow }, (_, row) =>
            Array.from({ length: maxCol }, (_, col) => {
              const seat = seatMap[`${row}-${col}`];
              if (!seat) return <div key={`${row}-${col}`} style={{ width: 110, height: 150 }} />;
              const color = getSeatColor(seat.topBid, seat.winner);
              const mine = isTopBidder(seat);
              const settled = !!seat.winner;
              return (
                <div key={seat.id} className="seat-btn" style={{ background: color.bg, border: `2px solid ${color.border}`, borderRadius: "12px", padding: "0.7rem 0.5rem", boxShadow: color.glow !== "none" ? color.glow : mine ? "0 0 0 3px #22c55e" : "none", animation: mine && !settled ? "pulse 1.5s infinite" : "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem", minHeight: 150, position: "relative" }}>
                  {settled && <div style={{ position: "absolute", top: 4, right: 6, fontSize: "0.7rem", background: "#ffd700", color: "#92400e", borderRadius: "6px", padding: "1px 6px", fontWeight: "bold" }}>낙찰</div>}
                  <div style={{ fontWeight: "bold", fontSize: "1rem", color: "#1e293b" }}>{seat.label}번</div>
                  <div style={{ fontSize: "0.95rem", fontWeight: "bold", color: seat.topBid > 0 ? "#7c3aed" : "#94a3b8" }}>
                    {seat.topBid > 0 ? `${seat.topBid.toLocaleString()}P` : "시작가 0P"}
                  </div>
                  {seat.winner ? (
                    <div style={{ fontSize: "0.8rem", color: "#92400e", fontWeight: "bold", textAlign: "center" }}>🏆 {seat.winnerName}</div>
                  ) : seat.topBidderName ? (
                    <div style={{ fontSize: "0.75rem", color: "#64748b", textAlign: "center" }}>{mine ? "🟢 내가 최고" : `최고: ${seat.topBidderName}`}</div>
                  ) : null}
                  {myBid(seat) > 0 && !seat.winner && <div style={{ fontSize: "0.7rem", color: "#64748b" }}>내 입찰: {myBid(seat).toLocaleString()}P</div>}
                  {!isTeacher && !settled && auction.status === "active" && (
                    <div style={{ display: "flex", gap: "2px", width: "100%", marginTop: "0.3rem" }}>
                      <input type="number" min={seat.topBid + 1} value={bidAmounts[seat.id] || ""} onChange={(e) => setBidAmounts(prev => ({ ...prev, [seat.id]: parseInt(e.target.value) || 0 }))} placeholder={(seat.topBid + 100).toString()} style={{ flex: 1, padding: "3px 4px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.75rem", width: 0 }} onClick={(e) => e.stopPropagation()} />
                      <button onClick={() => handleBid(seat)} disabled={submitting === seat.id} style={{ background: "#7c3aed", color: "white", border: "none", padding: "3px 7px", borderRadius: "6px", cursor: "pointer", fontSize: "0.75rem", fontWeight: "bold", opacity: submitting === seat.id ? 0.6 : 1 }}>
                        {submitting === seat.id ? "..." : "입찰"}
                      </button>
                    </div>
                  )}
                  {isTeacher && !settled && seat.topBidder && (
                    <button onClick={() => handleSettle(seat)} style={{ marginTop: "0.3rem", background: "#f59e0b", color: "white", border: "none", padding: "4px 10px", borderRadius: "8px", cursor: "pointer", fontSize: "0.8rem", fontWeight: "bold", width: "100%" }}>
                      🔨 낙찰
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
      {isTeacher && (
        <div style={{ marginTop: "2rem", background: "rgba(255,255,255,0.05)", borderRadius: "12px", padding: "1.5rem" }}>
          <h3 style={{ marginBottom: "1rem" }}>📊 입찰 현황</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  <th style={{ padding: "0.5rem", textAlign: "left" }}>자리</th>
                  <th style={{ padding: "0.5rem", textAlign: "right" }}>최고 입찰가</th>
                  <th style={{ padding: "0.5rem", textAlign: "left" }}>최고 입찰자</th>
                  <th style={{ padding: "0.5rem", textAlign: "center" }}>입찰 수</th>
                  <th style={{ padding: "0.5rem", textAlign: "center" }}>상태</th>
                </tr>
              </thead>
              <tbody>
                {[...auction.seats].sort((a, b) => b.topBid - a.topBid).map(seat => (
                  <tr key={seat.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "0.5rem", fontWeight: "bold" }}>{seat.label}번</td>
                    <td style={{ padding: "0.5rem", textAlign: "right", color: seat.topBid > 0 ? "#fbbf24" : "#64748b" }}>{seat.topBid > 0 ? `${seat.topBid.toLocaleString()}P` : "-"}</td>
                    <td style={{ padding: "0.5rem", color: "#94a3b8" }}>{seat.topBidderName || "-"}</td>
                    <td style={{ padding: "0.5rem", textAlign: "center" }}>{Object.keys(seat.bids || {}).length}</td>
                    <td style={{ padding: "0.5rem", textAlign: "center" }}>
                      {seat.winner ? <span style={{ color: "#fbbf24", fontWeight: "bold" }}>🏆 낙찰</span> : seat.topBidder ? <span style={{ color: "#22c55e" }}>입찰 중</span> : <span style={{ color: "#64748b" }}>-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
