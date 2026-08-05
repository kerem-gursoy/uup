import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    AlertTriangle,
    Check,
    CheckCircle2,
    CircleSlash,
    CloudOff,
    History,
    Info,
    Loader2,
    Plus,
    RefreshCw,
    X,
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
    type TotalsCheck,
} from '../services/api';
import InvoiceLineItem from '../components/InvoiceLineItem';
import { Button, ConfirmDialog } from '../components/ui';
import {
    blankLine,
    lineState,
    linesFromDraft,
    linesFromParse,
    tallyLines,
    type LineItemState,
    type LineState,
} from '../lib/invoiceReview';
import { lineStateTokens } from '../lib/lineStateTokens';
import { useAutosave, type AutosaveStatus } from '../hooks/useAutosave';
import { formatDate, formatDateRelative, formatMoney } from '../lib/format';
import { pluralKey, useT, useTPlural } from '../i18n';
import { T } from '../i18n/T';

/**
 * Checking what the parser read off a supplier invoice, before it is written into
 * stock and cost history.
 *
 * The screen is built around the fact that this is not a quick task and should
 * not pretend to be. Applying an invoice moves real stock and rewrites what the
 * shop believes each item costs, so the work is: go down the paper, line by line,
 * and settle each one. What the screen owes that work is a way to see how much of
 * it is left - which is why lines are closed until opened, sorted into settled and
 * unsettled, and counted at the top.
 *
 * Nothing here is throwaway either. The reading cost a Gemini call and the
 * corrections are somebody's afternoon, so both are kept server-side and this
 * screen picks up exactly where it was left.
 */

/** Which lines the list is showing. Document order is never disturbed. */
type Filter = 'all' | LineState;

const rowDomId = (uid: string) => `invoice-line-${uid}`;
const TIPS_DISMISSED_KEY = 'uup.invoiceReviewTipsSeen';

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

    const [filter, setFilter] = useState<Filter>('all');
    /** Only one line is ever open. The screen is long enough already. */
    const [openUid, setOpenUid] = useState<string | null>(null);
    const [confirmingReread, setConfirmingReread] = useState(false);
    const [showTips, setShowTips] = useState(
        () => localStorage.getItem(TIPS_DISMISSED_KEY) !== '1'
    );

    /** Set when a row should be scrolled to once it has rendered open. */
    const scrollTo = useRef<string | null>(null);

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

    // Scrolling happens after the row has rendered in its open state, so that
    // "centre this row" measures the row a reviewer is about to read, not the
    // one-line version of it that was on screen a moment ago.
    useEffect(() => {
        if (!scrollTo.current) return;
        const target = document.getElementById(rowDomId(scrollTo.current));
        scrollTo.current = null;
        target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, [openUid, filter]);

    const tally = useMemo(() => tallyLines(linesState), [linesState]);

    /** Every line's state in document order - what the progress bar is drawn from. */
    const segments = useMemo(
        () => linesState.map((line) => ({ uid: line.uid, state: lineState(line) })),
        [linesState]
    );

    const visibleLines = useMemo(
        () =>
            linesState
                .map((line, index) => ({ line, index }))
                .filter(({ line }) => filter === 'all' || lineState(line) === filter),
        [linesState, filter]
    );

    const updateLine = (index: number, updates: Partial<LineItemState>) => {
        setEdited(true);
        setLinesState((prev) => {
            const next = [...prev];
            next[index] = { ...next[index]!, ...updates };
            return next;
        });
    };

    const handleAddManualLine = () => {
        const line = blankLine();
        setEdited(true);
        setLinesState((prev) => [...prev, line]);
        // Added lines are empty by definition, so they open straight away - there
        // is nothing to read on a closed row that has nothing in it yet.
        setFilter('all');
        setOpenUid(line.uid);
        scrollTo.current = line.uid;
    };

    const handleRemoveLine = (index: number) => {
        setEdited(true);
        setLinesState((prev) => prev.filter((_, i) => i !== index));
        setOpenUid(null);
    };

    /** Opens the first line still wanting a decision, and goes to it. */
    const reviewNext = () => {
        const next = linesState.find((line) => lineState(line) === 'attention');
        if (!next) return;
        setOpenUid(next.uid);
        scrollTo.current = next.uid;
    };

    /**
     * Deals with every outstanding line at once, by leaving them out.
     *
     * The one bulk action this screen can honestly offer. Nothing matches products
     * automatically - the parser returns every line with no product on it - so
     * there is never a pile of machine-made guesses sitting here waiting to be
     * accepted in one tap. What there is instead, on a long invoice, is the tail:
     * delivery charges, pallets, the two items the shop does not stock. Each one
     * has to be unticked by hand before Apply will move, and unticking twelve
     * things one at a time is the part of this screen that wastes the most time.
     *
     * It only ever declines to write. Where a bulk confirm would push a dozen
     * guessed rows into stock and cost history on one tap, this leaves the shop's
     * numbers exactly as they were - so it is offered quietly, and it is offered
     * with a way back.
     */
    const leaveOutTheRest = () => {
        const outstanding = linesState.filter((line) => lineState(line) === 'attention');
        if (outstanding.length === 0) return;

        // Held by uid rather than by index: undo may run after the reviewer has
        // added or removed a line, and putting `apply` back on whatever now sits
        // at position 4 would include a line nobody asked for.
        const affected = new Set(outstanding.map((line) => line.uid));
        const setApply = (apply: boolean) => (prev: LineItemState[]) =>
            prev.map((line) => (affected.has(line.uid) ? { ...line, apply } : line));

        setEdited(true);
        setLinesState(setApply(false));
        setOpenUid(null);

        toast.success(tPlural('invoice.review.leftOutRest', outstanding.length), {
            action: {
                label: t('common.undo'),
                onClick: () => {
                    setEdited(true);
                    setLinesState(setApply(true));
                },
            },
        });
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
            setOpenUid(null);
            setFilter('all');
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

        // Should be unreachable - the button is disabled while anything is
        // unsettled - but a stray line must never reach the server as a 400 that
        // names a line number the reviewer cannot see.
        if (tally.attention > 0) {
            setFilter('attention');
            reviewNext();
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
                    applyPrice: line.applyPrice,
                    // What the document called this line, so the server can
                    // remember what it was decided to mean. This is the entire
                    // mechanism by which next month's invoice from this supplier
                    // arrives already matched.
                    code: line.code,
                    description: line.description,
                })),
            };

            const result = await applyInvoice(invoiceId, payload);

            // Applying is what the draft was building towards, and the server
            // drops it in the same write. Dropping it here too stops the flush on
            // unmount from writing a new one on the way out.
            discardPendingDraft();

            toast.success(tPlural('invoice.review.applied', result.appliedLines));
            navigate('/invoices');
        } catch (err) {
            console.error('Failed to apply invoice:', err);
            toast.error(errorMessage(err, t('error.invoiceApply')));
        } finally {
            setSubmitting(false);
        }
    };

    const dismissTips = () => {
        localStorage.setItem(TIPS_DISMISSED_KEY, '1');
        setShowTips(false);
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
                <Button variant="secondary" onClick={() => navigate('/invoices')}>
                    {t('invoice.review.backToInvoices')}
                </Button>
            </div>
        );
    }

    const blocked = tally.attention > 0 || tally.ready === 0;

    return (
        // Clears the action bar, plus the phone's own navigation sitting under it.
        <div className="pb-40 md:pb-28">
            {/* -mt-8 is not a nudge: Layout fixes a 64px app bar and then pads
                main to 96px, so anything starting at the top of a page begins 32px
                below the bar with the page background showing through the gap. On
                an ordinary page that reads as breathing room. On this one, which
                puts its own white bar there and sticks it at top-16, it read as a
                seam between two white headers - and closed itself the moment you
                scrolled and the sticky took over. Cancelling the padding is the
                same move the -mx already makes horizontally. */}
            <header className="bg-white border-b border-slate-200 sticky top-16 z-20 -mt-8 -mx-4 md:-mx-8 px-4 md:px-8">
                <div className="max-w-3xl mx-auto py-2.5">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => navigate('/invoices')}
                            aria-label={t('common.back')}
                            className="shrink-0 p-2 -ml-2 hover:bg-slate-50 rounded-full text-slate-500"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        {/* One row, and every part of it on the same baseline. The
                            draft line used to sit under the title in a box kept
                            open whether or not it had anything in it, which left a
                            band of empty white through the middle of the header and
                            set the back and re-read buttons floating apart. Out
                            here it costs nothing when it is silent. */}
                        <h1 className="flex-1 min-w-0 text-lg font-bold text-slate-900 truncate">
                            {t('invoice.review.title')}
                        </h1>
                        <DraftStatus status={draftStatus} restoredAt={restoredAt} />
                        <button
                            onClick={() => setConfirmingReread(true)}
                            aria-label={t('invoice.review.reread')}
                            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 min-h-[44px] text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:scale-95 transition"
                        >
                            <RefreshCw size={16} aria-hidden="true" />
                            <span className="hidden sm:inline">{t('invoice.review.reread')}</span>
                        </button>
                    </div>
                </div>
            </header>


            <div className="max-w-3xl mx-auto space-y-5 pt-5">
                <section
                    aria-label={t('invoice.review.documentLabel')}
                    className="bg-white rounded-2xl border border-slate-200 p-4"
                >
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        <div>
                            <dt className="text-slate-500">{t('invoice.review.supplier')}</dt>
                            <dd className="font-semibold text-slate-900">{invoice.supplierName}</dd>
                            {invoice.supplierFromDocument &&
                                invoice.supplierFromDocument !== invoice.supplierName && (
                                    <dd className="text-xs text-slate-400">
                                        {t('invoice.review.onDocument', {
                                            name: invoice.supplierFromDocument,
                                        })}
                                    </dd>
                                )}
                        </div>
                        <div className="text-right">
                            <dt className="text-slate-500">{t('invoice.review.date')}</dt>
                            <dd className="font-semibold text-slate-900">
                                {invoice.issueDate
                                    ? formatDate(invoice.issueDate)
                                    : t('invoice.review.unknownDate')}
                            </dd>
                        </div>
                    </dl>
                </section>

                {showTips && <HowThisWorks onDismiss={dismissTips} />}

                <TotalsWarning check={invoice.totalsCheck} />

                <Progress
                    tally={tally}
                    segments={segments}
                    filter={filter}
                    onFilter={(next) => {
                        setFilter(next);
                        setOpenUid(null);
                    }}
                    onLeaveOutTheRest={leaveOutTheRest}
                />

                <section aria-label={t('invoice.review.linesLabel')}>
                    {visibleLines.length === 0 ? (
                        <p className="text-center text-slate-500 bg-white border border-slate-200 rounded-2xl py-10 px-5">
                            {filter === 'all'
                                ? t('invoice.review.noLines')
                                : t('invoice.review.noneInFilter')}
                        </p>
                    ) : (
                        <ul className="space-y-3">
                            {visibleLines.map(({ line, index }) => (
                                <InvoiceLineItem
                                    key={line.uid}
                                    id={rowDomId(line.uid)}
                                    line={line}
                                    index={index}
                                    open={openUid === line.uid}
                                    onToggle={(open) => setOpenUid(open ? line.uid : null)}
                                    onChange={updateLine}
                                    onRemove={handleRemoveLine}
                                    supplierId={invoice.supplierId}
                                />
                            ))}
                        </ul>
                    )}

                    <button
                        type="button"
                        onClick={handleAddManualLine}
                        className="mt-3 w-full min-h-[52px] rounded-2xl border-2 border-dashed border-slate-300 text-slate-600 font-medium flex items-center justify-center gap-2 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50/50 transition"
                    >
                        <Plus size={20} aria-hidden="true" />
                        {t('invoice.review.addLine')}
                    </button>
                    <p className="mt-2 text-sm text-slate-500 text-center">
                        {t('invoice.review.addLineHint')}
                    </p>
                </section>
            </div>

            {/* Sits directly on top of the bottom nav, which is 4rem of content
                plus the home-indicator inset - so the offset has to include the
                inset too, or on a notched phone this bar lands on the nav. Above
                md the nav is hidden and this bar is the one that has to clear the
                home indicator itself. */}
            <div className="fixed left-0 right-0 bg-white border-t border-slate-200 p-4 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] md:bottom-0 md:pb-[calc(1rem+env(safe-area-inset-bottom,0px))] z-30">
                {/* One row. What used to be here was a banner announcing the
                    outstanding lines above a second line announcing the ready
                    ones, which took two thirds of the bar to say one thing: why
                    the button beside it is grey. Said once, next to the button,
                    small - and carrying the same id either way, so the screen
                    reader landing on a disabled Apply is told the reason too. */}
                <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
                    {tally.attention > 0 ? (
                        <button
                            type="button"
                            id="apply-summary"
                            onClick={() => {
                                setFilter('attention');
                                reviewNext();
                            }}
                            className="min-w-0 flex items-start gap-1.5 text-left text-sm text-amber-700 hover:text-amber-900 underline decoration-amber-300 underline-offset-4 transition-colors"
                        >
                            <AlertTriangle size={15} aria-hidden="true" className="shrink-0 mt-0.5" />
                            <span>{tPlural('invoice.review.blocked', tally.attention)}</span>
                        </button>
                    ) : (
                        <p className="text-sm text-slate-600" id="apply-summary">
                            {/* pluralKey picks the form Intl would, so the bold
                                count can sit inside a sentence that inflects in
                                English and not in Turkish. */}
                            <T
                                k={pluralKey('invoice.review.willApply', tally.ready)}
                                values={{
                                    count: (
                                        <strong className="text-slate-900">{tally.ready}</strong>
                                    ),
                                }}
                            />
                        </p>
                    )}
                    <Button
                        onClick={handleApply}
                        busy={submitting}
                        disabled={blocked}
                        aria-describedby="apply-summary"
                        icon={<CheckCircle2 size={20} />}
                        className="shrink-0"
                    >
                        {submitting ? t('invoice.review.applying') : t('invoice.review.apply')}
                    </Button>
                </div>
            </div>

            {confirmingReread && (
                <ConfirmDialog
                    title={t('invoice.review.rereadTitle')}
                    body={
                        edited || restoredAt
                            ? t('invoice.review.rereadConfirm')
                            : t('invoice.review.rereadBody')
                    }
                    confirmLabel={t('invoice.review.reread')}
                    destructive={Boolean(edited || restoredAt)}
                    onConfirm={handleReread}
                    onClose={() => setConfirmingReread(false)}
                />
            )}
        </div>
    );
}

/**
 * The lines do not add up to the total printed on the invoice.
 *
 * This is the only thing on the screen that can tell you about a line which is
 * not here. Every other check works on a row that exists, so a row the reading
 * dropped entirely leaves nothing behind to go wrong - the invoice simply comes
 * back shorter, every remaining line settles cleanly, and a delivery goes
 * unrecorded with the screen reporting a tidy success.
 *
 * Shown rather than blocking, and worded as a question rather than a verdict:
 * the difference can also be a discount line, a rounding the document does
 * differently, or a total the reading itself misread. The person with the paper
 * can see which in a second - the app's job is to make sure they look.
 */
function TotalsWarning({ check }: { check: TotalsCheck }) {
    const t = useT();

    if (check.status !== 'disagrees' || check.difference === null) return null;

    const short = check.difference > 0;
    const amount = formatMoney(Math.round(Math.abs(check.difference) * 100));

    return (
        <section className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle
                size={20}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-amber-700"
            />
            <div className="min-w-0">
                <h2 className="font-semibold text-amber-950">
                    {t('invoice.review.totalsTitle')}
                </h2>
                <p className="mt-1 text-sm text-amber-900">
                    {t('invoice.review.totalsBody', {
                        lines: formatMoney(Math.round(check.linesTotal * 100)),
                        document: formatMoney(Math.round((check.documentTotal ?? 0) * 100)),
                    })}
                </p>
                <p className="mt-1.5 text-sm text-amber-900">
                    {short
                        ? t('invoice.review.totalsShort', { amount })
                        : t('invoice.review.totalsOver', { amount })}
                </p>
            </div>
        </section>
    );
}

/**
 * What this screen is for, for somebody meeting it the first time.
 *
 * Three things nobody can infer from the controls: that the reading is a guess
 * worth checking, that nothing is written until Apply, and what Apply actually
 * does to the shop's numbers. Dismissible, because it stops being news.
 */
function HowThisWorks({ onDismiss }: { onDismiss: () => void }) {
    const t = useT();

    return (
        <section className="relative bg-blue-50 border border-blue-200 rounded-2xl p-4 pr-12">
            <h2 className="font-semibold text-blue-950 flex items-center gap-2">
                <Info size={18} aria-hidden="true" />
                {t('invoice.review.tipsTitle')}
            </h2>
            <ul className="mt-2 space-y-1.5 text-sm text-blue-900 list-disc pl-5">
                <li>{t('invoice.review.tipCheck')}</li>
                <li>{t('invoice.review.tipProduct')}</li>
                <li>{t('invoice.review.tipApply')}</li>
            </ul>
            <button
                type="button"
                onClick={onDismiss}
                aria-label={t('common.close')}
                className="absolute top-2 right-2 p-2 rounded-full text-blue-700 hover:bg-blue-100"
            >
                <X size={18} />
            </button>
        </section>
    );
}

/**
 * How much of the invoice is settled, and a way to see only what is not.
 *
 * The filters keep document order rather than grouping, because the reviewer is
 * working down a piece of paper and a list that reshuffles itself as they go is
 * a list they have to find their place in again after every decision.
 */
function Progress({
    tally,
    segments,
    filter,
    onFilter,
    onLeaveOutTheRest,
}: {
    tally: ReturnType<typeof tallyLines>;
    segments: { uid: string; state: LineState }[];
    filter: Filter;
    onFilter: (filter: Filter) => void;
    onLeaveOutTheRest: () => void;
}) {
    const t = useT();
    const tPlural = useTPlural();
    const total = segments.length;
    const settled = tally.ready + tally.excluded;

    return (
        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-slate-900">{t('invoice.review.progressTitle')}</h2>
                {/* Announced, so the count reaching a screen reader keeps step
                    with the count on screen as lines get settled. */}
                <p aria-live="polite" className="text-sm text-slate-600 tabular-nums">
                    {t('invoice.review.progressCount', { done: settled, total })}
                </p>
            </div>

            {/* One block per line, in document order, rather than a single filled
                bar. Both say how much is left; only this one says where it is, so
                a reviewer scrolling a long invoice can see that the outstanding
                work is the last four rows and not scattered through fifty. The
                count beside the heading carries the same figure for anyone who
                cannot use the colours. */}
            <div
                className="h-2 rounded-full bg-slate-100 overflow-hidden flex gap-px"
                role="progressbar"
                aria-valuenow={settled}
                aria-valuemin={0}
                aria-valuemax={total}
                aria-label={t('invoice.review.progressTitle')}
            >
                {segments.map(({ uid, state }) => (
                    <span
                        key={uid}
                        className={clsx('flex-1 transition-colors', lineStateTokens[state].bar)}
                    />
                ))}
            </div>

            <div
                role="group"
                aria-label={t('invoice.review.filterLabel')}
                className="flex gap-2 overflow-x-auto -mx-1 px-1 py-0.5"
            >
                <FilterPill
                    active={filter === 'all'}
                    onClick={() => onFilter('all')}
                    label={t('invoice.review.filterAll')}
                    count={total}
                />
                <FilterPill
                    active={filter === 'attention'}
                    onClick={() => onFilter('attention')}
                    label={t('invoice.review.filterAttention')}
                    count={tally.attention}
                    icon={<AlertTriangle size={14} />}
                    tone="amber"
                />
                <FilterPill
                    active={filter === 'ready'}
                    onClick={() => onFilter('ready')}
                    label={t('invoice.review.filterReady')}
                    count={tally.ready}
                    icon={<Check size={14} />}
                    tone="emerald"
                />
                <FilterPill
                    active={filter === 'excluded'}
                    onClick={() => onFilter('excluded')}
                    label={t('invoice.review.filterExcluded')}
                    count={tally.excluded}
                    icon={<CircleSlash size={14} />}
                />
            </div>

            {/* Getting to the next outstanding line is what the "Needs you" filter
                above already does, so the full-width button that used to sit here
                was a second front door taking up more room than the panel it was
                in. What is left is the one action nothing else offers. */}
            {tally.attention > 0 && (
                <button
                    type="button"
                    onClick={onLeaveOutTheRest}
                    className="w-full min-h-[44px] px-3 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition"
                >
                    {tPlural('invoice.review.leaveOutRest', tally.attention)}
                </button>
            )}
        </section>
    );
}

function FilterPill({
    active,
    onClick,
    label,
    count,
    icon,
    tone,
}: {
    active: boolean;
    onClick: () => void;
    label: string;
    count: number;
    icon?: ReactNode;
    tone?: 'amber' | 'emerald';
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={clsx(
                'shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 min-h-[44px] text-sm font-medium border transition',
                active
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50',
                !active && tone === 'amber' && count > 0 && 'text-amber-900 border-amber-300 bg-amber-50',
                !active && tone === 'emerald' && count > 0 && 'text-emerald-900 border-emerald-300 bg-emerald-50'
            )}
        >
            {icon}
            {label}
            <span className="tabular-nums opacity-80">{count}</span>
        </button>
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
        <span className={clsx('shrink-0 flex items-center gap-1 text-xs', shown.tone)}>
            {shown.icon}
            {/* The words go when the header gets tight; the icon stays, because a
                save that is failing has to survive a narrow screen. */}
            <span className={clsx(status === 'failed' ? 'inline' : 'hidden sm:inline')}>
                {shown.label}
            </span>
        </span>
    );
}
