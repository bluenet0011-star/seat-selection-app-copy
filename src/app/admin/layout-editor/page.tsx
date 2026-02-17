"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, getDocs, collection, updateDoc } from "firebase/firestore";

export default function SeatLayoutEditor() {
    const [classes, setClasses] = useState<any[]>([]);
    const [selectedClassId, setSelectedClassId] = useState("");
    const [rows, setRows] = useState(5);
    const [cols, setCols] = useState(6);
    const [layout, setLayout] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [columnGaps, setColumnGaps] = useState<number[]>([]);
    const [successMessage, setSuccessMessage] = useState("");
    const [isResizing, setIsResizing] = useState<number | null>(null);

    // 수업 목록 불러오기
    useEffect(() => {
        const fetchClasses = async () => {
            const snap = await getDocs(collection(db, "classes"));
            setClasses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        };
        fetchClasses();
    }, []);

    // 선택된 수업의 레이아웃 불러오기
    useEffect(() => {
        if (!selectedClassId) {
            setLayout([]);
            setColumnGaps([]);
            return;
        }

        const fetchLayout = async () => {
            setLoading(true);
            try {
                const docRef = doc(db, "classes", selectedClassId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const classLayout = data.layout || [];
                    setLayout(classLayout);

                    if (classLayout.length > 0) {
                        const maxR = Math.max(...classLayout.map((s: any) => s.r));
                        const maxC = Math.max(...classLayout.map((s: any) => s.c));
                        const currentCols = maxC + 1;
                        setRows(maxR + 1);
                        setCols(currentCols);

                        // 간격 정보가 있으면 불러오고, 없으면 기본값(12px)으로 초기화
                        if (data.columnGaps && data.columnGaps.length === currentCols - 1) {
                            setColumnGaps(data.columnGaps);
                        } else {
                            setColumnGaps(Array(currentCols - 1).fill(12));
                        }
                    } else {
                        setRows(5);
                        setCols(6);
                        setColumnGaps(Array(5).fill(12));
                    }
                }
            } catch (error) {
                console.error("레이아웃 불러오기 오류:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchLayout();
    }, [selectedClassId]);

    const generateGrid = () => {
        const newLayout = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                newLayout.push({ id: `${r}-${c}`, r, c, active: true });
            }
        }
        setLayout(newLayout);
        setColumnGaps(Array(cols - 1).fill(12));
    };

    const handleSaveLayout = async () => {
        if (!selectedClassId) {
            alert("먼저 수업을 선택해주세요.");
            return;
        }
        if (layout.length === 0) {
            alert("먼저 그리드를 생성해주세요.");
            return;
        }
        setSaving(true);
        setSuccessMessage("");
        try {
            await updateDoc(doc(db, "classes", selectedClassId), {
                layout,
                columnGaps,
                updatedAt: new Date().toISOString()
            });
            setSuccessMessage("레이아웃이 성공적으로 저장되었습니다!");
            setTimeout(() => setSuccessMessage(""), 3000);
        } catch (error) {
            console.error("레이아웃 저장 오류:", error);
            alert("저장 중 오류가 발생했습니다.");
        } finally {
            setSaving(false);
        }
    };

    // 간격 조절 드래그 핸들러
    const onMouseDownResize = (index: number) => {
        setIsResizing(index);
    };

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (isResizing !== null) {
                const deltaX = e.movementX;
                setColumnGaps(prev => {
                    const next = [...prev];
                    next[isResizing] = Math.max(0, next[isResizing] + deltaX);
                    return next;
                });
            }
        };

        const onMouseUp = () => {
            setIsResizing(null);
        };

        if (isResizing !== null) {
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [isResizing]);

    if (loading) return <div className="card">데이터를 불러오는 중...</div>;

    return (
        <div className="card" style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <h2 style={{ marginBottom: '1rem' }}>수업별 좌석 배치 설정</h2>
            <p style={{ color: 'var(--secondary)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                편집할 수업을 선택하고, 행/열을 입력하여 그리드를 생성하세요.
            </p>

            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1rem',
                alignItems: 'flex-end',
                background: '#f8fafc',
                padding: '1.25rem',
                borderRadius: '8px',
                marginBottom: '2rem',
                border: '1px solid var(--border)'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: '1', minWidth: '200px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--primary)' }}>대상 수업 선택</label>
                    <select
                        value={selectedClassId}
                        onChange={e => setSelectedClassId(e.target.value)}
                        style={{ padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '0.9rem' }}
                    >
                        <option value="">-- 수업을 선택하세요 --</option>
                        {classes.map(cls => (
                            <option key={cls.id} value={cls.id}>{cls.name}</option>
                        ))}
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>행 (Rows)</label>
                    <input
                        type="number"
                        value={rows}
                        onChange={e => setRows(Number(e.target.value))}
                        style={{ width: '80px', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>열 (Cols)</label>
                    <input
                        type="number"
                        value={cols}
                        onChange={e => setCols(Number(e.target.value))}
                        style={{ width: '80px', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                    />
                </div>
                <button
                    onClick={generateGrid}
                    style={{
                        background: 'var(--primary)',
                        color: 'white',
                        border: 'none',
                        padding: '0.6rem 1.2rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    그리드 생성
                </button>
            </div>

            {layout.length > 0 && (
                <div style={{ position: 'relative' }}>
                    {/* 교탁 표시 */}
                    <div style={{
                        margin: '0 auto 1.5rem',
                        width: '120px',
                        height: '40px',
                        background: '#94a3b8',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        fontSize: '0.875rem',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}>
                        교탁
                    </div>

                    <div style={{
                        overflowX: 'auto',
                        background: '#f1f5f9',
                        padding: '30px',
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        position: 'relative'
                    }}>
                        {/* 간격 조절 핸들 영역 */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            marginBottom: '10px',
                            height: '20px',
                            position: 'relative',
                            width: 'fit-content',
                            margin: '0 auto'
                        }}>
                            {Array.from({ length: cols }).map((_, i) => (
                                <div key={`col-head-${i}`} style={{ display: 'flex', alignItems: 'center' }}>
                                    <div style={{ width: '50px', height: '100%' }}></div>
                                    {i < cols - 1 && (
                                        <div
                                            onMouseDown={() => onMouseDownResize(i)}
                                            style={{
                                                width: `${columnGaps[i]}px`,
                                                height: '100%',
                                                cursor: 'col-resize',
                                                display: 'flex',
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                                position: 'relative'
                                            }}
                                            title="드래그하여 간격 조절"
                                        >
                                            <div style={{
                                                width: '4px',
                                                height: '100%',
                                                background: isResizing === i ? 'var(--primary)' : '#cbd5e1',
                                                borderRadius: '2px',
                                                transition: 'background 0.2s'
                                            }}></div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: Array.from({ length: cols }).map((_, i) =>
                                i === cols - 1 ? '50px' : `50px ${columnGaps[i]}px`
                            ).join(' '),
                            rowGap: '12px',
                            justifyContent: 'center',
                            width: 'fit-content',
                            margin: '0 auto'
                        }}>
                            {layout.map(seat => (
                                <div
                                    key={seat.id}
                                    onClick={() => {
                                        setLayout(layout.map(s => s.id === seat.id ? { ...s, active: !s.active } : s));
                                    }}
                                    style={{
                                        gridColumn: seat.c * 2 + 1, // 간격 컬럼을 포함하므로 2n+1
                                        gridRow: seat.r + 1,
                                        width: '50px',
                                        height: '50px',
                                        background: seat.active ? 'white' : 'transparent',
                                        border: seat.active ? '1px solid var(--primary)' : '1px dashed #cbd5e1',
                                        color: seat.active ? 'var(--primary)' : 'transparent',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.7rem',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        boxShadow: seat.active ? '0 2px 4px rgba(59, 130, 246, 0.1)' : 'none'
                                    }}
                                >
                                    {seat.active ? "좌석" : ""}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div style={{ marginTop: '2.5rem', textAlign: 'center' }}>
                <button
                    onClick={handleSaveLayout}
                    disabled={saving || layout.length === 0}
                    style={{
                        background: 'var(--success)',
                        color: 'white',
                        border: 'none',
                        padding: '1rem 3rem',
                        borderRadius: '8px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        opacity: (saving || layout.length === 0) ? 0.6 : 1,
                        fontSize: '1rem',
                        boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.4)'
                    }}
                >
                    {saving ? "저장 중..." : "레이아웃 저장"}
                </button>
                {successMessage && (
                    <p style={{ marginTop: '1rem', color: 'var(--success)', fontWeight: 'bold' }}>
                        ✅ {successMessage}
                    </p>
                )}
            </div>
        </div>
    );
}
