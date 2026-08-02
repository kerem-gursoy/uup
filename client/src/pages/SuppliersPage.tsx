import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    deleteSupplier,
    errorMessage,
    getSuppliers,
    type Supplier,
} from '../services/api';
import {
    Button,
    Card,
    EmptyBlock,
    ErrorBlock,
    LoadingBlock,
    Modal,
} from '../components/ui';
import SupplierDialog from '../components/SupplierDialog';
import { useT, useTPlural, type t as translate, type tPlural as translatePlural } from '../i18n';

/**
 * Manage the list of businesses the shop buys from.
 *
 * Each row says how much is attached to the supplier, because that is what
 * decides whether it can be removed: a supplier still named by products or
 * invoices must stay, or those records would point at nothing. Rather than
 * offering a delete that fails, the button is disabled and the row explains why.
 */
export default function SuppliersPage() {
    const t = useT();
    const tPlural = useTPlural();
    const navigate = useNavigate();

    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [addOpen, setAddOpen] = useState(false);
    const [renaming, setRenaming] = useState<Supplier | null>(null);
    const [removing, setRemoving] = useState<Supplier | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setSuppliers(await getSuppliers());
        } catch (err) {
            setError(errorMessage(err, t('error.suppliersListLoad')));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <div className="space-y-5">
            <div>
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 mb-4 min-h-[44px]"
                >
                    <ArrowLeft size={20} />
                    {t('common.back')}
                </button>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">
                            {t('supplier.list.title')}
                        </h1>
                        <p className="text-slate-500 text-sm mt-0.5">
                            {loading
                                ? t('common.loading')
                                : tPlural('count.supplier', suppliers.length)}
                        </p>
                    </div>
                    <Button onClick={() => setAddOpen(true)} icon={<Plus size={20} />}>
                        {t('supplier.list.add')}
                    </Button>
                </div>
            </div>

            {loading ? (
                <LoadingBlock label={t('supplier.list.loading')} />
            ) : error ? (
                <Card>
                    <ErrorBlock message={error} onRetry={load} />
                </Card>
            ) : suppliers.length === 0 ? (
                <Card>
                    <EmptyBlock
                        icon={<Building2 size={26} />}
                        title={t('supplier.list.empty')}
                        description={t('supplier.list.emptyHint')}
                        action={
                            <Button onClick={() => setAddOpen(true)} icon={<Plus size={20} />}>
                                {t('supplier.list.addOne')}
                            </Button>
                        }
                    />
                </Card>
            ) : (
                <ul className="space-y-3">
                    {suppliers.map((supplier) => (
                        <SupplierRow
                            key={supplier.id}
                            supplier={supplier}
                            onRename={() => setRenaming(supplier)}
                            onRemove={() => setRemoving(supplier)}
                        />
                    ))}
                </ul>
            )}

            {addOpen && (
                <SupplierDialog
                    onSaved={(supplier) => {
                        setAddOpen(false);
                        toast.success(t('supplier.list.added', { name: supplier.name }));
                        void load();
                    }}
                    onClose={() => setAddOpen(false)}
                />
            )}

            {renaming && (
                <SupplierDialog
                    existing={renaming}
                    onSaved={(supplier) => {
                        setRenaming(null);
                        toast.success(t('supplier.list.renamed', { name: supplier.name }));
                        void load();
                    }}
                    onClose={() => setRenaming(null)}
                />
            )}

            {removing && (
                <RemoveSupplierDialog
                    supplier={removing}
                    onDone={() => {
                        setRemoving(null);
                        void load();
                    }}
                    onClose={() => setRemoving(null)}
                />
            )}
        </div>
    );
}

function usageLabel(
    supplier: Supplier,
    t: typeof translate,
    tPlural: typeof translatePlural
): string {
    const products = supplier.productCount ?? 0;
    const invoices = supplier.invoiceCount ?? 0;

    const parts = [
        products > 0 && tPlural('count.product', products),
        invoices > 0 && tPlural('count.invoice', invoices),
    ].filter(Boolean) as string[];

    return parts.length
        ? t('supplier.list.usedBy', { what: parts.join(` ${t('common.and')} `) })
        : t('supplier.list.unused');
}

function SupplierRow({
    supplier,
    onRename,
    onRemove,
}: {
    supplier: Supplier;
    onRename: () => void;
    onRemove: () => void;
}) {
    const t = useT();
    const tPlural = useTPlural();
    const inUse = (supplier.productCount ?? 0) > 0 || (supplier.invoiceCount ?? 0) > 0;

    return (
        <li>
            {/* The name gets the full width on a phone and the actions sit
                underneath; squeezing both onto one line wrapped the usage text
                into a three-line column. They share a row from sm: up. */}
            <Card className="p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                    <p className="font-semibold text-slate-900 break-words">{supplier.name}</p>
                    <p className="text-sm text-slate-500 mt-0.5">
                        {usageLabel(supplier, t, tPlural)}
                    </p>
                    {/* Says why the button is dead, instead of leaving the user to
                        tap a greyed control and guess. */}
                    {inUse && (
                        <p className="text-sm text-slate-500 mt-1">
                            {t('supplier.list.moveFirst')}
                        </p>
                    )}
                </div>

                <div className="flex gap-2 mt-3 sm:mt-0 sm:shrink-0">
                    <Button
                        variant="secondary"
                        onClick={onRename}
                        icon={<Pencil size={17} />}
                        aria-label={t('supplier.list.renameAria', { name: supplier.name })}
                        className="flex-1 sm:flex-none min-h-[44px] px-3 text-sm"
                    >
                        {t('supplier.list.rename')}
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={onRemove}
                        disabled={inUse}
                        icon={<Trash2 size={17} />}
                        aria-label={t('supplier.list.removeAria', { name: supplier.name })}
                        className="flex-1 sm:flex-none min-h-[44px] px-3 text-sm"
                    >
                        {t('supplier.list.remove')}
                    </Button>
                </div>
            </Card>
        </li>
    );
}

function RemoveSupplierDialog({
    supplier,
    onDone,
    onClose,
}: {
    supplier: Supplier;
    onDone: () => void;
    onClose: () => void;
}) {
    const t = useT();
    const [removing, setRemoving] = useState(false);
    const [failed, setFailed] = useState<string | null>(null);

    const confirm = async () => {
        setRemoving(true);
        setFailed(null);
        try {
            await deleteSupplier(supplier.id);
            toast.success(t('supplier.list.removed', { name: supplier.name }));
            onDone();
        } catch (err) {
            // The server re-checks usage, so this catches a product attached in
            // the moment between the list loading and the delete.
            setFailed(errorMessage(err, t('error.supplierRemove')));
        } finally {
            setRemoving(false);
        }
    };

    return (
        <Modal title={t('supplier.remove.title')} onClose={onClose}>
            <div className="space-y-5">
                <div>
                    <p className="text-slate-600">{t('supplier.remove.aboutTo')}</p>
                    <p className="text-xl font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mt-1.5 break-words">
                        {supplier.name}
                    </p>
                </div>

                <p className="text-slate-600">{t('supplier.remove.note')}</p>

                {failed && (
                    <p role="alert" className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-900">
                        {failed}
                    </p>
                )}

                <div className="space-y-3">
                    <Button
                        onClick={confirm}
                        busy={removing}
                        icon={<Trash2 size={20} />}
                        className="w-full !bg-red-600 hover:!bg-red-700"
                    >
                        {removing ? t('supplier.remove.removing') : t('supplier.remove.yes')}
                    </Button>
                    <Button variant="secondary" onClick={onClose} className="w-full" disabled={removing}>
                        {t('supplier.remove.keep')}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
