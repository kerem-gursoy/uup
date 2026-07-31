import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Plus,
    AlertTriangle,
    Check,
    CheckCircle2,
    CloudOff,
    History,
    Loader2,
    RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
    errorMessage,
    getInvoiceReview,
    parseInvoice,
    applyInvoice,
    saveInvoiceDraft,
    type ParsedInvoiceResponse,
    type ApplyInvoiceRequest,
} from '../services/api';
import InvoiceLineItem from '../components/InvoiceLineItem';
import { linesFromDraft, linesFromParse, type LineItemState } from '../lib/invoiceReview';
import { useAutosave, type AutosaveStatus } from '../hooks/useAutosave';
import { formatDate, formatDateRelative } from '../lib/format';
import { pluralKey, useT, useTPlural } from '../i18n';
import { T } from '../i18n/T';

/**
 * Checking what the parser read off a supplier invoice, before it is written into
 * stock and cost history.
 *
 * Nothing on this screen is throwaway. The reading cost a Gemini call, and the
 * corrections on top of it are somebody working through a paper invoice line by
 * line - so both are kept on the server: the reading because re-deriving it from
 * a photograph that cannot change is paying twice for the same answer, and the
 * corrections because a shop assistant gets interrupted. Opening this screen a
 * second time picks up where the first left off, instead of starting over.
 */
export default function InvoiceReviewPage() {
    const t = useT();
    const tPlural = useTPlural();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const invoiceId = id && /^\d+$/.test(id) ? Number(id) : null;

    const [invoice, setInvoice] = useState<ParsedInvoiceResponse | null>(null);
    const [linesState, setLinesState] = useState<LineItemState[]>([]);
    const [loading, setLoading] = useState(true);
    /** A Gemini call is in flight - the slow path, and worth saying so. */
    const [reading, setReading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    /** Set when these lines came from a draft rather than from the reading. */
    const [restoredAt, setRestoredAt] = useState<string | null>(null);
    /** True once the reviewer has changed something, so a visit that only looks
     *  never writes a draft. */
    const [edited, setEdited] = useState(false);
    // Held unresolved rather than as a message: this screen re-renders in the new
    // language when the reader switches, and a message translated back when it
    // was caught would stay in the old one.
    const [error, setError] = useState<unknown>(null);

    const parsedAt = invoice?.parsedAt ?? null;

    const persistDraft = useCallback(
        (lines: LineItemState[], { keepalive }: { keepalive: boolean }) => {
            if (invoiceId === null || parsedAt === null) return Promise.resolve();
            return saveInvoiceDraft(invoiceId, { parsedAt, lines }, { keepalive });
        },
        [invoiceId, parsedAt]
    );

    const { status: draftStatus, discard: discardPendingDraft } = useAutosave({
        value: linesState,
        enabled: edited && invoice !== null,
        save: persistDraft,
    });

    useEffect(() => {
        if (invoiceId === null) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        const open = async () => {
            setLoading(true);
            setError(null);

            try {
                // Costs nothing, and usually answers the whole question: an
                // invoice opened before already has its reading, and may have a
                // half-finished review waiting against it.
                const { parsed, draft } = await getInvoiceReview(invoiceId);
                if (cancelled) return;

                // Null only for an invoice nobody has read yet. The one path here
                // that waits on the model, and it happens once per invoice.
                let current = parsed;
                if (!current) {
                    setReading(true);
                    current = await parseInvoice(invoiceId);
                    if (cancelled) return;
                }

                const restored = draft ? linesFromDraft(draft.lines) : null;

                setInvoice(current);
                setLinesState(restored ?? linesFromParse(current));
                setRestoredAt(restored && draft ? draft.updatedAt : null);
                setEdited(false);

                if (restored && draft) {
                    toast.success(
                        t('invoice.review.draftRestoredToast', {
                            when: formatDateRelative(draft.updatedAt),
                        })
                    );
                }
            } catch (err) {
                if (cancelled) return;
                console.error('Failed to load invoice:', err);
                setError(err);
            } finally {
                if (!cancelled) {
                    setLoading(false);
                    setReading(false);
                }
            }
        };

        open();

        return () => {
            cancelled = true;
        };
        // `t` is deliberately not a dependency. It takes a new identity on every
        // language switch, and re-running this would refetch - throwing away the
        // reviewer's corrections - for data that does not depend on the language.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [invoiceId]);

    const handleLineChange = (index: number, updates: Partial<LineItemState>) => {
        setEdited(true);
        setLinesState(prev => {
            const newLines = [...prev];
            newLines[index] = { ...newLines[index], ...updates };
            return newLines;
        });
    };

    const handleAddManualLine = () => {
        setEdited(true);
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
            setEdited(true);
            setLinesState(prev => prev.filter((_, i) => i !== index));
        }
    };

    /**
     * Reads the document again from scratch.
     *
     * The only action here that spends money, and the remedy for a reading gone
     * badly enough wrong that correcting it by hand is worse than starting over.
     * It replaces every line on screen, so anything already corrected goes with
     * them - hence the warning, and only when there is something to lose.
     */
    const handleReread = async () => {
        if (invoiceId === null) return;

        const hasWork = edited || restoredAt !== null;
        if (hasWork && !confirm(t('invoice.review.rereadConfirm'))) return;

        // The draft is about to be replaced on the server. Letting a debounced
        // save fire after that would be writing corrections against lines that no
        // longer exist - the server refuses it, but there is no reason to ask.
        discardPendingDraft();
        setReading(true);
        setLoading(true);

        try {
            const parsed = await parseInvoice(invoiceId, { refresh: true });
            setInvoice(parsed);
            setLinesState(linesFromParse(parsed));
            setRestoredAt(null);
            setEdited(false);
            toast.success(t('invoice.review.rereadDone'));
        } catch (err) {
            console.error('Failed to re-read invoice:', err);
            toast.error(errorMessage(err, t('error.invoiceReread')));
        } finally {
            setReading(false);
            setLoading(false);
        }
    };

    const handleApply = async () => {
        if (invoiceId === null) return;

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

            const result = await applyInvoice(invoiceId, payload);

            // Applying is what the draft was building towards, and the server
            // drops it in the same write. Dropping it here too stops the flush on
            // unmount from writing a new one on the way out.
            discardPendingDraft();

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
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <div>
                    <p className="text-slate-500">
                        {reading ? t('invoice.review.reading') : t('common.loading')}
                    </p>
                    {/* Only on the slow path. A few seconds of apparent nothing is
                        where a user starts tapping things. */}
                    {reading && (
                        <p className="text-slate-400 text-sm mt-1">
                            {t('invoice.review.readingHint')}
                        </p>
                    )}
                </div>
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
                <p className="text-slate-500">
                    {error
                        ? errorMessage(error, t('error.invoiceLoad'))
                        : t('invoice.review.notFound')}
                </p>
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
                    <div className="flex items-center gap-3 mb-4">
                        <button
                            onClick={() => navigate('/invoices')}
                            aria-label={t('common.back')}
                            className="shrink-0 p-2 -ml-2 hover:bg-slate-50 rounded-full text-slate-500"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl font-bold text-slate-900 truncate">
                                {t('invoice.review.title')}
                            </h1>
                            {/* Fixed height whether or not there is anything to
                                say, so the invoice details below do not jump the
                                moment the first edit turns this line on. */}
                            <div className="h-4 mt-0.5 flex items-center">
                                <DraftStatus status={draftStatus} restoredAt={restoredAt} />
                            </div>
                        </div>
                        <button
                            onClick={handleReread}
                            aria-label={t('invoice.review.reread')}
                            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:scale-95 transition"
                        >
                            <RefreshCw size={16} />
                            <span className="hidden sm:inline">
                                {t('invoice.review.reread')}
                            </span>
                        </button>
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

/**
 * Whether this screen's work is safe, in one quiet line under the title.
 *
 * Understated on purpose - it is meant to be glanced at, not read. The one state
 * that raises its voice is the one that changes what the reader should do: if
 * saving is failing, finishing the invoice in this sitting stops being optional.
 */
function DraftStatus({
    status,
    restoredAt,
}: {
    status: AutosaveStatus;
    restoredAt: string | null;
}) {
    const t = useT();

    const states: Record<
        Exclude<AutosaveStatus, 'idle'>,
        { icon: ReactNode; label: string; tone: string }
    > = {
        saving: {
            icon: <Loader2 size={12} className="animate-spin" />,
            label: t('invoice.review.draftSaving'),
            tone: 'text-slate-500',
        },
        saved: {
            icon: <Check size={12} />,
            label: t('invoice.review.draftSaved'),
            tone: 'text-slate-500',
        },
        failed: {
            icon: <CloudOff size={12} />,
            label: t('invoice.review.draftFailed'),
            tone: 'text-amber-700 font-medium',
        },
    };

    // Nothing has been edited yet, so the only thing left worth saying is that
    // these lines are not where the reading left them.
    const shown =
        status === 'idle'
            ? restoredAt
                ? {
                      icon: <History size={12} />,
                      label: t('invoice.review.draftRestored'),
                      tone: 'text-slate-500',
                  }
                : null
            : states[status];

    if (!shown) return null;

    return (
        <span className={clsx('flex items-center gap-1 text-xs', shown.tone)}>
            {shown.icon}
            {shown.label}
        </span>
    );
}
