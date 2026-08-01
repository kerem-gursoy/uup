import { afterEach, describe, expect, it } from 'vitest';
import { en } from './en';
import { tr } from './tr';
import { getLang, setLang } from './locale';
import { hasKey, pluralKey, raw, t, tPlural } from './index';

/**
 * Key parity between en.ts and tr.ts is enforced by the type system - tr is typed
 * as Record<keyof typeof en, string>, so a missing or invented key fails the
 * build. What is left to check at runtime is the behaviour tsc cannot see:
 * interpolation, plural selection, and the fallback.
 */

afterEach(() => {
    setLang('en');
});

describe('t', () => {
    it('returns the copy for the current language', () => {
        setLang('en');
        expect(t('common.tryAgain')).toBe('Try again');
        setLang('tr');
        expect(t('common.tryAgain')).toBe('Tekrar dene');
    });

    it('fills every placeholder', () => {
        setLang('en');
        expect(t('supplier.list.usedBy', { what: '2 products' })).toBe(
            'Used by 2 products'
        );
    });

    it('fills a placeholder that appears with others', () => {
        setLang('en');
        expect(
            t('product.profit.positive', { amount: '₺2.00', margin: '20%' })
        ).toBe('You make ₺2.00 on each one (20% of the selling price).');
    });

    it('leaves an unfilled placeholder visible rather than dropping it', () => {
        // A silently truncated sentence is harder to notice than a stray {name}.
        setLang('en');
        expect(raw('supplier.list.added')).toContain('{name}');
    });
});

describe('tPlural', () => {
    it('inflects the noun in English', () => {
        setLang('en');
        expect(tPlural('count.product', 1)).toBe('1 product');
        expect(tPlural('count.product', 5)).toBe('5 products');
        expect(tPlural('count.product', 0)).toBe('0 products');
    });

    it('does not inflect after a numeral in Turkish', () => {
        // "3 ürün", never "3 ürünler" - Turkish takes no plural after a number.
        setLang('tr');
        expect(tPlural('count.product', 1)).toBe('1 ürün');
        expect(tPlural('count.product', 5)).toBe('5 ürün');
    });

    it('agrees the verb too where the copy needs it', () => {
        setLang('en');
        expect(tPlural('home.needsAttention', 1)).toBe('1 thing needs attention');
        expect(tPlural('home.needsAttention', 3)).toBe('3 things need attention');
    });

    it('accepts extra values alongside the count', () => {
        setLang('en');
        expect(tPlural('invoice.review.applied', 2)).toBe(
            'Invoice applied. 2 lines updated.'
        );
    });
});

describe('pluralKey', () => {
    it('picks the form t would, so <T> can build the same sentence from elements', () => {
        setLang('en');
        expect(pluralKey('invoice.review.willApply', 1)).toBe(
            'invoice.review.willApply_one'
        );
        expect(pluralKey('invoice.review.willApply', 4)).toBe(
            'invoice.review.willApply_other'
        );
    });
});

describe('hasKey', () => {
    it('recognises a real key and rejects an invented one', () => {
        expect(hasKey('common.save')).toBe(true);
        expect(hasKey('error.code.BARCODE_TAKEN')).toBe(false);
    });
});

describe('the dictionaries themselves', () => {
    it('agree on which placeholders each piece of copy takes', () => {
        // tsc guarantees the keys match; it cannot see inside the strings. A
        // translation that drops {count} would render a sentence with a hole.
        const placeholders = (value: string) =>
            [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

        const mismatched = Object.keys(en).filter((key) => {
            const k = key as keyof typeof en;
            return (
                placeholders(en[k]).join() !== placeholders(tr[k]).join()
            );
        });

        expect(mismatched).toEqual([]);
    });

    it('leaves no copy empty in either language', () => {
        const blank = Object.keys(en).filter((key) => {
            const k = key as keyof typeof en;
            return !en[k].trim() || !tr[k].trim();
        });

        expect(blank).toEqual([]);
    });
});

describe('language selection', () => {
    it('remembers the choice', () => {
        setLang('tr');
        expect(getLang()).toBe('tr');
        expect(localStorage.getItem('uup.lang')).toBe('tr');
    });

    it('marks the document so screen readers pick the right voice', () => {
        setLang('tr');
        expect(document.documentElement.lang).toBe('tr');
        setLang('en');
        expect(document.documentElement.lang).toBe('en');
    });
});
