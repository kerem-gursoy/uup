import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight, FileText, History, Upload } from 'lucide-react';
import { errorMessage, getInvoices, type InvoiceSummary } from '../services/api';
import { formatDateRelative } from '../lib/format';
import { Button, Card, EmptyBlock, ErrorBlock, LoadingBlock } from '../components/ui';
import { useT } from '../i18n';

/**
 * The invoices that have been uploaded, and whether their stock and costs have
 * been recorded yet.
 *
 * This exists because the home screen counts invoices still waiting to be
 * reviewed, and a count with nowhere to go is worse than no count at all. Those
 * still waiting are listed first, since they are the ones representing work.
 */
export default function InvoiceListPage() {
    const t = useT();
    const navigate = useNavigate();

    const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setInvoices(await getInvoices());
        } catch (err) {
            setError(errorMessage(err, t('error.invoicesLoad')));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        load();
    }, [load]);

    const waiting = invoices.filter((invoice) => invoice.status !== 'APPLIED');
    const done = invoices.filter((invoice) => invoice.status === 'APPLIED');

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">
                        {t('invoice.list.title')}
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">
                        {loading
                            ? t('common.loading')
                            : waiting.length > 0
                              ? t('invoice.list.waiting', { count: waiting.length })
                              : t('invoice.list.allReviewed')}
                    </p>
                </div>
                <Button
                    onClick={() => navigate('/invoices/upload')}
                    icon={<Upload size={20} />}
                >
                    {t('invoice.list.upload')}
                </Button>
            </div>

            {loading ? (
                <LoadingBlock label={t('invoice.list.loading')} />
            ) : error ? (
                <Card>
                    <ErrorBlock message={error} onRetry={load} />
                </Card>
            ) : invoices.length === 0 ? (
                <Card>
                    <EmptyBlock
                        icon={<FileText size={26} />}
                        title={t('invoice.list.empty')}
                        description={t('invoice.list.emptyHint')}
                        action={
                            <Button onClick={() => navigate('/invoices/upload')} icon={<Upload size={20} />}>
                                {t('invoice.list.uploadOne')}
                            </Button>
                        }
                    />
                </Card>
            ) : (
                <div className="space-y-5">
                    {waiting.length > 0 && (
                        <section className="space-y-2.5">
                            <h2 className="font-semibold text-slate-900">
                                {t('invoice.list.waitingHeading')}
                            </h2>
                            <ul className="space-y-2.5">
                                {waiting.map((invoice) => (
                                    <InvoiceRow
                                        key={invoice.id}
                                        invoice={invoice}
                                        onClick={() => navigate(`/invoices/${invoice.id}/review`)}
                                    />
                                ))}
                            </ul>
                        </section>
                    )}

                    {done.length > 0 && (
                        <section className="space-y-2.5">
                            <h2 className="font-semibold text-slate-900">
                                {t('invoice.list.doneHeading')}
                            </h2>
                            <ul className="space-y-2.5">
                                {done.map((invoice) => (
                                    <InvoiceRow key={invoice.id} invoice={invoice} />
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
}

function InvoiceRow({
    invoice,
    onClick,
}: {
    invoice: InvoiceSummary;
    onClick?: () => void;
}) {
    const t = useT();
    const applied = invoice.status === 'APPLIED';

    const body = (
        <>
            <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900 truncate">
                    {invoice.supplier.name}
                </span>
                <span className="block text-sm text-slate-500 truncate">
                    {formatDateRelative(invoice.createdAt)} · {invoice.originalName}
                </span>
                {!applied && invoice.startedAt && (
                    <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full">
                        <History size={12} aria-hidden="true" />
                        {t('invoice.list.startedAt', {
                            when: formatDateRelative(invoice.startedAt),
                        })}
                    </span>
                )}
            </span>
            {applied ? (
                <span className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full">
                    <CheckCircle2 size={15} aria-hidden="true" />
                    {t('invoice.list.recorded')}
                </span>
            ) : (
                <span className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-blue-700">
                    {/* An invoice somebody started and left says so, because the
                        difference between "this is untouched" and "your work is
                        still in there" is the difference between dreading the tap
                        and taking it. */}
                    {invoice.startedAt ? t('invoice.list.continue') : t('invoice.list.review')}
                    <ChevronRight size={17} aria-hidden="true" />
                </span>
            )}
        </>
    );

    return (
        <li>
            {onClick ? (
                <button
                    type="button"
                    onClick={onClick}
                    className="w-full text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3 hover:border-slate-300 hover:shadow-md active:scale-[0.995] transition"
                >
                    {body}
                </button>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
                    {body}
                </div>
            )}
        </li>
    );
}
