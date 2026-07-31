import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle,
    CheckCircle2,
    ChevronRight,
    FileText,
    Plus,
    ScanLine,
    Tag,
    TrendingDown,
} from 'lucide-react';
import {
    errorMessage,
    getAttention,
    getRecentActivity,
    type ActivityEntry,
    type AttentionReport,
} from '../services/api';
import { formatDateRelative, formatMoney } from '../lib/format';
import { Button, Card, ErrorBlock, LoadingBlock } from '../components/ui';

/**
 * The home screen answers one question: what needs me today?
 *
 * It used to stack four competing blocks - a search box that only navigated
 * elsewhere, a grid of coloured shortcuts, a low-stock list and an activity feed
 * - none of which was ranked and none of which surfaced work the shop had left
 * undone. This is a single ordered list instead, most urgent first, where every
 * row is a real count and every row leads to exactly those items.
 */

type Signal = {
    key: string;
    count: number;
    label: string;
    detail: string;
    to: string;
    icon: React.ReactNode;
    /** Only the genuinely costly things get a loud colour. */
    tone: 'urgent' | 'warn' | 'info';
    /** Rows worth showing at zero, so the list does not jump around. */
    alwaysShow: boolean;
};

function buildSignals(report: AttentionReport): Signal[] {
    return [
        {
            key: 'below-cost',
            count: report.sellingBelowCost,
            label: 'Sold for less than they cost',
            detail: 'Every sale of these loses money.',
            to: '/products?filter=below-cost',
            icon: <TrendingDown size={20} />,
            tone: 'urgent',
            alwaysShow: false,
        },
        {
            key: 'low',
            count: report.lowStock,
            label:
                report.outOfStock > 0
                    ? `Running low — ${report.outOfStock} of them at zero`
                    : 'Running low',
            detail: `${report.lowStockThreshold} or fewer left.`,
            to: '/products?filter=low',
            icon: <AlertTriangle size={20} />,
            tone: 'warn',
            alwaysShow: true,
        },
        {
            key: 'invoices',
            count: report.invoicesToReview,
            label: 'Invoices to review',
            detail: 'Uploaded, but their stock and costs are not recorded yet.',
            to: '/invoices',
            icon: <FileText size={20} />,
            tone: 'info',
            alwaysShow: true,
        },
        {
            key: 'no-price',
            count: report.missingSellPrice,
            label: 'Missing a selling price',
            detail: 'Without one, this app cannot tell you what you earn on them.',
            to: '/products?filter=no-price',
            icon: <Tag size={20} />,
            tone: 'warn',
            alwaysShow: true,
        },
        {
            key: 'cost-rose',
            count: report.costRoseSincePriceSet,
            label: "Cost changed, price didn't",
            detail: 'What you pay went up after you set your price.',
            to: '/products?filter=cost-rose',
            icon: <TrendingDown size={20} />,
            tone: 'warn',
            alwaysShow: true,
        },
    ];
}

const TONES = {
    urgent: 'bg-red-100 text-red-900',
    warn: 'bg-amber-100 text-amber-900',
    info: 'bg-blue-100 text-blue-900',
} as const;

export default function HomePage() {
    const navigate = useNavigate();

    const [report, setReport] = useState<AttentionReport | null>(null);
    const [activity, setActivity] = useState<ActivityEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [attention, recent] = await Promise.all([
                getAttention(),
                // The feed is secondary; losing it must not blank the screen.
                getRecentActivity().catch(() => [] as ActivityEntry[]),
            ]);
            setReport(attention);
            setActivity(recent);
        } catch (err) {
            setError(errorMessage(err, 'Could not load your shop.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const signals = report ? buildSignals(report) : [];
    const visible = signals.filter((signal) => signal.alwaysShow || signal.count > 0);
    const needsAttention = visible.filter((signal) => signal.count > 0);

    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Today</h1>
                <p className="text-slate-500 mt-0.5">
                    {loading
                        ? 'Checking your shop…'
                        : needsAttention.length === 0
                          ? 'Nothing needs attention.'
                          : `${needsAttention.length} ${needsAttention.length === 1 ? 'thing needs' : 'things need'} attention`}
                </p>
            </div>

            {loading ? (
                <LoadingBlock />
            ) : error ? (
                <Card>
                    <ErrorBlock message={error} onRetry={load} />
                </Card>
            ) : (
                <>
                    {/* A genuine all-clear, so the list is not a permanent wall of
                        red that trains people to ignore it. */}
                    {needsAttention.length === 0 && (
                        <Card className="p-5 bg-emerald-50 border-emerald-200">
                            <p className="flex items-center gap-3 text-emerald-900">
                                <CheckCircle2 size={22} className="shrink-0" />
                                <span className="font-medium">
                                    Everything is stocked, priced and up to date.
                                </span>
                            </p>
                        </Card>
                    )}

                    <ul className="space-y-2.5">
                        {visible.map((signal) => (
                            <SignalRow
                                key={signal.key}
                                signal={signal}
                                onClick={() => navigate(signal.to)}
                            />
                        ))}
                    </ul>

                    {/* The two things done constantly stay one tap away; the rest
                        of the app is in the bottom bar, so nothing is stranded. */}
                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            onClick={() => navigate('/scan')}
                            icon={<ScanLine size={20} />}
                            className="min-h-[56px]"
                        >
                            Scan
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => navigate('/products/new')}
                            icon={<Plus size={20} />}
                            className="min-h-[56px]"
                        >
                            Add product
                        </Button>
                    </div>

                    {activity.length > 0 && (
                        <Card className="overflow-hidden">
                            <div className="p-4 border-b border-slate-100">
                                <h2 className="font-semibold text-slate-900">Recent changes</h2>
                            </div>
                            <ul className="divide-y divide-slate-100">
                                {activity.slice(0, 5).map((entry) => (
                                    <li key={entry.id}>
                                        <button
                                            type="button"
                                            onClick={() => navigate(`/products/${entry.productId}`)}
                                            className="w-full text-left p-4 flex items-start justify-between gap-3 hover:bg-slate-50 transition"
                                        >
                                            <div className="min-w-0">
                                                <p className="font-medium text-slate-900 truncate">
                                                    {entry.productName}
                                                </p>
                                                <p className="text-sm text-slate-500">
                                                    {describeActivity(entry)}
                                                </p>
                                            </div>
                                            <span className="text-xs text-slate-400 shrink-0 pt-0.5">
                                                {formatDateRelative(entry.at)}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}

/**
 * One row per signal. A zero count is kept but visibly settled, so the list has
 * a stable shape and a cleared item reads as an achievement rather than vanishing.
 */
function SignalRow({ signal, onClick }: { signal: Signal; onClick: () => void }) {
    const cleared = signal.count === 0;

    return (
        <li>
            <button
                type="button"
                onClick={onClick}
                disabled={cleared}
                className={`w-full text-left bg-white rounded-2xl border shadow-sm p-4 flex items-center gap-3 transition
                    ${cleared
                        ? 'border-slate-200 opacity-60'
                        : 'border-slate-200 hover:border-slate-300 hover:shadow-md active:scale-[0.995]'
                    }`}
            >
                <span
                    className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center font-bold tabular-nums
                        ${cleared ? 'bg-slate-100 text-slate-500' : TONES[signal.tone]}`}
                >
                    {cleared ? <CheckCircle2 size={20} /> : signal.count}
                </span>

                <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-900">{signal.label}</span>
                    <span className="block text-sm text-slate-500">
                        {cleared ? 'All clear' : signal.detail}
                    </span>
                </span>

                {!cleared && <ChevronRight size={20} className="text-slate-400 shrink-0" />}
            </button>
        </li>
    );
}

function describeActivity(entry: ActivityEntry): string {
    if (entry.type === 'STOCK' && entry.quantity !== null) {
        const direction = entry.quantity > 0 ? `+${entry.quantity}` : String(entry.quantity);
        return entry.detail ? `Stock ${direction} — ${entry.detail}` : `Stock ${direction}`;
    }

    if (entry.type === 'PRICE' && entry.priceCents !== null) {
        const what = entry.priceKind === 'COST' ? 'Cost' : 'Selling price';
        return `${what} set to ${formatMoney(entry.priceCents)}`;
    }

    return entry.detail;
}
