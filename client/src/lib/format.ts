/**
 * Money, numbers and dates, in one place so every screen reads the same.
 *
 * Change VITE_CURRENCY in the client env to switch currency; nothing else in
 * the app hardcodes a symbol.
 */
import { getLocaleTag } from '../i18n/locale';
import { t } from '../i18n';

const CURRENCY = import.meta.env.VITE_CURRENCY || 'TRY';

/**
 * How numbers and dates are written follows the interface language: "₺1.234,56"
 * and "3 Haz 2026" in Turkish, "₺1,234.56" and "3 Jun 2026" in English. The
 * currency itself never follows it - the shop is in Türkiye and trades in lira
 * whoever happens to be reading the screen.
 *
 * The locale is still not taken from the device: it comes from the language the
 * user chose, so two people standing at the same counter with differently
 * configured phones see prices written the same way. Set VITE_LOCALE to pin both
 * languages to a single way of writing numbers.
 */
const LOCALE_OVERRIDE = import.meta.env.VITE_LOCALE;

function locale(): string {
    return LOCALE_OVERRIDE || getLocaleTag();
}

/**
 * Intl formatters are expensive to build, so one is kept per language. Reading the
 * locale on each call rather than once at module load is what lets the language
 * change without a reload - every export below stays a function for that reason.
 */
function perLocale<T>(create: (tag: string) => T): () => T {
    const cache = new Map<string, T>();

    return () => {
        const tag = locale();
        let formatter = cache.get(tag);
        if (!formatter) {
            formatter = create(tag);
            cache.set(tag, formatter);
        }
        return formatter;
    };
}

/**
 * narrowSymbol, not the default, because the default only writes "₺" for a locale
 * whose own currency it is: en-GB renders lira as "TRY 1,234.56". That is correct
 * but wrong for this shop - the price tags say ₺ - and it would also put the
 * three-letter code inside the money input, which is sized for a symbol.
 */
const MONEY: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: CURRENCY,
    currencyDisplay: 'narrowSymbol',
};

const moneyFormatter = perLocale((tag) => new Intl.NumberFormat(tag, MONEY));

const moneyFormatterShort = perLocale(
    (tag) => new Intl.NumberFormat(tag, { ...MONEY, maximumFractionDigits: 0 })
);

const dateFormatter = perLocale(
    (tag) =>
        new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric' })
);

const dateTimeFormatter = perLocale(
    (tag) =>
        new Intl.DateTimeFormat(tag, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
);

const percentFormatter = perLocale(
    (tag) => new Intl.NumberFormat(tag, { style: 'percent', maximumFractionDigits: 0 })
);

const oneDecimalFormatter = perLocale(
    (tag) => new Intl.NumberFormat(tag, { maximumFractionDigits: 1 })
);

/** Money is stored and sent as whole cents so rounding can never drift. */
export function formatMoney(cents: number): string {
    return moneyFormatter().format(cents / 100);
}

/** Whole-currency form, for axis ticks where decimals are noise. */
export function formatMoneyShort(cents: number): string {
    return moneyFormatterShort().format(cents / 100);
}

/** For values a shop may simply not know yet - shown as a dash, never as 0. */
export function formatMoneyOrBlank(cents: number | null | undefined): string {
    return cents === null || cents === undefined ? '—' : formatMoney(cents);
}

export function currencySymbol(): string {
    const parts = moneyFormatter().formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value ?? '';
}

function decimalSeparator(): string {
    return moneyFormatter().formatToParts(0).find((part) => part.type === 'decimal')?.value ?? '.';
}

/** "0,00" or "0.00", matching however the current language writes decimals. */
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
 * Deliberately independent of the interface language: someone who switches to
 * English mid-shift should not find that what they type means something else.
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
 * A share, from a number already expressed as a percentage: pass 42 for 42%.
 *
 * Worth going through Intl rather than adding a "%" by hand, because Turkish puts
 * the sign in front of the number - "%42", not "42%".
 */
export function formatPercent(percent: number): string {
    return percentFormatter().format(percent / 100);
}

/**
 * Dates are spelled out ("3 Jun 2026") rather than numeric, because 03/06/2026
 * means two different days depending on who is reading it.
 */
export function formatDate(value: string | Date): string {
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '';

    return dateFormatter().format(date);
}

/** Date and time together, for stamps where the hour is part of the fact. */
export function formatDateTime(value: string | Date): string {
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '';

    return dateTimeFormatter().format(date);
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

    if (dayDifference === 0) return t('date.today');
    if (dayDifference === 1) return t('date.yesterday');
    return formatDate(date);
}

/** File sizes as shown beside a chosen upload - "1.234,5 KB" in Turkish. */
export function formatFileSize(bytes: number): string {
    return `${oneDecimalFormatter().format(bytes / 1024)} KB`;
}

/**
 * Sorts names the way a Turkish reader expects: ç after c, ğ after g, ı before i,
 * ö after o, ş after s, ü after u. A default collator gets all six wrong.
 *
 * Pinned to Turkish rather than following the interface language, because the names
 * being sorted are the shop's own products and suppliers - they are Turkish whatever
 * language the labels around them are in.
 */
export function compareNames(a: string, b: string): number {
    return a.localeCompare(b, 'tr', { sensitivity: 'base', numeric: true });
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
