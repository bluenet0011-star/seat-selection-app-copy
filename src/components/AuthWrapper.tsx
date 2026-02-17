"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
    const { user, userData, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (mounted && !loading) {
            if (!user && pathname !== "/login") {
                router.push("/login");
            } else if (user && userData?.isFirstLogin && pathname !== "/change-password") {
                router.push("/change-password");
            }
        }
    }, [user, userData, loading, pathname, router, mounted]);

    // 하이드레이션 오류 방지: 서버 렌더링 결과와 클라이언트 첫 렌더링 결과를 동일하게 유지
    if (!mounted || loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--secondary)' }}>
                데이터를 불러오는 중...
            </div>
        );
    }

    return <>{children}</>;
}
