import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Plus, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import {
    ApiError,
    checkProductName,
    createProduct,
    errorMessage,
    getProductByBarcode,
    getSuppliers,
    type SimilarProduct,
    type Supplier,
} from '../services/api';
import BarcodeScanner from '../components/BarcodeScanner';
import SupplierDialog from '../components/SupplierDialog';
import { useDebounce } from '../hooks/useDebounce';
import {
    centsToInputValue,
    compareNames,
    dateInputToISO,
    formatMoney,
    formatPercent,
    parseMoneyToCents,
    profitFrom,
    todayAsInputValue,
} from '../lib/format';
import { Button, Field, MoneyInput, QuantityInput, Section, Select, TextInput } from '../components/ui';
import { useT } from '../i18n';
import { T } from '../i18n/T';

/**
 * Adding the first products is the hardest part of moving a shop off paper, so
 * this page asks for as little as possible: only a name is required, and the
 * numbers a shop may not know yet can all be left blank and filled in later.
 */
export default function AddProductPage() {
    const t = useT();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [name, setName] = useState('');
    // Prefilled when the user arrived here from a scan that matched nothing.
    const [barcode, setBarcode] = useState(searchParams.get('barcode') ?? '');
    const [scannerOpen, setScannerOpen] = useState(false);
    const [barcodeOwner, setBarcodeOwner] = useState<{ id: number; name: string } | null>(null);
    const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
    const [brand, setBrand] = useState('');
    const [supplierId, setSupplierId] = useState('');
    const [quantity, setQuantity] = useState('0');
    const [cost, setCost] = useState('');
    const [sell, setSell] = useState('');
    const [priceDate, setPriceDate] = useState(todayAsInputValue());

    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    /** Products that already look like this one. A warning, never a refusal. */
    const [similar, setSimilar] = useState<SimilarProduct[]>([]);

    const debouncedName = useDebounce(name.trim(), 400);
    const debouncedBarcode = useDebounce(barcode.trim(), 400);

    /** Focused again after "Add another", so the next product starts by typing. */
    const nameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // A missing supplier list should not block adding a product, so a
        // failure here just leaves the dropdown empty.
        getSuppliers()
            .then(setSuppliers)
            .catch(() => setSuppliers([]));
    }, []);

    const costCents = parseMoneyToCents(cost);
    const sellCents = parseMoneyToCents(sell);
    const profit = profitFrom(costCents, sellCents);

    /*
     * A barcode typed by hand gets the same check as a scanned one.
     *
     * It used to only run on scan, so typing a duplicate survived every other
     * field and surfaced as a 409 on submit - the exact waste the scan path was
     * written to avoid, reached by the slower of the two routes in.
     */
    useEffect(() => {
        if (!debouncedBarcode) {
            setBarcodeOwner(null);
            return;
        }

        let cancelled = false;

        getProductByBarcode(debouncedBarcode)
            .then((existing) => {
                if (!cancelled) setBarcodeOwner({ id: existing.id, name: existing.name });
            })
            .catch((err) => {
                if (cancelled) return;
                // A 404 is the good outcome: nothing else uses this barcode.
                setBarcodeOwner(null);
                if (!(err instanceof ApiError && err.status === 404)) {
                    console.error('Barcode check failed:', err);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [debouncedBarcode]);

    /*
     * Near-duplicate names, headed off while they are being typed.
     *
     * A duplicate product is worse than it looks: it splits one item's stock and
     * cost history across two rows, and it leaves the invoice matcher with two
     * equally good answers for one line - which, by design, means it then
     * refuses to match either and the picker asks every month forever.
     */
    useEffect(() => {
        if (debouncedName.length < 2) {
            setSimilar([]);
            return;
        }

        let cancelled = false;

        checkProductName(debouncedName)
            .then((result) => {
                if (!cancelled) setSimilar(result.similar);
            })
            .catch((err) => {
                // Advisory only, so a failure here must never block adding a
                // product - it just means no warning this time.
                if (!cancelled) console.error('Product name check failed:', err);
            });

        return () => {
            cancelled = true;
        };
    }, [debouncedName]);

    /**
     * A scanned barcode goes straight into the field, and the effect above does
     * the rest - scanning and typing now reach the same check by the same route,
     * rather than the scan path carrying its own copy of it.
     */
    const handleScanned = (code: string) => {
        setScannerOpen(false);
        setBarcode(code);
        setErrors((current) => ({ ...current, barcode: '' }));
    };

    const validate = () => {
        const found: Record<string, string> = {};

        if (!name.trim()) {
            found.name = t('product.error.nameRequired');
        }
        if (barcodeOwner) {
            found.barcode = t('product.error.barcodeTaken', { name: barcodeOwner.name });
        }
        // The worked example is written the way this language writes money, so it
        // is not quietly telling a Turkish reader to type a full stop.
        if (cost.trim() && costCents === null) {
            found.cost = t('product.error.amount', { example: centsToInputValue(1250) });
        }
        if (sell.trim() && sellCents === null) {
            found.sell = t('product.error.amount', { example: centsToInputValue(1999) });
        }
        if (quantity.trim() && !Number.isInteger(Number(quantity))) {
            found.quantity = t('product.error.wholeNumber');
        }
        if (Number(quantity) < 0) {
            found.quantity = t('product.error.negativeQuantity');
        }

        setErrors(found);
        return Object.keys(found).length === 0;
    };

    /**
     * Saves, then either opens the new product or clears down for the next one.
     *
     * "Add another" exists for the week that decides whether a shop sticks with
     * this at all: moving off paper means entering hundreds of products, and
     * doing it through save → detail → back → new is most of an evening spent
     * navigating rather than typing. What it keeps is what stays the same down a
     * delivery note - the supplier, the brand, the price date - and what it
     * clears is everything that identifies one particular item.
     */
    const handleSubmit = async (event: React.FormEvent, addAnother = false) => {
        event.preventDefault();
        if (!validate()) return;

        setSaving(true);
        try {
            const product = await createProduct({
                name: name.trim(),
                barcode: barcode.trim() || null,
                brand: brand.trim() || null,
                supplierId: supplierId ? Number(supplierId) : null,
                quantity: Number(quantity) || null,
                costCents,
                sellCents,
                effectiveFrom: dateInputToISO(priceDate),
            });

            toast.success(t('product.add.added', { name: product.name }));

            if (!addAnother) {
                navigate(`/products/${product.id}`, { replace: true });
                return;
            }

            setName('');
            setBarcode('');
            setQuantity('0');
            setCost('');
            setSell('');
            setSimilar([]);
            setBarcodeOwner(null);
            setErrors({});
            // Straight back to the field every product starts with, so the next
            // one can be typed without reaching for the screen.
            nameRef.current?.focus();
        } catch (err) {
            toast.error(errorMessage(err, t('error.productAdd')));
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 pb-8">
            <div>
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 mb-4 min-h-[44px]"
                >
                    <ArrowLeft size={20} />
                    {t('common.back')}
                </button>
                <h1 className="text-2xl font-bold text-slate-900">{t('product.add.title')}</h1>
                <p className="text-slate-500 mt-1">{t('product.add.subtitle')}</p>
            </div>

            <Section title={t('product.form.whatIsIt')}>
                <Field label={t('product.form.name')} htmlFor="name" error={errors.name}>
                    <TextInput
                        id="name"
                        ref={nameRef}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder={t('product.form.namePlaceholder')}
                        invalid={Boolean(errors.name)}
                        autoFocus
                    />
                </Field>

                {/* A warning, never a refusal: two products can honestly share a
                    name once case and punctuation are folded away - the same
                    water from two suppliers - so this offers the ones that
                    already exist and lets the person decide. */}
                {similar.length > 0 && (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                        <p className="text-amber-900 font-medium">
                            {t('product.form.similarTitle')}
                        </p>
                        <ul className="mt-2 space-y-1">
                            {similar.map((product) => (
                                <li key={product.id}>
                                    <button
                                        type="button"
                                        onClick={() => navigate(`/products/${product.id}`)}
                                        className="text-left text-amber-900 underline min-h-[44px]"
                                    >
                                        {product.name}
                                        {product.brand && (
                                            <span className="text-amber-700"> · {product.brand}</span>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <p className="mt-1 text-sm text-amber-800">
                            {t('product.form.similarHint')}
                        </p>
                    </div>
                )}

                <Field
                    label={t('product.form.barcode')}
                    htmlFor="barcode"
                    optional
                    hint={t('product.form.barcodeHint')}
                    error={errors.barcode}
                >
                    <div className="flex gap-3">
                        <TextInput
                            id="barcode"
                            value={barcode}
                            onChange={(event) => {
                                setBarcode(event.target.value);
                                setBarcodeOwner(null);
                            }}
                            placeholder={t('product.form.barcodePlaceholder')}
                            inputMode="numeric"
                            invalid={Boolean(errors.barcode)}
                        />
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setScannerOpen(true)}
                            icon={<ScanLine size={20} />}
                            className="shrink-0 px-4"
                        >
                            {t('product.form.scan')}
                        </Button>
                    </div>
                </Field>

                {/* Barcodes are unique, so saving would fail on the server. Better
                    to say so now and offer the product they probably want. */}
                {barcodeOwner && (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                        <p className="text-amber-900">
                            <T
                                k="product.error.barcodeTaken"
                                values={{ name: <strong>{barcodeOwner.name}</strong> }}
                            />
                        </p>
                        <button
                            type="button"
                            onClick={() => navigate(`/products/${barcodeOwner.id}`)}
                            className="mt-2 font-semibold text-amber-900 underline min-h-[44px]"
                        >
                            {t('product.form.openInstead')}
                        </button>
                    </div>
                )}

                <Field label={t('product.form.brand')} htmlFor="brand" optional>
                    <TextInput
                        id="brand"
                        value={brand}
                        onChange={(event) => setBrand(event.target.value)}
                    />
                </Field>

                <Field
                    label={t('product.form.supplier')}
                    htmlFor="supplier"
                    optional
                    hint={t('product.form.supplierHint')}
                >
                    <div className="flex gap-3">
                        <Select
                            id="supplier"
                            value={supplierId}
                            onChange={(event) => setSupplierId(event.target.value)}
                        >
                            <option value="">{t('product.form.notSet')}</option>
                            {[...suppliers]
                                .sort((a, b) => compareNames(a.name, b.name))
                                .map((supplier) => (
                                    <option key={supplier.id} value={supplier.id}>
                                        {supplier.name}
                                    </option>
                                ))}
                        </Select>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setSupplierDialogOpen(true)}
                            icon={<Plus size={20} />}
                            className="shrink-0 px-4"
                        >
                            {t('product.form.newSupplier')}
                        </Button>
                    </div>
                </Field>
            </Section>

            <Section
                title={t('product.form.stockSection')}
                hint={t('product.form.stockHint')}
            >
                <Field
                    label={t('product.form.quantity')}
                    htmlFor="quantity"
                    error={errors.quantity}
                >
                    <QuantityInput id="quantity" value={quantity} onChange={setQuantity} />
                </Field>
            </Section>

            <Section
                title={t('product.form.pricesSection')}
                hint={t('product.form.pricesHint')}
            >
                <Field
                    label={t('product.form.cost')}
                    htmlFor="cost"
                    optional
                    hint={t('product.form.costHint')}
                    error={errors.cost}
                >
                    <MoneyInput
                        id="cost"
                        value={cost}
                        onChange={setCost}
                        invalid={Boolean(errors.cost)}
                    />
                </Field>

                <Field
                    label={t('product.form.sell')}
                    htmlFor="sell"
                    optional
                    hint={t('product.form.sellHint')}
                    error={errors.sell}
                >
                    <MoneyInput
                        id="sell"
                        value={sell}
                        onChange={setSell}
                        invalid={Boolean(errors.sell)}
                    />
                </Field>

                {profit && (
                    <div
                        className={`rounded-xl px-4 py-3 text-base ${
                            profit.profitCents >= 0
                                ? 'bg-emerald-50 text-emerald-900'
                                : 'bg-amber-50 text-amber-900'
                        }`}
                    >
                        {profit.profitCents >= 0 ? (
                            <T
                                k="product.profit.positive"
                                values={{
                                    amount: <strong>{formatMoney(profit.profitCents)}</strong>,
                                    margin: formatPercent(profit.marginPercent),
                                }}
                            />
                        ) : (
                            <T
                                k="product.profit.negative"
                                values={{
                                    amount: (
                                        <strong>
                                            {formatMoney(Math.abs(profit.profitCents))}
                                        </strong>
                                    ),
                                }}
                            />
                        )}
                    </div>
                )}

                <Field
                    label={t('product.form.priceDate')}
                    htmlFor="priceDate"
                    hint={t('product.form.priceDateHint')}
                >
                    <TextInput
                        id="priceDate"
                        type="date"
                        value={priceDate}
                        max={todayAsInputValue()}
                        onChange={(event) => setPriceDate(event.target.value)}
                    />
                </Field>
            </Section>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => navigate('/products')}>
                    {t('common.cancel')}
                </Button>
                {/* Deliberately not the primary action. Filling the catalogue is
                    a job somebody does for one week; opening what they just made
                    is what they want every other time. */}
                <Button
                    type="button"
                    variant="secondary"
                    busy={saving}
                    onClick={(event) => handleSubmit(event, true)}
                    icon={<Plus size={20} />}
                >
                    {t('product.add.submitAndAnother')}
                </Button>
                <Button type="submit" busy={saving} icon={<Check size={20} />}>
                    {saving ? t('product.add.saving') : t('product.add.submit')}
                </Button>
            </div>

            {scannerOpen && (
                <BarcodeScanner
                    title={t('product.form.scanTitle')}
                    onDetected={handleScanned}
                    onClose={() => setScannerOpen(false)}
                />
            )}

            {supplierDialogOpen && (
                <SupplierDialog
                    onSaved={(supplier) => {
                        setSuppliers((current) =>
                            [...current, supplier].sort((a, b) => compareNames(a.name, b.name))
                        );
                        setSupplierId(String(supplier.id));
                        setSupplierDialogOpen(false);
                        toast.success(t('supplier.list.added', { name: supplier.name }));
                    }}
                    onUseExisting={(supplier) => {
                        setSupplierId(String(supplier.id));
                        setSupplierDialogOpen(false);
                        toast.info(t('product.form.usingSupplier', { name: supplier.name }));
                    }}
                    onClose={() => setSupplierDialogOpen(false)}
                />
            )}
        </form>
    );
}
