import { forwardRef, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Loader2, Minus, Plus } from 'lucide-react';
import clsx from 'clsx';
import { currencySymbol, decimalPlaceholder } from '../lib/format';
import { useLocale, useT } from '../i18n';

/**
 * Shared building blocks for the app's screens.
 *
 * The tool is used by people of very different ages and comfort with software,
 * so the rules baked in here are deliberate: every control is at least 48px
 * tall, labels are full sentences rather than jargon, and each input can carry
 * a hint explaining what to type.
 */

const CONTROL = 'w-full min-h-[52px] px-4 rounded-xl border text-base outline-none transition-colors';
const CONTROL_IDLE = 'border-slate-300 bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-100';
const CONTROL_ERROR = 'border-red-400 bg-red-50 focus:border-red-600 focus:ring-4 focus:ring-red-100';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={clsx('bg-white rounded-2xl border border-slate-200 shadow-sm', className)}>
            {children}
        </div>
    );
}

export function Section({
    title,
    hint,
    children,
}: {
    title: string;
    hint?: string;
    children: ReactNode;
}) {
    return (
        <Card className="p-5 space-y-5">
            <div>
                <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
                {hint && <p className="text-sm text-slate-500 mt-1">{hint}</p>}
            </div>
            {children}
        </Card>
    );
}

export function Field({
    label,
    hint,
    error,
    optional,
    htmlFor,
    children,
}: {
    label: string;
    hint?: string;
    error?: string;
    optional?: boolean;
    htmlFor?: string;
    children: ReactNode;
}) {
    const t = useT();

    return (
        <div>
            <label htmlFor={htmlFor} className="block text-base font-medium text-slate-900 mb-1">
                {label}
                {optional && (
                    <span className="ml-2 text-sm font-normal text-slate-400">
                        {t('common.optional')}
                    </span>
                )}
            </label>
            {hint && <p className="text-sm text-slate-500 mb-2">{hint}</p>}
            {children}
            {error && (
                <p role="alert" className="mt-2 text-sm text-red-600 flex items-center gap-1.5">
                    <AlertCircle size={15} className="shrink-0" />
                    {error}
                </p>
            )}
        </div>
    );
}

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
    function TextInput({ invalid, className, ...props }, ref) {
        return (
            <input
                ref={ref}
                className={clsx(CONTROL, invalid ? CONTROL_ERROR : CONTROL_IDLE, className)}
                {...props}
            />
        );
    }
);

export function Select({
    invalid,
    className,
    children,
    ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; children: ReactNode }) {
    return (
        <select className={clsx(CONTROL, invalid ? CONTROL_ERROR : CONTROL_IDLE, className)} {...props}>
            {children}
        </select>
    );
}

/**
 * A money field showing the currency up front, so there is never a question of
 * what unit is being typed. The value stays a string while editing - parsing
 * happens on save, which lets people type "12," on the way to "12,50".
 */
export function MoneyInput({
    value,
    onChange,
    invalid,
    id,
}: {
    value: string;
    onChange: (value: string) => void;
    invalid?: boolean;
    id?: string;
}) {
    // This field writes money but has no copy of its own, so React cannot see that
    // it depends on the language. Without this it would keep the old decimal
    // separator and currency symbol after a switch.
    useLocale();

    // The currency sits in its own cell rather than floating over the input, so
    // a long symbol like "TRY" can never overlap what has been typed.
    return (
        <div
            className={clsx(
                CONTROL,
                invalid ? CONTROL_ERROR : CONTROL_IDLE,
                'flex items-center gap-2 px-3 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-100'
            )}
        >
            <span className="shrink-0 text-slate-500 select-none">{currencySymbol()}</span>
            <input
                id={id}
                type="text"
                inputMode="decimal"
                value={value}
                placeholder={decimalPlaceholder()}
                onChange={(event) => onChange(event.target.value)}
                className="w-full min-w-0 bg-transparent border-0 outline-none text-base tabular-nums"
            />
        </div>
    );
}

/**
 * Counting stock is the one number every user has to enter, so it gets big
 * plus and minus buttons alongside the field - faster than a keyboard on a
 * phone, and forgiving for anyone who finds small targets hard to hit.
 */
export function QuantityInput({
    value,
    onChange,
    min = 0,
    id,
}: {
    value: string;
    onChange: (value: string) => void;
    min?: number;
    id?: string;
}) {
    const t = useT();

    const step = (delta: number) => {
        const next = (Number(value) || 0) + delta;
        onChange(String(Math.max(min, next)));
    };

    return (
        <div className="flex items-stretch gap-3">
            <button
                type="button"
                onClick={() => step(-1)}
                aria-label={t('common.decreaseByOne')}
                className="w-14 shrink-0 rounded-xl border border-slate-300 bg-white text-slate-700 flex items-center justify-center hover:bg-slate-50 active:scale-95 transition"
            >
                <Minus size={22} />
            </button>
            <input
                id={id}
                type="number"
                inputMode="numeric"
                value={value}
                min={min}
                onChange={(event) => onChange(event.target.value)}
                className={clsx(CONTROL, CONTROL_IDLE, 'text-center text-xl font-semibold tabular-nums')}
            />
            <button
                type="button"
                onClick={() => step(1)}
                aria-label={t('common.increaseByOne')}
                className="w-14 shrink-0 rounded-xl border border-slate-300 bg-white text-slate-700 flex items-center justify-center hover:bg-slate-50 active:scale-95 transition"
            >
                <Plus size={22} />
            </button>
        </div>
    );
}

export function Button({
    variant = 'primary',
    busy,
    icon,
    children,
    className,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost';
    busy?: boolean;
    icon?: ReactNode;
}) {
    const variants = {
        primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
        secondary: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50',
        ghost: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
    } as const;

    return (
        <button
            className={clsx(
                'min-h-[52px] px-5 rounded-xl text-base font-semibold inline-flex items-center justify-center gap-2',
                'transition active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none',
                variants[variant],
                className
            )}
            disabled={busy || props.disabled}
            {...props}
        >
            {busy ? <Loader2 size={20} className="animate-spin" /> : icon}
            {children}
        </button>
    );
}

export function LoadingBlock({ label }: { label?: string }) {
    const t = useT();

    return (
        <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 size={28} className="animate-spin text-blue-600" />
            {/* Defaulted here rather than in the parameter list: a default value is
                evaluated before any hook has run. */}
            <span className="text-base">{label ?? t('common.loading')}</span>
        </div>
    );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
    const t = useT();

    return (
        <div className="py-10 px-5 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-3">
                <AlertCircle size={24} />
            </div>
            <p className="text-slate-900 font-medium">{message}</p>
            {onRetry && (
                <Button variant="secondary" onClick={onRetry} className="mt-4">
                    {t('common.tryAgain')}
                </Button>
            )}
        </div>
    );
}

export function EmptyBlock({
    icon,
    title,
    description,
    action,
}: {
    icon: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
}) {
    return (
        <div className="py-12 px-5 text-center">
            <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
                {icon}
            </div>
            <h3 className="text-slate-900 font-semibold text-lg">{title}</h3>
            {description && <p className="text-slate-500 mt-1.5 max-w-sm mx-auto">{description}</p>}
            {action && <div className="mt-5 flex justify-center">{action}</div>}
        </div>
    );
}

/**
 * A floating panel for the decisions a user makes on top of a screen - setting a
 * price, counting stock, choosing what to do with an unknown barcode.
 *
 * Deliberately inset from the edges rather than a full-bleed sheet: the screen
 * behind stays visible, so the panel reads as a step in the current task.
 */
const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
    title,
    onClose,
    children,
}: {
    title: string;
    onClose: () => void;
    children: ReactNode;
}) {
    const panelRef = useRef<HTMLDivElement>(null);

    /**
     * Keyboard handling for a panel that claims to be modal.
     *
     * Escape closes, Tab stays inside. Without the trap, `aria-modal` is a
     * promise the panel does not keep: tabbing walks out into the page behind,
     * which a screen reader has already been told is not there, and the next
     * Enter presses a button nobody can see.
     */
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
                return;
            }
            if (event.key !== 'Tab' || !panelRef.current) return;

            const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
                (element) => element.offsetParent !== null
            );
            if (focusable.length === 0) return;

            const first = focusable[0]!;
            const last = focusable[focusable.length - 1]!;
            const active = document.activeElement;

            if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    /**
     * Focus goes in on open and comes back out on close.
     *
     * Returning it matters more than taking it: without this, closing the panel
     * drops focus back to the top of the document, so a keyboard user lands
     * nowhere near the row they were working on and has to tab through the whole
     * invoice to find their place again.
     */
    useEffect(() => {
        const opener = document.activeElement as HTMLElement | null;

        // Whatever the panel puts first, or the panel itself if it holds nothing
        // focusable - never the page behind.
        const target =
            panelRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panelRef.current;
        target?.focus();

        return () => opener?.focus?.();
    }, []);

    // Rendered into <body>, not where it is written. A panel opened from a page
    // that is itself a <form> would otherwise nest one form inside another, which
    // is invalid HTML: the browser submits the outer form and reloads the page,
    // losing everything the user had typed.
    return createPortal(
        <div
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-backdrop-in p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]"
            onClick={onClose}
            role="presentation"
        >
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
                // React events travel the component tree, so a submit inside the
                // panel would reach the form of the page that opened it even
                // though the panel is portalled elsewhere in the DOM. Contained
                // here so no dialog can accidentally save the page behind it.
                onSubmit={(event) => event.stopPropagation()}
                className="w-full sm:max-w-md bg-white rounded-3xl shadow-2xl shadow-slate-950/30 ring-1 ring-slate-900/5 p-5 max-h-[88vh] overflow-y-auto animate-panel-in"
            >
                <h3 className="text-xl font-bold text-slate-900 mb-5">{title}</h3>
                {children}
            </div>
        </div>,
        document.body
    );
}

/**
 * Asking before something is undone.
 *
 * Replaces window.confirm, which looked like the browser rather than the app,
 * could not say which thing it was about to remove in the app's own language on
 * every platform, and froze the page while it waited. This one is a panel like
 * any other: it names what is going, focus lands on it, and Escape backs out.
 */
export function ConfirmDialog({
    title,
    body,
    confirmLabel,
    destructive,
    onConfirm,
    onClose,
}: {
    title: string;
    body?: string;
    confirmLabel: string;
    destructive?: boolean;
    onConfirm: () => void;
    onClose: () => void;
}) {
    const t = useT();

    return (
        <Modal title={title} onClose={onClose}>
            {body && <p className="text-slate-600 -mt-2 mb-5">{body}</p>}
            <div className="flex flex-col gap-2">
                <Button
                    onClick={() => {
                        onConfirm();
                        onClose();
                    }}
                    className={
                        destructive
                            ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm'
                            : undefined
                    }
                >
                    {confirmLabel}
                </Button>
                <Button variant="ghost" onClick={onClose}>
                    {t('common.cancel')}
                </Button>
            </div>
        </Modal>
    );
}
