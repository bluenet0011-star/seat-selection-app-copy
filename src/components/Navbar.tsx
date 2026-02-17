"use client";

import { useAuth } from "@/context/AuthContext";
import { auth, db } from "@/lib/firebase";
import { updatePassword } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function Navbar() {
    const { userData, user } = useAuth();
    const router = useRouter();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newPw, setNewPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [loading, setLoading] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    // 실시간 시계 타이머
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const handleLogout = async () => {
        try {
            await auth.signOut();
            router.push("/login");
        } catch (error) {
            console.error("로그아웃 오류:", error);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPw.length < 6) {
            alert("비밀번호는 6자리 이상이어야 합니다.");
            return;
        }
        if (newPw === "123456") {
            alert("보안을 위해 초기 비밀번호(123456)와 다른 비밀번호를 설정해주세요.");
            return;
        }
        if (newPw !== confirmPw) {
            alert("비밀번호가 일치하지 않습니다.");
            return;
        }

        setLoading(true);
        try {
            const currentUser = auth.currentUser;
            if (currentUser) {
                // 1. Auth 비밀번호 업데이트
                await updatePassword(currentUser, newPw);

                // 2. Firestore 정보 업데이트 (첫 로그인 여부 해제 및 수정일 기록)
                await updateDoc(doc(db, "users", currentUser.uid), {
                    isFirstLogin: false,
                    updatedAt: new Date().toISOString()
                });

                // 비밀번호 변경 후 로그아웃 처리 (보안상 권장)
                alert("비밀번호가 성공적으로 변경되었습니다. 다시 로그인해주세요.");
                await auth.signOut();
                router.push("/login");
            }
        } catch (error: any) {
            console.error("비밀번호 변경 오류:", error);
            if (error.code === 'auth/requires-recent-login') {
                alert("보안을 위해 다시 로그인한 후 비밀번호를 변경해주세요.");
            } else {
                alert("비밀번호 변경 중 오류가 발생했습니다: " + error.message);
            }
        } finally {
            setLoading(false);
            setIsModalOpen(false);
            setNewPw("");
            setConfirmPw("");
        }
    };

    if (!user) return null;

    return (
        <header style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem 0",
            borderBottom: "1px solid var(--border)",
            marginBottom: "2rem"
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Link href="/" style={{
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem"
                }}>
                    <span style={{ fontSize: "1.5rem" }}>🪑</span>
                    <span style={{
                        fontSize: "1.25rem",
                        fontWeight: "bold",
                        color: "var(--primary)"
                    }}>
                        좌석 신청
                    </span>
                </Link>
                <div style={{
                    fontSize: '0.9rem',
                    color: 'var(--secondary)',
                    padding: '4px 10px',
                    background: '#f1f5f9',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    fontWeight: '500',
                    fontFamily: 'monospace'
                }}>
                    현재 시간: {currentTime.toLocaleTimeString('ko-KR')}
                </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{
                        fontSize: "0.875rem",
                        background: userData?.role === "teacher" ? "var(--accent)" : "var(--primary)",
                        color: "white",
                        padding: "2px 8px",
                        borderRadius: "20px",
                        fontWeight: "500"
                    }}>
                        {userData?.role === "teacher" ? "교사" : "학생"}
                    </span>
                    <span style={{ fontWeight: "600", fontSize: "0.95rem" }}>
                        {userData?.name}님
                    </span>
                </div>

                <button
                    onClick={() => setIsModalOpen(true)}
                    style={{
                        background: "none",
                        border: "1px solid var(--border)",
                        color: "var(--secondary)",
                        padding: "0.4rem 0.8rem",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                        fontWeight: "500"
                    }}
                >
                    비밀번호 변경
                </button>

                <button
                    onClick={handleLogout}
                    style={{
                        background: "none",
                        border: "1px solid var(--error)",
                        color: "var(--error)",
                        padding: "0.4rem 1rem",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                        fontWeight: "bold",
                        transition: "all 0.2s"
                    }}
                    onMouseOver={(e) => {
                        e.currentTarget.style.background = "var(--error)";
                        e.currentTarget.style.color = "white";
                    }}
                    onMouseOut={(e) => {
                        e.currentTarget.style.background = "none";
                        e.currentTarget.style.color = "var(--error)";
                    }}
                >
                    로그아웃
                </button>
            </div>

            {/* 비밀번호 변경 모달 */}
            {isModalOpen && (
                <div style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    background: "rgba(0,0,0,0.5)",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    zIndex: 1000
                }}>
                    <div style={{
                        background: "white",
                        padding: "2rem",
                        borderRadius: "12px",
                        width: "100%",
                        maxWidth: "400px",
                        boxShadow: "0 10px 25px rgba(0,0,0,0.2)"
                    }}>
                        <h3 style={{ marginBottom: "1.5rem" }}>비밀번호 변경</h3>
                        <form onSubmit={handleChangePassword}>
                            <div style={{ marginBottom: "1rem" }}>
                                <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>새 비밀번호</label>
                                <input
                                    type="password"
                                    value={newPw}
                                    onChange={(e) => setNewPw(e.target.value)}
                                    placeholder="6자리 이상 입력"
                                    required
                                    style={{ width: "100%", boxSizing: "border-box" }}
                                />
                            </div>
                            <div style={{ marginBottom: "1.5rem" }}>
                                <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.875rem" }}>비밀번호 확인</label>
                                <input
                                    type="password"
                                    value={confirmPw}
                                    onChange={(e) => setConfirmPw(e.target.value)}
                                    placeholder="비밀번호 다시 입력"
                                    required
                                    style={{ width: "100%", boxSizing: "border-box" }}
                                />
                            </div>
                            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                                <button
                                    type="button"
                                    onClick={() => { setIsModalOpen(false); setNewPw(""); setConfirmPw(""); }}
                                    className="btn-outline"
                                    style={{ padding: "0.5rem 1rem" }}
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="btn-primary"
                                    style={{ padding: "0.5rem 1.5rem" }}
                                >
                                    {loading ? "변경 중..." : "변경하기"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </header>
    );
}
