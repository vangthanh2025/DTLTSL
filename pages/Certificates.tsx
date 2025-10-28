import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { UserData, Certificate } from '../App';
import GridViewIcon from '../components/icons/GridViewIcon';
import ListViewIcon from '../components/icons/ListViewIcon';
import ChartViewIcon from '../components/icons/ChartViewIcon';
import CertificateIcon from '../components/icons/CertificateIcon';
import ImagePreviewModal from '../components/ImagePreviewModal';
import PencilIcon from '../components/icons/PencilIcon';
import TrashIcon from '../components/icons/TrashIcon';
import CertificateEditModal from '../components/CertificateEditModal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import PlusIcon from '../components/icons/PlusIcon';
import CertificateAddModal from '../components/CertificateAddModal';
import { transformGoogleDriveUrl, deleteFromDrive, extractFileIdFromUrl } from '../utils/driveUploader';


interface CertificatesProps {
    user: UserData;
    geminiApiKey: string | null;
}

const formatDate = (dateObj: { toDate: () => Date }) => {
    if (!dateObj) return '';
    return dateObj.toDate().toLocaleDateString('vi-VN');
};

const normalizeText = (text: string): string => {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
};

const Certificates: React.FC<CertificatesProps> = ({ user, geminiApiKey }) => {
    const [certificates, setCertificates] = useState<Certificate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedYear, setSelectedYear] = useState('all');
    const [viewMode, setViewMode] = useState('grid'); // 'grid', 'list', 'chart'
    const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
    const [editingCertificate, setEditingCertificate] = useState<Certificate | null>(null);
    const [deletingCertificate, setDeletingCertificate] = useState<Certificate | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);


    useEffect(() => {
        const fetchCertificates = async () => {
            if (!user?.id) {
                setError('Không thể xác thực người dùng.');
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                const certsCollection = collection(db, 'Certificates');
                const q = query(certsCollection, where('userId', '==', user.id));
                const certsSnapshot = await getDocs(q);
                const certsList = certsSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as Certificate));

                certsList.sort((a, b) => b.date.toDate().getTime() - a.date.toDate().getTime());

                setCertificates(certsList);
            } catch (err: any) {
                console.error("Error fetching certificates: ", err);
                setError('Không thể tải dữ liệu chứng chỉ. Vui lòng thử lại. Lỗi: ' + err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchCertificates();
    }, [user.id]);

    const filteredCertificates = useMemo(() => {
        const normalizedSearchTerm = normalizeText(searchTerm);
        return certificates.filter(cert => {
            const certDate = cert.date?.toDate();
            if (!certDate) return false;
            
            const certYear = certDate.getFullYear().toString();
            const matchesYear = selectedYear === 'all' || certYear === selectedYear;
            const matchesSearch = normalizeText(cert.name).includes(normalizedSearchTerm);
            
            return matchesYear && matchesSearch;
        });
    }, [certificates, searchTerm, selectedYear]);
    
    const totalCredits = useMemo(() => {
        return filteredCertificates.reduce((sum, cert) => sum + (cert.credits || 0), 0);
    }, [filteredCertificates]);

    const yearOptions = useMemo(() => {
        const years = new Set(certificates.map(c => c.date.toDate().getFullYear().toString()));
        return ['all', ...Array.from(years).sort((a, b) => Number(b) - Number(a))];
    }, [certificates]);

    const handleUpdateCertificate = async (updatedData: Partial<Certificate>) => {
        if (!editingCertificate) return;

        // Check if the image was replaced and delete the old one from Drive
        const oldImageUrl = editingCertificate.imageUrl;
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
            const certDocRef = doc(db, 'Certificates', editingCertificate.id);
            const dataWithTimestamp = { ...updatedData, updatedAt: new Date() };
            await updateDoc(certDocRef, dataWithTimestamp as any);
            
            const newDateFromUpdate = dataWithTimestamp.date as unknown as Date;

            const updatedCertForState = { 
                ...editingCertificate, 
                ...(dataWithTimestamp as any),
                date: newDateFromUpdate ? { toDate: () => newDateFromUpdate } : editingCertificate.date,
                updatedAt: { toDate: () => dataWithTimestamp.updatedAt },
            };

            setCertificates(prevCerts => 
                prevCerts.map(c => c.id === editingCertificate.id ? (updatedCertForState as Certificate) : c)
            );
            setEditingCertificate(null);
        } catch (err) {
            console.error("Error updating certificate:", err);
        }
    };

    const handleAddCertificate = async (newData: Partial<Certificate>) => {
        try {
            const dataToSave = {
                ...newData,
                userId: user.id,
                updatedAt: new Date(),
            };
            const certsCollection = collection(db, 'Certificates');
            const docRef = await addDoc(certsCollection, dataToSave as any);

            // FIX: Correctly cast date from modal. `dataToSave.date` is a Date object at runtime,
            // so we use `as unknown as Date` to satisfy TypeScript while creating the
            // Firestore-like object for our local state.
            const newCert: Certificate = {
                id: docRef.id,
                name: newData.name || '',
                credits: newData.credits || 0,
                date: { toDate: () => dataToSave.date as unknown as Date },
                imageUrl: newData.imageUrl || '',
                userId: dataToSave.userId,
                updatedAt: { toDate: () => dataToSave.updatedAt },
            };

            setCertificates(prev => [newCert, ...prev].sort((a,b) => b.date.toDate().getTime() - a.date.toDate().getTime()));
            setIsAddModalOpen(false);

        } catch (err) {
            console.error("Error adding certificate:", err);
        }
    };
    
    const handleDeleteCertificate = async () => {
        if (!deletingCertificate) return;
        try {
            if (deletingCertificate.imageUrl) {
                const fileId = extractFileIdFromUrl(deletingCertificate.imageUrl);
                if (fileId) {
                    await deleteFromDrive(fileId);
                }
            }
            const certDocRef = doc(db, 'Certificates', deletingCertificate.id);
            await deleteDoc(certDocRef);
            setCertificates(prevCerts => prevCerts.filter(c => c.id !== deletingCertificate.id));
            setDeletingCertificate(null);
        } catch (err) {
            console.error("Error deleting certificate:", err);
        }
    };

    const renderContent = () => {
        if (loading) {
            return <div className="text-center text-gray-500">Đang tải dữ liệu chứng chỉ...</div>;
        }
        if (error) {
            return <div className="text-center text-red-600">{error}</div>;
        }
        if (filteredCertificates.length === 0) {
            return <div className="text-center text-gray-500">Không tìm thấy chứng chỉ nào phù hợp.</div>;
        }

        if (viewMode === 'grid') {
            return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full">
                    {filteredCertificates.map((cert, index) => (
                        <div 
                            key={cert.id} 
                            className="bg-white border rounded-lg shadow-sm overflow-hidden transform hover:-translate-y-1 transition-transform duration-200 flex flex-col group relative"
                        >
                             <div className="absolute top-2 right-2 z-10 flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setEditingCertificate(cert); }}
                                    className="bg-white/80 backdrop-blur-sm rounded-full p-1.5 text-gray-700 hover:bg-white hover:text-teal-600 shadow"
                                >
                                    <PencilIcon className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setDeletingCertificate(cert); }}
                                    className="bg-white/80 backdrop-blur-sm rounded-full p-1.5 text-gray-700 hover:bg-white hover:text-red-600 shadow"
                                >
                                    <TrashIcon className="h-4 w-4" />
                                </button>
                            </div>
                            <div onClick={() => setSelectedImageIndex(index)} className="cursor-pointer">
                                <div className="bg-gray-200 h-40 flex items-center justify-center">
                                    {cert.imageUrl ? (
                                        <img
                                            src={transformGoogleDriveUrl(cert.imageUrl)}
                                            alt={`Hình ảnh chứng chỉ ${cert.name}`}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <CertificateIcon className="h-16 w-16 text-gray-400" />
                                    )}
                                </div>
                                <div className="p-4 flex flex-col flex-grow">
                                    <h3 className="font-bold text-gray-800 text-base flex-grow" title={cert.name}>{cert.name}</h3>
                                    <div className="mt-2 text-sm text-gray-500">
                                        <p>Ngày cấp: {formatDate(cert.date)}</p>
                                        <p>Số tiết: <span className="font-semibold text-teal-700">{cert.credits}</span></p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )
        }
        
        if (viewMode === 'list') {
             return (
                <div className="w-full">
                    <div className="relative pl-6">
                        {/* The vertical line */}
                        <div className="absolute top-0 left-0 h-full w-0.5 bg-gray-200" aria-hidden="true"></div>

                        {/* Timeline items */}
                        <ul className="space-y-6">
                        {filteredCertificates.map((cert, index) => (
                            <li key={cert.id} className="relative group">
                            {/* Dot */}
                            <div className="absolute left-0 top-1 transform -translate-x-1/2 w-4 h-4 bg-teal-500 rounded-full border-4 border-white"></div>
                            
                            {/* Content Card */}
                            <div 
                                className="p-4 bg-white rounded-lg shadow-md border border-gray-200 transition-shadow hover:shadow-lg ml-6"
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex-1 cursor-pointer" onClick={() => setSelectedImageIndex(index)}>
                                        <h3 className="font-semibold text-gray-800">{cert.name}</h3>
                                        <p className="text-base text-gray-500 mt-2">Ngày cấp: {formatDate(cert.date)}</p>
                                        <p className="text-base text-gray-500">Số tiết: <span className="font-semibold">{cert.credits}</span></p>
                                    </div>
                                     <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => setEditingCertificate(cert)}
                                            className="p-1.5 text-gray-500 hover:text-teal-600"
                                        >
                                            <PencilIcon className="h-5 w-5" />
                                        </button>
                                        <button
                                            onClick={() => setDeletingCertificate(cert)}
                                            className="p-1.5 text-gray-500 hover:text-red-600"
                                        >
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                            </li>
                        ))}
                        </ul>
                    </div>
                </div>
            );
        }

        if (viewMode === 'chart') {
            const chartData: Record<string, number> = {};
            for (const cert of filteredCertificates) {
                const year = cert.date.toDate().getFullYear().toString();
                // FIX: Add fallback for credits to prevent NaN if a certificate is missing this value.
                chartData[year] = (chartData[year] || 0) + (cert.credits || 0);
            }
        
            const sortedYears = Object.keys(chartData).sort((a, b) => Number(a) - Number(b));
            const maxCredits = Math.max(0, ...Object.values(chartData));
        
            return (
                <div className="w-full h-full flex flex-col items-center justify-center p-4">
                    <h3 className="text-lg font-semibold text-teal-700 mb-4">Tổng số tiết tích lũy theo năm</h3>
                    <div className="w-full flex-grow flex justify-center items-end gap-4 px-4 border-b border-gray-300 min-h-[250px]">
                        {sortedYears.map(year => (
                            <div key={year} className="flex flex-col items-center flex-1 max-w-24 h-full justify-end">
                                <div className="text-sm font-bold text-teal-800 mb-1">{chartData[year]}</div>
                                <div 
                                    className="w-full bg-teal-500 hover:bg-teal-600 transition-all duration-300 rounded-t-md" 
                                    style={{ height: maxCredits > 0 ? `${(chartData[year] / maxCredits) * 100}%` : '0%' }}
                                    title={`${year}: ${chartData[year]} tiết`}
                                ></div>
                                <div className="mt-2 text-sm font-medium text-gray-600">{year}</div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        return null;
    };


    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
                <div className="flex items-center gap-4">
                     <h1 className="text-2xl font-bold text-teal-800">Chứng chỉ của bạn</h1>
                     <button 
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-teal-600 text-white font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-2 hover:bg-teal-700 transition-colors text-base"
                    >
                        <PlusIcon className="h-5 w-5" />
                        <span>Thêm mới</span>
                    </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:gap-4">
                    <div className="flex items-center gap-2">
                        <label htmlFor="search-cert" className="text-sm font-medium text-gray-700 sr-only">Tìm kiếm:</label>
                        <input
                            id="search-cert"
                            type="text"
                            placeholder="Tìm theo tên chứng chỉ..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                         <label htmlFor="year-filter" className="text-sm font-medium text-gray-700 sr-only">Năm:</label>
                        <select
                            id="year-filter"
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value)}
                             className="w-full md:w-auto px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        >
                            {yearOptions.map(year => (
                                <option key={year} value={year}>
                                    {year === 'all' ? 'Tất cả (Năm)' : year}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">Tổng tiết:</span>
                        <span className="bg-gray-200 text-gray-800 font-bold px-3 py-1 rounded-md">{totalCredits}</span>
                    </div>
                     <div className="flex items-center gap-1 bg-gray-200 p-1 rounded-md">
                        <button 
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded ${viewMode === 'grid' ? 'bg-white text-teal-600 shadow' : 'text-gray-600 hover:bg-gray-300'}`}
                            aria-label="Grid View"
                        >
                            <GridViewIcon className="h-5 w-5" />
                        </button>
                         <button 
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded ${viewMode === 'list' ? 'bg-white text-teal-600 shadow' : 'text-gray-600 hover:bg-gray-300'}`}
                            aria-label="List View"
                        >
                            <ListViewIcon className="h-5 w-5" />
                        </button>
                         <button 
                            onClick={() => setViewMode('chart')}
                            className={`p-2 rounded ${viewMode === 'chart' ? 'bg-white text-teal-600 shadow' : 'text-gray-600 hover:bg-gray-300'}`}
                            aria-label="Chart View"
                        >
                            <ChartViewIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </div>

            <div className={`bg-white p-4 md:p-8 rounded-lg shadow-md min-h-[400px] ${ (loading || error || filteredCertificates.length === 0 || viewMode === 'chart' ) ? 'flex items-center justify-center' : ''}`}>
                {renderContent()}
            </div>
            
            {selectedImageIndex !== null && (
                <ImagePreviewModal
                    images={filteredCertificates}
                    initialIndex={selectedImageIndex}
                    onClose={() => setSelectedImageIndex(null)}
                />
            )}

            {editingCertificate && (
                <CertificateEditModal
                    user={user}
                    certificate={editingCertificate}
                    onSave={handleUpdateCertificate}
                    onClose={() => setEditingCertificate(null)}
                    geminiApiKey={geminiApiKey}
                />
            )}
            
            {isAddModalOpen && (
                <CertificateAddModal
                    user={user}
                    onAdd={handleAddCertificate}
                    onClose={() => setIsAddModalOpen(false)}
                    geminiApiKey={geminiApiKey}
                />
            )}

            {deletingCertificate && (
                 <ConfirmDeleteModal
                    message={`Bạn có chắc chắn muốn xóa chứng chỉ "${deletingCertificate.name}" không?`}
                    onConfirm={handleDeleteCertificate}
                    onClose={() => setDeletingCertificate(null)}
                />
            )}
        </div>
    );
};

export default Certificates;