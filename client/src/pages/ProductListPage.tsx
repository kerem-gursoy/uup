import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, PackageOpen, Loader2 } from 'lucide-react';
import { getProducts, type Product } from '../services/api';

export default function ProductListPage() {
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Fetch products when debounced search changes
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                setLoading(true);
                setError(null);
                const data = await getProducts(debouncedSearch ? { search: debouncedSearch } : undefined);
                setProducts(data);
            } catch (err) {
                console.error('Failed to fetch products:', err);
                setError('Failed to load products');
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, [debouncedSearch]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Products</h1>
                    <p className="text-slate-500 text-sm">
                        {loading ? 'Loading...' : `${products.length} items`}
                    </p>
                </div>
                <button
                    onClick={() => { }} // TODO: Add product creation
                    className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition-colors"
                >
                    <Plus size={24} />
                </button>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, barcode, or brand..."
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm"
                />
            </div>

            {/* Product List */}
            <div className="space-y-3">
                {loading ? (
                    <div className="py-12 flex items-center justify-center text-slate-500">
                        <Loader2 size={24} className="animate-spin mr-2" />
                        Loading products...
                    </div>
                ) : error ? (
                    <div className="text-center py-12 bg-white rounded-xl border border-slate-100">
                        <p className="text-red-600 mb-2">{error}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="text-sm text-blue-600 hover:text-blue-700"
                        >
                            Retry
                        </button>
                    </div>
                ) : products.length > 0 ? (
                    products.map((product) => (
                        <ProductCard key={product.id} product={product} onClick={() => navigate(`/products/${product.id}`)} />
                    ))
                ) : (
                    <div className="text-center py-12 bg-white rounded-xl border border-slate-100 border-dashed">
                        <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
                            <PackageOpen size={24} />
                        </div>
                        <h3 className="text-slate-900 font-medium">No products found</h3>
                        <p className="text-slate-500 text-sm mt-1">
                            {searchQuery ? 'Try adjusting your search' : 'Get started by adding your first product'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

function ProductCard({ product, onClick }: { product: Product; onClick: () => void }) {
    // Determine stock status based on product data
    // Note: We don't have currentStock here, so we'll need to enhance this later
    const getStatusColor = () => {
        // For now, just show a neutral status
        return 'bg-slate-100 text-slate-800';
    };

    return (
        <div
            onClick={onClick}
            className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm active:scale-[0.99] transition-transform cursor-pointer"
        >
            <div className="flex justify-between items-start mb-2">
                <div>
                    <h3 className="font-semibold text-slate-900">{product.name}</h3>
                    {product.barcode && (
                        <p className="text-xs text-slate-500 font-mono bg-slate-50 inline-block px-1 rounded mt-1">
                            {product.barcode}
                        </p>
                    )}
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor()}`}>
                    View Details
                </span>
            </div>
            <div className="flex justify-between items-end mt-2">
                <p className="text-sm text-slate-500">
                    {product.brand && `${product.brand} • `}
                    {product.supplier?.name || 'No supplier'}
                </p>
            </div>
        </div>
    );
}
