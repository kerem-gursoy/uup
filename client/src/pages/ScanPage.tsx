import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, RotateCcw, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, errorMessage, getProductByBarcode } from '../services/api';
import BarcodeScanner from '../components/BarcodeScanner';
import { Button, Card, Field, Modal, TextInput } from '../components/ui';
import { useT } from '../i18n';

export default function ScanPage() {
    const t = useT();
    const navigate = useNavigate();

    const [barcode, setBarcode] = useState('');
    const [scannerOpen, setScannerOpen] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    /**
     * A barcode that matched nothing. Holding it in state drives the decision
     * dialog: rescanning the same unknown label over and over tells the user
     * nothing new, so we stop and ask what they want to do with it.
     */
    const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);

    const lookUp = async (code: string) => {
        setIsSearching(true);
        try {
            const product = await getProductByBarcode(code);
            navigate(`/products/${product.id}`);
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) {
                setUnknownBarcode(code);
            } else {
                console.error('Barcode lookup failed:', err);
                toast.error(errorMessage(err, t('error.barcodeLookup')));
            }
        } finally {
            setIsSearching(false);
        }
    };

    const handleDetected = (code: string) => {
        setScannerOpen(false);
        setBarcode(code);
        void lookUp(code);
    };

    const handleManualSearch = (event: React.FormEvent) => {
        event.preventDefault();
        const code = barcode.trim();
        if (code) void lookUp(code);
    };

    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">{t('scan.title')}</h1>
                <p className="text-slate-500 mt-0.5">{t('scan.subtitle')}</p>
            </div>

            <Button
                onClick={() => setScannerOpen(true)}
                icon={<ScanLine size={22} />}
                busy={isSearching}
                className="w-full min-h-[64px] text-lg"
            >
                {isSearching ? t('scan.looking') : t('scan.withCamera')}
            </Button>

            <Card className="p-5">
                <form onSubmit={handleManualSearch} className="space-y-4">
                    <Field
                        label={t('scan.manualLabel')}
                        htmlFor="manualBarcode"
                        hint={t('scan.manualHint')}
                    >
                        <TextInput
                            id="manualBarcode"
                            value={barcode}
                            onChange={(event) => setBarcode(event.target.value)}
                            placeholder={t('scan.manualPlaceholder')}
                            inputMode="numeric"
                            disabled={isSearching}
                        />
                    </Field>
                    <Button
                        type="submit"
                        variant="secondary"
                        disabled={isSearching || !barcode.trim()}
                        className="w-full"
                    >
                        {isSearching ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                {t('scan.looking')}
                            </>
                        ) : (
                            t('scan.find')
                        )}
                    </Button>
                </form>
            </Card>

            {scannerOpen && (
                <BarcodeScanner
                    title={t('scan.dialogTitle')}
                    onDetected={handleDetected}
                    onClose={() => setScannerOpen(false)}
                />
            )}

            {unknownBarcode && (
                <UnknownBarcodeDialog
                    barcode={unknownBarcode}
                    onScanAgain={() => {
                        setUnknownBarcode(null);
                        setScannerOpen(true);
                    }}
                    onAddProduct={() => {
                        setUnknownBarcode(null);
                        // Carry the barcode across so it does not have to be
                        // scanned or typed a second time.
                        navigate(`/products/new?barcode=${encodeURIComponent(unknownBarcode)}`);
                    }}
                    onClose={() => setUnknownBarcode(null)}
                />
            )}
        </div>
    );
}

/**
 * Shown when a scanned barcode matches nothing. For a shop still filling in its
 * inventory this is a common and expected outcome, so it offers the two things
 * worth doing rather than treating it as an error.
 */
function UnknownBarcodeDialog({
    barcode,
    onScanAgain,
    onAddProduct,
    onClose,
}: {
    barcode: string;
    onScanAgain: () => void;
    onAddProduct: () => void;
    onClose: () => void;
}) {
    const t = useT();

    return (
        <Modal title={t('scan.unknownTitle')} onClose={onClose}>
            <div className="space-y-5">
                <div>
                    <p className="text-slate-600">{t('scan.youScanned')}</p>
                    <p className="font-mono text-lg text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mt-1 break-all">
                        {barcode}
                    </p>
                </div>

                <p className="text-slate-600">{t('scan.unknownBody')}</p>

                <div className="space-y-3">
                    <Button onClick={onAddProduct} icon={<Plus size={20} />} className="w-full">
                        {t('scan.addAsNew')}
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={onScanAgain}
                        icon={<RotateCcw size={20} />}
                        className="w-full"
                    >
                        {t('scan.scanAnother')}
                    </Button>
                    <Button variant="ghost" onClick={onClose} className="w-full">
                        {t('common.cancel')}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
