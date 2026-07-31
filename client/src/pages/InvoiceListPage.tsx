import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight, FileText, Upload } from 'lucide-react';
import { errorMessage, getInvoices, type InvoiceSummary } from '../services/api';
import { formatDateRelative } from '../lib/format';
import { Button, Card, EmptyBlock, ErrorBlock, LoadingBlock } from '../components/ui';

/**
 * The invoices that have been uploaded, and whether their stock and costs have
 * been recorded yet.
 *
 * This exists because the home screen counts invoices still waiting to be
 * reviewed, and a count with nowhere to go is worse than no count at all. Those
 * still waiting are listed first, since they are the ones representing work.
 */
export default function InvoiceListPage() {
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
            setError(errorMessage(err, 'Could not load your invoices.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const waiting = invoices.filter((invoice) => invoice.status !== 'APPLIED');
    const done = invoices.filter((invoice) => invoice.status === 'APPLIED');

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
                    <p className="text-slate-500 text-sm mt-0.5">
                        {loading
                            ? 'Loading…'
                            : waiting.length > 0
                              ? `${waiting.length} waiting to be reviewed`
                              : 'All reviewed'}
                    </p>
                </div>
                <Button
                    onClick={() => navigate('/invoices/upload')}
                    icon={<Upload size={20} />}
                >
                    Upload
                </Button>
            </div>

            {loading ? (
                <LoadingBlock label="Loading invoices…" />
            ) : error ? (
                <Card>
                    <ErrorBlock message={error} onRetry={load} />
                </Card>
            ) : invoices.length === 0 ? (
                <Card>
                    <EmptyBlock
                        icon={<FileText size={26} />}
                        title="No invoices yet"
                        description="Photograph a supplier invoice and the app will read the lines off it for you."
                        action={
                            <Button onClick={() => navigate('/invoices/upload')} icon={<Upload size={20} />}>
                                Upload an invoice
                            </Button>
                        }
                    />
                </Card>
            ) : (
                <div className="space-y-5">
                    {waiting.length > 0 && (
                        <section className="space-y-2.5">
                            <h2 className="font-semibold text-slate-900">Waiting for you</h2>
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
                            <h2 className="font-semibold text-slate-900">Already recorded</h2>
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
            </span>
            {applied ? (
                <span className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full">
                    <CheckCircle2 size={15} />
                    Recorded
                </span>
            ) : (
                <span className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-blue-700">
                    Review
                    <ChevronRight size={17} />
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
