import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, DollarSign, Package, History, ScanLine, X, TrendingUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getProductSummary, getPriceHistory, setProductPrice, adjustProductStock, type ProductSummary, type PriceHistoryEntry } from '../services/api';

export default function ProductDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [summary, setSummary] = useState<ProductSummary | null>(null);
    const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [showStockModal, setShowStockModal] = useState(false);
    const [showPriceModal, setShowPriceModal] = useState(false);

    const fetchData = async () => {
        if (!id) return;

        try {
            setLoading(true);
            setError(null);

            const [summaryData, historyData] = await Promise.all([
                getProductSummary(Number(id)),
                getPriceHistory(Number(id)),
            ]);

            setSummary(summaryData);
            setPriceHistory(historyData);
        } catch (err) {
            console.error('Failed to fetch product data:', err);
            setError('Failed to load product details');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [id]);

    const handleStockUpdate = async (newStock: number, reason: string) => {
        if (!id || !summary) return;

        try {
            const quantity = newStock - summary.currentStock;
            await adjustProductStock(Number(id), { quantity, reason });
            toast.success(`Stock updated: ${newStock} (${reason})`);
            setShowStockModal(false);
            await fetchData(); // Refresh data
        } catch (err) {
            console.error('Failed to update stock:', err);
            toast.error('Failed to update stock');
        }
    };

    const handlePriceUpdate = async (newPriceCents: number) => {
        if (!id) return;

        try {
            await setProductPrice(Number(id), newPriceCents);
            toast.success(`Price updated to $${(newPriceCents / 100).toFixed(2)}`);
            setShowPriceModal(false);
            await fetchData(); // Refresh data
        } catch (err) {
            console.error('Failed to update price:', err);
            toast.error('Failed to update price');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 size={32} className="animate-spin text-blue-600" />
            </div>
        );
    }

    if (error || !summary) {
        return (
            <div className="text-center py-12">
                <p className="text-red-600 mb-4">{error || 'Product not found'}</p>
                <button
                    onClick={() => navigate('/products')}
                    className="text-blue-600 hover:text-blue-700"
                >
                    Back to Products
                </button>
            </div>
        );
    }

    const { product, latestPrice, currentStock } = summary;
    const priceDollars = latestPrice ? latestPrice.priceCents / 100 : 0;

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div>
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center text-slate-500 hover:text-slate-700 mb-4"
                >
                    <ArrowLeft size={20} className="mr-1" />
                    Back
                </button>
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">{product.name}</h1>
                        <div className="flex items-center gap-2 mt-1 text-slate-500 text-sm">
                            <span>{product.brand && `${product.brand} • `}{product.supplier?.name || 'No supplier'}</span>
                            {product.barcode && (
                                <>
                                    <span>•</span>
                                    <span className="font-mono bg-slate-100 px-1 rounded">{product.barcode}</span>
                                </>
                            )}
                        </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${currentStock === 0 ? 'bg-red-100 text-red-800' :
                            currentStock <= 5 ? 'bg-amber-100 text-amber-800' :
                                'bg-emerald-100 text-emerald-800'
                        }`}>
                        {currentStock === 0 ? 'Out of Stock' : currentStock <= 5 ? 'Low Stock' : 'In Stock'}
                    </span>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-500 mb-1">
                        <DollarSign size={18} />
                        <span className="text-sm font-medium">Price</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">
                        {latestPrice ? `$${priceDollars.toFixed(2)}` : 'Not set'}
                    </p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-500 mb-1">
                        <Package size={18} />
                        <span className="text-sm font-medium">Stock</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{currentStock}</p>
                </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3">
                <ActionButton
                    icon={<Package size={20} />}
                    label="Adjust Stock"
                    onClick={() => setShowStockModal(true)}
                    primary
                />
                <ActionButton
                    icon={<DollarSign size={20} />}
                    label="Set Price"
                    onClick={() => setShowPriceModal(true)}
                />
                <ActionButton
                    icon={<History size={20} />}
                    label="View History"
                    onClick={() => { }} // TODO: Show history modal
                />
                <ActionButton
                    icon={<ScanLine size={20} />}
                    label="Scan Barcode"
                    onClick={() => navigate('/scan')}
                />
            </div>

            {/* Price History */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <TrendingUp size={18} className="text-blue-500" />
                    Price History
                </h3>
                {priceHistory.length > 0 ? (
                    <div className="space-y-2">
                        {priceHistory.slice(0, 5).map((entry) => (
                            <div key={entry.id} className="flex justify-between items-center text-sm">
                                <span className="text-slate-600">
                                    {new Date(entry.effectiveFrom).toLocaleDateString()}
                                </span>
                                <span className="font-medium text-slate-900">
                                    ${(entry.priceCents / 100).toFixed(2)}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-slate-500 text-sm">No price history</p>
                )}
            </div>

            {/* Stock Movements */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <h3 className="font-semibold text-slate-900 mb-4">Stock Movements</h3>
                {product.stockMovements && product.stockMovements.length > 0 ? (
                    <div className="space-y-4">
                        {product.stockMovements.slice(0, 5).map((movement) => (
                            <MovementItem
                                key={movement.id}
                                date={new Date(movement.createdAt).toLocaleDateString()}
                                change={movement.quantity > 0 ? `+${movement.quantity}` : `${movement.quantity}`}
                                reason={movement.reason}
                            />
                        ))}
                    </div>
                ) : (
                    <p className="text-slate-500 text-sm">No stock movements</p>
                )}
            </div>

            {/* Modals */}
            {showStockModal && (
                <StockModal
                    currentStock={currentStock}
                    onClose={() => setShowStockModal(false)}
                    onSave={handleStockUpdate}
                />
            )}
            {showPriceModal && (
                <PriceModal
                    currentPrice={priceDollars}
                    onClose={() => setShowPriceModal(false)}
                    onSave={handlePriceUpdate}
                />
            )}
        </div>
    );
}

function ActionButton({ icon, label, onClick, primary }: { icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean }) {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all active:scale-95 ${primary
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
        >
            <div className="mb-2">{icon}</div>
            <span className="text-sm font-medium">{label}</span>
        </button>
    );
}

function MovementItem({ date, change, reason }: { date: string; change: string; reason: string }) {
    const isPositive = change.startsWith('+');
    return (
        <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
                <span className="text-slate-400 w-20">{date}</span>
                <span className="text-slate-700">{reason}</span>
            </div>
            <span className={`font-medium ${isPositive ? 'text-emerald-600' : 'text-slate-600'}`}>
                {change}
            </span>
        </div>
    );
}

function StockModal({ currentStock, onClose, onSave }: { currentStock: number; onClose: () => void; onSave: (val: number, reason: string) => void }) {
    const [value, setValue] = useState(currentStock.toString());
    const [reason, setReason] = useState('Restock');

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl scale-100 animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-900">Adjust Stock</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">New Quantity</label>
                        <input
                            type="number"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
                        <select
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        >
                            <option>Restock</option>
                            <option>Correction</option>
                            <option>Damage</option>
                            <option>Return</option>
                            <option>Sale</option>
                        </select>
                    </div>
                    <button
                        onClick={() => onSave(parseInt(value) || 0, reason)}
                        className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors"
                    >
                        Update Stock
                    </button>
                </div>
            </div>
        </div>
    );
}

function PriceModal({ currentPrice, onClose, onSave }: { currentPrice: number; onClose: () => void; onSave: (val: number) => void }) {
    const [value, setValue] = useState(currentPrice.toString());

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl scale-100 animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-900">Set Price</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">New Price ($)</label>
                        <input
                            type="number"
                            step="0.01"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <button
                        onClick={() => {
                            const dollars = parseFloat(value) || 0;
                            const cents = Math.round(dollars * 100);
                            onSave(cents);
                        }}
                        className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors"
                    >
                        Update Price
                    </button>
                </div>
            </div>
        </div>
    );
}
