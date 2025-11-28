import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ScanLine, Plus, FileText, Package, AlertTriangle, Loader2 } from 'lucide-react';
import { getLowStock, type LowStockProduct } from '../services/api';

export default function HomePage() {
    const navigate = useNavigate();
    const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchLowStock = async () => {
            try {
                setLoading(true);
                setError(null);
                const products = await getLowStock(5);
                setLowStockProducts(products);
            } catch (err) {
                console.error('Failed to fetch low stock products:', err);
                setError('Failed to load low stock products');
            } finally {
                setLoading(false);
            }
        };

        fetchLowStock();
    }, []);

    return (
        <div className="space-y-6">
            {/* Welcome Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
                <p className="text-slate-500">Monitor stock levels and manage inventory.</p>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                    type="text"
                    placeholder="Search products..."
                    onFocus={() => navigate('/products')}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm cursor-pointer"
                    readOnly
                />
            </div>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-2 gap-4">
                <QuickAction
                    icon={<ScanLine size={24} />}
                    label="Scan barcode"
                    color="bg-blue-50 text-blue-600"
                    onClick={() => navigate('/scan')}
                />
                <QuickAction
                    icon={<Plus size={24} />}
                    label="Add product"
                    color="bg-emerald-50 text-emerald-600"
                    onClick={() => navigate('/products')}
                />
                <QuickAction
                    icon={<FileText size={24} />}
                    label="Upload invoice"
                    color="bg-purple-50 text-purple-600"
                    onClick={() => navigate('/invoices/upload')}
                />
                <QuickAction
                    icon={<Package size={24} />}
                    label="View products"
                    color="bg-orange-50 text-orange-600"
                    onClick={() => navigate('/products')}
                />
            </div>

            {/* Low Stock Preview */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                        <AlertTriangle size={18} className="text-amber-500" />
                        Low Stock Alert
                    </h2>
                    <button
                        onClick={() => navigate('/products')}
                        className="text-sm text-blue-600 font-medium hover:text-blue-700"
                    >
                        View all
                    </button>
                </div>

                {loading ? (
                    <div className="p-8 flex items-center justify-center text-slate-500">
                        <Loader2 size={20} className="animate-spin mr-2" />
                        Loading...
                    </div>
                ) : error ? (
                    <div className="p-8 text-center">
                        <p className="text-red-600 mb-2">{error}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="text-sm text-blue-600 hover:text-blue-700"
                        >
                            Retry
                        </button>
                    </div>
                ) : lowStockProducts.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                        <p>No low stock items</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {lowStockProducts.slice(0, 3).map((product) => (
                            <div key={product.id} className="p-4 flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-slate-900">{product.name}</p>
                                    <p className="text-sm text-slate-500">
                                        {product.brand && `${product.brand} • `}
                                        {product.supplier?.name || 'No supplier'}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${product.currentStock === 0 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                                        }`}>
                                        {product.currentStock} left
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Recent Activity (Optional) */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                <h2 className="font-semibold text-slate-900 mb-4">Recent Activity</h2>
                <div className="space-y-4">
                    <ActivityItem
                        action="Stock adjusted"
                        detail="+10 Wireless Mouse"
                        time="2 mins ago"
                    />
                    <ActivityItem
                        action="Price updated"
                        detail="Mechanical Keyboard"
                        time="1 hour ago"
                    />
                    <ActivityItem
                        action="Invoice uploaded"
                        detail="#INV-2023-001"
                        time="3 hours ago"
                    />
                </div>
            </div>
        </div>
    );
}

function QuickAction({ icon, label, color, onClick }: { icon: React.ReactNode; label: string; color: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`${color} p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-transform active:scale-95`}
        >
            <div className="p-2 bg-white/50 rounded-full backdrop-blur-sm">
                {icon}
            </div>
            <span className="font-medium text-sm">{label}</span>
        </button>
    );
}

function ActivityItem({ action, detail, time }: { action: string; detail: string; time: string }) {
    return (
        <div className="flex items-start gap-3">
            <div className="w-2 h-2 mt-2 rounded-full bg-blue-400" />
            <div>
                <p className="text-sm font-medium text-slate-900">{action}</p>
                <p className="text-xs text-slate-500">{detail}</p>
            </div>
            <span className="ml-auto text-xs text-slate-400">{time}</span>
        </div>
    );
}
