import React, { useState } from 'react';
import CloseIcon from './icons/CloseIcon';
import CheckIcon from './icons/CheckIcon';

interface ShareReportModalProps {
    shareUrl: string;
    expiresAt: Date;
    onClose: () => void;
}

const ShareReportModal: React.FC<ShareReportModalProps> = ({ shareUrl, expiresAt, onClose }) => {
    const [copied, setCopied] = useState(false);
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(shareUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 sm:p-8 relative" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 z-10">
                    <CloseIcon className="h-6 w-6" />
                </button>
                <h2 className="text-2xl font-bold text-teal-800 mb-4">Chia sẻ Báo cáo</h2>
                <p className="text-gray-600 mb-6">Bất kỳ ai có liên kết này đều có thể xem báo cáo (chỉ đọc). Liên kết sẽ hết hạn vào lúc {expiresAt.toLocaleString('vi-VN')}.</p>
                
                <div className="flex justify-center mb-6">
                    <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48 rounded-lg border-4 border-gray-200" />
                </div>

                <div>
                    <label htmlFor="share-url" className="block text-base font-medium text-gray-700 mb-1">Liên kết chia sẻ</label>
                    <div className="flex items-center gap-2">
                        <input id="share-url" type="text" readOnly value={shareUrl} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 cursor-text" />
                        <button onClick={handleCopy} className={`w-28 flex-shrink-0 flex items-center justify-center py-2 px-4 rounded-md shadow-sm text-base font-medium text-white transition-colors ${copied ? 'bg-green-500 hover:bg-green-600' : 'bg-teal-600 hover:bg-teal-700'}`}>
                            {copied && <CheckIcon className="h-5 w-5 mr-1" />}
                            {copied ? 'Đã chép' : 'Sao chép'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ShareReportModal;
