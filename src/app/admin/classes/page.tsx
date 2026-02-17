"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc, onSnapshot, query, where } from "firebase/firestore";
import * as XLSX from "xlsx";

interface ClassRoom {
    id: string;
    name: string;
    studentIds: string[];
    createdAt: string;
}

interface Student {
    id: string;
    name: string;
}

export default function ClassManagement() {
    const [classes, setClasses] = useState<ClassRoom[]>([]);
    const [allStudents, setAllStudents] = useState<Student[]>([]);
    const [newClassName, setNewClassName] = useState("");
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    // 수업 목록 및 전체 학생 목록 로드
    useEffect(() => {
        const classesQuery = collection(db, "classes");
        const studentsQuery = query(collection(db, "users"), where("role", "==", "student"));

        const unsubClasses = onSnapshot(classesQuery, (snapshot) => {
            const classData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as ClassRoom[];
            classData.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            setClasses(classData);
            setLoading(false);
        });

        const unsubStudents = onSnapshot(studentsQuery, (snapshot) => {
            const studentData = snapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name
            })) as Student[];
            studentData.sort((a, b) => a.id.localeCompare(b.id));
            setAllStudents(studentData);
        });

        return () => {
            unsubClasses();
            unsubStudents();
        };
    }, []);

    // 수업 생성
    const handleCreateClass = async () => {
        if (!newClassName.trim()) return;
        setProcessing(true);
        try {
            await addDoc(collection(db, "classes"), {
                name: newClassName,
                studentIds: [],
                createdAt: new Date().toISOString()
            });
            setNewClassName("");
            alert("수업이 등록되었습니다.");
        } catch (error) {
            console.error("수업 생성 오류:", error);
            alert("수업 생성 중 오류가 발생했습니다.");
        } finally {
            setProcessing(false);
        }
    };

    // 수업 삭제
    const handleDeleteClass = async (id: string, name: string) => {
        if (!confirm(`'${name}' 수업을 삭제하시겠습니까? 관련 학생 배정 정보도 사라집니다.`)) return;
        try {
            await deleteDoc(doc(db, "classes", id));
        } catch (error) {
            console.error("수업 삭제 오류:", error);
        }
    };

    // 학생 개별 배정/해제 토글
    const toggleStudentInClass = async (classId: string, studentId: string, isAssigned: boolean) => {
        const targetClass = classes.find(c => c.id === classId);
        if (!targetClass) return;

        let newStudentIds = [...targetClass.studentIds];
        if (isAssigned) {
            newStudentIds = newStudentIds.filter(id => id !== studentId);
        } else {
            if (!newStudentIds.includes(studentId)) {
                newStudentIds.push(studentId);
            }
        }

        try {
            await updateDoc(doc(db, "classes", classId), {
                studentIds: newStudentIds
            });
        } catch (error) {
            console.error("학생 배정 업데이트 오류:", error);
        }
    };

    // 엑셀 일괄 배정
    const handleBulkAssign = async (classId: string, file: File) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: "array" });
                const ws = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(ws) as any[];

                const studentIdsToAssign = rows
                    .map(row => row["학번"]?.toString())
                    .filter(id => id && allStudents.some(s => s.id === id));

                if (studentIdsToAssign.length === 0) {
                    alert("배정할 유효한 학생 학번이 없습니다. 먼저 학생 계정을 등록해주세요.");
                    return;
                }

                const targetClass = classes.find(c => c.id === classId);
                if (!targetClass) return;

                const mergedIds = Array.from(new Set([...targetClass.studentIds, ...studentIdsToAssign]));

                await updateDoc(doc(db, "classes", classId), {
                    studentIds: mergedIds
                });
                alert(`${studentIdsToAssign.length}명의 학생이 배정되었습니다.`);
            } catch (error) {
                console.error("엑셀 배정 오류:", error);
                alert("파일 처리 중 오류가 발생했습니다.");
            }
        };
        reader.readAsArrayBuffer(file);
    };

    if (loading) return <div className="card">로딩 중...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="card">
                <h2>수업(학급) 관리</h2>
                <p style={{ color: 'var(--secondary)', marginBottom: '1.5rem' }}>
                    수업을 등록하고 해당 수업을 수강하는 학생들을 배정합니다.
                </p>

                <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                    <input
                        type="text"
                        placeholder="새 수업 명칭 (예: 기하A반)"
                        value={newClassName}
                        onChange={e => setNewClassName(e.target.value)}
                        style={{ flex: 1, padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                    />
                    <button
                        onClick={handleCreateClass}
                        disabled={processing || !newClassName.trim()}
                        style={{
                            background: 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            padding: '0 1.5rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            opacity: processing ? 0.6 : 1
                        }}
                    >
                        수업 추가
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.5rem' }}>
                    {classes.map(cls => (
                        <div key={cls.id} className="card" style={{ border: '1px solid var(--border)', padding: '1.25rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h3 style={{ margin: 0 }}>{cls.name}</h3>
                                <button
                                    onClick={() => handleDeleteClass(cls.id, cls.name)}
                                    style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '0.875rem' }}
                                >
                                    삭제
                                </button>
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                                    배정된 학생 ({cls.studentIds.length}명)
                                </div>
                                <div style={{
                                    maxHeight: '150px',
                                    overflowY: 'auto',
                                    fontSize: '0.875rem',
                                    background: '#f8fafc',
                                    padding: '0.5rem',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '0.4rem'
                                }}>
                                    {cls.studentIds.length === 0 ? (
                                        <span style={{ color: '#94a3b8' }}>배정된 학생이 없습니다.</span>
                                    ) : (
                                        cls.studentIds.map(sid => {
                                            const student = allStudents.find(s => s.id === sid);
                                            return (
                                                <span key={sid} style={{ background: 'white', padding: '2px 8px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                                    {student ? `${student.name}(${sid})` : sid}
                                                </span>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <div style={{ flex: 1, position: 'relative' }}>
                                    <button
                                        style={{
                                            width: '100%',
                                            padding: '0.5rem',
                                            fontSize: '0.8125rem',
                                            background: 'white',
                                            border: '1px solid var(--border)',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                        onClick={() => {
                                            const el = document.getElementById(`file-${cls.id}`);
                                            el?.click();
                                        }}
                                    >
                                        📥 엑셀로 일괄 배정
                                    </button>
                                    <input
                                        id={`file-${cls.id}`}
                                        type="file"
                                        accept=".xlsx, .xls"
                                        style={{ display: 'none' }}
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleBulkAssign(cls.id, file);
                                        }}
                                    />
                                </div>
                                <button
                                    style={{
                                        flex: 1,
                                        padding: '0.5rem',
                                        fontSize: '0.8125rem',
                                        background: 'white',
                                        border: '1px solid var(--border)',
                                        borderRadius: '4px',
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => alert('개별 배정은 목록에서 학생을 클릭하여 토글할 수 있는 기능을 준비 중입니다. 현재는 엑셀 배정을 이용해주세요.')}
                                >
                                    👤 개별 배정 관리
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="card">
                <h3>전체 학생 명단 및 수업 배정 현황</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--secondary)', marginBottom: '1rem' }}>
                    학생의 이름(학번)을 클릭하여 각 수업에 배정하거나 제외할 수 있습니다.
                </p>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--border)' }}>
                                <th style={{ padding: '0.75rem', textAlign: 'left' }}>학번</th>
                                <th style={{ padding: '0.75rem', textAlign: 'left' }}>이름</th>
                                {classes.map(cls => (
                                    <th key={cls.id} style={{ padding: '0.75rem', textAlign: 'center' }}>{cls.name}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {allStudents.map(student => (
                                <tr key={student.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '0.75rem' }}>{student.id}</td>
                                    <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{student.name}</td>
                                    {classes.map(cls => {
                                        const isAssigned = cls.studentIds.includes(student.id);
                                        return (
                                            <td key={cls.id} style={{ padding: '0.75rem', textAlign: 'center' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isAssigned}
                                                    onChange={() => toggleStudentInClass(cls.id, student.id, isAssigned)}
                                                    style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                                                />
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
