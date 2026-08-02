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
import { useT, useTPlural, type t as translate } from '../i18n';

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

function buildSignals(report: AttentionReport, t: typeof translate): Signal[] {
    return [
        {
            key: 'below-cost',
            count: report.sellingBelowCost,
            label: t('home.signal.belowCost.label'),
            detail: t('home.signal.belowCost.detail'),
            to: '/products?filter=below-cost',
            icon: <TrendingDown size={20} />,
            tone: 'urgent',
            alwaysShow: false,
        },
        {
            key: 'low',
            count: report.lowStock,
            // Two whole sentences rather than one with a bolted-on clause: the
            // "at zero" part lands in a different place in Turkish.
            label:
                report.outOfStock > 0
                    ? t('home.signal.low.labelWithZero', { count: report.outOfStock })
                    : t('home.signal.low.label'),
            detail: t('home.signal.low.detail', { threshold: report.lowStockThreshold }),
            to: '/products?filter=low',
            icon: <AlertTriangle size={20} />,
            tone: 'warn',
            alwaysShow: true,
        },
        {
            key: 'invoices',
            count: report.invoicesToReview,
            label: t('home.signal.invoices.label'),
            detail: t('home.signal.invoices.detail'),
            to: '/invoices',
            icon: <FileText size={20} />,
            tone: 'info',
            alwaysShow: true,
        },
        {
            key: 'no-price',
            count: report.missingSellPrice,
            label: t('home.signal.noPrice.label'),
            detail: t('home.signal.noPrice.detail'),
            to: '/products?filter=no-price',
            icon: <Tag size={20} />,
            tone: 'warn',
            alwaysShow: true,
        },
        {
            key: 'cost-rose',
            count: report.costRoseSincePriceSet,
            label: t('home.signal.costRose.label'),
            detail: t('home.signal.costRose.detail'),
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
    const t = useT();
    const tPlural = useTPlural();
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
            setError(errorMessage(err, t('error.shopLoad')));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        load();
    }, [load]);

    const signals = report ? buildSignals(report, t) : [];
    const visible = signals.filter((signal) => signal.alwaysShow || signal.count > 0);
    const needsAttention = visible.filter((signal) => signal.count > 0);

    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">{t('home.title')}</h1>
                <p className="text-slate-500 mt-0.5">
                    {loading
                        ? t('home.checking')
                        : needsAttention.length === 0
                          ? t('home.nothingNeeds')
                          : tPlural('home.needsAttention', needsAttention.length)}
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
                                <span className="font-medium">{t('home.allClear')}</span>
                            </p>
                        </Card>
                    )}

                    <ul className="space-y-2.5">
                        {visible.map((signal) => (
                            <SignalRow
                                key={signal.key}
                                signal={signal}
                                clearedLabel={t('home.rowClear')}
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
                            {t('home.scan')}
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => navigate('/products/new')}
                            icon={<Plus size={20} />}
                            className="min-h-[56px]"
                        >
                            {t('home.addProduct')}
                        </Button>
                    </div>

                    {activity.length > 0 && (
                        <Card className="overflow-hidden">
                            <div className="p-4 border-b border-slate-100">
                                <h2 className="font-semibold text-slate-900">
                                    {t('home.recentChanges')}
                                </h2>
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
                                                    {describeActivity(entry, t)}
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
function SignalRow({
    signal,
    clearedLabel,
    onClick,
}: {
    signal: Signal;
    clearedLabel: string;
    onClick: () => void;
}) {
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
                        {cleared ? clearedLabel : signal.detail}
                    </span>
                </span>

                {!cleared && <ChevronRight size={20} className="text-slate-400 shrink-0" />}
            </button>
        </li>
    );
}

function describeActivity(entry: ActivityEntry, t: typeof translate): string {
    if (entry.type === 'STOCK' && entry.quantity !== null) {
        const direction = entry.quantity > 0 ? `+${entry.quantity}` : String(entry.quantity);
        return entry.detail
            ? t('home.activity.stockDetail', { direction, detail: entry.detail })
            : t('home.activity.stock', { direction });
    }

    if (entry.type === 'PRICE' && entry.priceCents !== null) {
        return t('home.activity.price', {
            what: entry.priceKind === 'COST' ? t('chart.cost') : t('chart.sellingPrice'),
            amount: formatMoney(entry.priceCents),
        });
    }

    // Whatever the server wrote, verbatim - it is the shop's own note, not copy.
    return entry.detail;
}
