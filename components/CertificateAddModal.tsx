import React, { useState, useRef } from 'react';
import { Certificate, UserData } from '../App';
import CloseIcon from './icons/CloseIcon';
import UploadIcon from './icons/UploadIcon';
import CameraIcon from './icons/CameraIcon';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import CameraModal from './CameraModal';
import { uploadToDrive, blobToBase64, deleteFromDrive } from '../utils/driveUploader';

interface CertificateAddModalProps {
  user: UserData;
  onAdd: (newData: Partial<Certificate>) => void;
  onClose: () => void;
  geminiApiKey: string | null;
}

const CertificateAddModal: React.FC<CertificateAddModalProps> = ({ user, onAdd, onClose, geminiApiKey }) => {
  const [formData, setFormData] = useState({
    name: '',
    credits: '',
    date: '',
    imageUrl: '',
  });
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [newlyUploadedFileId, setNewlyUploadedFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
     if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validate = (): { [key: string]: string } => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.name.trim()) newErrors.name = 'Tên chứng chỉ không được để trống.';
    const creditsValue = parseFloat(formData.credits);
    if (isNaN(creditsValue) || creditsValue <= 0) newErrors.credits = 'Số tiết phải là một số lớn hơn 0.';
    if (!formData.date) {
        newErrors.date = 'Ngày cấp không được để trống.';
    } else {
        const selectedDate = new Date(formData.date + 'T00:00:00.000Z');
        const minDate = new Date('2021-01-01T00:00:00.000Z');
        const today = new Date();
        today.setUTCHours(23, 59, 59, 999);
        if (selectedDate < minDate) newErrors.date = 'Ngày cấp không được trước ngày 01/01/2021.';
        if (selectedDate > today) newErrors.date = 'Ngày cấp không được là một ngày trong tương lai.';
    }
    if (!formData.imageUrl.trim()) newErrors.imageUrl = 'Vui lòng chọn hoặc chụp ảnh chứng chỉ.';
    return newErrors;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
    }
    setErrors({});
    const dataToSave = {
      name: formData.name.trim(),
      credits: parseFloat(formData.credits),
      imageUrl: formData.imageUrl.trim(),
      date: new Date(formData.date + 'T00:00:00.000Z'),
    };
    onAdd(dataToSave as unknown as Partial<Certificate>);
  };
  
  const handleClose = async () => {
    if (isProcessing) return;
    if (newlyUploadedFileId) {
      console.log(`Cancelling... Deleting temporary file: ${newlyUploadedFileId}`);
      await deleteFromDrive(newlyUploadedFileId);
    }
    onClose();
  };

  const processNewImage = async (imageBlob: Blob) => {
    const MAX_FILE_SIZE_MB = 10;
    if (imageBlob.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setErrors(prev => ({ ...prev, imageUrl: `Lỗi: Kích thước tệp quá lớn (tối đa ${MAX_FILE_SIZE_MB}MB).` }));
        return;
    }
    
    if (!geminiApiKey) {
        setErrors(prev => ({ ...prev, imageUrl: "Lỗi: Chưa cấu hình API Key. Vui lòng liên hệ quản trị viên."}));
        return;
    }

    if (newlyUploadedFileId) {
        await deleteFromDrive(newlyUploadedFileId);
        setNewlyUploadedFileId(null);
    }

    setIsProcessing(true);
    setErrors({});
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(URL.createObjectURL(imageBlob));

    try {
        setProcessingMessage('Đang tải ảnh lên...');

        const uploadResult = await uploadToDrive(imageBlob, user.username);

        if (!uploadResult.success || !uploadResult.id || !uploadResult.url) {
            throw new Error(uploadResult.error || "Tải ảnh lên Google Drive thất bại.");
        }
        
        setNewlyUploadedFileId(uploadResult.id);
        const downloadURL = uploadResult.url;
        
        setFormData(prev => ({ ...prev, imageUrl: downloadURL }));
        if (errors.imageUrl) setErrors(prev => ({ ...prev, imageUrl: '' }));

        setProcessingMessage('Đang trích xuất dữ liệu...');
        const base64Data = await blobToBase64(imageBlob);
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });

        const systemInstruction = `Vai trò: Bạn là một AI chuyên gia trích xuất dữ liệu, được đào tạo đặc biệt để phân tích hình ảnh chứng chỉ đào tạo y khoa liên tục (CME/CPD) bằng tiếng Việt.
Nhiệm vụ: Nhiệm vụ của bạn là trích xuất chính xác các thông tin cụ thể từ hình ảnh chứng chỉ được cung cấp và trả về dưới dạng một đối tượng JSON.
Đầu ra: Chỉ trả về một đối tượng JSON hợp lệ theo cấu trúc sau. TUYỆT ĐỐI không thêm bất kỳ văn bản giải thích, lời chào đầu/kết hay định dạng markdown nào khác.
\`\`\`json
{
  "name": "string | null",
  "date": "string (YYYY-MM-DD) | null",
  "credits": "number | null"
}
\`\`\`
Hướng dẫn chi tiết: Trích xuất tiêu đề chính (name), ngày kết thúc sự kiện (date), và số tiết học (credits). Luôn trả về ngày theo định dạng YYYY-MM-DD. Nếu không chắc, trả về null.`;

        const genAIResponse: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [ { parts: [{ inlineData: { mimeType: imageBlob.type, data: base64Data } }] } ],
            config: { responseMimeType: "application/json", systemInstruction }
        });

        const extractedData = JSON.parse(genAIResponse.text.trim());
        if (extractedData) {
            setFormData(prev => ({
                ...prev,
                name: extractedData.name || prev.name,
                credits: extractedData.credits?.toString() || prev.credits,
                date: extractedData.date || prev.date,
            }));
        }
    } catch (error) {
        console.error("Error processing image:", error);
        setErrors(prev => ({ ...prev, imageUrl: 'Phần mềm không lấy được dữ liệu, đề nghị nhập liệu bằng tay.' }));
    } finally {
        setIsProcessing(false);
        setProcessingMessage('');
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processNewImage(file);
    }
  };

  const handlePhotoTaken = (imageBlob: Blob) => {
      setIsCameraOpen(false);
      processNewImage(imageBlob);
  }

  return (
    <>
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div 
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl p-6 sm:p-8 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={handleClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 z-10" aria-label="Đóng">
          <CloseIcon className="h-6 w-6" />
        </button>
        <h2 className="text-2xl font-bold text-teal-800 mb-6">Thêm chứng chỉ mới</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
                <h3 className="text-base font-medium text-gray-700">Hình ảnh chứng chỉ</h3>
                 <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isProcessing} className="flex w-full sm:w-auto items-center justify-center gap-2 bg-white text-gray-700 font-semibold py-2 px-3 rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors text-base disabled:opacity-50 disabled:cursor-wait">
                        <UploadIcon className="h-5 w-5" />
                        Chọn từ tệp
                    </button>
                    <button type="button" onClick={() => setIsCameraOpen(true)} disabled={isProcessing} className="flex w-full sm:w-auto items-center justify-center gap-2 bg-teal-50 text-teal-700 font-semibold py-2 px-3 rounded-lg hover:bg-teal-100 transition-colors text-base disabled:opacity-50 disabled:cursor-wait">
                       <CameraIcon className="h-5 w-5" />
                       Chụp ảnh
                    </button>
                </div>
                <div className="relative w-full aspect-[4/3] bg-gray-100 rounded-md border flex items-center justify-center overflow-hidden mt-2">
                    {imagePreviewUrl ? (
                         <img src={imagePreviewUrl} alt="Xem trước chứng chỉ" className="w-full h-full object-contain" />
                    ) : (
                        <p className="text-base text-gray-500">Vui lòng chọn ảnh</p>
                    )}
                    {isProcessing && (
                        <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center gap-2">
                            <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-sm font-semibold text-teal-700">{processingMessage}</p>
                        </div>
                    )}
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 flex flex-col">
                <div className="flex-grow space-y-4">
                    <div>
                        <label htmlFor="name" className="block text-base font-medium text-gray-700">Tên chứng chỉ</label>
                        <input id="name" name="name" type="text" value={formData.name} onChange={handleChange} className={`mt-1 w-full input-style ${errors.name ? 'border-red-500' : 'border-gray-300'}`} />
                        {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                        <label htmlFor="credits" className="block text-base font-medium text-gray-700">Số tiết</label>
                        <input id="credits" name="credits" type="number" step="0.1" value={formData.credits} onChange={handleChange} className={`mt-1 w-full input-style ${errors.credits ? 'border-red-500' : 'border-gray-300'}`} />
                        {errors.credits && <p className="text-sm text-red-500 mt-1">{errors.credits}</p>}
                        </div>
                        <div>
                        <label htmlFor="date" className="block text-base font-medium text-gray-700">Ngày cấp</label>
                        <input id="date" name="date" type="date" value={formData.date} onChange={handleChange} className={`mt-1 w-full input-style ${errors.date ? 'border-red-500' : 'border-gray-300'}`} />
                        {errors.date && <p className="text-sm text-red-500 mt-1">{errors.date}</p>}
                        </div>
                    </div>
                    <div>
                        <label htmlFor="imageUrl" className="block text-base font-medium text-gray-700">URL Ảnh</label>
                        <input id="imageUrl" name="imageUrl" type="text" value={formData.imageUrl} readOnly placeholder="Sẽ tự động điền sau khi tải ảnh lên" className={`mt-1 w-full input-style bg-gray-100 cursor-not-allowed ${errors.imageUrl ? 'border-red-500' : 'border-gray-300'}`} />
                        {errors.imageUrl && <p className="text-sm text-red-500 mt-1">{errors.imageUrl}</p>}
                    </div>
                </div>
                <div className="pt-6 flex justify-end space-x-3">
                    <button type="button" onClick={handleClose} disabled={isProcessing} className="btn-secondary">Hủy</button>
                    <button type="submit" disabled={isProcessing} className="btn-primary">Thêm chứng chỉ</button>
                </div>
            </form>
        </div>
      </div>
      <style>{`
        .input-style { box-sizing: border-box; width: 100%; margin-top: 0.25rem; padding: 0.5rem 0.75rem; border: 1px solid #D1D5DB; border-radius: 0.375rem; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); }
        .input-style:focus { outline: 2px solid transparent; outline-offset: 2px; --tw-ring-color: #14B8A6; box-shadow: 0 0 0 2px var(--tw-ring-color); border-color: #14B8A6; }
        .btn-primary { background-color: #0D9488; color: white; font-weight: 600; padding: 0.5rem 1rem; border-radius: 0.5rem; transition: background-color 0.2s; }
        .btn-primary:hover { background-color: #0F766E; } .btn-primary:disabled { background-color: #5EEAD4; cursor: not-allowed; }
        .btn-secondary { background-color: #E5E7EB; color: #374151; font-weight: 600; padding: 0.5rem 1rem; border-radius: 0.5rem; transition: background-color 0.2s; }
        .btn-secondary:hover { background-color: #D1D5DB; } .btn-secondary:disabled { background-color: #F3F4F6; cursor: not-allowed; }
      `}</style>
    </div>
    {isCameraOpen && <CameraModal onCapture={handlePhotoTaken} onClose={() => setIsCameraOpen(false)} />}
    </>
  );
};

export default CertificateAddModal;