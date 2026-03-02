"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, updateDoc, doc } from "firebase/firestore";
import { useRouter } from "next/navigation";

interface Auction {
  id: string; title: string; className: string;
  status: "waiting" | "active" | "closed";
  seats: any[]; createdAt: string;
}

export default function AuctionManagement() {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "auctions"), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Auction[];
      data.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setAuctions(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleChangeStatus = async (id: string, status: string) => {
    await updateDoc(doc(db, "auctions", id), { status });
  };

  if (loading) return <div className="card">불러오는 중...</div>;

  return (
    <div className="card">
      <h2>🏷️ 좌석 경매 관리</h2>
      <p style={{ color: "var(--secondary)", marginBottom: "1.5rem" }}>
        세션 생성 시 경매가 자동으로 생성됩니다. 경매방에 입장하여 낙찰 처리를 진행하세요.
      </p>
      {auctions.length === 0 ? (
        <p style={{ color: "var(--secondary)", textAlign: "center", padding: "2rem" }}>
          경매가 없습니다. 세션 관리에서 세션을 생성하면 경매가 자동으로 만들어집니다.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {auctions.map(auction => {
            const totalBids = (auction.seats || []).reduce((acc: number, s: any) => acc + Object.keys(s.bids || {}).length, 0);
            const settled = (auction.seats || []).filter((s: any) => s.winner).length;
            return (
              <div key={auction.id} style={{
                padding: "1rem 1.5rem", border: "1px solid var(--border)", borderRadius: "12px",
                background: auction.status === "active" ? "#faf5ff" : "white",
                borderLeft: `4px solid ${auction.status === "active" ? "#7c3aed" : auction.status === "closed" ? "#94a3b8" : "#f59e0b"}`
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <span style={{ fontSize: "0.75rem", background: "#e2e8f0", padding: "2px 8px", borderRadius: "4px", fontWeight: "bold" }}>
                        {auction.className}
                      </span>
                      <span style={{ fontWeight: "bold", fontSize: "1rem" }}>{auction.title}</span>
                      <span style={{
                        fontSize: "0.75rem", padding: "2px 10px", borderRadius: "12px", color: "white", fontWeight: "bold",
                        background: auction.status === "active" ? "#7c3aed" : auction.status === "closed" ? "#94a3b8" : "#f59e0b"
                      }}>
                        {auction.status === "active" ? "🔴 진행 중" : auction.status === "closed" ? "종료" : "대기 중"}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--secondary)", marginTop: "0.4rem" }}>
                      자리 수: {(auction.seats || []).length}개 · 총 입찰: {totalBids}건 · 낙찰: {settled}개
                      · 생성: {new Date(auction.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <button
                      onClick={() => router.push(`/auction/${auction.id}`)}
                      style={{ background: "#7c3aed", color: "white", border: "none", padding: "0.5rem 1.2rem", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}
                    >
                      경매방 입장
                    </button>
                    {auction.status === "waiting" && (
                      <button onClick={() => handleChangeStatus(auction.id, "active")}
                        style={{ background: "#22c55e", color: "white", border: "none", padding: "0.5rem 1rem", borderRadius: "8px", cursor: "pointer" }}>
                        시작
                      </button>
                    )}
                    {auction.status === "active" && (
                      <button onClick={() => handleChangeStatus(auction.id, "closed")}
                        style={{ background: "#ef4444", color: "white", border: "none", padding: "0.5rem 1rem", borderRadius: "8px", cursor: "pointer" }}>
                        종료
                      </button>
                    )}
                    {auction.status === "closed" && (
                      <button onClick={() => handleChangeStatus(auction.id, "active")}
                        style={{ background: "var(--primary)", color: "white", border: "none", padding: "0.5rem 1rem", borderRadius: "8px", cursor: "pointer" }}>
                        재개
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
