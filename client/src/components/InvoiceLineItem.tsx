import { useId, useState } from 'react';
import {
    AlertTriangle,
    Check,
    ChevronDown,
    CircleSlash,
    Package,
    Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import type { Product } from '../services/api';
import {
    isUsablePrice,
    isUsableQuantity,
    lineProblems,
    lineState,
    type LineItemState,
    type LineProblem,
} from '../lib/invoiceReview';
import { centsToInputValue, formatMoney, parseMoneyToCents } from '../lib/format';
import ProductPicker from './ProductPicker';
import { Button, ConfirmDialog, Field, MoneyInput, QuantityInput } from './ui';
import { useT } from '../i18n';

/**
 * One line of an invoice, as a row that is closed until you open it.
 *
 * The screen used to render every field of every line at once: name, brand,
 * barcode, product, quantity, price and two switches, times however many lines
 * the supplier printed. Thirty lines came to something like two hundred and
 * forty controls in one scroll, with no way to tell which of them still wanted a
 * decision - and three of those fields (name, brand, barcode) did nothing at all
 * unless you happened to be creating a new product, so editing them on a line
 * already matched to one quietly achieved nothing.
 *
 * Closed, a row answers the only questions worth asking at a glance: what did
 * the document say, what will this do, and is it settled. Open, it is an
 * ordinary form built from the same controls as the rest of the app - which is
 * to say 52px targets and labels that are sentences, neither of which this
 * screen had before.
 */
export default function InvoiceLineItem({
    id,
    line,
    index,
    open,
    onToggle,
    onChange,
    onRemove,
    supplierId,
}: {
    /** Set by the page so it can scroll this row into view. */
    id?: string;
    line: LineItemState;
    index: number;
    open: boolean;
    onToggle: (open: boolean) => void;
    onChange: (index: number, updates: Partial<LineItemState>) => void;
    onRemove?: (index: number) => void;
    supplierId?: number;
}) {
    const t = useT();
    const panelId = useId();
    const applyId = useId();

    const state = lineState(line);
    const problems = lineProblems(line);
    const title = line.name?.trim() || line.description.trim() || t('invoice.line.newItem');
    const isManual = line.parsedLineNo === null;

    return (
        <li id={id} className="scroll-mt-44">
            <div
                className={clsx(
                    'rounded-2xl border transition-colors',
                    open
                        ? 'border-blue-300 bg-white ring-4 ring-blue-50'
                        : state === 'attention'
                          ? 'border-amber-200 bg-white'
                          : 'border-slate-200 bg-white',
                    state === 'excluded' && !open && 'bg-slate-50'
                )}
            >
                <div className="flex items-start gap-3 p-3">
                    {/* Its own control rather than part of the row button: including
                        a line and opening it to edit are different decisions, and
                        a checkbox nested in a button is not a checkbox at all. */}
                    <input
                        id={applyId}
                        type="checkbox"
                        checked={line.apply}
                        onChange={(event) => onChange(index, { apply: event.target.checked })}
                        className="mt-2.5 ml-1 w-6 h-6 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-4 focus:ring-blue-100"
                    />
                    <label htmlFor={applyId} className="sr-only">
                        {t('invoice.line.includeLabel', { name: title })}
                    </label>

                    <button
                        type="button"
                        onClick={() => onToggle(!open)}
                        aria-expanded={open}
                        aria-controls={panelId}
                        className="flex-1 min-w-0 text-left flex items-start gap-3 py-1 rounded-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
                    >
                        <span className="flex-1 min-w-0">
                            <span
                                className={clsx(
                                    'block font-semibold truncate',
                                    line.apply ? 'text-slate-900' : 'text-slate-400 line-through'
                                )}
                            >
                                {title}
                            </span>
                            <LineSummary line={line} />
                        </span>
                        <span className="shrink-0 flex items-center gap-2">
                            <StateChip state={state} />
                            <ChevronDown
                                size={20}
                                aria-hidden="true"
                                className={clsx(
                                    'text-slate-400 transition-transform',
                                    open && 'rotate-180'
                                )}
                            />
                        </span>
                    </button>
                </div>

                <div id={panelId} hidden={!open}>
                    {open && (
                        <LineEditor
                            line={line}
                            index={index}
                            problems={problems}
                            isManual={isManual}
                            supplierId={supplierId}
                            onChange={onChange}
                            onRemove={onRemove}
                            onDone={() => onToggle(false)}
                        />
                    )}
                </div>
            </div>
        </li>
    );
}

/** The one-line "what will happen", which is the point of a closed row. */
function LineSummary({ line }: { line: LineItemState }) {
    const t = useT();

    if (!line.apply) {
        return <span className="block text-sm text-slate-400">{t('invoice.line.excludedNote')}</span>;
    }

    const effects = [
        line.applyStock ? t('invoice.line.effectStockShort') : null,
        line.applyPrice ? t('invoice.line.effectPriceShort') : null,
    ].filter(Boolean);

    return (
        <>
            <span className="block text-sm text-slate-600 truncate">
                {/* Keyed off the id, not the name. The name is only ever a label
                    for the id, and a row that shows one while holding no product
                    would read as settled when applying it would do nothing. */}
                {line.productId && line.matchedProductName ? (
                    <>
                        <Package size={13} aria-hidden="true" className="inline mb-0.5 mr-1 text-slate-400" />
                        {line.matchedProductName}
                    </>
                ) : (
                    <span className="text-amber-700">{t('invoice.line.noProductYet')}</span>
                )}
            </span>
            <span className="block text-sm text-slate-500 tabular-nums truncate">
                {t('invoice.line.summaryNumbers', {
                    quantity: line.quantity ?? '—',
                    price: line.unitPrice === null ? '—' : formatMoney(Math.round(line.unitPrice * 100)),
                })}
                {effects.length > 0 && ` · ${effects.join(', ')}`}
            </span>
        </>
    );
}

/** Never colour alone: each state carries its own icon and its own words. */
function StateChip({ state }: { state: ReturnType<typeof lineState> }) {
    const t = useT();

    const styles = {
        ready: { className: 'bg-emerald-50 text-emerald-800', icon: <Check size={13} /> },
        attention: { className: 'bg-amber-100 text-amber-900', icon: <AlertTriangle size={13} /> },
        excluded: { className: 'bg-slate-100 text-slate-600', icon: <CircleSlash size={13} /> },
    }[state];

    const label = {
        ready: t('invoice.line.stateReady'),
        attention: t('invoice.line.stateAttention'),
        excluded: t('invoice.line.stateExcluded'),
    }[state];

    return (
        <span
            className={clsx(
                'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold',
                styles.className
            )}
        >
            {styles.icon}
            {label}
        </span>
    );
}

function LineEditor({
    line,
    index,
    problems,
    isManual,
    supplierId,
    onChange,
    onRemove,
    onDone,
}: {
    line: LineItemState;
    index: number;
    problems: LineProblem[];
    isManual: boolean;
    supplierId?: number;
    onChange: (index: number, updates: Partial<LineItemState>) => void;
    onRemove?: (index: number) => void;
    onDone: () => void;
}) {
    const t = useT();
    const quantityId = useId();
    const priceId = useId();

    // Kept as text while being typed, then pushed up as a number. Parsing on
    // every keystroke would empty the field the moment someone typed "12," on
    // their way to "12,50".
    const [quantityText, setQuantityText] = useState(
        line.quantity === null ? '' : String(line.quantity)
    );
    const [priceText, setPriceText] = useState(
        line.unitPrice === null ? '' : centsToInputValue(Math.round(line.unitPrice * 100))
    );

    const [picking, setPicking] = useState(false);
    const [confirmingRemove, setConfirmingRemove] = useState(false);

    const has = (problem: LineProblem) => problems.includes(problem);

    const handleQuantity = (text: string) => {
        setQuantityText(text);
        const parsed = Number(text);
        onChange(index, {
            quantity: text.trim() === '' || !Number.isFinite(parsed) ? null : parsed,
        });
    };

    const handlePrice = (text: string) => {
        setPriceText(text);
        const cents = parseMoneyToCents(text);
        onChange(index, { unitPrice: cents === null ? null : cents / 100 });
    };

    const handlePicked = (product: Product) => {
        setPicking(false);
        onChange(index, {
            productId: product.id,
            matchedProductName: product.name,
            matchedBrand: product.brand,
            brand: product.brand ?? line.brand ?? null,
            barcode: line.barcode ?? product.barcode,
            matchScore: 1,
        });
    };

    return (
        <div className="px-4 pb-4 pt-1 space-y-5 border-t border-slate-100 mt-1">
            {/* What the parser actually read, kept visible and never edited. It is
                the thing being checked against the paper, so overwriting it with
                the corrected values - which is what the old screen did - removed
                the only reference the reviewer had. */}
            {!isManual && (
                <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-3 py-2">
                    <span className="font-medium text-slate-600">
                        {t('invoice.line.asPrinted')}
                    </span>{' '}
                    <span className="tabular-nums">
                        {t('invoice.line.asPrintedNumbers', {
                            quantity: line.quantity ?? '—',
                            unit: line.unit ?? '',
                            total:
                                line.totalPrice == null
                                    ? '—'
                                    : formatMoney(Math.round(line.totalPrice * 100)),
                        })}
                    </span>
                    {(line.code || line.barcode) && (
                        <span className="block mt-0.5">
                            {[
                                line.code && t('invoice.line.code', { code: line.code }),
                                line.barcode && t('invoice.line.barcodeTag', { barcode: line.barcode }),
                            ]
                                .filter(Boolean)
                                .join(' · ')}
                        </span>
                    )}
                </p>
            )}

            {/* 1. The decision everything else depends on. */}
            <Field label={t('invoice.line.product')} hint={t('invoice.line.productHint')}>
                {line.productId ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                        <span className="min-w-0">
                            <span className="block font-medium text-slate-900 truncate">
                                {line.matchedProductName}
                            </span>
                            {line.matchedBrand && (
                                <span className="block text-sm text-slate-500 truncate">
                                    {line.matchedBrand}
                                </span>
                            )}
                        </span>
                        <Button
                            variant="secondary"
                            onClick={() => setPicking(true)}
                            className="shrink-0 min-h-[44px] px-4 text-sm"
                        >
                            {t('invoice.line.change')}
                        </Button>
                    </div>
                ) : (
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => setPicking(true)}
                            icon={<Package size={20} />}
                            className={clsx(
                                'w-full',
                                has('noProduct') && 'border-amber-400 bg-amber-50 text-amber-900'
                            )}
                        >
                            {t('invoice.line.choose')}
                        </Button>
                        {has('noProduct') && (
                            <p role="alert" className="mt-2 text-sm text-amber-800">
                                {t('invoice.problem.noProduct')}
                            </p>
                        )}
                    </>
                )}
            </Field>

            {/* 2. The numbers, each shown only when it is going to be used. */}
            {line.applyStock && (
                <Field
                    label={t('invoice.line.quantity')}
                    hint={t('invoice.line.quantityHint')}
                    error={has('quantity') ? t('invoice.problem.quantity') : undefined}
                    htmlFor={quantityId}
                >
                    <QuantityInput id={quantityId} value={quantityText} onChange={handleQuantity} />
                </Field>
            )}

            {line.applyPrice && (
                <Field
                    label={t('invoice.line.unitPrice')}
                    hint={t('invoice.line.unitPriceHint')}
                    error={has('price') ? t('invoice.problem.price') : undefined}
                    htmlFor={priceId}
                >
                    <MoneyInput
                        id={priceId}
                        value={priceText}
                        onChange={handlePrice}
                        invalid={has('price')}
                    />
                </Field>
            )}

            {/* The row does not add up against the total printed on the invoice.
                Shown rather than blocked, because the person holding the paper is
                the one who can settle it - but shown loudly, because applying it
                writes the price into history. */}
            {line.priceMismatch && line.totalPrice != null && (
                <p className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
                    <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                    {t('invoice.line.mismatch', {
                        total: formatMoney(Math.round(line.totalPrice * 100)),
                    })}
                </p>
            )}

            {/* 3. What applying will actually do, said in full. */}
            <fieldset className="space-y-2">
                <legend className="text-base font-medium text-slate-900 mb-1">
                    {t('invoice.line.willDo')}
                </legend>

                <EffectToggle
                    checked={line.applyStock}
                    onChange={(applyStock) => onChange(index, { applyStock })}
                    label={t('invoice.line.updateStock')}
                    // Promises only what the line can actually deliver. A count
                    // of 2.5 - a supplier billing by the kilo - cannot move stock
                    // at all, so saying "add 2.5 to the shelf" directly under a
                    // field refusing 2.5 would be the screen arguing with itself.
                    description={
                        !isUsableQuantity(line.quantity)
                            ? t('invoice.line.effectStockUnknown')
                            : line.quantity! > 0
                              ? t('invoice.line.effectStockAdd', { quantity: line.quantity! })
                              : t('invoice.line.effectStockRemove', { quantity: -line.quantity! })
                    }
                />
                <EffectToggle
                    checked={line.applyPrice}
                    onChange={(applyPrice) => onChange(index, { applyPrice })}
                    label={t('invoice.line.updatePrice')}
                    description={
                        !isUsablePrice(line.unitPrice)
                            ? t('invoice.line.effectPriceUnknown')
                            : t('invoice.line.effectPriceSet', {
                                  price: formatMoney(Math.round(line.unitPrice! * 100)),
                              })
                    }
                />

                {has('nothingToUpdate') && (
                    <p role="alert" className="text-sm text-amber-800">
                        {t('invoice.problem.nothingToUpdate')}
                    </p>
                )}
            </fieldset>

            <div className="flex items-center justify-between gap-3 pt-1">
                {isManual && onRemove ? (
                    <button
                        type="button"
                        onClick={() => setConfirmingRemove(true)}
                        className="inline-flex items-center gap-1.5 min-h-[44px] px-3 -ml-3 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition"
                    >
                        <Trash2 size={16} aria-hidden="true" />
                        {t('invoice.line.remove')}
                    </button>
                ) : (
                    <span />
                )}
                <Button variant="secondary" onClick={onDone} className="min-h-[44px] px-4 text-sm">
                    {t('invoice.line.done')}
                </Button>
            </div>

            {picking && (
                <ProductPicker
                    line={line}
                    supplierId={supplierId}
                    onPick={handlePicked}
                    onClose={() => setPicking(false)}
                />
            )}

            {confirmingRemove && (
                <ConfirmDialog
                    title={t('invoice.line.removeConfirmTitle')}
                    body={t('invoice.line.removeConfirmBody')}
                    confirmLabel={t('invoice.line.remove')}
                    destructive
                    onConfirm={() => onRemove?.(index)}
                    onClose={() => setConfirmingRemove(false)}
                />
            )}
        </div>
    );
}

/**
 * A switch that states its consequence rather than its name.
 *
 * "Update stock" tells you which setting you are touching; "Add 400 to stock"
 * tells you what pressing Apply will do to the shop's numbers, which is the
 * thing actually being decided.
 */
function EffectToggle({
    checked,
    onChange,
    label,
    description,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    description: string;
}) {
    const id = useId();

    return (
        <div
            className={clsx(
                'flex items-start gap-3 rounded-xl border p-3 transition-colors',
                checked ? 'border-blue-200 bg-blue-50/60' : 'border-slate-200'
            )}
        >
            <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                className="mt-0.5 w-6 h-6 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-4 focus:ring-blue-100"
            />
            <label htmlFor={id} className="min-w-0 cursor-pointer">
                <span className="block font-medium text-slate-900">{label}</span>
                <span className="block text-sm text-slate-600">{description}</span>
            </label>
        </div>
    );
}
