import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { UserData, Certificate, AppSettings, Department, Title } from '../App';
import Statistics from './Statistics';
import Reporting from './Reporting';
import Inspection from './Inspection';
import { deleteFromDrive, extractFileIdFromUrl } from '../utils/driveUploader';


interface ReportsProps {
    user: UserData;
    settings: AppSettings | null;
    departments: Department[];
    titles: Title[];
    geminiApiKey: string | null;
}

const Reports: React.FC<ReportsProps> = ({ user, settings, departments, titles, geminiApiKey }) => {
    const [users, setUsers] = useState<UserData[]>([]);
    const [certificates, setCertificates] = useState<Certificate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('Báo cáo');

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const usersPromise = getDocs(collection(db, 'Users'));
                const certsPromise = getDocs(collection(db, 'Certificates'));
                const [userSnapshot, certsSnapshot] = await Promise.all([usersPromise, certsPromise]);
                
                const userList = userSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserData));
                const certsList = certsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Certificate));
                
                setUsers(userList);
                setCertificates(certsList);
            } catch (err) {
                console.error("Error fetching report data:", err);
                setError("Không thể tải dữ liệu báo cáo.");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleCertificateUpdate = async (updatedData: Partial<Certificate>, originalCert: Certificate) => {
        // Check if the image was replaced and delete the old one from Drive
        const oldImageUrl = originalCert.imageUrl;
        const newImageUrl = updatedData.imageUrl;
        if (newImageUrl && oldImageUrl && newImageUrl !== oldImageUrl) {
            const oldFileId = extractFileIdFromUrl(oldImageUrl);
            if (oldFileId) {
                try {
                    await deleteFromDrive(oldFileId);
                } catch (deleteError) {
                    // Log the error but don't block the update
                    console.error("Failed to delete old image from Drive, but proceeding with update:", deleteError);
                }
            }
        }

        try {
            const certDocRef = doc(db, 'Certificates', originalCert.id);
            const dataToSave = { ...updatedData, updatedAt: new Date() };
            await updateDoc(certDocRef, dataToSave as any);

            const updatedCertForState: Certificate = {
                ...originalCert,
                ...updatedData,
                date: { toDate: () => updatedData.date as unknown as Date },
                updatedAt: { toDate: () => dataToSave.updatedAt },
            };

            setCertificates(prev => 
                prev.map(c => c.id === originalCert.id ? updatedCertForState : c)
            );
        } catch (err) {
            console.error("Error updating certificate from Reports page:", err);
            // Optionally, set an error state to show in the UI
        }
    };

    const handleCertificateDelete = async (certId: string) => {
        try {
            const certToDelete = certificates.find(c => c.id === certId);
            if (certToDelete && certToDelete.imageUrl) {
                const fileId = extractFileIdFromUrl(certToDelete.imageUrl);
                if (fileId) {
                    await deleteFromDrive(fileId);
                }
            }

            const certDocRef = doc(db, 'Certificates', certId);
            await deleteDoc(certDocRef);
            setCertificates(prevCerts => prevCerts.filter(c => c.id !== certId));
        } catch (err) {
            console.error("Error deleting certificate from Reports page:", err);
        }
    };
    
    const renderContent = () => {
        if (loading) return <div className="flex items-center justify-center p-8"><p>Đang tải dữ liệu...</p></div>;
        if (error) return <div className="flex items-center justify-center p-8"><p className="text-red-600">{error}</p></div>;

        switch(activeTab) {
            case 'Thống kê':
                return <Statistics users={users} certificates={certificates} settings={settings} />;
            case 'Báo cáo':
                return <Reporting users={users} certificates={certificates} departments={departments} titles={titles} settings={settings} />;
            case 'Kiểm tra':
                return <Inspection 
                            currentUser={user}
                            allUsers={users}
                            allCertificates={certificates}
                            departments={departments}
                            titles={titles}
                            onCertificateUpdate={handleCertificateUpdate}
                            onCertificateDelete={handleCertificateDelete}
                            geminiApiKey={geminiApiKey}
                       />;
            default:
                return null;
        }
    };

    return (
        <div>
            <h1 className="text-2xl font-bold text-teal-800 mb-4">Báo cáo & Thống kê</h1>

            <div className="border-b border-gray-200 mb-4">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <button 
                        onClick={() => setActiveTab('Thống kê')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-base ${activeTab === 'Thống kê' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                    >
                        Thống kê
                    </button>
                     <button 
                        onClick={() => setActiveTab('Báo cáo')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-base ${activeTab === 'Báo cáo' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                    >
                        Báo cáo
                    </button>
                    <button 
                        onClick={() => setActiveTab('Kiểm tra')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-base ${activeTab === 'Kiểm tra' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                    >
                        Kiểm tra
                    </button>
                </nav>
            </div>
            
            {renderContent()}
        </div>
    );
};

export default Reports;