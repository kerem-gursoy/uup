import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage, parseInvoice, applyInvoice, type ParsedInvoiceResponse, type ApplyInvoiceRequest } from '../services/api';
import InvoiceLineItem, { type LineItemState } from '../components/InvoiceLineItem';
import { formatDate } from '../lib/format';
import { pluralKey, useT, useTPlural } from '../i18n';
import { T } from '../i18n/T';

export default function InvoiceReviewPage() {
    const t = useT();
    const tPlural = useTPlural();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [invoice, setInvoice] = useState<ParsedInvoiceResponse | null>(null);
    const [linesState, setLinesState] = useState<LineItemState[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;

        const loadInvoice = async () => {
            try {
                setLoading(true);
                const data = await parseInvoice(parseInt(id));
                setInvoice(data);

                // Initialize lines state
                const initialLines: LineItemState[] = data.lines.map(line => ({
                    apply: true,
                    productId: line.matchedProductId,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice,
                    applyStock: line.quantity !== null,
                    applyPrice: line.unitPrice !== null,
                    parsedLineNo: line.lineNo,
                    name: line.description,
                    description: line.description,
                    brand: line.matchedBrand ?? null,
                    barcode: line.barcode,
                    code: line.code,
                    matchedProductName: line.matchedProductName,
                    matchedBrand: line.matchedBrand,
                    matchScore: line.matchScore,
                    priceMismatch: line.priceMismatch,
                    totalPrice: line.totalPrice,
                }));

                setLinesState(initialLines);
            } catch (err) {
                console.error('Failed to load invoice:', err);
                setError(errorMessage(err, t('error.invoiceLoad')));
            } finally {
                setLoading(false);
            }
        };

        loadInvoice();
    }, [id, t]);

    const handleLineChange = (index: number, updates: Partial<LineItemState>) => {
        setLinesState(prev => {
            const newLines = [...prev];
            newLines[index] = { ...newLines[index], ...updates };
            return newLines;
        });
    };

    const handleAddManualLine = () => {
        setLinesState(prev => [
            ...prev,
            {
                apply: true,
                productId: null,
                quantity: null,
                unitPrice: null,
                applyStock: true,
                applyPrice: true,
                parsedLineNo: null,
                name: '',
                description: '',
                brand: null,
                barcode: null,
                code: null
            }
        ]);
        // Scroll to bottom after render?
        setTimeout(() => {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }, 100);
    };

    const handleRemoveLine = (index: number) => {
        if (confirm(t('invoice.review.removeConfirm'))) {
            setLinesState(prev => prev.filter((_, i) => i !== index));
        }
    };

    const handleApply = async () => {
        if (!id) return;

        // Validation: Check if any applied lines are missing product ID
        const invalidLines = linesState.filter(l => l.apply && !l.productId);
        if (invalidLines.length > 0) {
            toast.error(tPlural('invoice.review.needProduct', invalidLines.length));
            return;
        }

        try {
            setSubmitting(true);

            const payload: ApplyInvoiceRequest = {
                lines: linesState.map((line, index) => ({
                    lineIndex: index,
                    parsedLineNo: line.parsedLineNo,
                    apply: line.apply,
                    productId: line.productId,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice,
                    applyStock: line.applyStock,
                    applyPrice: line.applyPrice
                }))
            };

            const result = await applyInvoice(parseInt(id), payload);

            toast.success(tPlural('invoice.review.applied', result.appliedLines));
            navigate('/'); // Or to invoice detail if it exists

        } catch (err) {
            console.error('Failed to apply invoice:', err);
            toast.error(errorMessage(err, t('error.invoiceApply')));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <p className="text-slate-500">{t('invoice.review.reading')}</p>
            </div>
        );
    }

    if (error || !invoice) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center">
                <AlertTriangle className="w-12 h-12 text-red-500" />
                <h2 className="text-xl font-semibold text-slate-900">
                    {t('invoice.review.wentWrong')}
                </h2>
                <p className="text-slate-500">{error || t('invoice.review.notFound')}</p>
                <button
                    onClick={() => navigate('/invoices/upload')}
                    className="text-blue-600 font-medium hover:underline"
                >
                    {t('invoice.review.backToUpload')}
                </button>
            </div>
        );
    }

    const appliedCount = linesState.filter(l => l.apply).length;

    return (
        <div className="pb-32">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
                <div className="max-w-3xl mx-auto px-4 py-4">
                    <div className="flex items-center gap-4 mb-4">
                        <button
                            onClick={() => navigate('/invoices/upload')}
                            className="p-2 -ml-2 hover:bg-slate-50 rounded-full text-slate-500"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <h1 className="text-xl font-bold text-slate-900">
                            {t('invoice.review.title')}
                        </h1>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <div className="text-slate-500 text-xs uppercase tracking-wider font-semibold">
                                {t('invoice.review.supplier')}
                            </div>
                            <div className="font-medium text-slate-900">{invoice.supplierName}</div>
                            {invoice.supplierFromDocument && invoice.supplierFromDocument !== invoice.supplierName && (
                                <div className="text-xs text-slate-400">
                                    {t('invoice.review.onDocument', {
                                        name: invoice.supplierFromDocument,
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="text-right">
                            <div className="text-slate-500 text-xs uppercase tracking-wider font-semibold">
                                {t('invoice.review.date')}
                            </div>
                            <div className="font-medium text-slate-900">
                                {invoice.issueDate
                                    ? formatDate(invoice.issueDate)
                                    : t('invoice.review.unknownDate')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-slate-900">
                        {t('invoice.review.lineItems', { count: linesState.length })}
                    </h2>
                    <button
                        onClick={handleAddManualLine}
                        className="text-sm text-blue-600 font-medium flex items-center gap-1 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                        <Plus size={16} />
                        {t('invoice.review.addLine')}
                    </button>
                </div>

                <div className="space-y-4">
                    {linesState.map((line, index) => (
                        <InvoiceLineItem
                            key={index}
                            index={index}
                            line={line}
                            onChange={handleLineChange}
                            onRemove={handleRemoveLine}
                            isManual={line.parsedLineNo === null}
                            supplierId={invoice.supplierId}
                        />
                    ))}
                </div>
            </div>

            {/* Footer Actions */}
            <div className="fixed left-0 right-0 bg-white border-t border-slate-200 p-4 safe-area-bottom bottom-16 md:bottom-0">
                <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
                    <div className="text-sm text-slate-500">
                        {/* pluralKey picks the form Intl would, so the bold count can
                            sit inside a sentence that inflects in English and not in
                            Turkish, without a hand-written ternary here. */}
                        <T
                            k={pluralKey('invoice.review.selected', appliedCount)}
                            values={{
                                count: (
                                    <strong className="text-slate-900">{appliedCount}</strong>
                                ),
                            }}
                        />
                    </div>
                    <button
                        onClick={handleApply}
                        disabled={submitting || appliedCount === 0}
                        className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-blue-200 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:shadow-none"
                    >
                        {submitting ? (
                            <>
                                <Loader2 size={20} className="animate-spin" />
                                {t('invoice.review.applying')}
                            </>
                        ) : (
                            <>
                                <CheckCircle2 size={20} />
                                {t('invoice.review.apply')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
