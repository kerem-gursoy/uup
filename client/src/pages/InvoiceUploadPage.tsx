import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage, getSuppliers, uploadInvoice, type Supplier } from '../services/api';
import { formatFileSize, compareNames } from '../lib/format';
import { Button, Card, Field, Select } from '../components/ui';
import { useT } from '../i18n';

/**
 * Registers a supplier invoice against a supplier and hands it to the parser.
 *
 * On success this goes straight to the review screen - there is no confirmation
 * step in between, because the upload is not the point: reading the lines off the
 * invoice is, and stopping to say "uploaded" would just be a tap in the way.
 */
export default function InvoiceUploadPage() {
    const t = useT();
    const navigate = useNavigate();

    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loadingSuppliers, setLoadingSuppliers] = useState(true);
    const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        let cancelled = false;

        getSuppliers()
            .then((data) => {
                if (!cancelled) setSuppliers(data);
            })
            .catch((error) => {
                console.error('Failed to fetch suppliers:', error);
                if (!cancelled) toast.error(errorMessage(error, t('error.suppliersLoad')));
            })
            .finally(() => {
                if (!cancelled) setLoadingSuppliers(false);
            });

        return () => {
            cancelled = true;
        };
    }, [t]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selected = event.target.files?.[0];
        if (!selected) return;

        if (!selected.type.startsWith('image/')) {
            toast.error(t('invoice.upload.notAnImage'));
            return;
        }

        setFile(selected);
    };

    const handleUpload = async () => {
        if (!selectedSupplierId || !file) return;

        setUploading(true);

        try {
            const formData = new FormData();
            formData.append('supplierId', String(selectedSupplierId));
            formData.append('file', file);

            const result = await uploadInvoice(formData);
            if (!result?.invoiceId) throw new Error('Missing invoice id in server response');

            toast.success(t('invoice.upload.done'));
            navigate(`/invoices/${result.invoiceId}/review`);
        } catch (error) {
            console.error('Upload failed:', error);
            toast.error(errorMessage(error, t('error.uploadFailed')));
        } finally {
            setUploading(false);
        }
    };

    const canUpload = selectedSupplierId !== null && file !== null && !uploading;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">{t('invoice.upload.title')}</h1>
                <p className="text-slate-500 mt-0.5">{t('invoice.upload.subtitle')}</p>
            </div>

            <Card className="p-5 space-y-5">
                <Field label={t('invoice.upload.supplier')} htmlFor="supplier">
                    {loadingSuppliers ? (
                        <div className="flex items-center gap-2 py-3 text-slate-500">
                            <Loader2 size={20} className="animate-spin" />
                            {t('invoice.upload.loadingSuppliers')}
                        </div>
                    ) : (
                        <Select
                            id="supplier"
                            value={selectedSupplierId ?? ''}
                            onChange={(event) =>
                                setSelectedSupplierId(
                                    event.target.value ? Number(event.target.value) : null
                                )
                            }
                            disabled={uploading}
                        >
                            <option value="">{t('invoice.upload.selectSupplier')}</option>
                            {/* Sorted with the Turkish alphabet: the shop's supplier
                                names are Turkish whatever language the labels are in. */}
                            {[...suppliers]
                                .sort((a, b) => compareNames(a.name, b.name))
                                .map((supplier) => (
                                    <option key={supplier.id} value={supplier.id}>
                                        {supplier.name}
                                    </option>
                                ))}
                        </Select>
                    )}
                </Field>

                <Field label={t('invoice.upload.photo')} htmlFor="file">
                    <input
                        id="file"
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        disabled={uploading}
                        className="w-full min-h-[52px] px-4 py-3 rounded-xl border border-slate-300 bg-white outline-none transition-colors focus:border-blue-600 focus:ring-4 focus:ring-blue-100 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    {file && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                            <FileText size={16} className="shrink-0" />
                            <span className="truncate">{file.name}</span>
                            <span className="text-slate-400 shrink-0">
                                ({formatFileSize(file.size)})
                            </span>
                        </div>
                    )}
                </Field>

                <Button
                    onClick={handleUpload}
                    disabled={!canUpload}
                    busy={uploading}
                    icon={<UploadCloud size={20} />}
                    className="w-full"
                >
                    {uploading ? t('invoice.upload.uploading') : t('invoice.upload.submit')}
                </Button>

                {!canUpload && !uploading && (
                    <p className="flex items-start gap-2 bg-amber-50 border border-amber-200 p-3 rounded-xl text-sm text-amber-900">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        {t('invoice.upload.needBoth')}
                    </p>
                )}
            </Card>
        </div>
    );
}
