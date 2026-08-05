import { describe, expect, it } from 'vitest';
import {
    lineProblems,
    lineState,
    linesFromDraft,
    linesFromParse,
    tallyLines,
    type LineItemState,
} from './invoiceReview';
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
    matchedBy: 'barcode',
    matchRefusedBecause: null,
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
    totals: { subtotal: null, vatTotal: null, grandTotal: null },
    totalsCheck: {
        status: 'unknown',
        linesTotal: 0,
        documentTotal: null,
        difference: null,
        linesMissingTotal: 0,
    },
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

/**
 * These conditions are the same ones the server rejects on apply. The point of
 * checking them here is that the reviewer finds out beside the field, while they
 * are looking at it, rather than from a 400 naming a line number after they have
 * filled in the other twenty-nine.
 */
describe('what stops a line being ready', () => {
    const ready = (over: Partial<LineItemState> = {}): LineItemState => ({
        uid: 'u1',
        apply: true,
        productId: 4,
        quantity: 12,
        unitPrice: 2.5,
        applyStock: true,
        applyPrice: true,
        parsedLineNo: 1,
        description: 'Çay 500g',
        barcode: null,
        code: null,
        ...over,
    });

    it('is ready when a product is chosen and the numbers hold up', () => {
        expect(lineProblems(ready())).toEqual([]);
        expect(lineState(ready())).toBe('ready');
    });

    it('wants a product before anything else', () => {
        expect(lineProblems(ready({ productId: null }))).toContain('noProduct');
    });

    it('rejects a fractional count, because stock moves in whole units', () => {
        // A supplier billing 2.5 KG is a real invoice line, and it used to reach
        // the server and come back as a 400 the screen could not explain.
        expect(lineProblems(ready({ quantity: 2.5 }))).toContain('quantity');
        expect(lineProblems(ready({ quantity: 0 }))).toContain('quantity');
        expect(lineProblems(ready({ quantity: null }))).toContain('quantity');
    });

    it('ignores the count when stock is not being updated', () => {
        expect(lineProblems(ready({ quantity: null, applyStock: false }))).toEqual([]);
    });

    it('rejects a price that would round away to nothing', () => {
        expect(lineProblems(ready({ unitPrice: 0 }))).toContain('price');
        expect(lineProblems(ready({ unitPrice: 0.001 }))).toContain('price');
        expect(lineProblems(ready({ unitPrice: null }))).toContain('price');
    });

    /*
     * The quietest failure the pipeline had. Applying writes `quantity` straight
     * into a stock movement, in pieces - so "1,5 KG" is caught by the whole-number
     * rule above, but "5 KOLI" of a twenty-four pack is a perfectly good integer
     * that adds 5 to the shelf when 120 arrived, and nothing downstream ever
     * questions it.
     */
    it('will not apply a case-packed count until somebody confirms it', () => {
        const koli = ready({ unit: 'KOLI', quantity: 5 });

        expect(lineProblems(koli)).toContain('unitUnconfirmed');
        expect(lineState(koli)).toBe('attention');
    });

    it('accepts it once the reviewer says what the piece count is', () => {
        const confirmed = ready({ unit: 'KOLI', quantity: 120, quantityConfirmed: true });

        expect(lineProblems(confirmed)).toEqual([]);
        expect(lineState(confirmed)).toBe('ready');
    });

    it('says nothing about units that already mean single items', () => {
        for (const unit of ['ADET', 'adet', 'Ad.', 'TANE', 'PCS']) {
            expect(lineProblems(ready({ unit }))).toEqual([]);
        }
    });

    it('says nothing when the document printed no unit at all', () => {
        // Plenty of invoices have no unit column. Treating "unknown" as
        // "suspicious" would block every line on those to say nothing useful.
        expect(lineProblems(ready({ unit: null }))).toEqual([]);
        expect(lineProblems(ready({ unit: '' }))).toEqual([]);
    });

    it('does not ask about units when stock is not being updated', () => {
        // Nothing is going onto the shelf, so how the supplier counted it is
        // beside the point.
        const priceOnly = ready({ unit: 'KG', quantity: null, applyStock: false });
        expect(lineProblems(priceOnly)).toEqual([]);
    });

    it('never treats a confirmation as carried over from the reading', () => {
        // linesFromParse must not answer, on the reviewer's behalf, the one
        // question the app cannot check.
        const [line] = linesFromParse(parsed([parsedLine({ unit: 'KOLI', quantity: 5 })]));
        expect(line.quantityConfirmed).toBe(false);
        expect(lineProblems(line)).toContain('unitUnconfirmed');
    });

    it('catches a line that is included but would change nothing', () => {
        // Easy to reach by switching both off, and silently pointless: the server
        // accepts it and writes nothing at all.
        const idle = ready({ applyStock: false, applyPrice: false });
        expect(lineProblems(idle)).toContain('nothingToUpdate');
        expect(lineState(idle)).toBe('attention');
    });

    it('finds nothing wrong with a line that was left out', () => {
        // Leaving a line out is how you dismiss one you cannot resolve, so it
        // must not go on holding the invoice up.
        const excluded = ready({ apply: false, productId: null, quantity: null });
        expect(lineProblems(excluded)).toEqual([]);
        expect(lineState(excluded)).toBe('excluded');
    });

    it('counts each line into exactly one group', () => {
        const tally = tallyLines([
            ready(),
            ready({ uid: 'u2' }),
            ready({ uid: 'u3', productId: null }),
            ready({ uid: 'u4', apply: false }),
        ]);

        expect(tally).toEqual({ ready: 2, attention: 1, excluded: 1 });
    });
});

describe('line identity', () => {
    it('gives every line its own id, so removing one cannot shuffle the rest', () => {
        const lines = linesFromParse(
            parsed([parsedLine(), parsedLine({ lineNo: 2 }), parsedLine({ lineNo: 3 })])
        );
        const uids = lines.map((line) => line.uid);

        expect(new Set(uids).size).toBe(3);
    });

    it('keeps those ids across a save and restore', () => {
        const lines = linesFromParse(parsed([parsedLine()]));
        const restored = linesFromDraft(JSON.parse(JSON.stringify(lines)));

        expect(restored?.[0].uid).toBe(lines[0].uid);
    });

    it('invents ids for a draft written before they existed', () => {
        const restored = linesFromDraft([{ apply: true, description: 'Çay' }]);

        expect(restored?.[0].uid).toBeTruthy();
    });
});
