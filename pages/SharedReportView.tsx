import React, { useState, useEffect, useMemo, ReactNode, useRef } from 'react';
import { db } from '../firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import PrintIcon from '../components/icons/PrintIcon';
import CertificateDetailModal from '../components/CertificateDetailModal';
import { GoogleGenAI } from '@google/genai';
import AIAssistantIcon from '../components/icons/AIAssistantIcon';
import CloseIcon from '../components/icons/CloseIcon';
import SendIcon from '../components/icons/SendIcon';
import UserIcon from '../components/icons/UserIcon';


// Interfaces
interface ComplianceReportRow { id: string; name: string; title: string; totalCredits: number; requirement: number; status: 'Đã đạt' | 'Chưa đạt'; }
interface SummaryReportRow { id: string; name: string; title: string; department: string; totalCredits: number; departmentId?: string; titleId?: string; }
interface DetailedReportRow { id: string; name: string; certificates: { name: string; credits: number }[]; totalCredits: number; }
interface SummaryWithDetailsRow {
    id: string;
    name: string;
    totalCredits: number;
    certificates: { name: string, credits: number }[];
}
type ReportRow = ComplianceReportRow | SummaryReportRow | DetailedReportRow | SummaryWithDetailsRow;

interface SharedReportData {
    reportTitle: string;
    reportType: string;
    reportHeaders: string;
    reportData: string;
    createdAt: { toDate: () => Date };
    expiresAt: { toDate: () => Date };
    createdBy: string;
    token?: string;
}

interface SharedReportViewProps {
    shareId: string;
}

const SharedReportView: React.FC<SharedReportViewProps> = ({ shareId }) => {
    const [report, setReport] = useState<SharedReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [detailModalUser, setDetailModalUser] = useState<SummaryWithDetailsRow | null>(null);

    // AI Assistant State
    const [geminiApiKey, setGeminiApiKey] = useState<string | null>(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [messages, setMessages] = useState<{ sender: 'user' | 'ai'; text: string }[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement | null>(null);


    useEffect(() => {
        const fetchReport = async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const urlToken = urlParams.get('token');

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

                if (data.token && data.token !== urlToken) {
                    setError("Truy cập trực tiếp qua liên kết không được phép. Vui lòng quét mã QR để xem báo cáo.");
                    setLoading(false);
                    return;
                }

                if (new Date() > data.expiresAt.toDate()) {
                    setError("Liên kết báo cáo này đã hết hạn.");
                    setLoading(false);
                    return;
                }
                
                setReport(data);

                // Hide token from URL after successful validation
                if (urlToken) {
                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.delete('token');
                    window.history.replaceState({}, document.title, newUrl.toString());
                }
            } catch (err) {
                console.error(err);
                setError("Đã xảy ra lỗi khi tải báo cáo.");
            } finally {
                setLoading(false);
            }
        };

        const fetchGeminiKey = async () => {
            try {
                const keyCollection = collection(db, 'KeyGemini');
                const keySnapshot = await getDocs(keyCollection);
                if (!keySnapshot.empty) {
                    const keyDoc = keySnapshot.docs[0];
                    setGeminiApiKey(keyDoc.data().key);
                } else {
                    console.warn("No Gemini API Key found in Firestore.");
                }
            } catch (error) {
                console.error("Error fetching Gemini API Key:", error);
            }
        };

        fetchReport();
        fetchGeminiKey();
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

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isAiLoading]);

    const formatResponse = (text: string) => {
        return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                   .replace(/\*(.*?)\*/g, '<em>$1</em>')
                   .replace(/\n/g, '<br />');
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userInput.trim() || isAiLoading || !report) return;

        const userMessage = { sender: 'user' as const, text: userInput };
        setMessages(prev => [...prev, userMessage]);
        setUserInput('');
        setIsAiLoading(true);

        if (!geminiApiKey) {
            const errorMessage = {
                sender: 'ai' as const,
                text: 'Lỗi: Gemini API Key chưa được cấu hình. Tính năng AI không khả dụng.',
            };
            setMessages((prev) => [...prev, errorMessage]);
            setIsAiLoading(false);
            return;
        }

        try {
            const ai = new GoogleGenAI({ apiKey: geminiApiKey });
            
            const prompt = `Bạn là một trợ lý AI chuyên nghiệp, nhiệm vụ của bạn là phân tích và trả lời các câu hỏi dựa trên dữ liệu báo cáo được cung cấp. Dữ liệu báo cáo ở định dạng JSON. Hãy trả lời một cách ngắn gọn, chính xác bằng tiếng Việt.
            
            Dữ liệu báo cáo cho "${report.reportTitle}":
            ${report.reportData}

            Câu hỏi của người dùng:
            "${userInput}"`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            const aiMessage = { sender: 'ai' as const, text: response.text };
            setMessages((prev) => [...prev, aiMessage]);
        } catch (error) {
            console.error('Gemini API error:', error);
            const errorMessage = {
                sender: 'ai' as const,
                text: 'Rất tiếc, đã xảy ra lỗi khi kết nối với trợ lý AI. Vui lòng thử lại sau.',
            };
            setMessages((prev) => [...prev, errorMessage]);
        } finally {
            setIsAiLoading(false);
        }
    };

    const renderCellContent = (row: ReportRow, key: string): ReactNode => {
        if (key === 'actions' && reportType === 'summary_with_details') {
            return (
                <button
                    onClick={() => setDetailModalUser(row as SummaryWithDetailsRow)}
                    className="text-teal-600 font-semibold hover:underline"
                >
                    Xem
                </button>
            );
        }

        const value = (row as any)[key];
        if (key === 'status' && 'status' in row) {
            const status = row.status;
            const isCompliant = status === 'Đã đạt';
            return (<span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${isCompliant ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{status}</span>);
        }
        if (typeof value === 'string' || typeof value === 'number') return value;
        return 'N/A';
    };

    const renderGroupedReport = (groupBy: 'department' | 'title') => {
        const groupHeaderLabel = groupBy === 'department' ? 'Khoa/Phòng' : 'Chức danh';
        const dataRows = data as SummaryReportRow[];
        
        const groupedData: { [key: string]: { rows: SummaryReportRow[], totalCredits: number } } = {};
    
        dataRows.forEach(row => {
            const groupName = groupBy === 'department' ? row.department : row.title;
            if (!groupName) return; // Skip if no group name
            if (!groupedData[groupName]) {
                groupedData[groupName] = { rows: [], totalCredits: 0 };
            }
            groupedData[groupName].rows.push(row);
            groupedData[groupName].totalCredits += row.totalCredits;
        });
    
        const sortedGroupNames = Object.keys(groupedData).sort((a, b) => a.localeCompare(b, 'vi'));
    
        return (
            <table className="min-w-full bg-white border border-gray-300 border-collapse">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider border border-gray-300 w-12">STT</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider border border-gray-300">Họ tên</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider border border-gray-300 w-32">Tổng số tiết</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedGroupNames.length === 0 && (
                        <tr>
                            <td colSpan={3} className="text-center py-4 text-gray-500">Không có dữ liệu.</td>
                        </tr>
                    )}
                    {sortedGroupNames.flatMap(groupName => {
                        const group = groupedData[groupName];
                        const groupRows = group.rows.map((row, index) => (
                            <tr key={row.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 border border-gray-300 text-center">{index + 1}</td>
                                <td className="px-4 py-3 border border-gray-300">{row.name}</td>
                                <td className="px-4 py-3 border border-gray-300 text-center">{row.totalCredits}</td>
                            </tr>
                        ));
    
                        return [
                            <tr key={`${groupName}-header`} className="bg-teal-50 sticky top-0">
                                <td colSpan={3} className="px-4 py-2 border border-gray-300 font-bold text-teal-800">{groupHeaderLabel}: {groupName}</td>
                            </tr>,
                            ...groupRows,
                            <tr key={`${groupName}-footer`} className="bg-gray-100">
                                <td colSpan={2} className="px-4 py-2 border border-gray-300 text-right font-bold">Tổng cộng</td>
                                <td className="px-4 py-2 border border-gray-300 text-center font-bold">{group.totalCredits}</td>
                            </tr>
                        ];
                    })}
                </tbody>
            </table>
        );
    };

    const renderReportTable = () => {
        if (!data || data.length === 0) return <p className="text-center text-gray-500 py-8">Không có dữ liệu trong báo cáo.</p>;

        if (reportType === 'department' || reportType === 'title_detail') {
            return renderGroupedReport(reportType === 'department' ? 'department' : 'title');
        }

        if (reportType === 'detail') {
            return (
              <>
                {/* Mobile View: Card-based Layout */}
                <div className="md:hidden space-y-4">
                    {(data as DetailedReportRow[]).map((userRow, userIndex) => (
                        <div key={userRow.id} className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
                            <div className="p-4 bg-slate-50 border-b">
                                <h3 className="font-bold text-lg text-teal-800">{userIndex + 1}. {userRow.name}</h3>
                                <p className="font-semibold text-gray-600">Tổng tiết: <span className="text-teal-700">{userRow.totalCredits}</span></p>
                            </div>
                            <ul className="divide-y divide-gray-200">
                                {userRow.certificates.map((cert, certIndex) => (
                                    <li key={certIndex} className="px-4 py-3 flex justify-between items-start">
                                        <p className="text-gray-800 flex-1 pr-4">{cert.name}</p>
                                        <p className="font-bold text-teal-800 bg-teal-100 rounded-full px-3 py-1 text-sm flex-shrink-0">{cert.credits}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Desktop View: Table Layout */}
                <div className="hidden md:block overflow-x-auto">
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
                                        {certIndex === 0 && ( <> <td rowSpan={userRow.certificates.length} className="px-4 py-3 border border-gray-300 text-center align-top">{userIndex + 1}</td> <td rowSpan={userRow.certificates.length} className="px-4 py-3 border border-gray-300 align-top font-semibold">{userRow.name}</td> </> )}
                                        <td className="px-4 py-3 border border-gray-300">{cert.name}</td>
                                        <td className="px-4 py-3 border border-gray-300 text-center">{cert.credits}</td>
                                        {certIndex === 0 && ( <td rowSpan={userRow.certificates.length} className="px-4 py-3 border border-gray-300 text-center align-top font-bold">{userRow.totalCredits}</td> )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
              </>
            );
        }

        return (
            <div className="overflow-x-auto">
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
            </div>
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
                <main id="report-content" className="bg-white p-0 md:p-6 rounded-lg md:shadow-md">
                    {renderReportTable()}
                </main>
                <footer className="text-center text-gray-500 mt-8 text-sm">
                    <p>Hệ thống Quản lý Đào tạo Liên tục</p>
                </footer>
            </div>
             {detailModalUser && (
                <CertificateDetailModal
                    user={detailModalUser}
                    onClose={() => setDetailModalUser(null)}
                />
            )}

            {/* AI Assistant FAB */}
            <button
                onClick={() => setIsChatOpen(true)}
                className="no-print fixed bottom-6 right-6 bg-gradient-to-br from-teal-500 to-sky-600 text-white rounded-full p-4 shadow-lg hover:scale-110 transition-transform duration-200 z-30"
                aria-label="Mở Trợ lý AI"
            >
                <AIAssistantIcon className="h-7 w-7" />
            </button>
            
            {/* AI Assistant Chat Modal */}
            {isChatOpen && <div className="no-print fixed inset-0 bg-black bg-opacity-50 z-40" onClick={() => setIsChatOpen(false)}></div>}
            <div className={`no-print fixed bottom-0 right-0 left-0 sm:left-auto sm:right-6 bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${isChatOpen ? 'translate-y-0' : 'translate-y-full sm:translate-y-[calc(100%+1.5rem)]'}`}
                 style={{ height: 'calc(100% - 4rem)', maxHeight: '700px', width: '100%', maxWidth: '450px' }}>
                <header className="flex items-center justify-between p-4 border-b flex-shrink-0">
                    <h3 className="text-lg font-bold text-teal-800 flex items-center gap-2">
                        <AIAssistantIcon className="h-6 w-6" />
                        Trợ lý Báo cáo AI
                    </h3>
                    <button onClick={() => setIsChatOpen(false)} className="text-gray-500 hover:text-gray-800">
                        <CloseIcon className="h-6 w-6" />
                    </button>
                </header>
                
                <main className="flex-1 p-4 overflow-y-auto bg-slate-50">
                    <div className="space-y-6">
                        {messages.length === 0 && (
                            <div className="text-center text-gray-500 p-8">
                                <p>Tôi có thể giúp gì với báo cáo này?</p>
                                <p className="text-sm mt-2">Ví dụ: "Ai có nhiều tiết nhất?" hoặc "Tóm tắt tình hình tuân thủ."</p>
                            </div>
                        )}
                        {messages.map((msg, index) => (
                            <div key={index} className={`flex items-start gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.sender === 'ai' && <div className="flex-shrink-0 w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center"><AIAssistantIcon className="w-5 h-5 text-teal-600" /></div>}
                                <div className={`max-w-xs md:max-w-sm p-3 rounded-xl shadow-sm ${msg.sender === 'user' ? 'bg-teal-600 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none border'}`}>
                                    <p className="text-base" dangerouslySetInnerHTML={{ __html: formatResponse(msg.text) }} />
                                </div>
                                {msg.sender === 'user' && <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center"><UserIcon className="w-5 h-5 text-gray-600" /></div>}
                            </div>
                        ))}
                        {isAiLoading && (
                            <div className="flex items-start gap-3 justify-start">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center"><AIAssistantIcon className="w-5 h-5 text-teal-600" /></div>
                                <div className="max-w-lg p-3 rounded-xl shadow-sm bg-white text-gray-800 rounded-bl-none border">
                                    <div className="flex items-center space-x-2">
                                        <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse"></div>
                                        <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse [animation-delay:0.2s]"></div>
                                        <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse [animation-delay:0.4s]"></div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>
                </main>
                
                <footer className="p-4 border-t bg-white flex-shrink-0">
                    <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                        <input
                            type="text"
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            placeholder="Đặt câu hỏi về báo cáo..."
                            disabled={isAiLoading}
                            className="flex-1 w-full px-4 py-2 border border-gray-300 rounded-full shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition disabled:bg-gray-100"
                        />
                        <button type="submit" disabled={isAiLoading || !userInput.trim()} className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-teal-600 text-white rounded-full hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors disabled:bg-teal-400 disabled:cursor-not-allowed">
                            <SendIcon className="w-5 h-5" />
                        </button>
                    </form>
                </footer>
            </div>
        </div>
    );
};

export default SharedReportView;