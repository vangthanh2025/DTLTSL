import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, deleteDoc, addDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { UserData, Department, Title, GeminiKey } from '../App';
import PencilIcon from '../components/icons/PencilIcon';
import TrashIcon from '../components/icons/TrashIcon';
import PlusIcon from '../components/icons/PlusIcon';
import UserAddModal from '../components/UserAddModal';
import UserEditModal from '../components/UserEditModal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { GoogleGenAI } from '@google/genai';
import QRIcon from '../components/icons/QRIcon';
import UpdateExpirationModal from '../components/UpdateExpirationModal';

interface AdministrationProps {
    departments: Department[];
    titles: Title[];
    onKeysUpdate: () => void;
    onDepartmentsUpdate: () => void;
    onTitlesUpdate: () => void;
}

interface SharedReport {
  id: string;
  reportTitle: string;
  createdAt: { toDate: () => Date };
  expiresAt: { toDate: () => Date };
  createdBy: string;
  token: string;
}

const roleNames: { [key: string]: string } = {
    admin: 'Quản trị viên',
    user: 'Nhân viên',
    reporter: 'Báo cáo viên',
    reporter_user: 'Nhân viên & Báo cáo',
};

const statusNames: { [key: string]: string } = {
    active: 'Hoạt động',
    disabled: 'Vô hiệu hóa',
    locked: 'Bị khóa',
};

const statusColors: { [key: string]: string } = {
    active: 'bg-green-100 text-green-800',
    disabled: 'bg-red-100 text-red-800',
    locked: 'bg-yellow-100 text-yellow-800',
};

const Administration: React.FC<AdministrationProps> = ({ departments, titles, onKeysUpdate, onDepartmentsUpdate, onTitlesUpdate }) => {
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('userManagement');
    const [searchTerm, setSearchTerm] = useState('');

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserData | null>(null);
    const [deletingUser, setDeletingUser] = useState<UserData | null>(null);

    // Settings state
    const [complianceStartYear, setComplianceStartYear] = useState('');
    const [complianceEndYear, setComplianceEndYear] = useState('');
    const [settingsDocId, setSettingsDocId] = useState<string | null>(null);
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
    const [settingsError, setSettingsError] = useState<string | null>(null);

    // Gemini Key state
    const [geminiKeys, setGeminiKeys] = useState<GeminiKey[]>([]);
    const [newKeyInput, setNewKeyInput] = useState('');
    const [deletingKey, setDeletingKey] = useState<GeminiKey | null>(null);
    const [keyLoading, setKeyLoading] = useState(true);
    const [keyCheckStatus, setKeyCheckStatus] = useState<{ [keyId: string]: 'idle' | 'checking' | 'valid' | 'invalid' }>({});


    // Category Management State
    const [localDepartments, setLocalDepartments] = useState<Department[]>([]);
    const [localTitles, setLocalTitles] = useState<Title[]>([]);
    const [newDepartmentName, setNewDepartmentName] = useState('');
    const [newTitleName, setNewTitleName] = useState('');
    const [editingItem, setEditingItem] = useState<{ type: 'department' | 'title', id: string } | null>(null);
    const [editedName, setEditedName] = useState('');
    const [deletingItem, setDeletingItem] = useState<{ type: 'department' | 'title', item: Department | Title } | null>(null);
    
    // QR Management State
    const [sharedReports, setSharedReports] = useState<SharedReport[]>([]);
    const [editingExpirationReport, setEditingExpirationReport] = useState<SharedReport | null>(null);
    const [deletingSharedReport, setDeletingSharedReport] = useState<SharedReport | null>(null);


    const departmentMap = new Map(departments.map(dept => [dept.id, dept.name]));
    const titleMap = new Map(titles.map(title => [title.id, title.name]));

    useEffect(() => {
        const fetchAllData = async () => {
            setLoading(true); setSettingsLoading(true); setKeyLoading(true);
            try {
                // Fetch Users, Settings, Keys, and Shared Reports
                const [userSnapshot, settingsSnapshot, keysSnapshot, sharedReportsSnapshot] = await Promise.all([
                    getDocs(collection(db, 'Users')),
                    getDocs(collection(db, 'Settings')),
                    getDocs(collection(db, 'KeyGemini')),
                    getDocs(collection(db, 'SharedReports'))
                ]);
                
                const userList: UserData[] = [];
                userSnapshot.docs.forEach(doc => {
                    const data = doc.data();
                    const docId = doc.id;

                    if (typeof data.name !== 'string' || data.name.trim() === '') {
                        console.error(`Validation Error: User document '${docId}' has invalid or missing 'name'. Skipping.`);
                        return;
                    }

                    // Transform legacy boolean status
                    if (typeof data.status === 'boolean') {
                        data.status = data.status ? 'active' : 'disabled';
                    } else if (!data.status) {
                        data.status = 'active'; // Default for old accounts
                    }
                    userList.push({ id: doc.id, ...data } as UserData);
                });
                setUsers(userList);

                if (!settingsSnapshot.empty) {
                    const settingsDoc = settingsSnapshot.docs[0];
                    const data = settingsDoc.data();
                    setSettingsDocId(settingsDoc.id);
                    setComplianceStartYear(data.complianceStartYear?.toString() || '');
                    setComplianceEndYear(data.complianceEndYear?.toString() || '');
                } else {
                    const currentYear = new Date().getFullYear().toString();
                    setComplianceStartYear(currentYear);
                }

                const keyList = keysSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GeminiKey));
                setGeminiKeys(keyList);

                const reportList = sharedReportsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SharedReport));
                reportList.sort((a, b) => b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime());
                setSharedReports(reportList);

            } catch (err) {
                console.error("Error fetching data: ", err);
                setError('Không thể tải dữ liệu.');
            } finally {
                setLoading(false); setSettingsLoading(false); setKeyLoading(false);
            }
        };
        fetchAllData();
    }, []);

    useEffect(() => {
        setLocalDepartments([...departments].sort((a, b) => a.name.localeCompare(b.name, 'vi')));
    }, [departments]);
    
    useEffect(() => {
        setLocalTitles([...titles].sort((a, b) => a.name.localeCompare(b.name, 'vi')));
    }, [titles]);


    const filteredUsers = useMemo(() => {
        return users.filter(user => 
            user.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [users, searchTerm]);

    const handleAddUser = async (newUserData: Omit<UserData, 'id'>) => {
        try {
            const docRef = await addDoc(collection(db, 'Users'), newUserData);
            setUsers(prev => [...prev, { ...newUserData, id: docRef.id } as UserData]);
            setIsAddModalOpen(false);
        } catch (err) { console.error("Error adding user: ", err); }
    };

    const handleUpdateUser = async (updatedData: Partial<UserData>) => {
        if (!editingUser) return;
        try {
            await updateDoc(doc(db, 'Users', editingUser.id), updatedData);
            setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...updatedData } : u));
            setEditingUser(null);
        } catch (err) { console.error("Error updating user: ", err); }
    };

    const handleDeleteUser = async () => {
        if (!deletingUser) return;
        try {
            await deleteDoc(doc(db, 'Users', deletingUser.id));
            setUsers(prev => prev.filter(u => u.id !== deletingUser.id));
            setDeletingUser(null);
        } catch (err) { console.error("Error deleting user: ", err); }
    };

    const handleUnlockUser = async (userToUnlock: UserData) => {
        try {
            const userDocRef = doc(db, 'Users', userToUnlock.id);
            await updateDoc(userDocRef, {
                status: 'active',
                failedLoginAttempts: 0
            });
            setUsers(prev => prev.map(u => u.id === userToUnlock.id ? { ...u, status: 'active', failedLoginAttempts: 0 } : u));
        } catch (err) {
            console.error("Error unlocking user: ", err);
        }
    };

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaveStatus('saving'); setSettingsError(null);
        try {
            const startYear = parseInt(complianceStartYear, 10);
            const endYear = parseInt(complianceEndYear, 10);
            if (isNaN(startYear) || isNaN(endYear) || startYear < 2000 || endYear < startYear) {
                 throw new Error("Năm không hợp lệ.");
            }
            const settingsData = { complianceStartYear: startYear, complianceEndYear: endYear };
            if (settingsDocId) {
                await updateDoc(doc(db, 'Settings', settingsDocId), settingsData);
            } else {
                const newDocRef = await addDoc(collection(db, 'Settings'), settingsData);
                setSettingsDocId(newDocRef.id);
            }
            setSaveStatus('success');
        } catch (err) {
            setSettingsError(err instanceof Error ? err.message : "Lỗi không xác định.");
            setSaveStatus('error');
        } finally {
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    // --- Key Management ---
    const handleAddKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newKeyInput.trim()) return;
        try {
            const docRef = await addDoc(collection(db, 'KeyGemini'), { key: newKeyInput.trim() });
            setGeminiKeys(prev => [...prev, { id: docRef.id, key: newKeyInput.trim() }]);
            setNewKeyInput('');
            onKeysUpdate();
        } catch (err) { console.error("Error adding Gemini Key:", err); }
    };

    const handleDeleteKey = async () => {
        if (!deletingKey) return;
        try {
            await deleteDoc(doc(db, 'KeyGemini', deletingKey.id));
            setGeminiKeys(prev => prev.filter(k => k.id !== deletingKey.id));
            setDeletingKey(null);
            onKeysUpdate();
        } catch (err) { console.error("Error deleting Gemini Key:", err); }
    };

    const handleCheckKey = async (keyToCheck: GeminiKey) => {
        setKeyCheckStatus(prev => ({ ...prev, [keyToCheck.id]: 'checking' }));
        try {
            const ai = new GoogleGenAI({ apiKey: keyToCheck.key });
            await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: 'Hi',
            });
            setKeyCheckStatus(prev => ({ ...prev, [keyToCheck.id]: 'valid' }));
        } catch (error) {
            console.error("Key check failed:", error);
            setKeyCheckStatus(prev => ({ ...prev, [keyToCheck.id]: 'invalid' }));
        } finally {
            setTimeout(() => {
                setKeyCheckStatus(prev => ({ ...prev, [keyToCheck.id]: 'idle' }));
            }, 5000); // Reset status after 5 seconds
        }
    };

    // --- Category Management ---
    const handleAddDepartment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newDepartmentName.trim()) return;
        try {
            await addDoc(collection(db, 'Departments'), { name: newDepartmentName.trim() });
            setNewDepartmentName('');
            onDepartmentsUpdate();
        } catch (err) { console.error("Error adding department:", err); }
    };

    const handleAddTitle = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitleName.trim()) return;
        try {
            await addDoc(collection(db, 'Titles'), { name: newTitleName.trim() });
            setNewTitleName('');
            onTitlesUpdate();
        } catch (err) { console.error("Error adding title:", err); }
    };
    
    const handleStartEdit = (type: 'department' | 'title', item: Department | Title) => {
        setEditingItem({ type, id: item.id });
        setEditedName(item.name);
    };
    const handleCancelEdit = () => { setEditingItem(null); setEditedName(''); };
    
    const handleSaveEdit = async () => {
        if (!editingItem || !editedName.trim()) return;
        const collectionName = editingItem.type === 'department' ? 'Departments' : 'Titles';
        try {
            await updateDoc(doc(db, collectionName, editingItem.id), { name: editedName.trim() });
            handleCancelEdit();
            if (editingItem.type === 'department') onDepartmentsUpdate(); else onTitlesUpdate();
        } catch (err) { console.error(`Error updating ${editingItem.type}:`, err); }
    };

    const handleConfirmDelete = async () => {
        if (!deletingItem) return;
        const collectionName = deletingItem.type === 'department' ? 'Departments' : 'Titles';
        try {
            await deleteDoc(doc(db, collectionName, deletingItem.item.id));
            setDeletingItem(null);
            if (deletingItem.type === 'department') onDepartmentsUpdate(); else onTitlesUpdate();
        } catch (err) { console.error(`Error deleting ${deletingItem.type}:`, err); }
    };

    // --- QR Management ---
    const handleUpdateExpiration = async (report: SharedReport, newExpiresAt: Date) => {
        try {
            const reportRef = doc(db, 'SharedReports', report.id);
            await updateDoc(reportRef, { expiresAt: Timestamp.fromDate(newExpiresAt) });
            setSharedReports(prev => prev.map(r => 
                r.id === report.id ? { ...r, expiresAt: { toDate: () => newExpiresAt } } : r
            ));
            setEditingExpirationReport(null);
        } catch (err) {
            console.error("Error updating expiration date:", err);
            // Optionally, show an error to the user
        }
    };

    const handleDeleteSharedReport = async () => {
        if (!deletingSharedReport) return;
        try {
            await deleteDoc(doc(db, 'SharedReports', deletingSharedReport.id));
            setSharedReports(prev => prev.filter(r => r.id !== deletingSharedReport.id));
            setDeletingSharedReport(null);
        } catch (err) {
            console.error("Error deleting shared report:", err);
        }
    };

    const maskKey = (key: string) => key.length < 16 ? '***' : `${key.substring(0, 8)}...${key.substring(key.length - 8)}`;

    const renderUserManagement = () => (
        <div className="bg-white p-6 rounded-lg shadow-md mt-6">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <h3 className="text-lg font-semibold text-teal-700">Quản lý Tài khoản</h3>
                <input type="text" placeholder="Tìm kiếm theo họ tên..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full sm:w-1/3 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500" />
                <button onClick={() => setIsAddModalOpen(true)} className="bg-teal-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-teal-700 transition-colors w-full sm:w-auto"><PlusIcon className="h-5 w-5" /><span>Thêm người dùng</span></button>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full bg-white"><thead className="bg-gray-50"><tr>{['#', 'Tên đăng nhập', 'Họ tên', 'Khoa/Phòng', 'Chức danh', 'Vai trò', 'Trạng thái', 'Hành động'].map(header => (<th key={header} className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">{header}</th>))}</tr></thead>
                    <tbody className="divide-y divide-gray-200">{filteredUsers.map((user, index) => (<tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-base text-gray-900">{index + 1}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-base text-gray-500">{user.username}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-base font-medium text-gray-900">{user.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-base text-gray-500">{departmentMap.get(user.departmentId) || 'Chưa cập nhật'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-base text-gray-500">{titleMap.get(user.titleId) || 'Chưa cập nhật'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-base text-gray-500">{roleNames[user.role] || user.role}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-base"><span className={`px-2 inline-flex text-sm leading-5 font-semibold rounded-full ${statusColors[user.status] || 'bg-gray-100 text-gray-800'}`}>{statusNames[user.status] || user.status}</span></td>
                        <td className="px-6 py-4 whitespace-nowrap text-base font-medium">
                            {user.status === 'locked' && (
                                <button
                                    onClick={() => handleUnlockUser(user)}
                                    className="text-blue-600 hover:text-blue-900 mr-4 font-semibold"
                                    title="Mở khóa tài khoản"
                                >
                                    Mở khóa
                                </button>
                            )}
                            <button onClick={() => setEditingUser(user)} className="text-teal-600 hover:text-teal-900 mr-4" title="Chỉnh sửa"><PencilIcon className="h-5 w-5" /></button>
                            <button onClick={() => setDeletingUser(user)} className="text-red-600 hover:text-red-900" title="Xóa"><TrashIcon className="h-5 w-5" /></button>
                        </td>
                    </tr>))}</tbody>
                </table>
            </div>
        </div>
    );

    const renderCategoryManagement = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
            <div className="bg-white p-6 rounded-lg shadow-md flex flex-col">
                <h3 className="text-lg font-semibold text-teal-700 mb-4">Quản lý Khoa/Phòng</h3>
                <form onSubmit={handleAddDepartment} className="flex gap-2 mb-4"><input type="text" value={newDepartmentName} onChange={(e) => setNewDepartmentName(e.target.value)} placeholder="Tên khoa/phòng mới" className="flex-grow input-style" required /><button type="submit" className="btn-primary flex-shrink-0">Thêm</button></form>
                <ul className="space-y-2 flex-1 overflow-y-auto max-h-96">{localDepartments.map(dept => (<li key={dept.id} className="flex items-center justify-between p-2 rounded hover:bg-gray-50 group">{editingItem?.id === dept.id ? (<div className="flex-grow flex items-center gap-2"><input value={editedName} onChange={e => setEditedName(e.target.value)} className="input-style flex-grow" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()} /><button onClick={handleSaveEdit} className="text-green-600 font-semibold">Lưu</button><button onClick={handleCancelEdit} className="text-gray-500">Hủy</button></div>) : (<><span className="text-base text-gray-800">{dept.name}</span><div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => handleStartEdit('department', dept)} className="text-teal-600 hover:text-teal-900"><PencilIcon className="h-5 w-5" /></button><button onClick={() => setDeletingItem({ type: 'department', item: dept })} className="text-red-600 hover:text-red-900"><TrashIcon className="h-5 w-5" /></button></div></>)}</li>))}</ul>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md flex flex-col">
                <h3 className="text-lg font-semibold text-teal-700 mb-4">Quản lý Chức danh</h3>
                <form onSubmit={handleAddTitle} className="flex gap-2 mb-4"><input type="text" value={newTitleName} onChange={(e) => setNewTitleName(e.target.value)} placeholder="Tên chức danh mới" className="flex-grow input-style" required /><button type="submit" className="btn-primary flex-shrink-0">Thêm</button></form>
                <ul className="space-y-2 flex-1 overflow-y-auto max-h-96">{localTitles.map(title => (<li key={title.id} className="flex items-center justify-between p-2 rounded hover:bg-gray-50 group">{editingItem?.id === title.id ? (<div className="flex-grow flex items-center gap-2"><input value={editedName} onChange={e => setEditedName(e.target.value)} className="input-style flex-grow" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()} /><button onClick={handleSaveEdit} className="text-green-600 font-semibold">Lưu</button><button onClick={handleCancelEdit} className="text-gray-500">Hủy</button></div>) : (<><span className="text-base text-gray-800">{title.name}</span><div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => handleStartEdit('title', title)} className="text-teal-600 hover:text-teal-900"><PencilIcon className="h-5 w-5" /></button><button onClick={() => setDeletingItem({ type: 'title', item: title })} className="text-red-600 hover:text-red-900"><TrashIcon className="h-5 w-5" /></button></div></>)}</li>))}</ul>
            </div>
        </div>
    );
    
    const renderSettingsTab = () => (
        <div className="bg-white p-6 rounded-lg shadow-md mt-6 max-w-2xl">
            <form onSubmit={handleSaveSettings}><h3 className="text-lg font-semibold text-gray-800">Cài đặt chu kỳ tuân thủ</h3><p className="text-base text-gray-500 mt-1 mb-4">Nhập năm bắt đầu và kết thúc chu kỳ để hệ thống thống kê chính xác.</p>
                <div className="flex items-end gap-4"><label className="block text-base font-medium text-gray-700">Năm bắt đầu<input type="number" value={complianceStartYear} onChange={(e) => setComplianceStartYear(e.target.value)} className="mt-1 w-40 input-style" placeholder="YYYY" min="2000" max="2100" /></label><label className="block text-base font-medium text-gray-700">Năm kết thúc<input type="number" value={complianceEndYear} onChange={(e) => setComplianceEndYear(e.target.value)} className="mt-1 w-40 input-style" placeholder="YYYY" min="2000" max="2100" /></label><button type="submit" disabled={saveStatus === 'saving'} className="btn-primary h-10">{saveStatus === 'saving' ? 'Đang lưu...' : 'Lưu'}</button></div>
                {saveStatus === 'success' && <p className="text-base text-green-600 mt-2">Đã lưu thay đổi!</p>}
                {saveStatus === 'error' && <p className="text-base text-red-600 mt-2">{settingsError || 'Lưu thất bại.'}</p>}
            </form>
        </div>
    );
    
    const renderKeyManagement = () => (
        <div className="bg-white p-6 rounded-lg shadow-md mt-6 max-w-3xl">
            <h3 className="text-lg font-semibold text-gray-800">Quản lý API Key</h3>
            <p className="text-base text-gray-500 mt-1 mb-4">Thêm, xóa và kiểm tra trạng thái API key. Ứng dụng sẽ sử dụng key đầu tiên trong danh sách.</p>
            <form onSubmit={handleAddKey} className="flex items-center gap-3 mb-6">
                <input type="text" value={newKeyInput} onChange={(e) => setNewKeyInput(e.target.value)} placeholder="Dán API Key mới vào đây" className="flex-grow px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500" />
                <button type="submit" className="btn-primary">Thêm Key</button>
            </form>
            <div className="space-y-2">
                {geminiKeys.map(k => {
                    const status = keyCheckStatus[k.id] || 'idle';
                    return (
                        <div key={k.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md min-h-[58px]">
                            <span className="font-mono text-gray-700">{maskKey(k.key)}</span>
                            <div className="flex items-center gap-4">
                                <div className="w-28 text-right">
                                    {status === 'idle' && (
                                        <button onClick={() => handleCheckKey(k)} className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors">Kiểm tra</button>
                                    )}
                                    {status === 'checking' && (
                                        <span className="text-sm text-gray-500 italic">Đang kiểm tra...</span>
                                    )}
                                    {status === 'valid' && (
                                        <span className="text-sm font-semibold text-green-600 flex items-center justify-end gap-1">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>
                                            Hợp lệ
                                        </span>
                                    )}
                                    {status === 'invalid' && (
                                        <span className="text-sm font-semibold text-red-600 flex items-center justify-end gap-1">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path></svg>
                                            Không hợp lệ
                                        </span>
                                    )}
                                </div>
                                <button onClick={() => setDeletingKey(k)} className="text-red-500 hover:text-red-700"><TrashIcon className="h-5 w-5" /></button>
                            </div>
                        </div>
                    );
                })}
                {geminiKeys.length === 0 && (<p className="text-gray-500 text-center py-4">Chưa có API key nào.</p>)}
            </div>
        </div>
    );
    
    const renderQRManagement = () => (
        <div className="bg-white p-6 rounded-lg shadow-md mt-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Quản lý Báo cáo đã chia sẻ</h3>
            <div className="overflow-x-auto">
                <table className="min-w-full bg-white">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">Tên Báo cáo</th>
                            <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">Người tạo</th>
                            <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">Ngày tạo</th>
                            <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">Ngày hết hạn</th>
                            <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">Hành động</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {sharedReports.map(report => (
                            <tr key={report.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-base font-medium text-gray-900">{report.reportTitle}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-base text-gray-500">{report.createdBy}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-base text-gray-500">{report.createdAt.toDate().toLocaleDateString('vi-VN')}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-base text-gray-500">{report.expiresAt.toDate().toLocaleDateString('vi-VN')}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-base font-medium">
                                    <button onClick={() => setEditingExpirationReport(report)} className="text-teal-600 hover:text-teal-900 mr-4" title="Sửa hạn"><PencilIcon className="h-5 w-5" /></button>
                                    <button onClick={() => setDeletingSharedReport(report)} className="text-red-600 hover:text-red-900" title="Xóa"><TrashIcon className="h-5 w-5" /></button>
                                </td>
                            </tr>
                        ))}
                         {sharedReports.length === 0 && (
                            <tr>
                                <td colSpan={5} className="text-center py-8 text-gray-500">Chưa có báo cáo nào được chia sẻ.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );


    if (loading || settingsLoading || keyLoading) return <div className="text-center p-8">Đang tải dữ liệu quản trị...</div>;
    if (error) return <div className="text-center p-8 text-red-600">{error}</div>;

    return (
        <div>
            <h1 className="text-2xl font-bold text-teal-800 mb-4">Quản trị hệ thống</h1>
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex flex-wrap gap-x-8 gap-y-2" aria-label="Tabs">
                    <button onClick={() => setActiveTab('userManagement')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-base ${activeTab === 'userManagement' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Tài khoản</button>
                    <button onClick={() => setActiveTab('categoryManagement')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-base ${activeTab === 'categoryManagement' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Danh mục</button>
                    <button onClick={() => setActiveTab('qrManagement')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-base ${activeTab === 'qrManagement' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Quản lý QR</button>
                    <button onClick={() => setActiveTab('geminiKeyManagement')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-base ${activeTab === 'geminiKeyManagement' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Quản lý API</button>
                    <button onClick={() => setActiveTab('settings')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-base ${activeTab === 'settings' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Cài đặt</button>
                </nav>
            </div>
            
            {activeTab === 'userManagement' && renderUserManagement()}
            {activeTab === 'categoryManagement' && renderCategoryManagement()}
            {activeTab === 'qrManagement' && renderQRManagement()}
            {activeTab === 'geminiKeyManagement' && renderKeyManagement()}
            {activeTab === 'settings' && renderSettingsTab()}

            {isAddModalOpen && <UserAddModal departments={departments} titles={titles} onAdd={handleAddUser} onClose={() => setIsAddModalOpen(false)} />}
            {editingUser && <UserEditModal user={editingUser} departments={departments} titles={titles} onSave={handleUpdateUser} onClose={() => setEditingUser(null)} />}
            {deletingUser && <ConfirmDeleteModal message={`Bạn có chắc chắn muốn xóa người dùng "${deletingUser.name}"?`} onConfirm={handleDeleteUser} onClose={() => setDeletingUser(null)} />}
            {deletingKey && <ConfirmDeleteModal message={`Bạn có chắc chắn muốn xóa API Key "${maskKey(deletingKey.key)}"?`} onConfirm={handleDeleteKey} onClose={() => setDeletingKey(null)} />}
            {deletingItem && <ConfirmDeleteModal message={`Bạn có chắc chắn muốn xóa "${deletingItem.item.name}"?`} onConfirm={handleConfirmDelete} onClose={() => setDeletingItem(null)} />}
            {editingExpirationReport && <UpdateExpirationModal report={editingExpirationReport} onSave={handleUpdateExpiration} onClose={() => setEditingExpirationReport(null)} />}
            {deletingSharedReport && <ConfirmDeleteModal message={`Bạn có chắc chắn muốn xóa link chia sẻ cho báo cáo "${deletingSharedReport.reportTitle}" không?`} onConfirm={handleDeleteSharedReport} onClose={() => setDeletingSharedReport(null)} />}
            
            <style>{`
                .input-style { box-sizing: border-box; width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #D1D5DB; border-radius: 0.375rem; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); }
                .input-style:focus { outline: 2px solid transparent; outline-offset: 2px; --tw-ring-color: #14B8A6; box-shadow: 0 0 0 2px var(--tw-ring-color); border-color: #14B8A6; }
                .btn-primary { background-color: #0D9488; color: white; font-weight: 600; padding: 0.5rem 1rem; border-radius: 0.5rem; transition: background-color 0.2s; border: none; }
                .btn-primary:hover { background-color: #0F766E; } .btn-primary:disabled { background-color: #5EEAD4; cursor: not-allowed; }
            `}</style>
        </div>
    );
};

export default Administration;