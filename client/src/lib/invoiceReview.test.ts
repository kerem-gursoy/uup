import { describe, expect, it } from 'vitest';
import { linesFromDraft, linesFromParse } from './invoiceReview';
import type { ParsedInvoiceLine, ParsedInvoiceResponse } from '../services/api';

const parsedLine = (over: Partial<ParsedInvoiceLine> = {}): ParsedInvoiceLine => ({
    lineNo: 1,
    code: 'A-1',
    description: 'Çay 500g',
    barcode: '8690000000001',
    quantity: 12,
    unit: 'ad',
    unitPrice: 42.5,
    totalPrice: 510,
    matchedProductId: 7,
    matchedProductName: 'Çay 500g',
    matchedBrand: 'Rize',
    matchScore: 0.9,
    priceMismatch: false,
    ...over,
});

const parsed = (lines: ParsedInvoiceLine[]): ParsedInvoiceResponse => ({
    invoiceId: 3,
    supplierId: 2,
    supplierName: 'Acme',
    supplierFromDocument: 'ACME LTD',
    issueDate: '2026-07-01',
    currency: 'TRY',
    parsedAt: '2026-07-31T10:00:00.000Z',
    lines,
});

describe('linesFromParse', () => {
    it('starts every line selected', () => {
        const lines = linesFromParse(parsed([parsedLine(), parsedLine({ lineNo: 2 })]));

        expect(lines).toHaveLength(2);
        expect(lines.every((line) => line.apply)).toBe(true);
    });

    it('leaves a toggle off when the figure behind it was never read', () => {
        // Promising to update a price the parser could not make out would apply a
        // null over a real cost, so the toggle starts off instead.
        const [line] = linesFromParse(
            parsed([parsedLine({ quantity: null, unitPrice: null })])
        );

        expect(line.applyStock).toBe(false);
        expect(line.applyPrice).toBe(false);
    });
});

describe('linesFromDraft', () => {
    /** What the review screen actually stores: its own line objects, as JSON. */
    const roundTrip = (lines: unknown[]): unknown[] => JSON.parse(JSON.stringify(lines));

    it('gives back the corrections exactly as they were left', () => {
        const edited = linesFromParse(parsed([parsedLine()]));
        edited[0] = { ...edited[0], quantity: 11, unitPrice: 39.9, apply: false };

        expect(linesFromDraft(roundTrip(edited))).toEqual(edited);
    });

    it('keeps a hand-added line recognisable as one', () => {
        // parsedLineNo is how the screen tells a manual line from a read one, and
        // it is what decides whether the line can be removed again. Defaulting
        // this to a number would strand the row on the screen.
        const restored = linesFromDraft([
            { apply: true, parsedLineNo: null, description: 'Added by hand' },
        ]);

        expect(restored?.[0].parsedLineNo).toBeNull();
    });

    it('defaults a field it does not recognise rather than dropping the work', () => {
        // A draft outlives the code that wrote it. One field of an unexpected
        // shape must not cost the reviewer everything else on the line.
        const restored = linesFromDraft([
            { apply: true, quantity: 'twelve', description: 'Çay 500g', productId: 7 },
        ]);

        expect(restored?.[0]).toMatchObject({
            quantity: null,
            description: 'Çay 500g',
            productId: 7,
        });
    });

    it('restores an empty draft, because removing every line is a real decision', () => {
        expect(linesFromDraft([])).toEqual([]);
    });

    it('refuses a draft whose entries are not lines at all', () => {
        // Not version drift but corruption: rendering invented rows over a real
        // invoice is worse than falling back to the reading.
        expect(linesFromDraft(['nonsense'])).toBeNull();
        expect(linesFromDraft([null])).toBeNull();
        expect(linesFromDraft([[1, 2, 3]])).toBeNull();
    });
});
