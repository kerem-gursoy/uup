import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PackageOpen, Plus, Search, X } from 'lucide-react';
import {
    errorMessage,
    getProducts,
    type ProductFilter,
    type ProductWithNumbers,
} from '../services/api';

import { useDebounce } from '../hooks/useDebounce';
import { formatMoneyOrBlank } from '../lib/format';
import { Button, Card, ErrorBlock, EmptyBlock, LoadingBlock, TextInput } from '../components/ui';
import StockPill from '../components/StockPill';
import { useT, useTPlural, type t as translate } from '../i18n';
import { T } from '../i18n/T';

const PRODUCT_FILTERS = ['low', 'no-price', 'cost-rose', 'below-cost'] as const;

/**
 * Wording for each subset the home screen can send the user here with.
 *
 * Written as a switch rather than a `filter.${key}.title` template, because the
 * template would need a cast to TranslationKey and that cast is precisely what
 * stops the compiler noticing a key that does not exist.
 *
 * `inline` is the form that reads inside "Showing only …". It is written out as
 * its own phrase rather than lowercasing `title` at runtime: Turkish has no safe
 * locale-less case fold - "İade".toLowerCase() grows a combining dot - and the two
 * languages want different wording here anyway.
 */
function filterCopy(
    filter: ProductFilter,
    t: typeof translate
): { title: string; inline: string; empty: string } {
    switch (filter) {
        case 'low':
            return {
                title: t('filter.low.title'),
                inline: t('filter.low.inline'),
                empty: t('filter.low.empty'),
            };
        case 'no-price':
            return {
                title: t('filter.noPrice.title'),
                inline: t('filter.noPrice.inline'),
                empty: t('filter.noPrice.empty'),
            };
        case 'cost-rose':
            return {
                title: t('filter.costRose.title'),
                inline: t('filter.costRose.inline'),
                empty: t('filter.costRose.empty'),
            };
        case 'below-cost':
            return {
                title: t('filter.belowCost.title'),
                inline: t('filter.belowCost.inline'),
                empty: t('filter.belowCost.empty'),
            };
    }
}

export default function ProductListPage() {
    const t = useT();
    const tPlural = useTPlural();
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
    const filter = PRODUCT_FILTERS.includes(filterParam as ProductFilter)
        ? (filterParam as ProductFilter)
        : null;
    const copy = filter ? filterCopy(filter, t) : null;

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
            setError(errorMessage(err, t('error.productsLoad')));
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, filter, t]);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold text-slate-900">
                        {copy ? copy.title : t('product.list.title')}
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">
                        {loading
                            ? t('common.loading')
                            : tPlural('count.product', products.length)}
                    </p>
                </div>
                <Button onClick={() => navigate('/products/new')} icon={<Plus size={20} />}>
                    {t('product.list.add')}
                </Button>
            </div>

            {/* Makes the narrowed list obvious, and one tap gets out of it. */}
            {copy && (
                <button
                    type="button"
                    onClick={() => setSearchParams({}, { replace: true })}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 hover:bg-blue-100 transition-colors min-h-[52px]"
                >
                    <span className="text-left">
                        <T
                            k="product.list.showingOnly"
                            values={{ filter: <strong>{copy.inline}</strong> }}
                        />
                    </span>
                    <span className="flex items-center gap-1 font-semibold shrink-0">
                        {t('product.list.showAll')}
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
                    placeholder={t('product.list.searchPlaceholder')}
                    aria-label={t('product.list.searchLabel')}
                    className="pl-12"
                />
            </div>

            {loading ? (
                <LoadingBlock label={t('product.list.loading')} />
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
                    {copy && !searchQuery ? (
                        // Reaching an empty filtered list is good news, not a
                        // failure - it means the thing was dealt with.
                        <EmptyBlock
                            icon={<PackageOpen size={26} />}
                            title={t('product.list.nothingLeft')}
                            description={copy.empty}
                            action={
                                <Button
                                    variant="secondary"
                                    onClick={() => setSearchParams({}, { replace: true })}
                                >
                                    {t('product.list.showAllProducts')}
                                </Button>
                            }
                        />
                    ) : (
                        <EmptyBlock
                            icon={<PackageOpen size={26} />}
                            title={
                                searchQuery
                                    ? t('product.list.noMatch')
                                    : t('product.list.empty')
                            }
                            description={
                                searchQuery
                                    ? t('product.list.noMatchHint')
                                    : t('product.list.emptyHint')
                            }
                            action={
                                searchQuery ? undefined : (
                                    <Button onClick={() => navigate('/products/new')} icon={<Plus size={20} />}>
                                        {t('product.list.addProduct')}
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
    const t = useT();
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
                    <p className="text-xs text-slate-500">{t('product.sellsFor')}</p>
                    <p className="text-lg font-bold text-slate-900 tabular-nums">
                        {formatMoneyOrBlank(product.latestSell?.priceCents)}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-slate-500">{t('product.costsYou')}</p>
                    <p className="text-base font-medium text-slate-600 tabular-nums">
                        {formatMoneyOrBlank(product.latestCost?.priceCents)}
                    </p>
                </div>
            </div>
        </button>
    );
}
