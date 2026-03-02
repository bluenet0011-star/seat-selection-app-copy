"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";

interface AuthContextType {
  user: User | null;
  userData: any | null;
  loading: boolean;
  refreshUserData: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  refreshUserData: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setUserData(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 실시간 사용자 데이터 구독 (포인트 등 실시간 반영)
  useEffect(() => {
    if (!user) {
      setUserData(null);
      setLoading(false);
      return;
    }

    const docRef = doc(db, "users", user.uid);
    const unsubUser = onSnapshot(docRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        // id 필드 포함 (Firestore doc id를 userData.id로 사용)
        const fullData = { id: snap.id, ...data };

        // 포인트가 없는 경우 초기화 (10,000P)
        if (data.points === undefined || data.points === null) {
          await updateDoc(docRef, { points: 10000 });
          setUserData({ ...fullData, points: 10000 });
        } else {
          setUserData(fullData);
        }
      } else {
        setUserData(null);
      }
      setLoading(false);
    }, (error) => {
      console.error("사용자 데이터 로드 오류:", error);
      setLoading(false);
    });

    return () => unsubUser();
  }, [user]);

  const refreshUserData = () => {};

  return (
    <AuthContext.Provider value={{ user, userData, loading, refreshUserData }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
