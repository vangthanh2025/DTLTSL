import React, { useState, useEffect, useMemo, ReactNode } from 'react';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import PrintIcon from '../components/icons/PrintIcon';

// Interfaces
interface ComplianceReportRow { id: string; name: string; title: string; totalCredits: number; requirement: number; status: 'Đã đạt' | 'Chưa đạt'; }
interface SummaryReportRow { id: string; name: string; title: string; department: string; totalCredits: number; departmentId?: string; titleId?: string; }
interface DetailedReportRow { id: string; name: string; certificates: { name: string; credits: number }[]; totalCredits: number; }
type ReportRow = ComplianceReportRow | SummaryReportRow | DetailedReportRow;

interface SharedReportData {
    reportTitle: string;
    reportType: string;
    reportHeaders: string;
    reportData: string;
    createdAt: { toDate: () => Date };
    expiresAt: { toDate: () => Date };
    createdBy: string;
}

interface SharedReportViewProps {
    shareId: string;
}

const SharedReportView: React.FC<SharedReportViewProps> = ({ shareId }) => {
    const [report, setReport] = useState<SharedReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchReport = async () => {
            if (!shareId) {
                setError("Không tìm thấy ID báo cáo.");
                setLoading(false);
                return;
            }

            try {
                const reportRef = doc(db, 'SharedReports', shareId);
                const reportSnap = await getDoc(reportRef);

                if (!reportSnap.exists()) {
                    setError("Báo cáo không tồn tại hoặc đã bị xóa.");
                    setLoading(false);
                    return;
                }

                const data = reportSnap.data() as SharedReportData;

                if (new Date() > data.expiresAt.toDate()) {
                    setError("Liên kết báo cáo này đã hết hạn.");
                    setLoading(false);
                    return;
                }
                
                setReport(data);
            } catch (err) {
                console.error(err);
                setError("Đã xảy ra lỗi khi tải báo cáo.");
            } finally {
                setLoading(false);
            }
        };

        fetchReport();
    }, [shareId]);

    const { headers, data, reportType } = useMemo(() => {
        if (!report) return { headers: {}, data: [], reportType: '' };
        try {
            return {
                headers: JSON.parse(report.reportHeaders),
                data: JSON.parse(report.reportData),
                reportType: report.reportType,
            };
        } catch (e) {
            setError("Lỗi định dạng dữ liệu báo cáo.");
            return { headers: {}, data: [], reportType: '' };
        }
    }, [report]);

    const renderCellContent = (row: ReportRow, key: string): ReactNode => {
        const value = row[key as keyof ReportRow];
        if (key === 'status' && 'status' in row) {
            const status = row.status;
            const isCompliant = status === 'Đã đạt';
            return (<span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${isCompliant ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{status}</span>);
        }
        if (typeof value === 'string' || typeof value === 'number') return value;
        return 'N/A';
    };

    const renderReportTable = () => {
        if (!data || data.length === 0) return <p className="text-center text-gray-500 py-8">Không có dữ liệu trong báo cáo.</p>;

        if (reportType === 'detail') {
            return (
                <table className="min-w-full bg-white border border-gray-300 border-collapse">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider border border-gray-300 w-12">STT</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider border border-gray-300">Họ và tên</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider border border-gray-300">Tên chứng chỉ</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider border border-gray-300 w-24">Số tiết</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider border border-gray-300 w-24">Tổng tiết</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(data as DetailedReportRow[]).flatMap((userRow, userIndex) => 
                            userRow.certificates.map((cert, certIndex) => (
                                <tr key={`${userRow.id}-${certIndex}`} className="hover:bg-gray-50">
                                    {certIndex === 0 && ( <> <td rowSpan={userRow.certificates.length} className="px-4 py-3 border border-gray-300 text-center align-top">{userIndex + 1}</td> <td rowSpan={userRow.certificates.length} className="px-4 py-3 border border-gray-300 align-top">{userRow.name}</td> </> )}
                                    <td className="px-4 py-3 border border-gray-300">{cert.name}</td>
                                    <td className="px-4 py-3 border border-gray-300 text-center">{cert.credits}</td>
                                    {certIndex === 0 && ( <td rowSpan={userRow.certificates.length} className="px-4 py-3 border border-gray-300 text-center align-top">{userRow.totalCredits}</td> )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            );
        }

        return (
            <table className="min-w-full bg-white border border-gray-300 border-collapse">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider border border-gray-300 w-12">STT</th>
                        {Object.values(headers).map((value: any, index) => <th key={index} className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider border border-gray-300">{value}</th>)}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {data.map((row: any, index) => (
                        <tr key={row.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 border border-gray-300 text-center">{index + 1}</td>
                            {Object.keys(headers).map(key => <td key={key} className="px-4 py-3 border border-gray-300 align-top">{renderCellContent(row, key)}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    };
    
    if (loading) return <div className="bg-slate-100 min-h-screen flex items-center justify-center"><div className="text-center p-12">Đang tải báo cáo...</div></div>;
    if (error) return <div className="bg-slate-100 min-h-screen flex items-center justify-center"><div className="text-center p-12 text-red-600 font-semibold">{error}</div></div>;
    if (!report) return null;

    return (
        <div className="bg-slate-100 font-sans min-h-screen">
            <div className="container mx-auto p-4 sm:p-6 md:p-8">
                <header className="mb-6">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-teal-800">{report.reportTitle}</h1>
                            <p className="text-gray-600 mt-1">Người tạo: {report.createdBy} | Ngày tạo: {report.createdAt.toDate().toLocaleString('vi-VN')}</p>
                            <p className="text-sm text-red-600">Hết hạn vào: {report.expiresAt.toDate().toLocaleString('vi-VN')}</p>
                        </div>
                        <button onClick={() => window.print()} className="no-print flex items-center gap-2 text-base bg-teal-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-teal-700 transition-colors">
                            <PrintIcon className="h-5 w-5" />
                            <span>In báo cáo</span>
                        </button>
                    </div>
                </header>
                <main id="report-content" className="bg-white p-6 rounded-lg shadow-md">
                    {renderReportTable()}
                </main>
                <footer className="text-center text-gray-500 mt-8 text-sm">
                    <p>Hệ thống Quản lý Đào tạo Liên tục</p>
                </footer>
            </div>
        </div>
    );
};

export default SharedReportView;