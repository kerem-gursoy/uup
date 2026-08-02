import { useEffect, useId, useRef, useState } from 'react';
import { Camera, Check, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
    ApiError,
    createProduct,
    errorMessage,
    getProductByBarcode,
    getProducts,
    type Product,
} from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import BarcodeScanner from './BarcodeScanner';
import { Button, Field, Modal, TextInput } from './ui';
import { useT } from '../i18n';

/**
 * Deciding which product an invoice line refers to.
 *
 * This is the one decision on the review screen that cannot be guessed and
 * cannot be undone cheaply: it is what says whether tonight's delivery lands on
 * an existing product's stock or brings a new row into the catalogue. So it gets
 * a screen of its own rather than a row of small controls competing with seven
 * other fields.
 *
 * Creating a product is a step you arrive at, not a button you can hit by
 * accident. It used to be a link beside the search box that wrote to the
 * database on the first tap, using whatever the parser happened to read - which
 * is how a catalogue fills up with "BAKLAVA KABI SIZDIRMAZ 500GR" in shouting
 * capitals. Now the details are shown, and editable, before anything is written.
 */
export default function ProductPicker({
    line,
    supplierId,
    onPick,
    onClose,
}: {
    /** What the document said, used to prefill a new product. */
    line: { description: string; name?: string; brand?: string | null; barcode: string | null };
    supplierId?: number;
    onPick: (product: Product) => void;
    onClose: () => void;
}) {
    const t = useT();
    const [mode, setMode] = useState<'search' | 'create'>('search');

    return (
        <Modal
            title={mode === 'search' ? t('picker.title') : t('picker.createTitle')}
            onClose={onClose}
        >
            {mode === 'search' ? (
                <SearchMode
                    suggestion={line.name?.trim() || line.description.trim()}
                    onPick={onPick}
                    onCreate={() => setMode('create')}
                />
            ) : (
                <CreateMode
                    line={line}
                    supplierId={supplierId}
                    onCreated={onPick}
                    onBack={() => setMode('search')}
                />
            )}
        </Modal>
    );
}

function SearchMode({
    suggestion,
    onPick,
    onCreate,
}: {
    suggestion: string;
    onPick: (product: Product) => void;
    onCreate: () => void;
}) {
    const t = useT();
    const listId = useId();
    const optionId = useId();

    // Prefilled with what the document said, because that is nearly always the
    // right search and retyping it on a phone is the slowest part of the job.
    const [query, setQuery] = useState(suggestion);
    /** The last answer received, and which question it answers. */
    const [fetched, setFetched] = useState<{ query: string; products: Product[] } | null>(
        null
    );
    const [active, setActive] = useState(0);
    const [showScanner, setShowScanner] = useState(false);

    const debounced = useDebounce(query.trim(), 300);
    const inputRef = useRef<HTMLInputElement>(null);

    // Both derived rather than stored, which is what stops the previous query's
    // matches from sitting under a newly typed one looking like its answer.
    const settled = fetched !== null && fetched.query === debounced;
    const results = debounced && settled ? fetched.products : [];
    const searching = Boolean(debounced) && !settled;

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    useEffect(() => {
        if (!debounced) return;

        let cancelled = false;

        getProducts({ search: debounced })
            .then((products) => {
                if (cancelled) return;
                setFetched({ query: debounced, products });
                setActive(0);
            })
            .catch((error) => {
                if (cancelled) return;
                console.error('Product search failed', error);
                toast.error(errorMessage(error, t('error.productsLoad')));
                // Settled with nothing, so the panel stops saying "Searching…"
                // for a search that is never coming back.
                setFetched({ query: debounced, products: [] });
            });

        return () => {
            cancelled = true;
        };
    }, [debounced, t]);

    /** A scanned code is a definite answer, so a hit is chosen outright. */
    const handleScanned = async (code: string) => {
        setShowScanner(false);
        try {
            onPick(await getProductByBarcode(code));
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) {
                // Not a failure: an unknown barcode is how a new product starts.
                setQuery(code);
                toast.message(t('picker.barcodeUnknown', { barcode: code }));
            } else {
                console.error('Barcode lookup failed', error);
                toast.error(errorMessage(error, t('error.barcodeLookup')));
            }
        }
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (!results.length) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((index) => (index + 1) % results.length);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => (index - 1 + results.length) % results.length);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const chosen = results[active];
            if (chosen) onPick(chosen);
        }
    };

    return (
        <div className="space-y-4">
            <Field label={t('picker.searchLabel')} hint={t('picker.searchHint')} htmlFor="picker-search">
                <div className="relative">
                    <Search
                        size={20}
                        aria-hidden="true"
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <TextInput
                        id="picker-search"
                        ref={inputRef}
                        role="combobox"
                        aria-expanded={results.length > 0}
                        aria-controls={listId}
                        aria-autocomplete="list"
                        aria-activedescendant={
                            results.length > 0 ? `${optionId}-${active}` : undefined
                        }
                        autoComplete="off"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={onKeyDown}
                        className="pl-12"
                        placeholder={t('picker.searchPlaceholder')}
                    />
                </div>
            </Field>

            {/* Announced rather than only drawn, so the count of matches reaches
                someone who cannot see the list appear. */}
            <p aria-live="polite" className="sr-only">
                {searching
                    ? t('picker.searching')
                    : debounced
                      ? t('picker.resultCount', { count: results.length })
                      : ''}
            </p>

            <div className="min-h-[3rem]">
                {searching && results.length === 0 ? (
                    <p className="text-slate-500 py-3">{t('picker.searching')}</p>
                ) : results.length > 0 ? (
                    <ul id={listId} role="listbox" aria-label={t('picker.resultsLabel')} className="space-y-2">
                        {results.map((product, index) => (
                            <li key={product.id}>
                                <button
                                    type="button"
                                    id={`${optionId}-${index}`}
                                    role="option"
                                    aria-selected={index === active}
                                    onClick={() => onPick(product)}
                                    onMouseEnter={() => setActive(index)}
                                    className={
                                        'w-full text-left min-h-[52px] px-4 py-2.5 rounded-xl border transition flex items-center justify-between gap-3 ' +
                                        (index === active
                                            ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-100'
                                            : 'border-slate-200 bg-white hover:bg-slate-50')
                                    }
                                >
                                    <span className="min-w-0">
                                        <span className="block font-medium text-slate-900 truncate">
                                            {product.name}
                                        </span>
                                        <span className="block text-sm text-slate-500 truncate">
                                            {[product.brand, product.barcode]
                                                .filter(Boolean)
                                                .join(' · ') || t('picker.noDetails')}
                                        </span>
                                    </span>
                                    {index === active && (
                                        <Check size={20} aria-hidden="true" className="shrink-0 text-blue-600" />
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : debounced ? (
                    <p className="text-slate-500 py-3">{t('picker.noResults', { query: debounced })}</p>
                ) : (
                    <p className="text-slate-500 py-3">{t('picker.typeToSearch')}</p>
                )}
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                <Button
                    variant="secondary"
                    onClick={() => setShowScanner(true)}
                    icon={<Camera size={20} />}
                >
                    {t('picker.scan')}
                </Button>
                <Button variant="secondary" onClick={onCreate} icon={<Plus size={20} />}>
                    {t('picker.createNew')}
                </Button>
            </div>

            {showScanner && (
                <BarcodeScanner
                    title={t('picker.scanTitle')}
                    onDetected={handleScanned}
                    onClose={() => setShowScanner(false)}
                />
            )}
        </div>
    );
}

function CreateMode({
    line,
    supplierId,
    onCreated,
    onBack,
}: {
    line: { description: string; name?: string; brand?: string | null; barcode: string | null };
    supplierId?: number;
    onCreated: (product: Product) => void;
    onBack: () => void;
}) {
    const t = useT();

    // Prefilled from the document, then left alone. What the parser read is a
    // starting point for a catalogue entry, not the entry itself.
    const [name, setName] = useState(line.name?.trim() || line.description.trim());
    const [brand, setBrand] = useState(line.brand ?? '');
    const [barcode, setBarcode] = useState(line.barcode ?? '');
    const [showScanner, setShowScanner] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleCreate = async () => {
        if (!name.trim()) {
            setError(t('picker.nameRequired'));
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const product = await createProduct({
                name: name.trim(),
                brand: brand.trim() || undefined,
                barcode: barcode.trim() || undefined,
                supplierId,
            });
            toast.success(t('picker.created', { name: product.name }));
            onCreated(product);
        } catch (err) {
            console.error('Create product failed', err);
            // Shown in the panel rather than as a toast: the thing to fix is a
            // field a few centimetres away, most often a barcode already in use.
            setError(errorMessage(err, t('error.productCreate')));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">
                {t('picker.createHint')}
            </p>

            <Field label={t('picker.name')} error={error ?? undefined} htmlFor="picker-name">
                <TextInput
                    id="picker-name"
                    value={name}
                    invalid={Boolean(error)}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t('picker.namePlaceholder')}
                />
            </Field>

            <Field label={t('picker.brand')} optional htmlFor="picker-brand">
                <TextInput
                    id="picker-brand"
                    value={brand}
                    onChange={(event) => setBrand(event.target.value)}
                    placeholder={t('picker.brandPlaceholder')}
                />
            </Field>

            <Field
                label={t('picker.barcode')}
                hint={t('picker.barcodeHint')}
                optional
                htmlFor="picker-barcode"
            >
                <div className="flex gap-2">
                    <TextInput
                        id="picker-barcode"
                        value={barcode}
                        inputMode="numeric"
                        onChange={(event) => setBarcode(event.target.value)}
                        placeholder={t('picker.barcodePlaceholder')}
                    />
                    <button
                        type="button"
                        onClick={() => setShowScanner(true)}
                        aria-label={t('picker.scan')}
                        className="shrink-0 w-14 rounded-xl border border-slate-300 bg-white text-slate-700 flex items-center justify-center hover:bg-slate-50 active:scale-95 transition"
                    >
                        <Camera size={20} />
                    </button>
                </div>
            </Field>

            <div className="flex flex-col gap-2 pt-2">
                <Button onClick={handleCreate} busy={saving} icon={<Plus size={20} />}>
                    {t('picker.createConfirm')}
                </Button>
                <Button variant="ghost" onClick={onBack} disabled={saving}>
                    {t('picker.backToSearch')}
                </Button>
            </div>

            {showScanner && (
                <BarcodeScanner
                    title={t('picker.scanTitle')}
                    onDetected={(code) => {
                        setBarcode(code);
                        setShowScanner(false);
                    }}
                    onClose={() => setShowScanner(false)}
                />
            )}
        </div>
    );
}
