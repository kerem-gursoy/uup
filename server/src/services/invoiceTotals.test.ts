import { describe, expect, it } from "vitest";
import { checkTotals } from "./invoiceTotals.js";
import type { DocumentLine, DocumentTotals } from "./invoiceTypes.js";

/**
 * The only check in the pipeline that can notice a line the reading never
 * returned. Everything else validates a row against itself, and a dropped row
 * leaves no row behind - the invoice just comes back shorter and every remaining
 * line settles cleanly.
 */

const row = (totalPrice: number | null): DocumentLine => ({
    lineNo: null,
    code: null,
    description: "x",
    barcode: null,
    quantity: 1,
    unit: null,
    unitPrice: totalPrice,
    totalPrice,
    priceMismatch: false,
});

const totals = (over: Partial<DocumentTotals> = {}): DocumentTotals => ({
    subtotal: null,
    vatTotal: null,
    grandTotal: null,
    ...over,
});

describe("checkTotals", () => {
    it("agrees when the lines come to the printed subtotal", () => {
        const result = checkTotals([row(100), row(50)], totals({ subtotal: 150 }));

        expect(result.status).toBe("agrees");
        expect(result.difference).toBe(0);
    });

    it("absorbs the invoice's own rounding", () => {
        // Per-line rounding accumulates with length; a few kuruş is not a
        // missing line and must not be reported as one.
        expect(checkTotals([row(100), row(50)], totals({ subtotal: 150.02 })).status).toBe(
            "agrees"
        );
    });

    it("notices a line that was never read", () => {
        // Two of three rows came back. This is the failure the whole check exists
        // for, and the difference is the value of the row that went missing.
        const result = checkTotals([row(100), row(50)], totals({ subtotal: 210 }));

        expect(result.status).toBe("disagrees");
        expect(result.difference).toBe(60);
    });

    it("notices a line counted twice", () => {
        const result = checkTotals([row(100), row(100), row(50)], totals({ subtotal: 150 }));

        expect(result.status).toBe("disagrees");
        expect(result.difference).toBe(-100);
    });

    it("says nothing when the document printed no subtotal", () => {
        expect(checkTotals([row(100)], totals()).status).toBe("unknown");
    });

    it("refuses to compare against the VAT-inclusive total", () => {
        /*
         * Line totals are pre-VAT. Substituting the grand total when no subtotal
         * was printed would mean every correctly-read invoice in the country
         * disagreed by exactly its VAT.
         */
        const result = checkTotals([row(100)], totals({ grandTotal: 120, vatTotal: 20 }));

        expect(result.status).toBe("unknown");
        expect(result.documentTotal).toBeNull();
    });

    it("will not sum lines whose own totals were not read", () => {
        // An incomplete sum would look short and cry wolf on every invoice with
        // one unreadable row. Reported as unknown rather than as a disagreement.
        const result = checkTotals([row(100), row(null)], totals({ subtotal: 150 }));

        expect(result.status).toBe("unknown");
        expect(result.linesMissingTotal).toBe(1);
    });

    it("says nothing about an invoice with no lines at all", () => {
        // A reading that produced nothing is already loud on the review screen.
        expect(checkTotals([], totals({ subtotal: 150 })).status).toBe("unknown");
    });
});
