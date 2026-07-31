import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, CornerDownLeft, Loader2 } from 'lucide-react';
import {
    checkSupplierName,
    createSupplier,
    errorMessage,
    updateSupplier,
    type Supplier,
    type SupplierNameCheck,
} from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { Button, Field, Modal, TextInput } from './ui';
import { useT, useTPlural } from '../i18n';
import { T } from '../i18n/T';

/**
 * Adds a supplier, or renames one, with two safeguards against ending up with
 * the same supplier twice.
 *
 * The first is the server's: names that differ only in capitalisation or spacing
 * are the same supplier and cannot both exist. When the typed name is already
 * taken, this offers that supplier instead of reporting an error.
 *
 * The second needs a human. Names that match only once accents and punctuation
 * are ignored - "Çelikayna" against an existing "Celikayna" - are probably, but
 * not certainly, the same company. Those are shown to the user, who decides.
 *
 * Saving always goes through a confirmation step showing the exact text that
 * will be stored, so nothing changes from a stray tap.
 *
 * Pass `existing` to rename it instead of creating a new one; the supplier being
 * renamed is excluded from both checks, so fixing its own capitalisation is not
 * reported as a clash with itself.
 */
export default function SupplierDialog({
    existing,
    onSaved,
    onUseExisting,
    onClose,
}: {
    existing?: Supplier;
    onSaved: (supplier: Supplier) => void;
    onUseExisting?: (supplier: Supplier) => void;
    onClose: () => void;
}) {
    const t = useT();
    const renaming = existing !== undefined;

    const [name, setName] = useState(existing?.name ?? '');
    const [step, setStep] = useState<'enter' | 'confirm'>('enter');
    const [check, setCheck] = useState<SupplierNameCheck | null>(null);
    const [checking, setChecking] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const debouncedName = useDebounce(name.trim(), 350);

    useEffect(() => {
        if (!debouncedName) {
            setCheck(null);
            return;
        }

        let cancelled = false;
        setChecking(true);

        checkSupplierName(debouncedName)
            .then((result) => {
                if (!cancelled) setCheck(result);
            })
            .catch(() => {
                // A failed check must not block typing; the server still enforces
                // uniqueness when the user tries to save.
                if (!cancelled) setCheck(null);
            })
            .finally(() => {
                if (!cancelled) setChecking(false);
            });

        return () => {
            cancelled = true;
        };
    }, [debouncedName]);

    const trimmed = name.trim();
    const upToDate = check !== null && debouncedName === trimmed && !checking;

    // Matching yourself is not a clash: it is how a capitalisation fix looks.
    const rawExact = upToDate ? check.exact : null;
    const exact = rawExact && rawExact.id !== existing?.id ? rawExact : null;
    const similar = upToDate ? check.similar.filter((s) => s.id !== existing?.id) : [];

    // The server tidies whitespace, so show what it will actually store.
    const finalName = (upToDate && check.normalizedName) || trimmed;
    const unchanged = renaming && finalName === existing?.name;

    const handleSave = async () => {
        setSaving(true);
        setSaveError(null);

        try {
            onSaved(
                renaming
                    ? await updateSupplier(existing.id, { name: finalName })
                    : await createSupplier({ name: finalName })
            );
        } catch (err) {
            // Someone else may have taken the name since the check ran.
            const clash =
                err instanceof Error && 'body' in err
                    ? ((err as { body: Record<string, unknown> | null }).body?.existing as
                          | Supplier
                          | undefined)
                    : undefined;

            if (clash && onUseExisting) {
                onUseExisting(clash);
                return;
            }
            setSaveError(errorMessage(err, t('error.supplierSave')));
            setStep('enter');
        } finally {
            setSaving(false);
        }
    };

    if (step === 'confirm') {
        return (
            <Modal
                title={
                    renaming
                        ? t('supplier.dialog.confirmRename')
                        : t('supplier.dialog.confirmAdd')
                }
                onClose={onClose}
            >
                <div className="space-y-5">
                    {renaming && (
                        <div>
                            <p className="text-slate-600">
                                {t('supplier.dialog.currentlyCalled')}
                            </p>
                            <p className="text-lg text-slate-500 line-through break-words mt-0.5">
                                {existing.name}
                            </p>
                        </div>
                    )}

                    <div>
                        <p className="text-slate-600">
                            {renaming
                                ? t('supplier.dialog.willBeRenamed')
                                : t('supplier.dialog.willBeSaved')}
                        </p>
                        <p className="text-xl font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mt-1.5 break-words">
                            {finalName}
                        </p>
                    </div>

                    {similar.length > 0 && (
                        <SimilarWarning similar={similar} onUseExisting={onUseExisting} />
                    )}

                    <p className="text-slate-600">
                        {renaming
                            ? t('supplier.dialog.renameNote')
                            : t('supplier.dialog.addNote')}
                    </p>

                    <div className="space-y-3">
                        <Button
                            onClick={handleSave}
                            busy={saving}
                            icon={<Check size={20} />}
                            className="w-full"
                        >
                            {saving
                                ? t('supplier.dialog.saving')
                                : renaming
                                  ? t('supplier.dialog.yesRename')
                                  : t('supplier.dialog.yesAdd')}
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => setStep('enter')}
                            icon={<ArrowLeft size={20} />}
                            className="w-full"
                            disabled={saving}
                        >
                            {t('supplier.dialog.goBack')}
                        </Button>
                    </div>
                </div>
            </Modal>
        );
    }

    return (
        <Modal
            title={
                renaming ? t('supplier.dialog.renameTitle') : t('supplier.dialog.newTitle')
            }
            onClose={onClose}
        >
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    // React propagates events through the component tree, not the
                    // DOM, so this submit would otherwise reach the form of the
                    // page that opened the dialog - saving a half-filled product
                    // and navigating away from the supplier the user was adding.
                    event.stopPropagation();
                    if (trimmed && !exact && !unchanged) setStep('confirm');
                }}
                className="space-y-5"
            >
                <Field
                    label={t('supplier.dialog.nameLabel')}
                    htmlFor="supplierName"
                    hint={t('supplier.dialog.nameHint')}
                    error={saveError ?? (upToDate && !check.valid ? check.error : undefined)}
                >
                    <TextInput
                        id="supplierName"
                        value={name}
                        onChange={(event) => {
                            setName(event.target.value);
                            setSaveError(null);
                        }}
                        placeholder={t('supplier.dialog.namePlaceholder')}
                        autoFocus
                        autoCapitalize="words"
                        maxLength={120}
                        invalid={Boolean(saveError) || Boolean(exact)}
                    />
                </Field>

                {/* Announced politely so a screen reader hears the outcome of the
                    check without the input losing focus. */}
                <div aria-live="polite" className="space-y-3">
                    {checking && trimmed && (
                        <p className="text-sm text-slate-500 flex items-center gap-2">
                            <Loader2 size={15} className="animate-spin" />
                            {t('supplier.dialog.checking')}
                        </p>
                    )}

                    {exact && (
                        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
                            {/* Two keys, not one: the second sentence stands on its
                                own, and gluing it to the first would force the
                                Turkish to keep the English sentence boundary. */}
                            <p className="text-blue-900">
                                <T
                                    k="supplier.dialog.taken"
                                    values={{ name: <strong>{exact.name}</strong> }}
                                />{' '}
                                {t('supplier.dialog.takenNote')}
                            </p>
                            {onUseExisting && (
                                <Button
                                    type="button"
                                    onClick={() => onUseExisting(exact)}
                                    icon={<CornerDownLeft size={18} />}
                                    className="w-full mt-3"
                                >
                                    {t('supplier.dialog.use', { name: exact.name })}
                                </Button>
                            )}
                        </div>
                    )}

                    {!exact && similar.length > 0 && (
                        <SimilarWarning similar={similar} onUseExisting={onUseExisting} />
                    )}
                </div>

                <div className="space-y-3">
                    <Button
                        type="submit"
                        disabled={!trimmed || Boolean(exact) || checking || unchanged}
                        className="w-full"
                    >
                        {unchanged ? t('supplier.dialog.noChange') : t('common.continue')}
                    </Button>
                    <Button variant="ghost" onClick={onClose} className="w-full">
                        {t('common.cancel')}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

/**
 * A near-match is a judgement call, not an error, so it is phrased as a question
 * and, where the caller can act on it, offers the existing supplier instead.
 */
function SimilarWarning({
    similar,
    onUseExisting,
}: {
    similar: Supplier[];
    onUseExisting?: (supplier: Supplier) => void;
}) {
    const t = useT();
    const tPlural = useTPlural();

    return (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <p className="text-amber-900 flex items-start gap-2">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <span>{tPlural('supplier.dialog.similar', similar.length)}</span>
            </p>
            {onUseExisting && (
                <div className="mt-3 space-y-2">
                    {similar.map((supplier) => (
                        <Button
                            key={supplier.id}
                            type="button"
                            variant="secondary"
                            onClick={() => onUseExisting(supplier)}
                            className="w-full"
                        >
                            {t('supplier.dialog.use', { name: supplier.name })}
                        </Button>
                    ))}
                </div>
            )}
            {!onUseExisting && (
                <ul className="mt-2 text-amber-900 font-medium">
                    {similar.map((supplier) => (
                        <li key={supplier.id}>{supplier.name}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}
