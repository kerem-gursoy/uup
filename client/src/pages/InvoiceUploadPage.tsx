import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, FileText, Check, AlertCircle, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchSuppliers, uploadInvoice, type Supplier, type UploadInvoiceResponse } from '../services/api';

type Step = 'upload' | 'success';

export default function InvoiceUploadPage() {
    const navigate = useNavigate();

    // State
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loadingSuppliers, setLoadingSuppliers] = useState(true);
    const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [step, setStep] = useState<Step>('upload');
    const [uploadResult, setUploadResult] = useState<UploadInvoiceResponse | null>(null);

    // Fetch suppliers on mount
    useEffect(() => {
        const loadSuppliers = async () => {
            try {
                const data = await fetchSuppliers();
                setSuppliers(data);
            } catch (error) {
                console.error('Failed to fetch suppliers:', error);
                toast.error('Failed to load suppliers. Please refresh the page.');
            } finally {
                setLoadingSuppliers(false);
            }
        };

        loadSuppliers();
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];

            // Validate file type
            if (!selectedFile.type.startsWith('image/')) {
                toast.error('Please select an image file');
                return;
            }

            setFile(selectedFile);
        }
    };

    const handleUpload = async () => {
        if (!selectedSupplierId || !file) return;

        setUploading(true);

        try {
            const formData = new FormData();
            formData.append('supplierId', selectedSupplierId.toString());
            formData.append('file', file);

            const result = await uploadInvoice(formData);
            setUploadResult(result);
            setStep('success');
            toast.success('Invoice uploaded successfully');
        } catch (error) {
            console.error('Upload failed:', error);
            const message = error instanceof Error ? error.message : 'Upload failed';
            toast.error(message);
        } finally {
            setUploading(false);
        }
    };

    const handleReset = () => {
        setSelectedSupplierId(null);
        setFile(null);
        setUploadResult(null);
        setStep('upload');
    };

    const canUpload = selectedSupplierId !== null && file !== null && !uploading;

    if (step === 'success' && uploadResult) {
        return (
            <div className="space-y-6 pb-20">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Upload Invoice</h1>
                    <p className="text-slate-500">Import stock from supplier invoices.</p>
                </div>

                <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
                    <div className="flex items-center justify-center mb-6">
                        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                            <Check size={32} />
                        </div>
                    </div>

                    <h2 className="text-xl font-bold text-slate-900 text-center mb-2">Invoice Uploaded</h2>
                    <p className="text-slate-500 text-center mb-6">
                        Invoice ID: {uploadResult.invoiceId}. Parsing and mapping will come next.
                    </p>

                    <div className="space-y-4 bg-slate-50 rounded-lg p-4">
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-slate-600">Supplier</span>
                            <span className="text-sm text-slate-900">{uploadResult.supplier.name}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-slate-600">File</span>
                            <span className="text-sm text-slate-900">{uploadResult.file.originalName}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-slate-600">Status</span>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {uploadResult.status}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-slate-600">Created</span>
                            <span className="text-sm text-slate-900">
                                {new Date(uploadResult.createdAt).toLocaleString()}
                            </span>
                        </div>
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-3">
                        <button
                            onClick={() => navigate('/')}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-xl transition-colors"
                        >
                            Back to Home
                        </button>
                        <button
                            onClick={handleReset}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
                        >
                            Upload Another
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Upload Invoice</h1>
                <p className="text-slate-500">Import stock from supplier invoices.</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-6">
                {/* Supplier Selection */}
                <div>
                    <label htmlFor="supplier" className="block text-sm font-medium text-slate-700 mb-2">
                        Supplier <span className="text-red-500">*</span>
                    </label>
                    {loadingSuppliers ? (
                        <div className="flex items-center justify-center py-3 text-slate-500">
                            <Loader2 size={20} className="animate-spin mr-2" />
                            Loading suppliers...
                        </div>
                    ) : (
                        <div className="relative">
                            <select
                                id="supplier"
                                value={selectedSupplierId ?? ''}
                                onChange={(e) => setSelectedSupplierId(e.target.value ? Number(e.target.value) : null)}
                                className="w-full px-4 py-3 pr-10 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none"
                                disabled={uploading}
                            >
                                <option value="">Select a supplier...</option>
                                {suppliers.map((supplier) => (
                                    <option key={supplier.id} value={supplier.id}>
                                        {supplier.name}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
                        </div>
                    )}
                </div>

                {/* File Input */}
                <div>
                    <label htmlFor="file" className="block text-sm font-medium text-slate-700 mb-2">
                        Invoice Image <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                        <input
                            id="file"
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            disabled={uploading}
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                    </div>
                    {file && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                            <FileText size={16} />
                            <span>{file.name}</span>
                            <span className="text-slate-400">({(file.size / 1024).toFixed(1)} KB)</span>
                        </div>
                    )}
                </div>

                {/* Upload Button */}
                <button
                    onClick={handleUpload}
                    disabled={!canUpload}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-200 disabled:shadow-none transition-all active:scale-95 disabled:active:scale-100 flex items-center justify-center gap-2"
                >
                    {uploading ? (
                        <>
                            <Loader2 size={20} className="animate-spin" />
                            Uploading...
                        </>
                    ) : (
                        <>
                            <UploadCloud size={20} />
                            Upload Invoice
                        </>
                    )}
                </button>

                {!canUpload && !uploading && (
                    <div className="flex items-start gap-2 bg-amber-50 p-3 rounded-lg text-sm text-amber-800">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <p>
                            Please select a supplier and choose an invoice image to continue.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
