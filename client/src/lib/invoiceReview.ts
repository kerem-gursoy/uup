import type { ParsedInvoiceResponse } from '../services/api';

/**
 * A single row of the invoice review screen, and the two ways one gets built:
 * from a fresh reading of the document, or from a review someone left unfinished.
 *
 * The second path is why this lives apart from the component that renders it. A
 * draft is data that outlives the code that wrote it - saved before a deploy,
 * read back after one - so it arrives as `unknown[]` and has to be checked
 * rather than asserted. A cast would turn a shape change into a page that
 * renders undefined into every field.
 */
export interface LineItemState {
    apply: boolean;
    productId: number | null;
    quantity: number | null;
    unitPrice: number | null;
    applyStock: boolean;
    applyPrice: boolean;
    parsedLineNo: number | null;
    // Informational fields from parsed data or manual entry
    name?: string;
    description: string;
    brand?: string | null;
    barcode: string | null;
    code: string | null;
    matchedProductName?: string | null;
    matchedBrand?: string | null;
    matchScore?: number;
    /** Set by the parser when the row does not add up - see the warning it draws. */
    priceMismatch?: boolean;
    totalPrice?: number | null;
}

/**
 * The starting point for a document nobody has reviewed yet: every line in,
 * every reading the parser was confident enough to produce already filled.
 */
export function linesFromParse(parsed: ParsedInvoiceResponse): LineItemState[] {
    return parsed.lines.map((line) => ({
        apply: true,
        productId: line.matchedProductId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        // Nothing to apply where nothing was read, so those toggles start off
        // rather than promising an update the line cannot make.
        applyStock: line.quantity !== null,
        applyPrice: line.unitPrice !== null,
        parsedLineNo: line.lineNo,
        name: line.description,
        description: line.description,
        brand: line.matchedBrand ?? null,
        barcode: line.barcode,
        code: line.code,
        matchedProductName: line.matchedProductName,
        matchedBrand: line.matchedBrand,
        matchScore: line.matchScore,
        priceMismatch: line.priceMismatch,
        totalPrice: line.totalPrice,
    }));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const numberOrNull = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

const stringOrNull = (value: unknown): string | null =>
    typeof value === 'string' ? value : null;

const booleanOr = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback;

/**
 * A stored draft turned back into review lines, or null if it cannot be trusted.
 *
 * The two failure modes are treated differently on purpose. A field of the wrong
 * type, or one a newer version added, is read as absent and defaulted - losing a
 * whole afternoon's corrections because one optional field changed shape would be
 * a poor trade. An entry that is not an object at all is different: that is not
 * version drift but corruption, and the honest answer is to fall back to the
 * reading rather than render invented rows.
 */
export function linesFromDraft(stored: unknown[]): LineItemState[] | null {
    const lines: LineItemState[] = [];

    for (const entry of stored) {
        if (!isRecord(entry)) return null;

        lines.push({
            apply: booleanOr(entry.apply, true),
            productId: numberOrNull(entry.productId),
            quantity: numberOrNull(entry.quantity),
            unitPrice: numberOrNull(entry.unitPrice),
            applyStock: booleanOr(entry.applyStock, true),
            applyPrice: booleanOr(entry.applyPrice, true),
            // null means "added by hand", which is how the screen tells a manual
            // line from one that came off the document. Defaulting it to a number
            // would make a hand-added line unremovable.
            parsedLineNo: numberOrNull(entry.parsedLineNo),
            name: stringOrNull(entry.name) ?? undefined,
            description: stringOrNull(entry.description) ?? '',
            brand: stringOrNull(entry.brand),
            barcode: stringOrNull(entry.barcode),
            code: stringOrNull(entry.code),
            matchedProductName: stringOrNull(entry.matchedProductName),
            matchedBrand: stringOrNull(entry.matchedBrand),
            matchScore: numberOrNull(entry.matchScore) ?? 0,
            priceMismatch: booleanOr(entry.priceMismatch, false),
            totalPrice: numberOrNull(entry.totalPrice),
        });
    }

    return lines;
}
