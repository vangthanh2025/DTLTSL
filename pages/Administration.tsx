



import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, deleteDoc, addDoc, updateDoc } from 'firebase/firestore';
import { UserData, Department, Title, GeminiKey } from '../App';
import PencilIcon from '../components/icons/PencilIcon';
import TrashIcon from '../components/icons/TrashIcon';
import PlusIcon from '../components/icons/PlusIcon';
import UserAddModal from '../components/UserAddModal';
import UserEditModal from '../components/UserEditModal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';

interface AdministrationProps {
    departments: Department[];
    titles: Title[];
    onKeysUpdate: () => void;
}

const roleNames: { [key: string]: string } = {
    admin: 'Quản trị viên',
    user: 'Nhân viên',
    reporter: 'Báo cáo viên',
    reporter_user: 'Nhân viên & Báo cáo',
};

const Administration: React.FC<AdministrationProps> = ({ departments, titles, onKeysUpdate }) => {
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


    const departmentMap = new Map(departments.map(dept => [dept.id, dept.name]));
    const titleMap = new Map(titles.map(title => [title.id, title.name]));

    useEffect(() => {
        const fetchAllData = async () => {
            setLoading(true);
            setSettingsLoading(true);
            setKeyLoading(true);
            try {
                // Fetch Users
                const usersCollection = collection(db, 'Users');
                const userSnapshot = await getDocs(usersCollection);
                const userList = userSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserData));
                setUsers(userList);

                // Fetch Settings
                const settingsCollection = collection(db, 'Settings');
                const settingsSnapshot = await getDocs(settingsCollection);
                if (!settingsSnapshot.empty) {
                    const settingsDoc = settingsSnapshot.docs[0];
                    const data = settingsDoc.data();
                    setSettingsDocId(settingsDoc.id);
                    setComplianceStartYear(data.complianceStartYear?.toString() || '');
                    setComplianceEndYear(data.complianceEndYear?.toString() || '');
                } else {
                    const currentYear = new Date().getFullYear().toString();
                    setComplianceStartYear(currentYear);
                    console.warn("Settings document not found. A new one may be created on save.");
                }

                 // Fetch Gemini Keys
                const keysCollection = collection(db, 'KeyGemini');
                const keysSnapshot = await getDocs(keysCollection);
                const keyList = keysSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GeminiKey));
                setGeminiKeys(keyList);

            } catch (err) {
                console.error("Error fetching data: ", err);
                setError('Không thể tải dữ liệu.');
            } finally {
                setLoading(false);
                setSettingsLoading(false);
                setKeyLoading(false);
            }
        };

        fetchAllData();
    }, []);

    const filteredUsers = useMemo(() => {
        return users.filter(user => 
            user.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [users, searchTerm]);

    const handleAddUser = async (newUserData: Omit<UserData, 'id'>) => {
        try {
            const usersCollection = collection(db, 'Users');
            const docRef = await addDoc(usersCollection, newUserData);
            const newUserWithId = { ...newUserData, id: docRef.id } as UserData;
            setUsers(prev => [...prev, newUserWithId]);
            setIsAddModalOpen(false);
        } catch (err) {
            console.error("Error adding user: ", err);
        }
    };

    const handleUpdateUser = async (updatedData: Partial<UserData>) => {
        if (!editingUser) return;
        try {
            const userDocRef = doc(db, 'Users', editingUser.id);
            await updateDoc(userDocRef, updatedData);
            setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...updatedData } : u));
            setEditingUser(null);
        } catch (err) {
            console.error("Error updating user: ", err);
        }
    };

    const handleDeleteUser = async () => {
        if (!deletingUser) return;
        try {
            const userDocRef = doc(db, 'Users', deletingUser.id);
            await deleteDoc(userDocRef);
            setUsers(prev => prev.filter(u => u.id !== deletingUser.id));
            setDeletingUser(null);
        } catch (err) {
            console.error("Error deleting user: ", err);
        }
    };

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaveStatus('saving');
        setSettingsError(null);
        try {
            const startYear = parseInt(complianceStartYear, 10);
            const endYear = parseInt(complianceEndYear, 10);

            if (isNaN(startYear) || isNaN(endYear) || startYear < 2000 || startYear > 2100 || endYear < 2000 || endYear > 2100) {
                 throw new Error("Năm bắt đầu hoặc kết thúc không hợp lệ.");
            }
            if (endYear < startYear) {
                throw new Error("Năm kết thúc không được nhỏ hơn năm bắt đầu.");
            }

            const settingsData = { 
                complianceStartYear: startYear,
                complianceEndYear: endYear
            };

            if (settingsDocId) {
                const settingsDocRef = doc(db, 'Settings', settingsDocId);
                await updateDoc(settingsDocRef, settingsData);
            } else {
                const settingsCollection = collection(db, 'Settings');
                const newDocRef = await addDoc(settingsCollection, settingsData);
                setSettingsDocId(newDocRef.id);
            }
            
            setSaveStatus('success');
            setTimeout(() => setSaveStatus('idle'), 2000); 
        } catch (err) {
            console.error("Error saving settings: ", err);
            setSettingsError(err instanceof Error ? err.message : "Lỗi không xác định.");
            setSaveStatus('error');
            setTimeout(() => setSaveStatus('idle'), 4000);
        }
    };

    const handleAddKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newKeyInput.trim()) return;
        try {
            const keysCollection = collection(db, 'KeyGemini');
            const docRef = await addDoc(keysCollection, { key: newKeyInput.trim() });
            setGeminiKeys(prev => [...prev, { id: docRef.id, key: newKeyInput.trim() }]);
            setNewKeyInput('');
            onKeysUpdate(); // Refresh app-wide key
        } catch (err) {
            console.error("Error adding Gemini Key:", err);
        }
    };

    const handleDeleteKey = async () => {
        if (!deletingKey) return;
        try {
            const keyDocRef = doc(db, 'KeyGemini', deletingKey.id);
            await deleteDoc(keyDocRef);
            setGeminiKeys(prev => prev.filter(k => k.id !== deletingKey.id));
            setDeletingKey(null);
            onKeysUpdate(); // Refresh app-wide key
        } catch (err) {
            console.error("Error deleting Gemini Key:", err);
        }
    };

    const maskKey = (key: string) => {
        if (key.length < 16) return '***';
        return `${key.substring(0, 8)}...${key.substring(key.length - 8)}`;
    };

    const renderUserManagement = () => {
        if (loading) return <div className="text-center p-8">Đang tải danh sách người dùng...</div>;
        if (error) return <div className="text-center p-8 text-red-600">{error}</div>;

        return (
             <div className="bg-white p-6 rounded-lg shadow-md mt-6">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                    <h3 className="text-lg font-semibold text-teal-700">Quản lý người dùng</h3>
                     <input
                        type="text"
                        placeholder="Tìm kiếm theo họ tên..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full sm:w-1/3 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-teal-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-teal-700 transition-colors w-full sm:w-auto"
                    >
                        <PlusIcon className="h-5 w-5" />
                        <span>Thêm người dùng</span>
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white">
                        <thead className="bg-gray-50">
                            <tr>
                                {['#', 'Tên đăng nhập', 'Họ tên', 'Khoa/Phòng', 'Chức danh', 'Vai trò', 'Trạng thái', 'Hành động'].map(header => (
                                    <th key={header} className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                                        {header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filteredUsers.map((user, index) => (
                                <tr key={user.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-base text-gray-900">{index + 1}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-base text-gray-500">{user.username}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-base font-medium text-gray-900">{user.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-base text-gray-500">{departmentMap.get(user.departmentId) || 'Chưa cập nhật'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-base text-gray-500">{titleMap.get(user.titleId) || 'Chưa cập nhật'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-base text-gray-500">{roleNames[user.role] || user.role}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-base">
                                        <span className={`px-2 inline-flex text-sm leading-5 font-semibold rounded-full ${user.status ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {user.status ? 'Hoạt động' : 'Vô hiệu hóa'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-base font-medium">
                                        <button onClick={() => setEditingUser(user)} className="text-teal-600 hover:text-teal-900 mr-4">
                                            <PencilIcon className="h-5 w-5" />
                                        </button>
                                        <button onClick={() => setDeletingUser(user)} className="text-red-600 hover:text-red-900">
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )
    }

    const renderSettingsTab = () => {
        if (settingsLoading) return <div className="text-center p-8">Đang tải cài đặt...</div>;
        
        return (
            <div className="bg-white p-6 rounded-lg shadow-md mt-6 max-w-2xl">
                <form onSubmit={handleSaveSettings}>
                    <h3 className="text-lg font-semibold text-gray-800">Cài đặt chu kỳ tuân thủ</h3>
                    <p className="text-base text-gray-500 mt-1 mb-4">
                        Bạn hãy nhập năm bắt đầu và kết thúc chu kỳ để phần mềm thống kê, báo cáo đúng chu kỳ bạn đã thiết lập.
                    </p>
                    <div className="flex items-end gap-4">
                        <div>
                            <label htmlFor="complianceStartYear" className="block text-base font-medium text-gray-700">
                                Năm bắt đầu chu kỳ
                            </label>
                            <input
                                type="number"
                                id="complianceStartYear"
                                value={complianceStartYear}
                                onChange={(e) => setComplianceStartYear(e.target.value)}
                                className="mt-1 w-40 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500"
                                placeholder="YYYY"
                                min="2000"
                                max="2100"
                            />
                        </div>
                        <div>
                            <label htmlFor="complianceEndYear" className="block text-base font-medium text-gray-700">
                                Năm kết thúc chu kỳ
                            </label>
                            <input
                                type="number"
                                id="complianceEndYear"
                                value={complianceEndYear}
                                onChange={(e) => setComplianceEndYear(e.target.value)}
                                className="mt-1 w-40 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500"
                                placeholder="YYYY"
                                min="2000"
                                max="2100"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={saveStatus === 'saving'}
                            className="bg-teal-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-teal-700 transition-colors disabled:bg-teal-400 h-10"
                        >
                            {saveStatus === 'saving' ? 'Đang lưu...' : 'Lưu thay đổi'}
                        </button>
                    </div>
                     {saveStatus === 'success' && <p className="text-base text-green-600 mt-2">Đã lưu thay đổi thành công!</p>}
                     {saveStatus === 'error' && <p className="text-base text-red-600 mt-2">{settingsError || 'Lưu thất bại. Vui lòng thử lại.'}</p>}
                </form>
            </div>
        );
    };
    
    const renderKeyManagement = () => {
        if (keyLoading) return <div className="text-center p-8">Đang tải danh sách API key...</div>;
        return (
            <div className="bg-white p-6 rounded-lg shadow-md mt-6 max-w-3xl">
                <h3 className="text-lg font-semibold text-gray-800">Quản lý Gemini API Key</h3>
                <p className="text-base text-gray-500 mt-1 mb-4">
                    Thêm và quản lý các API key để sử dụng cho tính năng AI. Ứng dụng sẽ tự động sử dụng key đầu tiên trong danh sách.
                </p>
                <form onSubmit={handleAddKey} className="flex items-center gap-3 mb-6">
                    <input
                        type="text"
                        value={newKeyInput}
                        onChange={(e) => setNewKeyInput(e.target.value)}
                        placeholder="Dán API Key mới vào đây"
                        className="flex-grow px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <button
                        type="submit"
                        className="bg-teal-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-teal-700 transition-colors"
                    >
                        Thêm Key
                    </button>
                </form>

                <div className="space-y-2">
                    {geminiKeys.map(k => (
                        <div key={k.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                            <span className="font-mono text-gray-700">{maskKey(k.key)}</span>
                            <button onClick={() => setDeletingKey(k)} className="text-red-500 hover:text-red-700">
                                <TrashIcon className="h-5 w-5" />
                            </button>
                        </div>
                    ))}
                    {geminiKeys.length === 0 && (
                        <p className="text-gray-500 text-center py-4">Chưa có API key nào được thêm.</p>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div>
            <h1 className="text-2xl font-bold text-teal-800 mb-4">Quản trị hệ thống</h1>
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <button 
                        onClick={() => setActiveTab('userManagement')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-base ${activeTab === 'userManagement' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                    >
                        Quản lý người dùng
                    </button>
                    <button 
                        onClick={() => setActiveTab('geminiKeyManagement')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-base ${activeTab === 'geminiKeyManagement' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                    >
                        Quản lý Key Gemini
                    </button>
                    <button 
                        onClick={() => setActiveTab('settings')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-base ${activeTab === 'settings' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                    >
                        Cài đặt
                    </button>
                </nav>
            </div>
            
            {activeTab === 'userManagement' && renderUserManagement()}
            {activeTab === 'geminiKeyManagement' && renderKeyManagement()}
            {activeTab === 'settings' && renderSettingsTab()}


            {isAddModalOpen && (
                <UserAddModal
                    departments={departments}
                    titles={titles}
                    onAdd={handleAddUser}
                    onClose={() => setIsAddModalOpen(false)}
                />
            )}

            {editingUser && (
                <UserEditModal
                    user={editingUser}
                    departments={departments}
                    titles={titles}
                    onSave={handleUpdateUser}
                    onClose={() => setEditingUser(null)}
                />
            )}
            
            {deletingUser && (
                <ConfirmDeleteModal
                    message={`Bạn có chắc chắn muốn xóa người dùng "${deletingUser.name}"? Hành động này không thể hoàn tác.`}
                    onConfirm={handleDeleteUser}
                    onClose={() => setDeletingUser(null)}
                />
            )}

             {deletingKey && (
                <ConfirmDeleteModal
                    message={`Bạn có chắc chắn muốn xóa API Key "${maskKey(deletingKey.key)}"?`}
                    onConfirm={handleDeleteKey}
                    onClose={() => setDeletingKey(null)}
                />
            )}
        </div>
    );
};

export default Administration;