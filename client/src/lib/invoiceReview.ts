import type { MatchEvidence, MatchRefusal, ParsedInvoiceResponse } from '../services/api';

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
    /**
     * Identifies this row for as long as the screen is open, and nothing more -
     * it is not a database id and never reaches the server's apply payload.
     *
     * Rows were previously keyed by their position, which is wrong the moment one
     * is removed: React matches the old component at that position to a different
     * line, so an open editor and its half-typed search would reattach themselves
     * to whatever row slid up into the gap.
     */
    uid: string;
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
    /**
     * The unit the document counted in - "ADET", "KG", "KOLI".
     *
     * Stock is kept in whole pieces whatever the supplier billed in, so this is
     * never applied as a multiplier. It is not merely decorative either: see
     * needsUnitCheck below for the quiet way it used to go wrong.
     */
    unit?: string | null;
    /**
     * Set when the reviewer has confirmed that `quantity` is a count of pieces,
     * for a line the supplier billed in something else.
     *
     * Only ever set by a person. That is the entire point of it.
     */
    quantityConfirmed?: boolean;
    matchedProductName?: string | null;
    matchedBrand?: string | null;
    /** Which rule found the product, so the row can say why it is filled in. */
    matchedBy?: MatchEvidence | null;
    /** Evidence was found and refused - two rules named different products. */
    matchRefusedBecause?: MatchRefusal | null;
    /** Set by the parser when the row does not add up - see the warning it draws. */
    priceMismatch?: boolean;
    totalPrice?: number | null;
}

/**
 * Units that mean "one of the thing", in the spellings suppliers actually print.
 *
 * Anything not on this list is a unit whose count is not a count of pieces, and
 * that is what needsUnitCheck exists to catch.
 */
const PIECE_UNITS = new Set([
    'adet',
    'ad',
    'adt',
    'ade',
    'tane',
    'tn',
    'piece',
    'pieces',
    'pcs',
    'pc',
    'ea',
    'each',
    'unit',
    'units',
]);

/**
 * Whether this line's quantity needs a human to confirm it is a piece count.
 *
 * The failure this prevents is the quietest one in the pipeline. Applying a line
 * writes `quantity` straight into a stock movement, in pieces. A line billed as
 * "1,5 KG" is caught already, because 1.5 is not a whole number and validation
 * rejects it loudly. A line billed as "5 KOLI" of a twenty-four pack is a whole
 * number, so it sails through every check there is and adds 5 to the shelf when
 * 120 arrived - and nothing downstream ever questions it.
 *
 * So a non-piece unit blocks the line until somebody says what the real count
 * is. Deliberately NOT a conversion: the app does not know how many are in this
 * supplier's case, guessing would recreate the same silent error with more
 * steps, and the person holding the delivery note can simply read it.
 *
 * A missing unit does not trigger this. Plenty of invoices print no unit column
 * at all, and treating "unknown" as "suspicious" would block every line on those
 * documents to say nothing useful.
 */
export function needsUnitCheck(unit: string | null | undefined): boolean {
    const normalized = unit?.trim().toLowerCase().replace(/\.$/, '');
    if (!normalized) return false;

    return !PIECE_UNITS.has(normalized);
}

export function newLineUid(): string {
    return crypto.randomUUID();
}

/** A line added by hand, for goods on the paper that the reading missed. */
export function blankLine(): LineItemState {
    return {
        uid: newLineUid(),
        apply: true,
        productId: null,
        quantity: null,
        unitPrice: null,
        applyStock: true,
        applyPrice: true,
        // Null is what marks this as hand-added rather than read off the document.
        parsedLineNo: null,
        name: '',
        description: '',
        brand: null,
        barcode: null,
        code: null,
        unit: null,
        quantityConfirmed: false,
        matchedBy: null,
        matchRefusedBecause: null,
    };
}

/**
 * The starting point for a document nobody has reviewed yet: every line in,
 * every reading the parser was confident enough to produce already filled.
 */
export function linesFromParse(parsed: ParsedInvoiceResponse): LineItemState[] {
    return parsed.lines.map((line) => ({
        uid: newLineUid(),
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
        unit: line.unit,
        // Never carried over from a reading. A confirmation is a thing a person
        // did, and starting it true would be the app confirming on their behalf
        // exactly the number it cannot check.
        quantityConfirmed: false,
        matchedProductName: line.matchedProductName,
        matchedBrand: line.matchedBrand,
        matchedBy: line.matchedBy,
        matchRefusedBecause: line.matchRefusedBecause,
        priceMismatch: line.priceMismatch,
        totalPrice: line.totalPrice,
    }));
}

/**
 * Why a line is not yet ready to be applied.
 *
 * These mirror, exactly, the conditions the server rejects in
 * services/invoiceApply.ts. Duplicated deliberately: the server has to check
 * because it cannot trust a client, and the screen has to check because finding
 * out which line was wrong from a 400 after pressing Apply - having filled in
 * thirty of them - is not a review, it is a guessing game.
 */
export type LineProblem =
    /** No product chosen, so there is nothing to update. */
    | 'noProduct'
    /** Included, but with both updates switched off: applying would do nothing. */
    | 'nothingToUpdate'
    /** Stock is being updated, but the count is missing or not a whole number. */
    | 'quantity'
    /**
     * Stock is being updated from a quantity the supplier billed in something
     * other than pieces, and nobody has confirmed what the piece count is.
     */
    | 'unitUnconfirmed'
    /** Cost is being recorded, but the amount is missing or not positive. */
    | 'price';

/** Stock moves in whole units, and a movement of zero is not a movement. */
export const isUsableQuantity = (quantity: number | null): boolean =>
    quantity !== null && Number.isInteger(quantity) && quantity !== 0;

/** Cost is stored in whole cents, so anything under half a cent is not a price. */
export const isUsablePrice = (unitPrice: number | null): boolean =>
    unitPrice !== null && Number.isFinite(unitPrice) && Math.round(unitPrice * 100) > 0;

export function lineProblems(line: LineItemState): LineProblem[] {
    // A line nobody is applying cannot be wrong. Excluding a line is exactly how
    // you dismiss one you cannot resolve.
    if (!line.apply) return [];

    const problems: LineProblem[] = [];

    if (line.productId === null) problems.push('noProduct');
    if (!line.applyStock && !line.applyPrice) problems.push('nothingToUpdate');
    if (line.applyStock && !isUsableQuantity(line.quantity)) problems.push('quantity');
    if (line.applyStock && needsUnitCheck(line.unit) && !line.quantityConfirmed) {
        problems.push('unitUnconfirmed');
    }
    if (line.applyPrice && !isUsablePrice(line.unitPrice)) problems.push('price');

    return problems;
}

/**
 * The three states a line can be in, which are also the three groups the review
 * screen lets you filter down to.
 */
export type LineState = 'ready' | 'attention' | 'excluded';

export function lineState(line: LineItemState): LineState {
    if (!line.apply) return 'excluded';
    return lineProblems(line).length > 0 ? 'attention' : 'ready';
}

export type ReviewTally = { ready: number; attention: number; excluded: number };

export function tallyLines(lines: LineItemState[]): ReviewTally {
    const tally: ReviewTally = { ready: 0, attention: 0, excluded: 0 };
    for (const line of lines) tally[lineState(line)] += 1;
    return tally;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const numberOrNull = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

const stringOrNull = (value: unknown): string | null =>
    typeof value === 'string' ? value : null;

const booleanOr = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback;

const MATCH_EVIDENCE: readonly MatchEvidence[] = [
    'barcode',
    'supplierCode',
    'supplierDescription',
];

/** Anything that is not one of the known reasons is read as "no reason given". */
const matchEvidenceOrNull = (value: unknown): MatchEvidence | null =>
    MATCH_EVIDENCE.includes(value as MatchEvidence) ? (value as MatchEvidence) : null;

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
            // Regenerated when a draft predates this field. It only has to be
            // unique within the open screen, never across saves.
            uid: stringOrNull(entry.uid) ?? newLineUid(),
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
            unit: stringOrNull(entry.unit),
            // Defaults to false, so a draft written before this field existed
            // asks its unit question once rather than counting as answered.
            quantityConfirmed: booleanOr(entry.quantityConfirmed, false),
            matchedProductName: stringOrNull(entry.matchedProductName),
            matchedBrand: stringOrNull(entry.matchedBrand),
            matchedBy: matchEvidenceOrNull(entry.matchedBy),
            matchRefusedBecause: entry.matchRefusedBecause === 'conflict' ? 'conflict' : null,
            priceMismatch: booleanOr(entry.priceMismatch, false),
            totalPrice: numberOrNull(entry.totalPrice),
        });
    }

    return lines;
}
