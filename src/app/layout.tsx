import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import AuthWrapper from "@/components/AuthWrapper";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
    title: "교실 좌석 신청 시스템",
    description: "교사와 학생이 함께 사용하는 스마트한 좌석 예약 서비스",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ko" suppressHydrationWarning>
            <body suppressHydrationWarning>
                <AuthProvider>
                    <AuthWrapper>
                        <div className="container">
                            <Navbar />
                            <main>{children}</main>
                        </div>
                    </AuthWrapper>
                </AuthProvider>
            </body>
        </html>
    );
}
