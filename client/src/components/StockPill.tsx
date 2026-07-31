import clsx from 'clsx';

/** Local to the pill's colour choice; the server owns the real definition. */
const LOW_STOCK_THRESHOLD = 5;

/**
 * Stock status in one glance. The number is always shown alongside the words -
 * colour alone would leave out anyone who cannot easily tell red from green.
 */
export default function StockPill({
    quantity,
    size = 'md',
}: {
    quantity: number;
    size?: 'sm' | 'md';
}) {
    const tone =
        quantity <= 0
            ? 'bg-red-100 text-red-900'
            : quantity <= LOW_STOCK_THRESHOLD
              ? 'bg-amber-100 text-amber-900'
              : 'bg-emerald-100 text-emerald-900';

    const label = quantity <= 0 ? 'None left' : `${quantity} left`;

    return (
        <span
            className={clsx(
                'shrink-0 rounded-full font-semibold whitespace-nowrap tabular-nums',
                size === 'sm' ? 'text-xs px-2.5 py-1' : 'text-sm px-3 py-1',
                tone
            )}
        >
            {label}
        </span>
    );
}
