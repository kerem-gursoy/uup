import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Package, Pencil, Tag } from 'lucide-react';
import { toast } from 'sonner';
import {
    adjustProductStock,
    errorMessage,
    getPriceHistory,
    getProductSummary,
    setProductPrice,
    type PriceHistoryEntry,
    type PriceKind,
    type ProductSummary,
    type StockMovement,
} from '../services/api';
import {
    centsToInputValue,
    dateInputToISO,
    formatDate,
    formatDateRelative,
    formatMoney,
    formatMoneyOrBlank,
    parseMoneyToCents,
    profitFrom,
    todayAsInputValue,
} from '../lib/format';
import {
    Button,
    Card,
    ErrorBlock,
    Field,
    LoadingBlock,
    Modal,
    MoneyInput,
    QuantityInput,
    Select,
    TextInput,
} from '../components/ui';
import StockPill from '../components/StockPill';
import PriceChart from '../components/PriceChart';

export default function ProductDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const productId = Number(id);

    const [summary, setSummary] = useState<ProductSummary | null>(null);
    const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [stockModalOpen, setStockModalOpen] = useState(false);
    const [priceModalOpen, setPriceModalOpen] = useState(false);

    const load = useCallback(async () => {
        if (!Number.isInteger(productId) || productId <= 0) {
            setError('That product link is not valid.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const [summaryData, historyData] = await Promise.all([
                getProductSummary(productId),
                getPriceHistory(productId),
            ]);
            setSummary(summaryData);
            setHistory(historyData);
        } catch (err) {
            setError(errorMessage(err, 'Could not load this product.'));
        } finally {
            setLoading(false);
        }
    }, [productId]);

    useEffect(() => {
        load();
    }, [load]);

    if (loading) return <LoadingBlock label="Loading product…" />;

    if (error || !summary) {
        return (
            <Card>
                <ErrorBlock message={error ?? 'Product not found.'} onRetry={load} />
                <div className="pb-6 flex justify-center">
                    <Button variant="ghost" onClick={() => navigate('/products')}>
                        Back to products
                    </Button>
                </div>
            </Card>
        );
    }

    const { product, latestCost, latestSell, currentStock } = summary;
    const profit = profitFrom(latestCost?.priceCents, latestSell?.priceCents);
    const costHistory = history.filter((entry) => entry.kind === 'COST');
    const sellHistory = history.filter((entry) => entry.kind === 'SELL');
    const subtitle = [product.brand, product.supplier?.name].filter(Boolean).join(' • ');

    const handleStockSave = async (quantity: number, reason: string) => {
        try {
            const result = await adjustProductStock(productId, { quantity, reason });
            setStockModalOpen(false);
            toast.success(`Stock is now ${result.currentStock}`);
            await load();
        } catch (err) {
            toast.error(errorMessage(err, 'Could not update the stock.'));
        }
    };

    const handlePriceSave = async (
        changes: Array<{ kind: PriceKind; priceCents: number }>,
        effectiveFrom: string
    ) => {
        try {
            for (const change of changes) {
                await setProductPrice(productId, {
                    kind: change.kind,
                    priceCents: change.priceCents,
                    effectiveFrom: dateInputToISO(effectiveFrom),
                });
            }
            setPriceModalOpen(false);
            toast.success(changes.length > 1 ? 'Prices saved' : 'Price saved');
            await load();
        } catch (err) {
            toast.error(errorMessage(err, 'Could not save the price.'));
        }
    };

    return (
        <div className="space-y-5 pb-8">
            <div>
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 mb-4 min-h-[44px]"
                >
                    <ArrowLeft size={20} />
                    Back
                </button>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold text-slate-900 leading-tight">{product.name}</h1>
                        {subtitle && <p className="text-slate-500 mt-1">{subtitle}</p>}
                        {product.barcode && (
                            <p className="text-xs text-slate-500 font-mono bg-slate-50 border border-slate-100 inline-block px-1.5 py-0.5 rounded mt-2">
                                {product.barcode}
                            </p>
                        )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                        <StockPill quantity={currentStock} />
                        <Button
                            variant="secondary"
                            onClick={() => navigate(`/products/${productId}/edit`)}
                            icon={<Pencil size={17} />}
                            className="min-h-[44px] px-3 text-sm"
                        >
                            Edit
                        </Button>
                    </div>
                </div>
            </div>

            {/* The three numbers that matter, each stamped with when it was set.
                The two prices are buttons: a pencil and a hover lift signal that
                the number itself is the way to change it. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* Stock leads on its own row; the two prices sit side by side
                    underneath because they are read against each other. */}
                <StatCard
                    className="col-span-2 sm:col-span-1"
                    label="In stock"
                    value={String(currentStock)}
                    caption={currentStock === 1 ? 'item' : 'items'}
                    actionLabel="Update stock"
                    onEdit={() => setStockModalOpen(true)}
                />
                <StatCard
                    label="Costs you"
                    value={formatMoneyOrBlank(latestCost?.priceCents)}
                    caption={
                        latestCost
                            ? `since ${formatDate(latestCost.effectiveFrom)}`
                            : 'tap to add'
                    }
                    actionLabel="Change cost"
                    onEdit={() => setPriceModalOpen(true)}
                />
                <StatCard
                    label="Sells for"
                    value={formatMoneyOrBlank(latestSell?.priceCents)}
                    caption={
                        latestSell
                            ? `since ${formatDate(latestSell.effectiveFrom)}`
                            : 'tap to add'
                    }
                    actionLabel="Change selling price"
                    onEdit={() => setPriceModalOpen(true)}
                    emphasis
                />
            </div>

            {profit && (
                <Card
                    className={`px-4 py-3 ${
                        profit.profitCents >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
                    }`}
                >
                    <p className={profit.profitCents >= 0 ? 'text-emerald-900' : 'text-amber-900'}>
                        {profit.profitCents >= 0 ? (
                            <>
                                You make <strong>{formatMoney(profit.profitCents)}</strong> on each one
                                {' '}({profit.marginPercent.toFixed(0)}% of the selling price).
                            </>
                        ) : (
                            <>
                                Careful: this sells for{' '}
                                <strong>{formatMoney(Math.abs(profit.profitCents))}</strong> less than it costs you.
                            </>
                        )}
                    </p>
                </Card>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button onClick={() => setStockModalOpen(true)} icon={<Package size={20} />}>
                    Update stock
                </Button>
                <Button variant="secondary" onClick={() => setPriceModalOpen(true)} icon={<Tag size={20} />}>
                    Change prices
                </Button>
            </div>

            {/* The shape of the two prices over time. The dated lists underneath
                are its table view: every figure here is also readable as text. */}
            {history.length > 0 && (
                <Card className="p-5">
                    <h3 className="font-semibold text-slate-900">Prices over time</h3>
                    <p className="text-sm text-slate-500 mt-0.5 mb-3">
                        How much this has cost you, and what you have charged.
                    </p>
                    <PriceChart history={history} />
                </Card>
            )}

            {/* Both price tracks are shown in full, with a date on every entry. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <PriceHistoryCard
                    title="Cost history"
                    hint="What you paid your supplier, over time."
                    entries={costHistory}
                    emptyText="No cost recorded yet."
                />
                <PriceHistoryCard
                    title="Selling price history"
                    hint="What you charged your customers, over time."
                    entries={sellHistory}
                    emptyText="No selling price recorded yet."
                />
            </div>

            <StockMovementsCard movements={summary.recentMovements} />

            {stockModalOpen && (
                <StockModal
                    currentStock={currentStock}
                    onClose={() => setStockModalOpen(false)}
                    onSave={handleStockSave}
                />
            )}
            {priceModalOpen && (
                <PriceModal
                    latestCostCents={latestCost?.priceCents ?? null}
                    latestSellCents={latestSell?.priceCents ?? null}
                    onClose={() => setPriceModalOpen(false)}
                    onSave={handlePriceSave}
                />
            )}
        </div>
    );
}

/**
 * A number plus the action that changes it.
 *
 * The whole card is the control rather than a separate button beside it: the
 * pencil, the hover lift and the border shift all say "this figure is editable",
 * which is the hint a first-time user needs to find the price screen at all.
 */
function StatCard({
    label,
    value,
    caption,
    emphasis,
    className,
    actionLabel,
    onEdit,
}: {
    label: string;
    value: string;
    caption: string;
    emphasis?: boolean;
    className?: string;
    actionLabel: string;
    onEdit: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onEdit}
            aria-label={actionLabel}
            className={`group text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-4 transition
                hover:border-blue-300 hover:shadow-md focus-visible:outline-none
                focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-100
                active:scale-[0.99] ${className ?? ''}`}
        >
            <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-500">{label}</span>
                <Pencil
                    size={15}
                    aria-hidden="true"
                    className="shrink-0 text-slate-400 group-hover:text-blue-600 transition-colors"
                />
            </span>
            <span
                className={`block font-bold text-slate-900 tabular-nums mt-1 ${
                    emphasis ? 'text-3xl' : 'text-2xl'
                }`}
            >
                {value}
            </span>
            <span className="block text-xs text-slate-500 mt-1">{caption}</span>
        </button>
    );
}

/**
 * Every price the shop has ever recorded, newest first, each with the date it
 * took effect - that dated trail is the whole point of keeping history.
 */
function PriceHistoryCard({
    title,
    hint,
    entries,
    emptyText,
}: {
    title: string;
    hint: string;
    entries: PriceHistoryEntry[];
    emptyText: string;
}) {
    return (
        <Card className="p-5">
            <h3 className="font-semibold text-slate-900">{title}</h3>
            <p className="text-sm text-slate-500 mt-0.5 mb-3">{hint}</p>

            {entries.length === 0 ? (
                <p className="text-slate-500 text-sm py-2">{emptyText}</p>
            ) : (
                <ol className="divide-y divide-slate-100">
                    {entries.map((entry, index) => (
                        <li key={entry.id} className="flex items-baseline justify-between gap-4 py-2.5">
                            <div className="min-w-0">
                                <p className="text-slate-900">{formatDate(entry.effectiveFrom)}</p>
                                {entry.note && (
                                    <p className="text-xs text-slate-500 truncate">{entry.note}</p>
                                )}
                            </div>
                            <div className="text-right shrink-0">
                                <span className="font-semibold text-slate-900 tabular-nums">
                                    {formatMoney(entry.priceCents)}
                                </span>
                                {index === 0 && (
                                    <span className="ml-2 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                                        Now
                                    </span>
                                )}
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </Card>
    );
}

function StockMovementsCard({ movements }: { movements: StockMovement[] }) {
    return (
        <Card className="p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Stock changes</h3>
            {movements.length === 0 ? (
                <p className="text-slate-500 text-sm">Nothing recorded yet.</p>
            ) : (
                <ol className="divide-y divide-slate-100">
                    {movements.slice(0, 8).map((movement) => (
                        <li key={movement.id} className="flex items-center justify-between gap-4 py-2.5">
                            <div className="min-w-0">
                                <p className="text-slate-900 truncate">{movement.reason}</p>
                                <p className="text-xs text-slate-500">
                                    {formatDateRelative(movement.createdAt)}
                                </p>
                            </div>
                            <span
                                className={`font-semibold tabular-nums shrink-0 ${
                                    movement.quantity > 0 ? 'text-emerald-700' : 'text-red-700'
                                }`}
                            >
                                {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                            </span>
                        </li>
                    ))}
                </ol>
            )}
        </Card>
    );
}

const STOCK_REASONS = ['Counted the shelf', 'New delivery', 'Sold', 'Damaged', 'Returned'];

/**
 * Users think in "how many are there now", not in deltas, so the field asks for
 * the new total and the difference is worked out here.
 */
function StockModal({
    currentStock,
    onClose,
    onSave,
}: {
    currentStock: number;
    onClose: () => void;
    onSave: (quantity: number, reason: string) => Promise<void>;
}) {
    const [value, setValue] = useState(String(currentStock));
    const [reason, setReason] = useState(STOCK_REASONS[0]);
    const [saving, setSaving] = useState(false);

    const newTotal = Number(value);
    const difference = newTotal - currentStock;
    const invalid = !Number.isInteger(newTotal) || newTotal < 0;

    const submit = async () => {
        if (invalid || difference === 0) return;
        setSaving(true);
        await onSave(difference, reason);
        setSaving(false);
    };

    return (
        <Modal title="Update stock" onClose={onClose}>
            <div className="space-y-5">
                <Field
                    label="How many are there now?"
                    htmlFor="newStock"
                    hint={`Currently recorded: ${currentStock}`}
                    error={invalid ? 'Enter a whole number of zero or more.' : undefined}
                >
                    <QuantityInput id="newStock" value={value} onChange={setValue} />
                </Field>

                {!invalid && difference !== 0 && (
                    <p className="text-base text-slate-600">
                        That is{' '}
                        <strong className={difference > 0 ? 'text-emerald-700' : 'text-red-700'}>
                            {difference > 0 ? `${difference} more` : `${Math.abs(difference)} fewer`}
                        </strong>{' '}
                        than before.
                    </p>
                )}

                <Field label="Why did it change?" htmlFor="reason">
                    <Select id="reason" value={reason} onChange={(event) => setReason(event.target.value)}>
                        {STOCK_REASONS.map((option) => (
                            <option key={option}>{option}</option>
                        ))}
                    </Select>
                </Field>

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} busy={saving} disabled={invalid || difference === 0}>
                        Save
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

/**
 * Markup shortcuts, spanning the range this shop actually prices in: a little
 * over half again on cost, up to tripling it.
 */
const MARKUPS = [70, 100, 150, 200] as const;

/**
 * "Was X, that is Y more" under a price field. Seeing the old figure and the
 * size of the change is what catches a slipped decimal point before it is saved.
 */
function PriceDelta({ previous, next }: { previous: number | null; next: number | null }) {
    if (next === null || previous === null || next === previous) return null;

    const difference = next - previous;
    const percent = previous > 0 ? Math.abs((difference / previous) * 100) : null;

    return (
        <p className="mt-2 text-sm text-slate-600">
            Was <span className="tabular-nums">{formatMoney(previous)}</span> —{' '}
            <strong className={difference > 0 ? 'text-slate-900' : 'text-slate-900'}>
                {difference > 0 ? 'up' : 'down'} {formatMoney(Math.abs(difference))}
                {percent !== null && ` (${percent.toFixed(0)}%)`}
            </strong>
        </p>
    );
}

/**
 * Cost and selling price are edited together because they are usually reviewed
 * together, and both share the one date the change takes effect from.
 */
function PriceModal({
    latestCostCents,
    latestSellCents,
    onClose,
    onSave,
}: {
    latestCostCents: number | null;
    latestSellCents: number | null;
    onClose: () => void;
    onSave: (
        changes: Array<{ kind: PriceKind; priceCents: number }>,
        effectiveFrom: string
    ) => Promise<void>;
}) {
    const asInput = (cents: number | null) => (cents === null ? '' : centsToInputValue(cents));

    const [cost, setCost] = useState(asInput(latestCostCents));
    const [sell, setSell] = useState(asInput(latestSellCents));
    const [date, setDate] = useState(todayAsInputValue());
    const [saving, setSaving] = useState(false);

    const costCents = parseMoneyToCents(cost);
    const sellCents = parseMoneyToCents(sell);
    const costInvalid = cost.trim() !== '' && costCents === null;
    const sellInvalid = sell.trim() !== '' && sellCents === null;
    const profit = profitFrom(costCents, sellCents);

    // Only prices the user actually changed are written, so reopening the
    // dialog and closing it never adds a duplicate history entry.
    const changes: Array<{ kind: PriceKind; priceCents: number }> = [];
    if (costCents !== null && costCents !== latestCostCents) {
        changes.push({ kind: 'COST', priceCents: costCents });
    }
    if (sellCents !== null && sellCents !== latestSellCents) {
        changes.push({ kind: 'SELL', priceCents: sellCents });
    }

    const submit = async () => {
        if (costInvalid || sellInvalid || changes.length === 0) return;
        setSaving(true);
        await onSave(changes, date);
        setSaving(false);
    };

    return (
        <Modal title="Change prices" onClose={onClose}>
            <div className="space-y-5">
                <Field
                    label="Cost"
                    htmlFor="costEdit"
                    hint="What you pay your supplier for one."
                    error={costInvalid ? 'Enter an amount, for example 12,50.' : undefined}
                >
                    <MoneyInput id="costEdit" value={cost} onChange={setCost} invalid={costInvalid} />
                    <PriceDelta previous={latestCostCents} next={costCents} />
                </Field>

                <Field
                    label="Selling price"
                    htmlFor="sellEdit"
                    hint="What your customer pays for one."
                    error={sellInvalid ? 'Enter an amount, for example 19,99.' : undefined}
                >
                    <MoneyInput id="sellEdit" value={sell} onChange={setSell} invalid={sellInvalid} />
                    <PriceDelta previous={latestSellCents} next={sellCents} />
                </Field>

                {/* Working out "cost plus a third" in your head is where pricing
                    mistakes come from, so the common markups are one tap. */}
                {costCents !== null && (
                    <div>
                        <p className="text-sm text-slate-600 mb-2">
                            Or add a markup to the cost:
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {MARKUPS.map((markup) => {
                                const suggested = Math.round(costCents * (1 + markup / 100));
                                return (
                                    <button
                                        key={markup}
                                        type="button"
                                        onClick={() => setSell(centsToInputValue(suggested))}
                                        className="min-h-[44px] px-3 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:border-blue-400 hover:text-blue-700 transition-colors"
                                    >
                                        +{markup}%
                                        <span className="ml-1.5 text-slate-500 tabular-nums">
                                            {formatMoney(suggested)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {profit && (
                    <div
                        className={`rounded-xl px-4 py-3 ${
                            profit.profitCents >= 0
                                ? 'bg-emerald-50 text-emerald-900'
                                : 'bg-amber-50 text-amber-900'
                        }`}
                    >
                        {profit.profitCents >= 0 ? (
                            <>
                                You make <strong>{formatMoney(profit.profitCents)}</strong> on each one
                                {' '}({profit.marginPercent.toFixed(0)}% of the selling price).
                            </>
                        ) : (
                            <>
                                This would sell for{' '}
                                <strong>{formatMoney(Math.abs(profit.profitCents))}</strong> less than it costs you.
                            </>
                        )}
                    </div>
                )}

                <Field
                    label="Effective from"
                    htmlFor="priceDateEdit"
                    hint="Set an earlier date to record a price you have been using for a while."
                >
                    <TextInput
                        id="priceDateEdit"
                        type="date"
                        value={date}
                        max={todayAsInputValue()}
                        onChange={(event) => setDate(event.target.value)}
                    />
                </Field>

                <p className="text-sm text-slate-500">
                    Earlier prices are kept, so you can always look back at what this used to cost.
                </p>

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={submit}
                        busy={saving}
                        disabled={costInvalid || sellInvalid || changes.length === 0}
                    >
                        Save
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
