import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Plus, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import {
    ApiError,
    createProduct,
    errorMessage,
    getProductByBarcode,
    getSuppliers,
    type Supplier,
} from '../services/api';
import BarcodeScanner from '../components/BarcodeScanner';
import SupplierDialog from '../components/SupplierDialog';
import {
    dateInputToISO,
    formatMoney,
    parseMoneyToCents,
    profitFrom,
    todayAsInputValue,
} from '../lib/format';
import { Button, Field, MoneyInput, QuantityInput, Section, Select, TextInput } from '../components/ui';

/**
 * Adding the first products is the hardest part of moving a shop off paper, so
 * this page asks for as little as possible: only a name is required, and the
 * numbers a shop may not know yet can all be left blank and filled in later.
 */
export default function AddProductPage() {
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

    /**
     * A scanned barcode goes straight into the field, then we check whether some
     * other product already owns it - the server rejects duplicates, and finding
     * that out only on save would waste everything else the user typed.
     */
    const handleScanned = async (code: string) => {
        setScannerOpen(false);
        setBarcode(code);
        setBarcodeOwner(null);
        setErrors((current) => ({ ...current, barcode: '' }));

        try {
            const existing = await getProductByBarcode(code);
            setBarcodeOwner({ id: existing.id, name: existing.name });
        } catch (err) {
            // A 404 is the good outcome: nothing else uses this barcode.
            if (!(err instanceof ApiError && err.status === 404)) {
                console.error('Barcode check failed:', err);
            }
        }
    };

    const validate = () => {
        const found: Record<string, string> = {};

        if (!name.trim()) {
            found.name = 'Please give the product a name.';
        }
        if (barcodeOwner) {
            found.barcode = `${barcodeOwner.name} already uses this barcode. Clear it, or open that product instead.`;
        }
        if (cost.trim() && costCents === null) {
            found.cost = 'Enter an amount, for example 12,50.';
        }
        if (sell.trim() && sellCents === null) {
            found.sell = 'Enter an amount, for example 19,99.';
        }
        if (quantity.trim() && !Number.isInteger(Number(quantity))) {
            found.quantity = 'Enter a whole number.';
        }
        if (Number(quantity) < 0) {
            found.quantity = 'Quantity cannot be less than zero.';
        }

        setErrors(found);
        return Object.keys(found).length === 0;
    };

    const handleSubmit = async (event: React.FormEvent) => {
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

            toast.success(`${product.name} added`);
            navigate(`/products/${product.id}`, { replace: true });
        } catch (err) {
            toast.error(errorMessage(err, 'Could not add the product. Please try again.'));
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
                    Back
                </button>
                <h1 className="text-2xl font-bold text-slate-900">Add a product</h1>
                <p className="text-slate-500 mt-1">
                    Only the name is needed. Anything you do not know yet can be added later.
                </p>
            </div>

            <Section title="What is it?">
                <Field label="Product name" htmlFor="name" error={errors.name}>
                    <TextInput
                        id="name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="For example: 1kg white sugar"
                        invalid={Boolean(errors.name)}
                        autoFocus
                    />
                </Field>

                <Field
                    label="Barcode"
                    htmlFor="barcode"
                    optional
                    hint="Add it and you can find this product later by scanning it."
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
                            placeholder="Type or scan the number"
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
                            Scan
                        </Button>
                    </div>
                </Field>

                {/* Barcodes are unique, so saving would fail on the server. Better
                    to say so now and offer the product they probably want. */}
                {barcodeOwner && (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                        <p className="text-amber-900">
                            <strong>{barcodeOwner.name}</strong> already uses this barcode.
                        </p>
                        <button
                            type="button"
                            onClick={() => navigate(`/products/${barcodeOwner.id}`)}
                            className="mt-2 font-semibold text-amber-900 underline min-h-[44px]"
                        >
                            Open that product instead
                        </button>
                    </div>
                )}

                <Field label="Brand" htmlFor="brand" optional>
                    <TextInput
                        id="brand"
                        value={brand}
                        onChange={(event) => setBrand(event.target.value)}
                    />
                </Field>

                <Field label="Supplier" htmlFor="supplier" optional hint="Who you buy it from.">
                    <div className="flex gap-3">
                        <Select
                            id="supplier"
                            value={supplierId}
                            onChange={(event) => setSupplierId(event.target.value)}
                        >
                            <option value="">Not set</option>
                            {suppliers.map((supplier) => (
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
                            New
                        </Button>
                    </div>
                </Field>
            </Section>

            <Section
                title="How many do you have?"
                hint="Count what is on the shelf right now. You can correct it any time."
            >
                <Field label="Quantity in stock" htmlFor="quantity" error={errors.quantity}>
                    <QuantityInput id="quantity" value={quantity} onChange={setQuantity} />
                </Field>
            </Section>

            <Section
                title="Prices"
                hint="Leave either one blank if you do not know it yet."
            >
                <Field
                    label="Cost"
                    htmlFor="cost"
                    optional
                    hint="What you pay your supplier for one."
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
                    label="Selling price"
                    htmlFor="sell"
                    optional
                    hint="What your customer pays for one."
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
                            <>
                                You make <strong>{formatMoney(profit.profitCents)}</strong> on each one
                                {' '}({profit.marginPercent.toFixed(0)}% of the selling price).
                            </>
                        ) : (
                            <>
                                This sells for <strong>{formatMoney(Math.abs(profit.profitCents))}</strong>
                                {' '}less than it costs you.
                            </>
                        )}
                    </div>
                )}

                <Field
                    label="These prices are correct as of"
                    htmlFor="priceDate"
                    hint="Change this if you are entering an older price from a past invoice."
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
                    Cancel
                </Button>
                <Button type="submit" busy={saving} icon={<Check size={20} />}>
                    {saving ? 'Adding…' : 'Add product'}
                </Button>
            </div>

            {scannerOpen && (
                <BarcodeScanner
                    title="Scan the product's barcode"
                    onDetected={handleScanned}
                    onClose={() => setScannerOpen(false)}
                />
            )}

            {supplierDialogOpen && (
                <SupplierDialog
                    onSaved={(supplier) => {
                        setSuppliers((current) =>
                            [...current, supplier].sort((a, b) => a.name.localeCompare(b.name))
                        );
                        setSupplierId(String(supplier.id));
                        setSupplierDialogOpen(false);
                        toast.success(`${supplier.name} added`);
                    }}
                    onUseExisting={(supplier) => {
                        setSupplierId(String(supplier.id));
                        setSupplierDialogOpen(false);
                        toast.info(`Using ${supplier.name}`);
                    }}
                    onClose={() => setSupplierDialogOpen(false)}
                />
            )}
        </form>
    );
}
