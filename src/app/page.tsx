"use client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

interface Session {
    id: string;
    title: string;
    status: "open" | "closed" | "scheduled" | "ready_to_select" | "selection";
    createdAt: string;
    scheduledOpenAt?: string;
}

export default function HomePage() {
    const { userData } = useAuth();
    const router = useRouter();
    const [openSessions, setOpenSessions] = useState<Session[]>([]);

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
        if (classesLoading) return;

                const sessionsQuery = query(
                        collection(db, "sessions"),
                        where("status", "in", ["open", "scheduled", "ready_to_select", "selection"])
                      );

                const unsubscribe = onSnapshot(sessionsQuery, (snapshot) => {
                        let sessions = snapshot.docs.map(doc => ({
                                  id: doc.id,
                                  ...doc.data()
                        } as Session));

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

  const loading = sessionsLoading;

  const getSessionStatusInfo = (session: Session) => {
        switch (session.status) {
          case "open":
                    return { label: "입장하기", bg: "var(--primary)", locked: false };
          case "scheduled": {
                    const isLocked = session.scheduledOpenAt && new Date(session.scheduledOpenAt) > now;
                    return { label: isLocked ? "대기 중" : "입장하기", bg: isLocked ? "#94a3b8" : "var(--primary)", locked: !!isLocked };
          }
          case "ready_to_select":
                    return { label: "순위 확인", bg: "#8b5cf6", locked: false };
          case "selection":
                    return { label: "자리 선택 중", bg: "#10b981", locked: false };
          default:
                    return { label: "입장하기", bg: "var(--primary)", locked: false };
        }
  };

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
                                            const statusInfo = getSessionStatusInfo(session);
                                            return (
                                                                  <button
                                                                                          key={session.id}
                                                                                          onClick={() => !statusInfo.locked && router.push(`/booking/${session.id}`)}
                                                                                          disabled={statusInfo.locked}
                                                                                          style={{
                                                                                                                    width: "100%", textAlign: "left", padding: "1rem", borderRadius: "8px",
                                                                                                                    border: statusInfo.locked ? "1px solid var(--border)" : `1px solid ${statusInfo.bg}`,
                                                                                                                    background: statusInfo.locked ? "#f8fafc" : "white",
                                                                                                                    cursor: statusInfo.locked ? "not-allowed" : "pointer",
                                                                                                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                                                                                                    opacity: statusInfo.locked ? 0.8 : 1
                                                                                            }}>
                                                                                        <div>
                                                                                                                <span style={{ fontWeight: "600", color: statusInfo.locked ? "var(--secondary)" : statusInfo.bg }}>{session.title}</span>
                                                                                          {statusInfo.locked && session.scheduledOpenAt && (
                                                                                                                      <span style={{ fontSize: "0.9rem", color: "var(--accent)", fontWeight: "bold", display: "block", marginTop: "0.25rem" }}>
                                                                                                                                                  ⏰ {new Date(session.scheduledOpenAt).toLocaleString()} 오픈 예정
                                                                                                                        </span>
                                                                                                                )}
                                                                                          {(session.status === "ready_to_select" || session.status === "selection") && (
                                                                                                                      <span style={{ fontSize: "0.8rem", color: session.status === "selection" ? "#10b981" : "#8b5cf6", display: "block", marginTop: "0.25rem" }}>
                                                                                                                        {session.status === "selection" ? "🎯 순위별 자리 선택이 진행 중입니다" : "🏆 순위가 발표되었습니다"}
                                                                                                                        </span>
                                                                                                                )}
                                                                                          </div>
                                                                                        <span style={{
                                                                                                                    fontSize: "0.75rem", color: "white",
                                                                                                                    background: statusInfo.bg,
                                                                                                                    padding: "2px 8px", borderRadius: "12px"
                                                                                            }}>
                                                                                          {statusInfo.label}
                                                                                          </span>
                                                                  </button>
                                                                );
                        })}
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
                                              <li><button onClick={() => router.push("/admin/users")} style={{ width: "100%", textAlign: "left", padding: "0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "none", cursor: "pointer", color: "var(--primary)", fontWeight: "bold" }}>💰 학생 실시간 포인트 현황/부여</button></li>
                                </ul>
                    </div>
                      )}
              </section>
        </div>
      );
}</div>
