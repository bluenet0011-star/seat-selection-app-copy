"use client";
import { useState } from "react";
import { auth, db } from "@/lib/firebase";
import { updatePassword } from "firebase/auth";
import { doc, updateDoc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function ChangePasswordPage() {
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const { userData } = useAuth();

  const handleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (newPw.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    try {
      const user = auth.currentUser;
      if (user) {
        await updatePassword(user, newPw);

        // 신뢰성 있는 docId 추출
        let docId = userData?.id;

        if (!docId && user.email) {
          // 이메일에서 추출 시도 (예: 30301@school.com -> 30301)
          const extracted = user.email.replace("@school.com", "").trim();
          if (extracted) {
            docId = extracted;
          }
        }

        // 그래도 없으면 uid 풀백
        if (!docId) {
          docId = user.uid;
        }

        // updateDoc 대신 setDoc(merge: true)를 사용하여 문서 부재 시 오류 방지 처리
        await setDoc(doc(db, "users", docId), { isFirstLogin: false }, { merge: true });

        router.push("/");
      }
    } catch (err: any) {
      console.error("비밀번호 변경 오류:", err);
      // 🔥 Update to show actual error message for debugging
      setError("비밀번호 변경 중 오류가 발생했습니다: " + (err.message || err.toString()));
    }
  };

  return (
    <div className="card" style={{ maxWidth: '400px', margin: '2rem auto' }}>
      <h2 style={{ marginBottom: '1rem', textAlign: 'center' }}>비밀번호 변경</h2>
      <p style={{ marginBottom: '1.5rem', fontSize: '0.875rem', color: 'var(--secondary)', textAlign: 'center' }}>
        첫 로그인 시 반드시 비밀번호를 변경해야 합니다.
      </p>
      <form onSubmit={handleChange} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <input
          type="password"
          placeholder="새 비밀번호"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}
          required
        />
        <input
          type="password"
          placeholder="새 비밀번호 확인"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}
          required
        />
        {error && <p style={{ color: 'var(--error)', fontSize: '0.875rem' }}>{error}</p>}
        <button
          style={{ background: 'var(--primary)', color: 'white', padding: '0.75rem', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
        >
          변경하기
        </button>
      </form>
    </div>
  );
}
