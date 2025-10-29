import React, { useState, useRef, useEffect, useCallback } from 'react';
import CloseIcon from './icons/CloseIcon';

interface CameraModalProps {
    onCapture: (blob: Blob) => void;
    onClose: () => void;
}

const CameraModal: React.FC<CameraModalProps> = ({ onCapture, onClose }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null); // Use ref for stream
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isStarting, setIsStarting] = useState(true);

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    }, []); // Empty dependency array, this function is stable

    const startCamera = useCallback(async () => {
        stopCamera(); // Ensure any previous stream is stopped
        setIsStarting(true);
        setError(null);
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false,
            });
            streamRef.current = mediaStream; // Store stream in ref
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                // Muted is important for autoplay on many browsers
                videoRef.current.muted = true; 
                // Wait for metadata to be loaded to know video dimensions and start playing
                videoRef.current.onloadedmetadata = () => {
                    setIsStarting(false);
                    videoRef.current?.play();
                };
            }
        } catch (err) {
            console.error("Camera access error:", err);
            setError("Không thể truy cập camera. Vui lòng kiểm tra quyền truy cập trong trình duyệt của bạn.");
            setIsStarting(false);
        }
    }, [stopCamera]); // Dependency on stable stopCamera function

    // This useEffect now has stable dependencies and will only run once on mount and clean up on unmount.
    useEffect(() => {
        startCamera();
        return () => {
            stopCamera();
        };
    }, [startCamera, stopCamera]);

    const handleCapture = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            if (context) {
                context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
                const dataUrl = canvas.toDataURL('image/jpeg');
                setCapturedImage(dataUrl);
                stopCamera();
            }
        }
    };

    const handleRetake = () => {
        setCapturedImage(null);
        startCamera();
    };

    const handleConfirm = () => {
        if (canvasRef.current) {
            canvasRef.current.toBlob(blob => {
                if (blob) {
                    onCapture(blob);
                }
            }, 'image/jpeg', 0.95);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
            <div className="relative w-full max-w-4xl bg-gray-900 rounded-lg overflow-hidden shadow-xl">
                <button onClick={onClose} className="absolute top-2 right-2 text-white bg-black/50 rounded-full p-2 z-10 hover:bg-black/75">
                    <CloseIcon className="h-6 w-6" />
                </button>

                <div className="aspect-video w-full flex items-center justify-center">
                    {error ? (
                        <p className="text-red-400 p-8 text-center">{error}</p>
                    ) : (
                        <>
                            {isStarting && !capturedImage && (
                                <div className="text-white animate-pulse">Đang mở camera...</div>
                            )}
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted // Ensure muted is set
                                className={`w-full h-full object-contain ${capturedImage || isStarting ? 'hidden' : 'block'}`}
                            />
                            {capturedImage && (
                                <img src={capturedImage} alt="Ảnh đã chụp" className="w-full h-full object-contain" />
                            )}
                            <canvas ref={canvasRef} className="hidden" />
                        </>
                    )}
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex justify-center items-center">
                    {!capturedImage ? (
                         <button onClick={handleCapture} disabled={!!error || isStarting} className="w-16 h-16 rounded-full bg-white border-4 border-gray-400 ring-2 ring-white ring-offset-2 ring-offset-gray-900 focus:outline-none focus:ring-teal-500 disabled:opacity-50"></button>
                    ) : (
                        <div className="flex gap-8">
                             <button onClick={handleRetake} className="text-white font-semibold py-2 px-4 rounded-lg bg-gray-700 hover:bg-gray-600">
                                Chụp lại
                            </button>
                             <button onClick={handleConfirm} className="text-white font-semibold py-2 px-4 rounded-lg bg-teal-600 hover:bg-teal-700">
                                Xác nhận
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CameraModal;
