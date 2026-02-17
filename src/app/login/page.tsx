"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const [id, setId] = useState("");
    const [pw, setPw] = useState("");
    const [error, setError] = useState("");
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        try {
            // 학번을 이메일 형식으로 변환 (Firebase Auth용)
            const email = `${id}@school.com`;
            const userCredential = await signInWithEmailAndPassword(auth, email, pw);
            const user = userCredential.user;

            // 로그인 성공 시 메인으로 이동 (첫 로그인 여부는 layout에서 체크 예정)
            router.push("/");
        } catch (err: any) {
            setError("로그인에 실패했습니다. 아이디 또는 비밀번호를 확인하세요.");
        }
    };

    return (
        <div className="card" style={{ maxWidth: '400px', margin: '2rem auto' }}>
            <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>로그인</h2>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem' }}>학번 또는 아이디</label>
                    <input
                        type="text"
                        value={id}
                        onChange={(e) => setId(e.target.value)}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}
                        placeholder="학번을 입력하세요 (예: 30201)"
                        required
                    />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem' }}>비밀번호</label>
                    <input
                        type="password"
                        value={pw}
                        onChange={(e) => setPw(e.target.value)}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}
                        placeholder="비밀번호를 입력하세요"
                        required
                    />
                </div>
                {error && <p style={{ color: 'var(--error)', fontSize: '0.875rem' }}>{error}</p>}
                <button
                    type="submit"
                    style={{
                        backgroundColor: 'var(--primary)',
                        color: 'white',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        border: 'none',
                        fontWeight: 'bold',
                        marginTop: '1rem',
                        cursor: 'pointer'
                    }}
                >
                    로그인
                </button>
            </form>
        </div>
    );
}
