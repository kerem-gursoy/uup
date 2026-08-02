import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, FileText, Loader2, Plus, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage, getSuppliers, uploadInvoice, type Supplier } from '../services/api';
import { formatFileSize, compareNames } from '../lib/format';
import { Button, Card, EmptyBlock, Field, Section, Select } from '../components/ui';
import { useT } from '../i18n';

/**
 * Registers a supplier invoice against a supplier and hands it to the parser.
 *
 * On success this goes straight to the review screen - there is no confirmation
 * step in between, because the upload is not the point: reading the lines off the
 * invoice is, and stopping to say "uploaded" would just be a tap in the way.
 *
 * What this screen is really for is the photo. Everything after it is a
 * consequence of that photo: a sharp, flat, complete one comes back as lines
 * needing a glance, and a dim angled one comes back as an evening of typing. So
 * the guidance sits next to the button rather than being left for people to
 * infer from a bad first attempt.
 */
export default function InvoiceUploadPage() {
    const t = useT();
    const navigate = useNavigate();

    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loadingSuppliers, setLoadingSuppliers] = useState(true);
    const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
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

    // An object URL holds the file in memory until it is handed back.
    useEffect(() => {
        if (!file) return;

        const url = URL.createObjectURL(file);
        setPreview(url);

        return () => {
            URL.revokeObjectURL(url);
            setPreview(null);
        };
    }, [file]);

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

    // Nothing here works without one, and a shop on its first day has none. An
    // empty dropdown is a dead end that explains nothing.
    if (!loadingSuppliers && suppliers.length === 0) {
        return (
            <div className="space-y-6">
                <PageHeading />
                <Card>
                    <EmptyBlock
                        icon={<FileText size={26} />}
                        title={t('invoice.upload.noSuppliers')}
                        description={t('invoice.upload.noSuppliersHint')}
                        action={
                            <Link to="/suppliers">
                                <Button icon={<Plus size={20} />}>
                                    {t('invoice.upload.addSupplier')}
                                </Button>
                            </Link>
                        }
                    />
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <PageHeading />

            <Section title={t('invoice.upload.step1')} hint={t('invoice.upload.step1Hint')}>
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
            </Section>

            <Section title={t('invoice.upload.step2')} hint={t('invoice.upload.step2Hint')}>
                <label
                    htmlFor="file"
                    className="flex flex-col items-center justify-center gap-2 w-full min-h-[128px] rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-600 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-100 transition p-4 text-center"
                >
                    {/* Inside the label and only visually hidden, never
                        display:none - it keeps its place in the tab order, and
                        focus on it is what lights the whole area up. */}
                    <input
                        id="file"
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        disabled={uploading}
                        className="sr-only"
                    />
                    <Camera size={28} aria-hidden="true" className="text-slate-400" />
                    <span className="font-medium">
                        {file
                            ? t('invoice.upload.changePhoto')
                            : t('invoice.upload.choosePhoto')}
                    </span>
                    <span className="text-sm text-slate-500">
                        {t('invoice.upload.choosePhotoHint')}
                    </span>
                </label>

                {file && preview && (
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                        {/* Shown so a blurred or half-cropped photo is caught here,
                            rather than a minute later as nonsense line items. */}
                        <img
                            src={preview}
                            alt={t('invoice.upload.previewAlt')}
                            className="w-20 h-20 rounded-lg object-cover border border-slate-200"
                        />
                        <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">{file.name}</p>
                            <p className="text-sm text-slate-500">{formatFileSize(file.size)}</p>
                        </div>
                    </div>
                )}

                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                    <p className="font-medium text-slate-800 text-sm">
                        {t('invoice.upload.tipsTitle')}
                    </p>
                    <ul className="mt-1.5 space-y-1 text-sm text-slate-600 list-disc pl-5">
                        <li>{t('invoice.upload.tipFlat')}</li>
                        <li>{t('invoice.upload.tipWhole')}</li>
                        <li>{t('invoice.upload.tipLight')}</li>
                    </ul>
                </div>
            </Section>

            <div className="space-y-2">
                <Button
                    onClick={handleUpload}
                    disabled={!canUpload}
                    busy={uploading}
                    icon={<UploadCloud size={20} />}
                    className="w-full"
                >
                    {uploading ? t('invoice.upload.uploading') : t('invoice.upload.submit')}
                </Button>
                {/* Says what the button leads to rather than scolding for a form
                    that is merely unfinished - the disabled button says that much
                    already, and said it from the moment the page opened. */}
                <p className="text-sm text-slate-500 text-center">
                    {canUpload || uploading
                        ? t('invoice.upload.whatNext')
                        : t('invoice.upload.needBoth')}
                </p>
            </div>
        </div>
    );
}

function PageHeading() {
    const t = useT();

    return (
        <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('invoice.upload.title')}</h1>
            <p className="text-slate-500 mt-0.5">{t('invoice.upload.subtitle')}</p>
        </div>
    );
}
