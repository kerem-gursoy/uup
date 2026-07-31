import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Lock, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
    errorMessage,
    getProductSummary,
    getSuppliers,
    updateProduct,
    type Supplier,
} from '../services/api';
import {
    Button,
    Card,
    ErrorBlock,
    Field,
    LoadingBlock,
    Section,
    Select,
    TextInput,
} from '../components/ui';
import SupplierDialog from '../components/SupplierDialog';

/**
 * Edits the details of an existing product.
 *
 * Everything here is a label the shop chose and may want to reword. The barcode
 * is shown but not editable: it is printed on the physical product, so changing
 * it would silently break every future scan. Prices and stock are not here
 * either - both are dated records rather than fields, and are changed from the
 * product page so their history stays intact.
 */
export default function EditProductPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const productId = Number(id);

    const [name, setName] = useState('');
    const [brand, setBrand] = useState('');
    const [supplierId, setSupplierId] = useState('');
    const [barcode, setBarcode] = useState<string | null>(null);

    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [nameError, setNameError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        if (!Number.isInteger(productId) || productId <= 0) {
            setLoadError('That product link is not valid.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setLoadError(null);
        try {
            const [summary, supplierList] = await Promise.all([
                getProductSummary(productId),
                // An unavailable supplier list must not block renaming a product.
                getSuppliers().catch(() => [] as Supplier[]),
            ]);

            setName(summary.product.name);
            setBrand(summary.product.brand ?? '');
            setSupplierId(summary.product.supplierId ? String(summary.product.supplierId) : '');
            setBarcode(summary.product.barcode);
            setSuppliers(supplierList);
        } catch (err) {
            setLoadError(errorMessage(err, 'Could not load this product.'));
        } finally {
            setLoading(false);
        }
    }, [productId]);

    useEffect(() => {
        load();
    }, [load]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!name.trim()) {
            setNameError('Please give the product a name.');
            return;
        }

        setSaving(true);
        try {
            // `barcode` is left out of the request entirely so the server keeps
            // whatever is already stored.
            await updateProduct(productId, {
                name: name.trim(),
                brand: brand.trim() || null,
                supplierId: supplierId ? Number(supplierId) : null,
            });

            toast.success('Product updated');
            navigate(`/products/${productId}`, { replace: true });
        } catch (err) {
            toast.error(errorMessage(err, 'Could not save your changes.'));
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <LoadingBlock label="Loading product…" />;

    if (loadError) {
        return (
            <Card>
                <ErrorBlock message={loadError} onRetry={load} />
                <div className="pb-6 flex justify-center">
                    <Button variant="ghost" onClick={() => navigate('/products')}>
                        Back to products
                    </Button>
                </div>
            </Card>
        );
    }

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
                <h1 className="text-2xl font-bold text-slate-900">Edit product</h1>
                <p className="text-slate-500 mt-1">
                    Change the details. Prices and stock are changed on the product page, so
                    their history is kept.
                </p>
            </div>

            <Section title="Details">
                <Field label="Product name" htmlFor="name" error={nameError ?? undefined}>
                    <TextInput
                        id="name"
                        value={name}
                        onChange={(event) => {
                            setName(event.target.value);
                            setNameError(null);
                        }}
                        invalid={Boolean(nameError)}
                        autoFocus
                    />
                </Field>

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

            {/* Shown, but visibly locked: the greyed field and padlock say "not
                editable" before the user tries and wonders why nothing happens. */}
            <Section title="Barcode">
                <Field
                    label="Barcode"
                    htmlFor="barcodeLocked"
                    hint="This cannot be changed. It is printed on the product, and changing it here would stop the product being found by scanning."
                >
                    <div className="relative">
                        <TextInput
                            id="barcodeLocked"
                            value={barcode ?? 'No barcode saved'}
                            readOnly
                            disabled
                            className="bg-slate-100 text-slate-500 pr-12 cursor-not-allowed"
                        />
                        <Lock
                            size={18}
                            aria-hidden="true"
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                    </div>
                </Field>
            </Section>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                <Button
                    type="button"
                    variant="secondary"
                    onClick={() => navigate(`/products/${productId}`)}
                >
                    Cancel
                </Button>
                <Button type="submit" busy={saving} icon={<Check size={20} />}>
                    {saving ? 'Saving…' : 'Save changes'}
                </Button>
            </div>

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
