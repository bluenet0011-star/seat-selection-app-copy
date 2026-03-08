"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

export default function PartnerManagementPage() {
    const { userData, loading: authLoading } = useAuth();
    const router = useRouter();

    const [partnerships, setPartnerships] = useState<Array<{ id: string, student1: string, student1Name: string, student2: string, student2Name: string }>>([]);
    const [students, setStudents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [formS1, setFormS1] = useState('');
    const [formS2, setFormS2] = useState('');

    useEffect(() => {
        if (!authLoading && userData?.role !== 'teacher') {
            router.push('/');
        }
    }, [userData, authLoading, router]);

    useEffect(() => {
        const fetchData = async () => {
            if (userData?.role !== 'teacher') return;
            try {
                // Fetch all students to map IDs to Names, or allow select dropdowns
                const getStudentsInfo = async () => {
                    // Since there is no onSnapshot for students directly available here in admin without fetching,
                    // we can either fetch from users collection or require admin to just type the IDs.
                    const response = await fetch('/api/admin/list-users');
                    if (response.ok) {
                        const data = await response.json();
                        const studentUsers = data.users.filter((u: any) => u.role === 'student');
                        // sort by id
                        studentUsers.sort((a: any, b: any) => a.id.localeCompare(b.id));
                        setStudents(studentUsers);
                    }
                };

                await getStudentsInfo();

                // Fetch existing partnerships
                const settingsRef = doc(db, "settings", "partner_history");
                const snap = await getDoc(settingsRef);

                if (snap.exists()) {
                    const data = snap.data();
                    const list = data.pairs || [];
                    setPartnerships(list);
                } else {
                    // Initialize empty doc
                    await setDoc(settingsRef, { pairs: [] });
                }
            } catch (err) {
                console.error("Failed to load partner settings:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [userData]);

    const handleAddPartner = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formS1 || !formS2) return alert("두 명의 학생을 모두 선택하세요.");
        if (formS1 === formS2) return alert("동일한 학생을 선택할 수 없습니다.");

        const s1Info = students.find(s => s.id === formS1);
        const s2Info = students.find(s => s.id === formS2);

        if (!s1Info || !s2Info) return alert("학생 정보를 찾을 수 없습니다.");

        // Check if pair already exists
        const exists = partnerships.some(p =>
            (p.student1 === formS1 && p.student2 === formS2) ||
            (p.student1 === formS2 && p.student2 === formS1)
        );

        if (exists) return alert("이미 등록된 짝꿍 조합입니다.");

        const newPair = {
            id: Date.now().toString(),
            student1: formS1,
            student1Name: s1Info.name,
            student2: formS2,
            student2Name: s2Info.name
        };

        const newList = [...partnerships, newPair];

        try {
            await updateDoc(doc(db, "settings", "partner_history"), { pairs: newList });
            setPartnerships(newList);
            setFormS1('');
            setFormS2('');
            alert("짝꿍 제한 필터가 추가되었습니다.");
        } catch (err) {
            console.error("추가 실패:", err);
            alert("추가 중 오류가 발생했습니다.");
        }
    };

    const handleDeletePair = async (id: string) => {
        if (!confirm("이 짝꿍 제한을 삭제하시겠습니까?")) return;

        const newList = partnerships.filter(p => p.id !== id);
        try {
            await updateDoc(doc(db, "settings", "partner_history"), { pairs: newList });
            setPartnerships(newList);
        } catch (err) {
            console.error("삭제 실패:", err);
            alert("삭제 중 오류가 발생했습니다.");
        }
    };

    if (authLoading || loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>데이터를 불러오는 중...</div>;

    return (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>과거 짝꿍 제한 관리</h1>
                <Link href="/admin/students">
                    <button className="btn-secondary" style={{ padding: '0.5rem 1rem' }}>학생 명단으로 돌아가기</button>
                </Link>
            </div>

            <div className="card" style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--primary)' }}>제한할 짝꿍 추가</h2>
                <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem', color: 'var(--secondary)' }}>
                    다시 짝으로 앉지 못하게 할 (경매에서 서로의 양 옆에 입찰할 수 없게 할) 두 명의 학생을 선택하세요.
                </p>

                <form onSubmit={handleAddPartner} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px' }}>
                        <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>학생 1</label>
                        <select
                            value={formS1}
                            onChange={(e) => setFormS1(e.target.value)}
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                        >
                            <option value="">학생 선택</option>
                            {students.map(s => (
                                <option key={s.id} value={s.id}>{s.id} {s.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#94a3b8', paddingBottom: '0.5rem' }}>+</div>

                    <div style={{ flex: '1 1 200px' }}>
                        <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>학생 2</label>
                        <select
                            value={formS2}
                            onChange={(e) => setFormS2(e.target.value)}
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                        >
                            <option value="">학생 선택</option>
                            {students.map(s => (
                                <option key={s.id} value={s.id}>{s.id} {s.name}</option>
                            ))}
                        </select>
                    </div>

                    <button type="submit" className="btn-primary" style={{ padding: '0.75rem 1.5rem', whiteSpace: 'nowrap' }}>
                        조합 추가
                    </button>
                </form>
            </div>

            <div className="card">
                <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--primary)' }}>등록된 짝꿍 제한 목록 ({partnerships.length}쌍)</h2>

                {partnerships.length === 0 ? (
                    <p style={{ textAlign: 'center', padding: '2rem', color: '#64748b', background: '#f8fafc', borderRadius: '8px' }}>
                        등록된 짝꿍 제한 데이터가 없습니다.
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {partnerships.map(pair => (
                            <div key={pair.id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'white'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ background: '#f1f5f9', padding: '0.5rem 1rem', borderRadius: '4px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>{pair.student1}</div>
                                        <div style={{ fontWeight: 'bold' }}>{pair.student1Name}</div>
                                    </div>
                                    <span style={{ color: '#94a3b8', fontSize: '1.2rem' }}>↔</span>
                                    <div style={{ background: '#f1f5f9', padding: '0.5rem 1rem', borderRadius: '4px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>{pair.student2}</div>
                                        <div style={{ fontWeight: 'bold' }}>{pair.student2Name}</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDeletePair(pair.id)}
                                    style={{ background: '#fee2e2', color: '#ef4444', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                                >
                                    삭제
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

