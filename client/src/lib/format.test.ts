import { afterEach, describe, expect, it } from 'vitest';
import { setLang, type Lang } from '../i18n/locale';
import {
    centsToInputValue,
    compareNames,
    decimalPlaceholder,
    formatDate,
    formatMoney,
    formatPercent,
    parseMoneyToCents,
} from './format';

/**
 * The money path is the one place in this app where being quietly wrong writes a
 * wrong number into the database rather than just looking odd, and it is now
 * language-dependent on the way out (centsToInputValue, decimalPlaceholder) while
 * staying language-independent on the way in (parseMoneyToCents). That pairing is
 * what these cover.
 */

const withLang = (lang: Lang, body: () => void) => {
    setLang(lang);
    body();
};

afterEach(() => {
    setLang('en');
});

describe('parseMoneyToCents', () => {
    // Deliberately independent of the interface language: someone who switches to
    // English mid-shift must not find that what they type means something else.
    it.each([
        ['1.234,56', 123456],
        ['1,234.56', 123456],
        ['1234.56', 123456],
        ['1234,56', 123456],
        ['12,50', 1250],
        ['12.5', 1250],
        ['0,85', 85],
        ['1234', 123400],
        ['₺19,99', 1999],
    ])('reads %s as %i cents', (input, expected) => {
        expect(parseMoneyToCents(input)).toBe(expected);
    });

    it('reads a half-typed amount as the whole part, not as garbage', () => {
        // Someone on their way to "12,50" pauses here; it must not become 1250.
        expect(parseMoneyToCents('12,')).toBe(1200);
    });

    it.each(['', '   ', 'abc', '-'])('rejects %o', (input) => {
        expect(parseMoneyToCents(input)).toBeNull();
    });

    it('does not depend on the interface language', () => {
        setLang('tr');
        const inTurkish = parseMoneyToCents('1.234,56');
        setLang('en');
        expect(parseMoneyToCents('1.234,56')).toBe(inTurkish);
    });
});

describe('formatMoney', () => {
    it('writes Turkish grouping and decimals in Turkish', () => {
        withLang('tr', () => {
            expect(formatMoney(123456)).toContain('1.234,56');
        });
    });

    it('writes English grouping and decimals in English', () => {
        withLang('en', () => {
            expect(formatMoney(123456)).toContain('1,234.56');
        });
    });

    it('stays in lira whichever language is on screen', () => {
        // The shop is in Türkiye. Only the way the number is written follows the
        // interface language - never the currency itself.
        for (const lang of ['tr', 'en'] as const) {
            withLang(lang, () => {
                expect(formatMoney(1000)).toContain('₺');
            });
        }
    });
});

describe('money round trip', () => {
    // centsToInputValue and decimalPlaceholder became language-dependent, so the
    // pairing with parseMoneyToCents is new and worth pinning down.
    it.each(['tr', 'en'] as const)('survives prefill and re-parse in %s', (lang) => {
        withLang(lang, () => {
            for (const cents of [1, 85, 1250, 1999, 123456, 100000000]) {
                expect(parseMoneyToCents(centsToInputValue(cents))).toBe(cents);
            }
        });
    });

    it('offers a placeholder written the way that language writes decimals', () => {
        withLang('tr', () => expect(decimalPlaceholder()).toBe('0,00'));
        withLang('en', () => expect(decimalPlaceholder()).toBe('0.00'));
    });
});

describe('formatPercent', () => {
    it('puts the sign in front in Turkish and behind in English', () => {
        // This is the whole reason percentages go through Intl rather than
        // toFixed(0) + '%'.
        withLang('tr', () => expect(formatPercent(42)).toBe('%42'));
        withLang('en', () => expect(formatPercent(42)).toBe('42%'));
    });
});

describe('formatDate', () => {
    it('names the month in the interface language', () => {
        const june = '2026-06-03T12:00:00.000Z';
        withLang('tr', () => expect(formatDate(june)).toContain('Haz'));
        withLang('en', () => expect(formatDate(june)).toContain('Jun'));
    });

    it('returns an empty string for an unusable date rather than "Invalid Date"', () => {
        expect(formatDate('not a date')).toBe('');
    });

    it('shows a date-only value as the day it says, in every timezone', () => {
        // The date printed on an invoice is a calendar day, not an instant.
        // new Date("2025-11-17") is midnight UTC, so west of Greenwich this
        // rendered as 16 November - and was checked against the paper as the
        // 16th, on a screen whose whole job is catching that kind of mismatch.
        withLang('en', () => {
            expect(formatDate('2025-11-17')).toContain('17');
            expect(formatDate('2026-01-01')).toContain('1 Jan 2026');
        });
    });

    it('still treats a value carrying a time as the instant it is', () => {
        withLang('en', () => {
            expect(formatDate(new Date(2026, 5, 3, 12))).toContain('3 Jun 2026');
        });
    });
});

describe('compareNames', () => {
    it('sorts the Turkish alphabet the way a Turkish reader expects', () => {
        // Ç after C, O before Ö, Ş after S, and all of them before Z.
        const sorted = ['Zeytin', 'Çelikayna', 'Ada', 'Şahin', 'Ordu'].sort(compareNames);
        expect(sorted).toEqual(['Ada', 'Çelikayna', 'Ordu', 'Şahin', 'Zeytin']);
    });

    it('orders embedded numbers by value, not by digit', () => {
        expect(['Depo 10', 'Depo 2'].sort(compareNames)).toEqual(['Depo 2', 'Depo 10']);
    });

    it('does not follow the interface language', () => {
        // Supplier names are the shop's own data: Turkish whatever the labels say.
        setLang('en');
        expect(compareNames('Çelikayna', 'Duru')).toBeLessThan(0);
    });
});
