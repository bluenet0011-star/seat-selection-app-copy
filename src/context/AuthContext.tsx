"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot, updateDoc, collection, query, where, getDocs } from "firebase/firestore";

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
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setUserData(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    let unsub: (() => void) | null = null;

    const initUserData = async () => {
      // 방법 1: UID가 doc ID인 경우 (teacher1 등)
      const uidDocRef = doc(db, "users", user.uid);
      const { getDoc } = await import("firebase/firestore");
      const uidSnap = await getDoc(uidDocRef);

      let docId: string;

      if (uidSnap.exists()) {
        // Firebase Auth UID = Firestore doc ID (교사 계정 등)
        docId = user.uid;
      } else {
        // 방법 2: 이메일에서 학번 추출 (30301@school.com → "30301")
        const emailPrefix = user.email?.replace("@school.com", "") || "";
        const q = query(
          collection(db, "users"),
          where("__name__", "==", emailPrefix)
        );
        // __name__ 쿼리 대신 직접 doc 조회
        const studentDocRef = doc(db, "users", emailPrefix);
        const studentSnap = await getDoc(studentDocRef);

        if (studentSnap.exists()) {
          docId = emailPrefix;
        } else {
          // 방법 3: email로 users 컬렉션 검색
          const emailQ = query(collection(db, "users"), where("email", "==", user.email));
          const emailSnap = await getDocs(emailQ);
          if (!emailSnap.empty) {
            docId = emailSnap.docs[0].id;
          } else {
            console.error("사용자 데이터를 찾을 수 없습니다:", user.uid, user.email);
            setLoading(false);
            return;
          }
        }
      }

      // 실시간 구독 시작
      const finalDocRef = doc(db, "users", docId);
      unsub = onSnapshot(finalDocRef, async (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const fullData = { id: snap.id, ...data };

          // 포인트 미설정 시 초기화 (10,000P)
          if (data.points === undefined || data.points === null) {
            await updateDoc(finalDocRef, { points: 10000 });
            setUserData({ ...fullData, points: 10000 });
          } else {
            setUserData(fullData);
          }
        } else {
          setUserData(null);
        }
        setLoading(false);
      }, (error) => {
        console.error("사용자 데이터 구독 오류:", error);
        setLoading(false);
      });
    };

    initUserData();

    return () => {
      if (unsub) unsub();
    };
  }, [user]);

  const refreshUserData = () => {};

  return (
    <AuthContext.Provider value={{ user, userData, loading, refreshUserData }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
