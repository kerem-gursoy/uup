import { useState, useEffect } from 'react';
import { AlertTriangle, Search, Trash2, Camera } from 'lucide-react';
import { toast } from 'sonner';
import {
    ApiError,
    createProduct,
    errorMessage,
    getProductByBarcode,
    getProducts,
    type Product,
} from '../services/api';
import { useDebounce } from '../hooks/useDebounce.ts';
import BarcodeScanner from './BarcodeScanner';
import { currencySymbol, decimalPlaceholder, formatMoney } from '../lib/format';
import type { LineItemState } from '../lib/invoiceReview';
import { useT } from '../i18n';

interface InvoiceLineItemProps {
    line: LineItemState;
    index: number;
    onChange: (index: number, updates: Partial<LineItemState>) => void;
    onRemove?: (index: number) => void;
    isManual?: boolean;
    supplierId?: number;
}

export default function InvoiceLineItem({ line, index, onChange, onRemove, isManual, supplierId }: InvoiceLineItemProps) {
    const t = useT();
    const [productSearch, setProductSearch] = useState('');
    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showProductSearch, setShowProductSearch] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [creatingProduct, setCreatingProduct] = useState(false);

    const debouncedSearch = useDebounce(productSearch, 300);

    // Search products effect
    useEffect(() => {
        if (debouncedSearch && showProductSearch) {
            setIsSearching(true);
            getProducts({ search: debouncedSearch })
                .then(products => setSearchResults(products))
                .catch(console.error)
                .finally(() => setIsSearching(false));
        } else {
            setSearchResults([]);
        }
    }, [debouncedSearch, showProductSearch]);

    const handleProductSelect = (product: Product) => {
        onChange(index, {
            productId: product.id,
            matchedProductName: product.name,
            matchedBrand: product.brand,
            brand: product.brand ?? line.brand ?? null,
            matchScore: 1 // Manual selection is 100% match
        });
        setShowProductSearch(false);
        setProductSearch('');
    };

    const handleCreateProduct = async () => {
        const productName = line.name?.trim() || line.description?.trim();
        if (!productName) {
            toast.error(t('invoice.line.nameRequired'));
            return;
        }
        try {
            setCreatingProduct(true);
            const product = await createProduct({
                name: productName,
                barcode: line.barcode || undefined,
                brand: line.brand || undefined,
                supplierId,
            });
            toast.success(t('invoice.line.created'));
            onChange(index, {
                productId: product.id,
                matchedProductName: product.name,
                matchedBrand: product.brand,
                brand: line.brand ?? product.brand ?? null,
                matchScore: 1,
            });
        } catch (err) {
            console.error('Create product failed', err);
            toast.error(errorMessage(err, t('error.productCreate')));
        } finally {
            setCreatingProduct(false);
        }
    };

    /**
     * A scanned code fills the line's barcode, then tries to match it to a
     * product. The camera itself is the shared BarcodeScanner's concern - this
     * only decides what a scan means for an invoice line.
     */
    const handleScanned = async (code: string) => {
        setShowScanner(false);
        onChange(index, { barcode: code });

        try {
            const product = await getProductByBarcode(code);
            onChange(index, {
                productId: product.id,
                matchedProductName: product.name,
                matchedBrand: product.brand,
                brand: line.brand ?? product.brand ?? null,
                name: line.name || line.description || product.name,
                matchScore: 1,
            });
            toast.success(t('invoice.line.matched', { name: product.name }));
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) {
                toast.error(t('invoice.line.noBarcodeMatch', { barcode: code }));
            } else {
                console.error('Barcode lookup failed', error);
                toast.error(errorMessage(error, t('error.barcodeLookup')));
            }
        }
    };

    const getMatchBadge = () => {
        if (!line.productId) return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{t('invoice.line.badgeNone')}</span>;

        const score = line.matchScore || 0;
        if (score >= 0.9) return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{t('invoice.line.badgeHigh')}</span>;
        if (score >= 0.5) return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">{t('invoice.line.badgeMedium')}</span>;
        return <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{t('invoice.line.badgeLow')}</span>;
    };

    const headerTitle = line.name ?? line.description ?? '';

    return (
        <div className={`p-4 rounded-xl border ${line.apply ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-75'} transition-all shadow-sm`}>
            {/* Header: Checkbox + Description */}
            <div className="flex items-start gap-3 mb-4">
                <div className="pt-1">
                    <input
                        type="checkbox"
                        checked={line.apply}
                        onChange={(e) => onChange(index, { apply: e.target.checked })}
                        className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <h4 className="font-medium text-slate-900 truncate pr-2" title={headerTitle}>
                            {headerTitle || t('invoice.line.newItem')}
                        </h4>
                        {isManual && onRemove && (
                            <button
                                onClick={() => onRemove(index)}
                                aria-label={t('invoice.line.remove')}
                                className="text-slate-400 hover:text-red-500 p-1"
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                        {line.code && <span className="bg-slate-100 px-1.5 py-0.5 rounded">{t('invoice.line.code', { code: line.code })}</span>}
                        {line.barcode && <span className="bg-slate-100 px-1.5 py-0.5 rounded">{t('invoice.line.barcodeTag', { barcode: line.barcode })}</span>}
                    </div>
                </div>
            </div>

            {line.apply && (
                <div className="space-y-4 pl-8">
                    {/* Editable Basics */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('invoice.line.itemName')}</label>
                            <input
                                type="text"
                                value={line.name ?? line.description}
                                onChange={(e) => onChange(index, { name: e.target.value, description: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder={t('invoice.line.itemNamePlaceholder')}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('invoice.line.brand')}</label>
                            <input
                                type="text"
                                value={line.brand ?? line.matchedBrand ?? ''}
                                onChange={(e) => onChange(index, { brand: e.target.value || null })}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder={t('invoice.line.brandPlaceholder')}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                                <span>{t('invoice.line.barcode')}</span>
                                <button
                                    type="button"
                                    onClick={() => setShowScanner(true)}
                                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                                >
                                    <Camera size={14} />
                                    {t('invoice.line.scan')}
                                </button>
                            </label>
                            <input
                                type="text"
                                value={line.barcode ?? ''}
                                onChange={(e) => onChange(index, { barcode: e.target.value || null })}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder={t('invoice.line.barcodePlaceholder')}
                            />
                        </div>
                    </div>

                    {/* Product Selection */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('invoice.line.matchedProduct')}</label>
                            {!line.productId && (
                                <button
                                    type="button"
                                    onClick={handleCreateProduct}
                                    disabled={creatingProduct}
                                    className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
                                >
                                    {creatingProduct ? t('invoice.line.creating') : t('invoice.line.createNew')}
                                </button>
                            )}
                        </div>

                        {!showProductSearch ? (
                            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <div>
                                    {line.productId ? (
                                        <div>
                                            <div className="font-medium text-slate-900">{line.matchedProductName}</div>
                                            <div className="flex items-center gap-2 mt-1">
                                                {line.matchedBrand && <span className="text-xs text-slate-500">{line.matchedBrand}</span>}
                                                {getMatchBadge()}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-slate-500 italic text-sm">{t('invoice.line.noMatch')}</div>
                                    )}
                                </div>
                                <button
                                    onClick={() => setShowProductSearch(true)}
                                    className="text-sm text-blue-600 font-medium hover:text-blue-700"
                                >
                                    {line.productId ? t('invoice.line.change') : t('invoice.line.select')}
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <div className="flex items-center gap-2 mb-2">
                                    <Search size={16} className="text-slate-400" />
                                    <input
                                        type="text"
                                        value={productSearch}
                                        onChange={(e) => setProductSearch(e.target.value)}
                                        placeholder={t('invoice.line.searchPlaceholder')}
                                        className="flex-1 text-sm outline-none border-b border-slate-200 py-1 focus:border-blue-500"
                                        autoFocus
                                    />
                                    <button
                                        onClick={() => setShowProductSearch(false)}
                                        className="text-xs text-slate-500 hover:text-slate-700"
                                    >
                                        {t('common.cancel')}
                                    </button>
                                </div>

                                {debouncedSearch && (
                                    <div className="absolute z-10 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto mt-1">
                                        {isSearching ? (
                                            <div className="p-3 text-center text-xs text-slate-500">{t('invoice.line.searching')}</div>
                                        ) : searchResults.length > 0 ? (
                                            searchResults.map(p => (
                                                <button
                                                    key={p.id}
                                                    onClick={() => handleProductSelect(p)}
                                                    className="w-full text-left p-2 hover:bg-slate-50 text-sm border-b border-slate-50 last:border-0"
                                                >
                                                    <div className="font-medium text-slate-900">{p.name}</div>
                                                    <div className="text-xs text-slate-500">{p.brand}</div>
                                                </button>
                                            ))
                                        ) : (
                                            <div className="p-3 text-center text-xs text-slate-500">{t('invoice.line.noResults')}</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Quantity & Price */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('invoice.line.quantity')}</label>
                            <input
                                type="number"
                                value={line.quantity ?? ''}
                                onChange={(e) => onChange(index, { quantity: e.target.value ? parseFloat(e.target.value) : null })}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="0"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('invoice.line.unitPrice')}</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{currencySymbol()}</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={line.unitPrice ?? ''}
                                    onChange={(e) => onChange(index, { unitPrice: e.target.value ? parseFloat(e.target.value) : null })}
                                    className="w-full pl-7 pr-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder={decimalPlaceholder()}
                                />
                            </div>
                        </div>
                    </div>

                    {/* The row does not add up against the total printed on the
                        invoice. Shown here rather than blocked, because the person
                        holding the paper is the one who can settle it - but shown
                        loudly, because applying it writes the price into history. */}
                    {line.priceMismatch && line.totalPrice != null && (
                        <p className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
                            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                            {t('invoice.line.mismatch', {
                                total: formatMoney(Math.round(line.totalPrice * 100)),
                            })}
                        </p>
                    )}

                    {/* Toggles */}
                    <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={line.applyStock}
                                onChange={(e) => onChange(index, { applyStock: e.target.checked })}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600"
                            />
                            <span className="text-sm text-slate-700">{t('invoice.line.updateStock')}</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={line.applyPrice}
                                onChange={(e) => onChange(index, { applyPrice: e.target.checked })}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600"
                            />
                            <span className="text-sm text-slate-700">{t('invoice.line.updatePrice')}</span>
                        </label>
                    </div>
                </div>
            )}

            {showScanner && (
                <BarcodeScanner
                    title={t('invoice.line.scanTitle')}
                    onDetected={handleScanned}
                    onClose={() => setShowScanner(false)}
                />
            )}
        </div>
    );
}
