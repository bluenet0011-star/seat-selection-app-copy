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

interface AuctionItem {
  id: string;
  title: string;
  className: string;
  status: "waiting" | "active" | "closed";
  createdAt: string;
  seats: any[];
}

export default function HomePage() {
  const { userData } = useAuth();
  const router = useRouter();
  const [openSessions, setOpenSessions] = useState<Session[]>([]);
  const [openAuctions, setOpenAuctions] = useState<AuctionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [classesLoading, setClassesLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => { setNow(new Date()); }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [myClassIds, setMyClassIds] = useState<string[]>([]);

  // 학생 수업 목록 로드
  useEffect(() => {
    if (!userData) return;
    if (userData.role !== "student") {
      // 교사는 classId 필터 불필요
      setClassesLoading(false);
      return;
    }
    if (!userData.id) {
      setClassesLoading(false);
      return;
    }

    const q = query(collection(db, "classes"), where("studentIds", "array-contains", userData.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMyClassIds(snapshot.docs.map(doc => doc.id));
      setClassesLoading(false);
    }, (error) => {
      console.error("수업 로드 오류:", error);
      setClassesLoading(false);
    });
    return () => unsubscribe();
  }, [userData]);

  // 세션 로드 - 클래스 로딩 완료 후 실행
  useEffect(() => {
    if (!userData) return;
    if (classesLoading) return; // 클래스 목록 로드 대기

    const sessionsQuery = query(
      collection(db, "sessions"),
      where("status", "in", ["open", "scheduled"])
    );

    const unsubscribe = onSnapshot(sessionsQuery, (snapshot) => {
      let sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Session));

      // 학생은 자신의 수업에 연결된 세션만 표시
      if (userData.role === "student") {
        sessions = sessions.filter(s => myClassIds.includes((s as any).classId));
      }

      sessions.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setOpenSessions(sessions);
      setSessionsLoading(false);
    }, (error) => {
      console.error("세션 로드 오류:", error);
      setSessionsLoading(false);
    });

    return () => unsubscribe();
  }, [userData, myClassIds, classesLoading]);

  // 경매 로드 - 클래스 로딩 완료 후 실행
  useEffect(() => {
    if (!userData) return;
    if (classesLoading) return;

    const auctionsQuery = query(
      collection(db, "auctions"),
      where("status", "in", ["waiting", "active"])
    );

    const unsubscribe = onSnapshot(auctionsQuery, (snapshot) => {
      let auctions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuctionItem));

      if (userData.role === "student") {
        auctions = auctions.filter(a => myClassIds.includes((a as any).classId));
      }

      auctions.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setOpenAuctions(auctions);
    }, (error) => {
      console.error("경매 로드 오류:", error);
    });

    return () => unsubscribe();
  }, [userData, myClassIds, classesLoading]);

  const loading = sessionsLoading;

  return (
    <div>
      <div className="card" style={{ marginBottom: "2rem", background: "linear-gradient(135deg, var(--primary), #60a5fa)", color: "white" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>반갑습니다, {userData?.name}님!</h1>
        <p>오늘의 좌석 신청 현황을 확인하거나 새로운 예약을 진행하세요.</p>
        {userData?.role === "student" && (
          <div style={{ marginTop: "0.75rem", background: "rgba(255,255,255,0.2)", borderRadius: "8px", padding: "0.5rem 1rem", display: "inline-block" }}>
            💰 내 포인트: <strong>{(userData?.points ?? 0).toLocaleString()}P</strong>
          </div>
        )}
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem" }}>
        <div className="card" style={{ borderTop: "4px solid var(--primary)" }}>
          <h3>현재 진행 중인 세션</h3>
          <p style={{ color: "var(--secondary)", fontSize: "0.875rem", marginTop: "0.5rem" }}>지금 참여하여 좌석을 신청할 수 있는 세션들입니다.</p>
          <div style={{ marginTop: "1.5rem" }}>
            {loading ? (
              <p style={{ textAlign: "center", color: "var(--secondary)" }}>로딩 중...</p>
            ) : openSessions.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--secondary)", padding: "1rem" }}>현재 진행 중인 좌석 신청 세션이 없습니다.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {openSessions.map(session => {
                  const isScheduled = session.status === "scheduled";
                  const isLocked = isScheduled && session.scheduledOpenAt && new Date(session.scheduledOpenAt) > now;
                  return (
                    <button key={session.id}
                      onClick={() => !isLocked && router.push(`/booking/${session.id}`)}
                      disabled={!!isLocked}
                      style={{ width: "100%", textAlign: "left", padding: "1rem", borderRadius: "8px", border: isLocked ? "1px solid var(--border)" : "1px solid var(--primary)", background: isLocked ? "#f8fafc" : "white", cursor: isLocked ? "not-allowed" : "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: isLocked ? 0.8 : 1 }}>
                      <div>
                        <span style={{ fontWeight: "600", color: isLocked ? "var(--secondary)" : "var(--primary)" }}>{session.title}</span>
                        {isLocked && session.scheduledOpenAt && (
                          <span style={{ fontSize: "0.9rem", color: "var(--accent)", fontWeight: "bold", display: "block", marginTop: "0.25rem" }}>
                            ⏰ {new Date(session.scheduledOpenAt).toLocaleString()} 오픈 예정
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "white", background: isLocked ? "#94a3b8" : "var(--primary)", padding: "2px 8px", borderRadius: "12px" }}>
                        {isLocked ? "대기 중" : "입장하기"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ borderTop: "4px solid #7c3aed" }}>
          <h3>🏷️ 진행 중인 경매</h3>
          <p style={{ color: "var(--secondary)", fontSize: "0.875rem", marginTop: "0.5rem" }}>포인트로 입찰하여 원하는 자리를 낙찰받으세요.</p>
          <div style={{ marginTop: "1.5rem" }}>
            {openAuctions.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--secondary)", padding: "1rem" }}>진행 중인 경매가 없습니다.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {openAuctions.map(auction => (
                  <button key={auction.id}
                    onClick={() => router.push(`/auction/${auction.id}`)}
                    style={{ width: "100%", textAlign: "left", padding: "1rem", borderRadius: "8px", border: "1px solid #7c3aed", background: "white", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: "600", color: "#7c3aed" }}>{auction.title}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--secondary)", marginTop: "0.25rem" }}>{auction.className} · {auction.seats?.length ?? 0}개 자리</div>
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "white", background: auction.status === "active" ? "#7c3aed" : "var(--accent)", padding: "2px 8px", borderRadius: "12px" }}>
                      {auction.status === "active" ? "입찰 중" : "대기 중"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {userData?.role === "teacher" && (
          <div className="card" style={{ borderTop: "4px solid var(--accent)" }}>
            <h3>관리자 빠른 메뉴</h3>
            <ul style={{ listStyle: "none", marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <li><button onClick={() => router.push("/admin/students")} style={{ width: "100%", textAlign: "left", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "none", cursor: "pointer" }}>📂 학생 계정(DB) 관리</button></li>
              <li><button onClick={() => router.push("/admin/classes")} style={{ width: "100%", textAlign: "left", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "none", cursor: "pointer" }}>🏫 수업(학급) 설정 및 학생 배정</button></li>
              <li><button onClick={() => router.push("/admin/layout-editor")} style={{ width: "100%", textAlign: "left", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "none", cursor: "pointer" }}>📐 좌석 배치도 설정</button></li>
              <li><button onClick={() => router.push("/admin/sessions")} style={{ width: "100%", textAlign: "left", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "none", cursor: "pointer" }}>⏰ 예약 세션 관리</button></li>
              <li><button onClick={() => router.push("/admin/auctions")} style={{ width: "100%", textAlign: "left", padding: "0.5rem", borderRadius: "4px", border: "1px solid #7c3aed", background: "#faf5ff", cursor: "pointer", color: "#7c3aed", fontWeight: "bold" }}>🏷️ 좌석 경매 관리</button></li>
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
