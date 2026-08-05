import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { matchInvoiceLines, usableBarcode, type MatchableLine } from "./productMatching.js";

/**
 * The rule these tests exist to defend: a match is either certain or it does not
 * happen. An unmatched line costs somebody twenty seconds in the picker. A
 * wrongly matched line writes a delivery onto the wrong product's shelf and the
 * wrong product's cost history, where nothing downstream will ever question it.
 *
 * So most of what follows checks that matching declines, rather than that it
 * succeeds.
 */

type ProductRow = { id: number; name: string; brand: string | null; barcode: string | null };
type ItemRow = {
    kind: string;
    value: string;
    product: { id: number; name: string; brand: string | null };
};

/**
 * Stands in for Prisma. The matcher only ever calls these two finders, and both
 * are given exactly what a real query would return for the arguments it built -
 * so what is being tested is the decision logic, not the ORM.
 */
const fakeClient = (products: ProductRow[], items: ItemRow[]) =>
    ({
        product: {
            findMany: async ({ where }: { where: { barcode: { in: string[] } } }) =>
                products.filter((p) => p.barcode !== null && where.barcode.in.includes(p.barcode)),
        },
        supplierItem: {
            findMany: async () => items,
        },
    }) as unknown as Prisma.TransactionClient;

const line = (over: Partial<MatchableLine> = {}): MatchableLine => ({
    barcode: null,
    code: null,
    description: "ÇAY 500G",
    ...over,
});

const CAY: ProductRow = { id: 7, name: "Çay 500g", brand: "Rize", barcode: "8690000000005" };
const SEKER: ProductRow = { id: 9, name: "Şeker 1kg", brand: null, barcode: "8690000000012" };

describe("usableBarcode", () => {
    /*
     * The guard that makes barcode matching safe against OCR. The failure that
     * matters is a single misread digit landing on some other product's real
     * barcode - which is exactly what a GTIN check digit exists to prevent.
     */
    it("accepts a barcode whose own check digit agrees", () => {
        expect(usableBarcode("4006381333931")).toBe("4006381333931");
        expect(usableBarcode("8690000000005")).toBe("8690000000005");
    });

    it("rejects a GTIN-length code with a bad check digit", () => {
        // One digit off the valid code above: precisely the OCR failure mode.
        expect(usableBarcode("4006381333932")).toBeNull();
    });

    it("rejects a digit string that is not a GTIN length at all", () => {
        expect(usableBarcode("12345")).toBeNull();
        expect(usableBarcode("123456789012345678")).toBeNull();
    });

    it("allows a shop's own non-numeric label, which has no check digit to test", () => {
        // Refusing these would lose barcode matching entirely for shops that use
        // internal labels, to guard against a misread landing exactly on another
        // label - a far smaller risk than the one being traded away.
        expect(usableBarcode("RAF-0012")).toBe("RAF-0012");
    });

    it("rejects an empty or implausibly short label", () => {
        expect(usableBarcode(null)).toBeNull();
        expect(usableBarcode("   ")).toBeNull();
        expect(usableBarcode("AB")).toBeNull();
    });
});

describe("matching on certain evidence", () => {
    it("matches on a barcode that identifies exactly one product", async () => {
        const result = (await matchInvoiceLines(
            fakeClient([CAY, SEKER], []),
            2,
            [line({ barcode: "8690000000005" })]
        ))[0]!;

        expect(result.match).toMatchObject({ productId: 7, matchedBy: "barcode" });
    });

    it("ignores a barcode that failed its check digit", async () => {
        // The product exists, but the code as read is not trustworthy - so the
        // line comes back for a human rather than matching by luck.
        const result = (await matchInvoiceLines(
            fakeClient([CAY], []),
            2,
            [line({ barcode: "8690000000006" })]
        ))[0]!;

        expect(result.match).toBeNull();
    });

    it("matches on a supplier code a person confirmed before", async () => {
        const result = (await matchInvoiceLines(
            fakeClient([], [{ kind: "CODE", value: "ab1234", product: CAY }]),
            2,
            [line({ code: "AB-1234" })]
        ))[0]!;

        expect(result.match).toMatchObject({ productId: 7, matchedBy: "supplierCode" });
    });

    it("reads a supplier code past the punctuation it is printed with", async () => {
        // "AB-1234", "ab 1234" and "AB1234" are one code across a supplier's own
        // paperwork, and frequently across one document.
        const client = fakeClient([], [{ kind: "CODE", value: "ab1234", product: CAY }]);

        for (const code of ["AB-1234", "ab 1234", "AB1234", " ab/1234 "]) {
            const result = (await matchInvoiceLines(client, 2, [line({ code })]))[0]!;
            expect(result.match?.productId).toBe(7);
        }
    });

    it("matches on wording when the supplier prints no code", async () => {
        const result = (await matchInvoiceLines(
            fakeClient([], [{ kind: "DESC", value: "cay500g", product: CAY }]),
            2,
            [line({ description: "ÇAY 500G" })]
        ))[0]!;

        expect(result.match).toMatchObject({ productId: 7, matchedBy: "supplierDescription" });
    });

    it("folds Turkish letters and case when comparing wording", async () => {
        const client = fakeClient([], [{ kind: "DESC", value: "isikmum", product: CAY }]);

        for (const description of ["IŞIK MUM", "ışık mum", "Isik Mum", "İŞİK MUM"]) {
            const result = (await matchInvoiceLines(client, 2, [line({ description })]))[0]!;
            expect(result.match?.productId).toBe(7);
        }
    });
});

describe("matching refuses rather than guesses", () => {
    it("returns nothing when there is no evidence at all", async () => {
        const result = (await matchInvoiceLines(fakeClient([CAY], []), 2, [
            line({ description: "SOMETHING NEVER SEEN" }),
        ]))[0]!;

        expect(result.match).toBeNull();
        expect(result.refusedBecause).toBeNull();
    });

    it("refuses when two rules name different products", async () => {
        /*
         * The crux of the whole design. A barcode says one thing and a learned
         * supplier code says another - one of them is stale, and there is no way
         * to tell which from here. Precedence would silently pick a winner and be
         * wrong half the time, so the line goes back to the person instead.
         */
        const result = (await matchInvoiceLines(
            fakeClient([CAY], [{ kind: "CODE", value: "x1", product: SEKER }]),
            2,
            [line({ barcode: "8690000000005", code: "X1" })]
        ))[0]!;

        expect(result.match).toBeNull();
        expect(result.refusedBecause).toBe("conflict");
    });

    it("is happy when two rules agree", async () => {
        const result = (await matchInvoiceLines(
            fakeClient([CAY], [{ kind: "CODE", value: "x1", product: CAY }]),
            2,
            [line({ barcode: "8690000000005", code: "X1" })]
        ))[0]!;

        // Reported as the strongest rule that fired, not as a tally of them.
        expect(result.match).toMatchObject({ productId: 7, matchedBy: "barcode" });
    });

    it("never matches on name similarity alone", async () => {
        /*
         * "AYÇİÇEK YAĞI 5L" and "AYÇİÇEK YAĞI 1L" differ by two characters and
         * are different products. Nothing in the catalogue is consulted by name -
         * only mappings a person established by applying an invoice.
         */
        const oil: ProductRow = {
            id: 11,
            name: "Ayçiçek Yağı 1L",
            brand: null,
            barcode: null,
        };

        const result = (await matchInvoiceLines(fakeClient([oil], []), 2, [
            line({ description: "AYÇİÇEK YAĞI 5L" }),
        ]))[0]!;

        expect(result.match).toBeNull();
    });

    it("resolves each line of an invoice on its own evidence", async () => {
        const client = fakeClient(
            [CAY, SEKER],
            [{ kind: "CODE", value: "s9", product: SEKER }]
        );

        const results = await matchInvoiceLines(client, 2, [
            line({ barcode: "8690000000005" }),
            line({ code: "S-9", description: "ŞEKER 1KG" }),
            line({ description: "NAKLİYE BEDELİ" }),
        ]);

        expect(results.map((r) => r.match?.productId ?? null)).toEqual([7, 9, null]);
    });

    it("ignores an empty description rather than matching everything with one", async () => {
        // A blank folds to a blank, which would otherwise be a key that matches
        // any other line the model also failed to read.
        const result = (await matchInvoiceLines(
            fakeClient([], [{ kind: "DESC", value: "", product: CAY }]),
            2,
            [line({ description: "   " })]
        ))[0]!;

        expect(result.match).toBeNull();
    });
});
