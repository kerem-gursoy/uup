import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine, Camera, Loader2, StopCircle } from 'lucide-react';
import { toast } from 'sonner';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';
import { getProductByBarcode } from '../services/api';

export default function ScanPage() {
    const navigate = useNavigate();
    const [barcode, setBarcode] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
    const [debugInfo, setDebugInfo] = useState<string>('');

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const scanningLockRef = useRef(false);

    useEffect(() => {
        return () => {
            stopCamera();
        };
    }, []);

    const stopCamera = () => {
        setIsScanning(false);
        scanningLockRef.current = false;

        if (codeReaderRef.current) {
            codeReaderRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
    };

    const startCameraAndScan = async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            toast.error('Camera is not supported in this browser.');
            setHasPermission(false);
            return;
        }

        try {
            setIsScanning(true);
            setHasPermission(null);
            scanningLockRef.current = false;
            setLastScannedCode(null);
            setDebugInfo('Requesting camera access...');

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false,
            });

            streamRef.current = stream;
            setDebugInfo('Camera access granted');

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                setDebugInfo('Video playing');
            }

            setHasPermission(true);

            const codeReader = new BrowserMultiFormatReader();
            codeReaderRef.current = codeReader;

            setDebugInfo('Scanner initialized, scanning...');

            codeReader.decodeFromVideoDevice(
                undefined,
                videoRef.current!,
                (result, err) => {
                    // Don't process if we're already processing a scan
                    if (scanningLockRef.current) return;

                    // Handle successful scan
                    if (result) {
                        const text = result.getText();
                        if (text) {
                            scanningLockRef.current = true;
                            setLastScannedCode(text);
                            setDebugInfo(`Scanned: ${text}`);
                            toast.success(`Scanned barcode: ${text}`);

                            // Look up the product
                            handleBarcodeFound(text);
                        }
                        return;
                    }

                    // Only log non-NotFoundException errors (those are expected while scanning)
                    if (err && !(err instanceof NotFoundException)) {
                        console.warn('Scan error:', err);
                        setDebugInfo(`Scan error: ${err.message || 'Unknown'}`);
                    }
                }
            );
        } catch (err) {
            console.error('Error starting camera:', err);
            const error = err as { name?: string; message?: string };
            setDebugInfo(`Error: ${error?.message || 'Unknown error'}`);

            if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
                toast.error('Camera permission denied. You can still enter the barcode manually.');
                setHasPermission(false);
            } else {
                toast.error('Unable to start camera.');
            }
            stopCamera();
        }
    };

    const handleBarcodeFound = async (text: string) => {
        try {
            setIsSearching(true);
            const product = await getProductByBarcode(text.trim());
            toast.success('Product found');
            stopCamera();
            navigate(`/products/${product.id}`);
        } catch (error) {
            console.error('Barcode lookup failed:', error);
            const apiError = error as { status?: number };
            if (apiError?.status === 404) {
                toast.error('No product with that barcode found');
                setDebugInfo(`Product not found for: ${text}`);
                // Allow user to try again; unlock scanning
                scanningLockRef.current = false;
            } else {
                toast.error('Failed to look up barcode');
                setDebugInfo('API error');
                stopCamera();
            }
        } finally {
            setIsSearching(false);
        }
    };

    const handleToggleScan = () => {
        if (isScanning) {
            stopCamera();
            setDebugInfo('');
        } else {
            startCameraAndScan();
        }
    };

    const handleManualSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!barcode.trim()) return;

        setIsSearching(true);

        try {
            const product = await getProductByBarcode(barcode.trim());
            toast.success('Product found');
            navigate(`/products/${product.id}`);
        } catch (error) {
            console.error('Barcode lookup failed:', error);
            const apiError = error as { status?: number };
            if (apiError?.status === 404) {
                toast.error('No product with that barcode found');
            } else {
                toast.error('Failed to look up barcode');
            }
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Scan Barcode</h1>
                <p className="text-slate-500">
                    Point your camera at a barcode to scan, or enter it manually below.
                </p>
            </div>

            {/* Camera Viewport */}
            <div className="relative aspect-[4/3] bg-slate-900 rounded-2xl overflow-hidden flex flex-col items-center justify-center">
                <video
                    ref={videoRef}
                    className={`w-full h-full object-cover ${isScanning && hasPermission ? 'opacity-100' : 'opacity-30'
                        } transition-opacity`}
                    playsInline
                    muted
                />

                {/* Placeholder / hints */}
                {!isScanning && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2 pointer-events-none">
                        <Camera size={48} />
                        <span className="text-sm font-medium">Camera preview</span>
                        <span className="text-xs text-slate-500">
                            Tap &quot;Start scanning&quot; to activate camera
                        </span>
                    </div>
                )}

                {isScanning && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="w-64 h-64 border-2 border-blue-500/80 rounded-xl relative">
                            <div className="absolute inset-x-4 top-1/2 h-0.5 bg-blue-500/70 animate-[scan_2s_ease-in-out_infinite]" />
                        </div>
                    </div>
                )}

                {/* Info overlay */}
                {lastScannedCode && (
                    <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-2 py-1 rounded-lg">
                        Last scanned: {lastScannedCode}
                    </div>
                )}

                {/* Debug info overlay */}
                {debugInfo && (
                    <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-lg max-w-[200px]">
                        {debugInfo}
                    </div>
                )}

                {/* Scan control button */}
                <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                    <button
                        onClick={handleToggleScan}
                        disabled={isSearching}
                        className="bg-white text-slate-900 font-semibold px-6 py-3 rounded-full shadow-lg active:scale-95 transition-all flex items-center gap-2 disabled:opacity-70"
                    >
                        {isScanning ? (
                            <>
                                <StopCircle size={20} />
                                Stop camera
                            </>
                        ) : (
                            <>
                                <ScanLine size={20} />
                                Start scanning
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Manual Input */}
            <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                <h3 className="font-semibold text-slate-900 mb-4">Manual Entry</h3>
                <form onSubmit={handleManualSearch} className="flex gap-2">
                    <input
                        type="text"
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        placeholder="Enter barcode..."
                        disabled={isSearching}
                        className="flex-1 px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                    />
                    <button
                        type="submit"
                        disabled={isSearching || !barcode.trim()}
                        className="bg-slate-900 text-white px-6 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isSearching ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Finding...
                            </>
                        ) : (
                            'Find'
                        )}
                    </button>
                </form>
                <p className="mt-2 text-xs text-slate-500">
                    If camera access is blocked or scanning fails, you can always enter the barcode manually.
                </p>
            </div>
        </div>
    );
}
