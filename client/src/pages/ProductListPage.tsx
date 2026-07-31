import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PackageOpen, Plus, Search, X } from 'lucide-react';
import {
    errorMessage,
    getProducts,
    type ProductFilter,
    type ProductWithNumbers,
} from '../services/api';

/** Wording for each subset the home screen can send the user here with. */
const FILTERS: Record<ProductFilter, { title: string; empty: string }> = {
    low: { title: 'Running low', empty: 'Nothing is running low.' },
    'no-price': {
        title: 'Missing a selling price',
        empty: 'Every product has a selling price.',
    },
    'cost-rose': {
        title: "Cost changed, price didn't",
        empty: 'No costs have moved since you set your prices.',
    },
    'below-cost': {
        title: 'Sold for less than they cost',
        empty: 'Nothing is priced below cost.',
    },
};
import { useDebounce } from '../hooks/useDebounce';
import { formatMoneyOrBlank } from '../lib/format';
import { Button, Card, ErrorBlock, EmptyBlock, LoadingBlock, TextInput } from '../components/ui';
import StockPill from '../components/StockPill';

export default function ProductListPage() {
    const navigate = useNavigate();

    const [products, setProducts] = useState<ProductWithNumbers[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 300);

    // Arrived from a count on the home screen: show exactly those products, and
    // say so, so the shorter list is never mistaken for the whole catalogue.
    const [searchParams, setSearchParams] = useSearchParams();
    const filterParam = searchParams.get('filter');
    const filter = FILTERS[filterParam as ProductFilter] ? (filterParam as ProductFilter) : null;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setProducts(
                await getProducts({
                    ...(debouncedSearch ? { search: debouncedSearch } : {}),
                    ...(filter ? { filter } : {}),
                })
            );
        } catch (err) {
            setError(errorMessage(err, 'Could not load your products.'));
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, filter]);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold text-slate-900">
                        {filter ? FILTERS[filter].title : 'Products'}
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">
                        {loading
                            ? 'Loading…'
                            : `${products.length} ${products.length === 1 ? 'product' : 'products'}`}
                    </p>
                </div>
                <Button onClick={() => navigate('/products/new')} icon={<Plus size={20} />}>
                    Add
                </Button>
            </div>

            {/* Makes the narrowed list obvious, and one tap gets out of it. */}
            {filter && (
                <button
                    type="button"
                    onClick={() => setSearchParams({}, { replace: true })}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 hover:bg-blue-100 transition-colors min-h-[52px]"
                >
                    <span className="text-left">
                        Showing only <strong>{FILTERS[filter].title.toLowerCase()}</strong>
                    </span>
                    <span className="flex items-center gap-1 font-semibold shrink-0">
                        Show all
                        <X size={17} />
                    </span>
                </button>
            )}

            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <TextInput
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search by name, barcode or brand"
                    aria-label="Search products"
                    className="pl-12"
                />
            </div>

            {loading ? (
                <LoadingBlock label="Loading products…" />
            ) : error ? (
                <Card>
                    <ErrorBlock message={error} onRetry={load} />
                </Card>
            ) : products.length > 0 ? (
                <div className="space-y-3">
                    {products.map((product) => (
                        <ProductCard
                            key={product.id}
                            product={product}
                            onClick={() => navigate(`/products/${product.id}`)}
                        />
                    ))}
                </div>
            ) : (
                <Card>
                    {filter && !searchQuery ? (
                        // Reaching an empty filtered list is good news, not a
                        // failure - it means the thing was dealt with.
                        <EmptyBlock
                            icon={<PackageOpen size={26} />}
                            title="Nothing left here"
                            description={FILTERS[filter].empty}
                            action={
                                <Button
                                    variant="secondary"
                                    onClick={() => setSearchParams({}, { replace: true })}
                                >
                                    Show all products
                                </Button>
                            }
                        />
                    ) : (
                        <EmptyBlock
                            icon={<PackageOpen size={26} />}
                            title={searchQuery ? 'Nothing matched that search' : 'No products yet'}
                            description={
                                searchQuery
                                    ? 'Try part of the name, or a different spelling.'
                                    : 'Add your first product to start tracking what you have and what it is worth.'
                            }
                            action={
                                searchQuery ? undefined : (
                                    <Button onClick={() => navigate('/products/new')} icon={<Plus size={20} />}>
                                        Add a product
                                    </Button>
                                )
                            }
                        />
                    )}
                </Card>
            )}
        </div>
    );
}

/**
 * One row answers the three questions a shopkeeper actually has: how many are
 * left, what it sells for, and what it cost. The selling price is the biggest
 * number because it is the one quoted to customers.
 */
function ProductCard({ product, onClick }: { product: ProductWithNumbers; onClick: () => void }) {
    const subtitle = [product.brand, product.supplier?.name].filter(Boolean).join(' • ');

    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full text-left bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:border-slate-300 active:scale-[0.995] transition"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 leading-snug">{product.name}</h3>
                    {subtitle && <p className="text-sm text-slate-500 mt-0.5 truncate">{subtitle}</p>}
                    {product.barcode && (
                        <p className="text-xs text-slate-500 font-mono bg-slate-50 border border-slate-100 inline-block px-1.5 py-0.5 rounded mt-1.5">
                            {product.barcode}
                        </p>
                    )}
                </div>
                <StockPill quantity={product.currentStock} />
            </div>

            <div className="flex items-end justify-between gap-4 mt-3 pt-3 border-t border-slate-100">
                <div>
                    <p className="text-xs text-slate-500">Sells for</p>
                    <p className="text-lg font-bold text-slate-900 tabular-nums">
                        {formatMoneyOrBlank(product.latestSell?.priceCents)}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-slate-500">Costs you</p>
                    <p className="text-base font-medium text-slate-600 tabular-nums">
                        {formatMoneyOrBlank(product.latestCost?.priceCents)}
                    </p>
                </div>
            </div>
        </button>
    );
}
