"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, query, where, writeBatch, doc, setDoc, updateDoc, onSnapshot, orderBy } from "firebase/firestore";
import * as XLSX from "xlsx";

interface Student {
    id: string;
    name: string;
    email: string;
    createdAt: string;
}

interface ClassRoom {
    id: string;
    name: string;
    studentIds: string[];
}

export default function StudentManagement() {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [students, setStudents] = useState<Student[]>([]);
    const [classes, setClasses] = useState<ClassRoom[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [sortConfig, setSortConfig] = useState<{ key: 'id' | 'name', direction: 'asc' | 'desc' } | null>({ key: 'id', direction: 'asc' });
    const [filterClassId, setFilterClassId] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ id: "", name: "" });

    // 개별 등록을 위한 상태 추가
    const [individualId, setIndividualId] = useState("");
    const [individualName, setIndividualName] = useState("");

    // 학생 및 수업 목록 실시간 구독
    useEffect(() => {
        const studentQuery = query(collection(db, "users"), where("role", "==", "student"));
        const unsubStudents = onSnapshot(studentQuery, (snapshot) => {
            const studentData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Student[];
            setStudents(studentData);
        });

        const unsubClasses = onSnapshot(collection(db, "classes"), (snapshot) => {
            const classData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as ClassRoom[];
            setClasses(classData);
        });

        return () => {
            unsubStudents();
            unsubClasses();
        };
    }, []);

    // 엑셀 관련 함수들 (기존과 동일)
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) setFile(e.target.files[0]);
    };

    const downloadTemplate = () => {
        try {
            const data = [{ "학번": "30101", "이름": "김철수" }, { "학번": "30102", "이름": "이영희" }];
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "학생명단");
            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
            const url = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + wbout;
            const a = document.createElement('a');
            a.href = url;
            a.download = 'student_template.xlsx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (error) { alert("양식 다운로드 중 오류가 발생했습니다."); }
    };

    const processExcel = async () => {
        if (!file) return;
        setLoading(true);
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: "binary" });
                const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
                const usersToCreate = data.map(row => ({
                    id: row["학번"]?.toString(),
                    name: row["이름"],
                    email: `${row["학번"]}@school.com`
                })).filter(u => u.id && u.name);

                if (usersToCreate.length === 0) {
                    alert("데이터가 없습니다.");
                    setLoading(false);
                    return;
                }

                const response = await fetch("/api/admin/create-auth-user", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ users: usersToCreate })
                });
                const result = await response.json();
                if (response.ok) { alert(result.message); setFile(null); }
                else throw new Error(result.error);
            } catch (error: any) { alert("처리 중 오류: " + error.message); }
            finally { setLoading(false); }
        };
        reader.readAsBinaryString(file);
    };

    // 개별 등록
    const handleIndividualRegister = async () => {
        if (!individualId || !individualName) return;
        setLoading(true);
        try {
            const response = await fetch("/api/admin/create-auth-user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: individualId, name: individualName, email: `${individualId}@school.com` })
            });
            const result = await response.json();
            if (response.ok) {
                alert(`${individualName} 학생이 등록되었습니다.`);
                setIndividualId(""); setIndividualName("");
            } else throw new Error(result.error);
        } catch (error: any) { alert(`오류: ${error.message}`); }
        finally { setLoading(false); }
    };

    // 개별 삭제
    const handleDeleteOne = async (id: string, name: string) => {
        if (!confirm(`${name} (${id}) 학생을 삭제하시겠습니까? 계정 정보와 모든 배정/예약 내역이 삭제됩니다.`)) return;
        setLoading(true);
        try {
            const response = await fetch("/api/admin/delete-users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userIds: [id] })
            });
            const result = await response.json();
            if (response.ok) {
                alert("삭제되었습니다.");
                setSelectedIds(prev => prev.filter(sid => sid !== id));
            } else {
                throw new Error(result.error || "삭제 중 오류가 발생했습니다.");
            }
        } catch (error: any) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    // 선택 삭제
    const handleDeleteSelected = async () => {
        if (selectedIds.length === 0) return;
        if (!confirm(`${selectedIds.length}명의 학생을 삭제하시겠습니까? 계정 정보와 모든 배정/예약 내역이 삭제됩니다.`)) return;
        setLoading(true);
        try {
            const response = await fetch("/api/admin/delete-users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userIds: selectedIds })
            });
            const result = await response.json();
            if (response.ok) {
                alert(result.message || "삭제되었습니다.");
                setSelectedIds([]);
            } else {
                throw new Error(result.error || "삭제 중 오류가 발생했습니다.");
            }
        } catch (error: any) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    // 정렬
    const handleSort = (key: 'id' | 'name') => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // 인라인 수정 시작
    const startEdit = (student: Student) => {
        setEditingId(student.id);
        setEditForm({ id: student.id, name: student.name });
    };

    // 인라인 수정 저장
    const handleSaveEdit = async () => {
        if (!editingId) return;

        const trimmedId = editForm.id.trim();
        const trimmedName = editForm.name.trim();

        if (!trimmedId || !trimmedName) {
            alert("학번과 이름을 입력해주세요.");
            return;
        }

        if (trimmedId !== editingId && students.some(s => s.id === trimmedId)) {
            alert("이미 존재하는 학번입니다.");
            return;
        }

        setLoading(true);
        try {
            if (trimmedId !== editingId) {
                // 학번이 바뀐 경우: 기존 계정 삭제 후 새 계정 생성
                if (!confirm("학번 변경 시 계정이 재생성되어 비밀번호가 초기화됩니다. 계속하시겠습니까?")) {
                    setLoading(false);
                    return;
                }

                // 삭제 API 호출
                const delRes = await fetch("/api/admin/delete-users", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userIds: [editingId] })
                });

                if (!delRes.ok) throw new Error("기존 계정 삭제 중 오류가 발생했습니다.");

                // 생성 API 호출
                const createRes = await fetch("/api/admin/create-auth-user", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: trimmedId, name: trimmedName, email: `${trimmedId}@school.com` })
                });

                if (!createRes.ok) throw new Error("새 계정 생성 중 오류가 발생했습니다.");
            } else {
                // 이름만 바뀐 경우: Firestore만 업데이트
                await updateDoc(doc(db, "users", editingId), {
                    name: trimmedName,
                    updatedAt: new Date().toISOString()
                });
            }
            setEditingId(null);
            alert("수정되었습니다.");
        } catch (e: any) { alert("수정 중 오류: " + e.message); }
        finally { setLoading(false); }
    };

    // 비밀번호 초기화
    const handleResetPassword = async (uid: string, name: string) => {
        if (!confirm(`${name} 학생의 비밀번호를 123456으로 초기화하시겠습니까?`)) return;
        setLoading(true);
        try {
            const response = await fetch("/api/admin/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uid })
            });

            if (response.ok) {
                alert(`${name} 학생의 비밀번호가 123456으로 초기화되었습니다.`);
            } else {
                throw new Error("비밀번호 초기화 중 오류가 발생했습니다.");
            }
        } catch (error: any) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    // 필터링 및 정렬된 데이터 계산
    const filteredStudents = students
        .filter(s => {
            if (!filterClassId) return true;
            const cls = classes.find(c => c.id === filterClassId);
            return cls?.studentIds.includes(s.id);
        })
        .sort((a, b) => {
            if (!sortConfig) return 0;
            const aVal = (a[sortConfig.key] || "").toString();
            const bVal = (b[sortConfig.key] || "").toString();
            return sortConfig.direction === 'asc'
                ? aVal.localeCompare(bVal, 'ko')
                : bVal.localeCompare(aVal, 'ko');
        });

    return (
        <div className="card">
            <h2>학생 명단 관리</h2>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} />
                <button onClick={downloadTemplate} className="btn-outline">📄 양식 다운로드</button>
                <button onClick={processExcel} disabled={loading || !file} className="btn-primary">
                    {loading ? "처리 중..." : "명단 업로드"}
                </button>
            </div>

            <div className="card" style={{ background: '#f8fafc', marginBottom: '2rem' }}>
                <h3>개별 등록</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '1rem', marginTop: '1rem' }}>
                    <input type="text" placeholder="학번" value={individualId} onChange={e => setIndividualId(e.target.value)} />
                    <input type="text" placeholder="이름" value={individualName} onChange={e => setIndividualName(e.target.value)} />
                    <button onClick={handleIndividualRegister} disabled={loading || !individualId || !individualName} className="btn-primary">
                        등록
                    </button>
                </div>
            </div>

            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3>학생 목록 ({filteredStudents.length}명)</h3>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <select
                            value={filterClassId}
                            onChange={e => setFilterClassId(e.target.value)}
                            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                        >
                            <option value="">모든 수업</option>
                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <button
                            onClick={handleDeleteSelected}
                            disabled={selectedIds.length === 0 || loading}
                            className="btn-danger"
                            style={{ padding: '0.5rem 1rem' }}
                        >
                            선택 삭제 ({selectedIds.length})
                        </button>
                    </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--border)' }}>
                                <th style={{ padding: '0.75rem', width: '40px' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.length === filteredStudents.length && filteredStudents.length > 0}
                                        onChange={(e) => {
                                            if (e.target.checked) setSelectedIds(filteredStudents.map(s => s.id));
                                            else setSelectedIds([]);
                                        }}
                                    />
                                </th>
                                <th onClick={() => handleSort('id')} style={{ padding: '0.75rem', textAlign: 'left', cursor: 'pointer' }}>
                                    학번 {sortConfig?.key === 'id' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </th>
                                <th onClick={() => handleSort('name')} style={{ padding: '0.75rem', textAlign: 'left', cursor: 'pointer' }}>
                                    이름 {sortConfig?.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </th>
                                <th style={{ padding: '0.75rem', textAlign: 'left' }}>배정된 수업</th>
                                <th style={{ padding: '0.75rem', textAlign: 'center' }}>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStudents.length === 0 ? (
                                <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center' }}>학생이 없습니다.</td></tr>
                            ) : (
                                filteredStudents.map((s) => (
                                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(s.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedIds([...selectedIds, s.id]);
                                                    else setSelectedIds(selectedIds.filter(id => id !== s.id));
                                                }}
                                            />
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            {editingId === s.id ? (
                                                <input value={editForm.id} onChange={e => setEditForm({ ...editForm, id: e.target.value })} style={{ width: '80px' }} />
                                            ) : s.id}
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            {editingId === s.id ? (
                                                <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} style={{ width: '80px' }} />
                                            ) : s.name}
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                                {classes.filter(c => c.studentIds.includes(s.id)).map(c => (
                                                    <span key={c.id} style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem' }}>
                                                        {c.name}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                            {editingId === s.id ? (
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                                    <button onClick={handleSaveEdit} className="btn-primary" style={{ padding: '2px 8px', fontSize: '0.75rem' }}>저장</button>
                                                    <button onClick={() => setEditingId(null)} className="btn-outline" style={{ padding: '2px 8px', fontSize: '0.75rem' }}>취소</button>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                                    <button onClick={() => startEdit(s)} className="btn-outline" style={{ padding: '4px 8px', fontSize: '0.75rem' }}>수정</button>
                                                    <button onClick={() => handleResetPassword(s.id, s.name)} className="btn-outline" style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--secondary)' }}>비번</button>
                                                    <button onClick={() => handleDeleteOne(s.id, s.name)} className="btn-outline" style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--error)' }}>삭제</button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
