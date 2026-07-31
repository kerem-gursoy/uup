/**
 * Money and date formatting, in one place so every screen reads the same.
 *
 * Change VITE_CURRENCY in the client env to switch currency; nothing else in
 * the app hardcodes a symbol.
 */
const CURRENCY = import.meta.env.VITE_CURRENCY || 'TRY';

/**
 * The locale is pinned rather than taken from the browser so that every member
 * of staff sees prices written the same way, whatever device they are on.
 */
const LOCALE = import.meta.env.VITE_LOCALE || 'tr-TR';

const moneyFormatter = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
});

/** Money is stored and sent as whole cents so rounding can never drift. */
export function formatMoney(cents: number): string {
    return moneyFormatter.format(cents / 100);
}

const moneyFormatterShort = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    maximumFractionDigits: 0,
});

/** Whole-currency form, for axis ticks where decimals are noise. */
export function formatMoneyShort(cents: number): string {
    return moneyFormatterShort.format(cents / 100);
}

/** For values a shop may simply not know yet - shown as a dash, never as 0. */
export function formatMoneyOrBlank(cents: number | null | undefined): string {
    return cents === null || cents === undefined ? '—' : formatMoney(cents);
}

export function currencySymbol(): string {
    const parts = moneyFormatter.formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value ?? '';
}

function decimalSeparator(): string {
    return moneyFormatter.formatToParts(0).find((part) => part.type === 'decimal')?.value ?? '.';
}

/** "0,00" or "0.00", matching however the configured locale writes decimals. */
export function decimalPlaceholder(): string {
    return `0${decimalSeparator()}00`;
}

/**
 * Fills a money field with an existing amount, written the way the rest of the
 * app writes money. Prefilling "115.83" where every label reads "₺115,83" makes
 * the field look like it belongs to a different program.
 */
export function centsToInputValue(cents: number): string {
    return (cents / 100).toFixed(2).replace('.', decimalSeparator());
}

/**
 * Reads a typed amount into whole cents.
 *
 * People type money differently depending on where they learned to: "12.50",
 * "12,50", "1.234,56" and "1,234.56" all mean what they look like. The last
 * separator followed by one or two digits is the decimal point; every other
 * separator is thousands grouping.
 *
 * Returns null for anything that is not a usable amount, so callers can show a
 * message instead of silently saving a wrong number.
 */
export function parseMoneyToCents(input: string): number | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Keep only digits and separators; drops currency symbols and spaces.
    const cleaned = trimmed.replace(/[^\d.,]/g, '');
    if (!cleaned || !/\d/.test(cleaned)) return null;

    const lastSeparator = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','));
    let whole = cleaned;
    let fraction = '';

    if (lastSeparator !== -1) {
        const after = cleaned.slice(lastSeparator + 1);
        if (after.length >= 1 && after.length <= 2 && /^\d+$/.test(after)) {
            whole = cleaned.slice(0, lastSeparator);
            fraction = after;
        }
    }

    const wholeDigits = whole.replace(/[.,]/g, '');
    if (!/^\d*$/.test(wholeDigits)) return null;

    const cents =
        Number(wholeDigits || '0') * 100 + Number(fraction.padEnd(2, '0') || '0');

    return Number.isFinite(cents) ? Math.round(cents) : null;
}

/**
 * Dates are spelled out ("3 Jun 2026") rather than numeric, because 03/06/2026
 * means two different days depending on who is reading it.
 */
export function formatDate(value: string | Date): string {
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleDateString(LOCALE, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

/** "Today" and "Yesterday" read faster than a date when that is what it is. */
export function formatDateRelative(value: string | Date): string {
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '';

    const startOfDay = (d: Date) =>
        new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

    const dayDifference = Math.round(
        (startOfDay(new Date()) - startOfDay(date)) / 86_400_000
    );

    if (dayDifference === 0) return 'Today';
    if (dayDifference === 1) return 'Yesterday';
    return formatDate(date);
}

/** Today as yyyy-mm-dd in local time, for prefilling <input type="date">. */
export function todayAsInputValue(): string {
    const now = new Date();
    const offsetMinutes = now.getTimezoneOffset();
    return new Date(now.getTime() - offsetMinutes * 60_000)
        .toISOString()
        .slice(0, 10);
}

/**
 * Turns a date picker's "yyyy-mm-dd" into an instant to send to the server.
 *
 * `new Date("2026-07-01")` is midnight *UTC*, which lands on 30 June for
 * anyone west of Greenwich - a price would be filed under the wrong day. This
 * anchors the date at local midday instead, so it reads back as the day the
 * user picked from any plausible timezone.
 *
 * Returns null when the chosen day is today: the server's own clock is then a
 * better timestamp, and it keeps several changes on the same day in order.
 */
export function dateInputToISO(value: string): string | null {
    if (!value || value === todayAsInputValue()) return null;

    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;

    return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
}

/**
 * Profit per unit and margin, when both sides of the price are known.
 * Margin is expressed against the selling price, the way retail quotes it.
 */
export function profitFrom(
    costCents: number | null | undefined,
    sellCents: number | null | undefined
): { profitCents: number; marginPercent: number } | null {
    if (costCents === null || costCents === undefined) return null;
    if (sellCents === null || sellCents === undefined) return null;
    if (sellCents <= 0) return null;

    const profitCents = sellCents - costCents;
    return {
        profitCents,
        marginPercent: (profitCents / sellCents) * 100,
    };
}
