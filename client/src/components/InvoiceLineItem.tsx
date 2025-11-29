import { useState, useEffect, useRef } from 'react';
import { Search, Trash2, Camera, X } from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';
import { toast } from 'sonner';
import { type Product, getProducts, getProductByBarcode, createProduct } from '../services/api';
import { useDebounce } from '../hooks/useDebounce.ts';

// Extended type for internal state management
export interface LineItemState {
    apply: boolean;
    productId: number | null;
    quantity: number | null;
    unitPrice: number | null;
    applyStock: boolean;
    applyPrice: boolean;
    parsedLineNo: number | null;
    // Informational fields from parsed data or manual entry
    name?: string;
    description: string;
    brand?: string | null;
    barcode: string | null;
    code: string | null;
    matchedProductName?: string | null;
    matchedBrand?: string | null;
    matchScore?: number;
}

interface InvoiceLineItemProps {
    line: LineItemState;
    index: number;
    onChange: (index: number, updates: Partial<LineItemState>) => void;
    onRemove?: (index: number) => void;
    isManual?: boolean;
    supplierId?: number;
}

export default function InvoiceLineItem({ line, index, onChange, onRemove, isManual, supplierId }: InvoiceLineItemProps) {
    const [productSearch, setProductSearch] = useState('');
    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showProductSearch, setShowProductSearch] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [scanMessage, setScanMessage] = useState<string>('');
    const [creatingProduct, setCreatingProduct] = useState(false);

    const debouncedSearch = useDebounce(productSearch, 300);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const scanningLockRef = useRef(false);

    // Initial product name display
    useEffect(() => {
        if (line.matchedProductName && !productSearch) {
            // If we have a match but no search term, we could pre-fill search 
            // but it might be better to just show the selected state.
        }
    }, [line.matchedProductName]);

    // Search products effect
    useEffect(() => {
        if (debouncedSearch && showProductSearch) {
            setIsSearching(true);
            getProducts({ search: debouncedSearch })
                .then(products => setSearchResults(products))
                .catch(console.error)
                .finally(() => setIsSearching(false));
        } else {
            setSearchResults([]);
        }
    }, [debouncedSearch, showProductSearch]);

    const handleProductSelect = (product: Product) => {
        onChange(index, {
            productId: product.id,
            matchedProductName: product.name,
            matchedBrand: product.brand,
            brand: product.brand ?? line.brand ?? null,
            matchScore: 1 // Manual selection is 100% match
        });
        setShowProductSearch(false);
        setProductSearch('');
    };

    const handleCreateProduct = async () => {
        const productName = line.name?.trim() || line.description?.trim();
        if (!productName) {
            toast.error('Name is required to create a product');
            return;
        }
        try {
            setCreatingProduct(true);
            const product = await createProduct({
                name: productName,
                barcode: line.barcode || undefined,
                brand: line.brand || undefined,
                supplierId,
            });
            toast.success('Product created');
            onChange(index, {
                productId: product.id,
                matchedProductName: product.name,
                matchedBrand: product.brand,
                brand: line.brand ?? product.brand ?? null,
                matchScore: 1,
            });
        } catch (err) {
            console.error('Create product failed', err);
            toast.error('Failed to create product');
        } finally {
            setCreatingProduct(false);
        }
    };

    const stopScanning = () => {
        setIsScanning(false);
        scanningLockRef.current = false;
        setScanMessage('');
        if (codeReaderRef.current) {
            codeReaderRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
    };

    const closeScanner = () => {
        stopScanning();
        setShowScanner(false);
    };

    useEffect(() => {
        if (!showScanner) {
            stopScanning();
            return;
        }

        const startScan = async () => {
            try {
                if (!navigator.mediaDevices?.getUserMedia) {
                    setScanMessage('Camera not supported in this browser');
                    return;
                }
                setIsScanning(true);
                setScanMessage('Requesting camera access...');
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' },
                    audio: false,
                });
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }
                setScanMessage('Scanning...');

                const reader = new BrowserMultiFormatReader();
                codeReaderRef.current = reader;

                reader.decodeFromVideoDevice(undefined, videoRef.current!, (result, err) => {
                    if (scanningLockRef.current) return;
                    if (result) {
                        const text = result.getText();
                        if (text) {
                            scanningLockRef.current = true;
                            onChange(index, { barcode: text });
                            setScanMessage(`Scanned: ${text}`);
                            void handleBarcodeLookup(text);
                        }
                        return;
                    }
                    if (err && !(err instanceof NotFoundException)) {
                        setScanMessage(err.message || 'Scan error');
                    }
                });
            } catch (err) {
                console.error('Scan start failed', err);
                setScanMessage('Unable to start camera');
                stopScanning();
            }
        };

        void startScan();

        return () => {
            stopScanning();
        };
    }, [showScanner, index, onChange]);

    const handleBarcodeLookup = async (code: string) => {
        try {
            const product = await getProductByBarcode(code.trim());
            onChange(index, {
                productId: product.id,
                matchedProductName: product.name,
                matchedBrand: product.brand,
                brand: line.brand ?? product.brand ?? null,
                name: line.name || line.description || product.name,
                matchScore: 1,
            });
            toast.success('Barcode matched to product');
            setTimeout(() => setShowScanner(false), 250);
        } catch (error) {
            console.error('No product for scanned barcode', error);
            toast.error('No matching barcode found');
            setScanMessage('No matching product found. Try again.');
            scanningLockRef.current = false;
        }
    };

    const getMatchBadge = () => {
        if (!line.productId) return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">No Product</span>;

        const score = line.matchScore || 0;
        if (score >= 0.9) return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">High Match</span>;
        if (score >= 0.5) return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Medium Match</span>;
        return <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">Low Match</span>;
    };

    const headerTitle = line.name ?? line.description ?? '';

    return (
        <div className={`p-4 rounded-xl border ${line.apply ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-75'} transition-all shadow-sm`}>
            {/* Header: Checkbox + Description */}
            <div className="flex items-start gap-3 mb-4">
                <div className="pt-1">
                    <input
                        type="checkbox"
                        checked={line.apply}
                        onChange={(e) => onChange(index, { apply: e.target.checked })}
                        className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <h4 className="font-medium text-slate-900 truncate pr-2" title={headerTitle}>
                            {headerTitle || 'New Item'}
                        </h4>
                        {isManual && onRemove && (
                            <button
                                onClick={() => onRemove(index)}
                                className="text-slate-400 hover:text-red-500 p-1"
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                        {line.code && <span className="bg-slate-100 px-1.5 py-0.5 rounded">Code: {line.code}</span>}
                        {line.barcode && <span className="bg-slate-100 px-1.5 py-0.5 rounded">Barcode: {line.barcode}</span>}
                    </div>
                </div>
            </div>

            {line.apply && (
                <div className="space-y-4 pl-8">
                    {/* Editable Basics */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Item Name</label>
                            <input
                                type="text"
                                value={line.name ?? line.description}
                                onChange={(e) => onChange(index, { name: e.target.value, description: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Product name"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Brand (optional)</label>
                            <input
                                type="text"
                                value={line.brand ?? line.matchedBrand ?? ''}
                                onChange={(e) => onChange(index, { brand: e.target.value || null })}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Brand"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                                <span>Barcode</span>
                                <button
                                    type="button"
                                    onClick={() => setShowScanner(true)}
                                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                                >
                                    <Camera size={14} />
                                    Scan
                                </button>
                            </label>
                            <input
                                type="text"
                                value={line.barcode ?? ''}
                                onChange={(e) => onChange(index, { barcode: e.target.value || null })}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Scan or type barcode"
                            />
                        </div>
                    </div>

                    {/* Product Selection */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Matched Product</label>
                            {!line.productId && (
                                <button
                                    type="button"
                                    onClick={handleCreateProduct}
                                    disabled={creatingProduct}
                                    className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
                                >
                                    {creatingProduct ? 'Creating…' : 'Create new'}
                                </button>
                            )}
                        </div>

                        {!showProductSearch ? (
                            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <div>
                                    {line.productId ? (
                                        <div>
                                            <div className="font-medium text-slate-900">{line.matchedProductName}</div>
                                            <div className="flex items-center gap-2 mt-1">
                                                {line.matchedBrand && <span className="text-xs text-slate-500">{line.matchedBrand}</span>}
                                                {getMatchBadge()}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-slate-500 italic text-sm">No product matched</div>
                                    )}
                                </div>
                                <button
                                    onClick={() => setShowProductSearch(true)}
                                    className="text-sm text-blue-600 font-medium hover:text-blue-700"
                                >
                                    {line.productId ? 'Change' : 'Select'}
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <div className="flex items-center gap-2 mb-2">
                                    <Search size={16} className="text-slate-400" />
                                    <input
                                        type="text"
                                        value={productSearch}
                                        onChange={(e) => setProductSearch(e.target.value)}
                                        placeholder="Search products..."
                                        className="flex-1 text-sm outline-none border-b border-slate-200 py-1 focus:border-blue-500"
                                        autoFocus
                                    />
                                    <button
                                        onClick={() => setShowProductSearch(false)}
                                        className="text-xs text-slate-500 hover:text-slate-700"
                                    >
                                        Cancel
                                    </button>
                                </div>

                                {debouncedSearch && (
                                    <div className="absolute z-10 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto mt-1">
                                        {isSearching ? (
                                            <div className="p-3 text-center text-xs text-slate-500">Searching...</div>
                                        ) : searchResults.length > 0 ? (
                                            searchResults.map(p => (
                                                <button
                                                    key={p.id}
                                                    onClick={() => handleProductSelect(p)}
                                                    className="w-full text-left p-2 hover:bg-slate-50 text-sm border-b border-slate-50 last:border-0"
                                                >
                                                    <div className="font-medium text-slate-900">{p.name}</div>
                                                    <div className="text-xs text-slate-500">{p.brand}</div>
                                                </button>
                                            ))
                                        ) : (
                                            <div className="p-3 text-center text-xs text-slate-500">No products found</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Quantity & Price */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quantity</label>
                            <input
                                type="number"
                                value={line.quantity ?? ''}
                                onChange={(e) => onChange(index, { quantity: e.target.value ? parseFloat(e.target.value) : null })}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="0"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Unit Price</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={line.unitPrice ?? ''}
                                    onChange={(e) => onChange(index, { unitPrice: e.target.value ? parseFloat(e.target.value) : null })}
                                    className="w-full pl-7 pr-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Toggles */}
                    <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={line.applyStock}
                                onChange={(e) => onChange(index, { applyStock: e.target.checked })}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600"
                            />
                            <span className="text-sm text-slate-700">Update Stock Level</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={line.applyPrice}
                                onChange={(e) => onChange(index, { applyPrice: e.target.checked })}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600"
                            />
                            <span className="text-sm text-slate-700">Update Product Price</span>
                        </label>
                    </div>
                </div>
            )}

            {showScanner && (
                <div
                    className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
                    onClick={closeScanner}
                >
                    <div
                        className="bg-slate-900 rounded-2xl w-full max-w-md overflow-hidden relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={closeScanner}
                            className="absolute top-3 right-3 text-white/80 hover:text-white"
                            aria-label="Close scanner"
                        >
                            <X size={20} />
                        </button>
                        <div className="aspect-[4/3] bg-black">
                            <video
                                ref={videoRef}
                                className={`w-full h-full object-cover ${isScanning ? 'opacity-100' : 'opacity-60'}`}
                                playsInline
                                muted
                            />
                        </div>
                        <div className="p-3 text-sm text-white/80">
                            {scanMessage || 'Point the camera at a barcode'}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
