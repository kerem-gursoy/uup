import type { Prisma } from "@prisma/client";
import { codeKey, textFingerprint } from "./textKeys.js";

/**
 * Deciding which product an invoice line refers to - or, far more often and just
 * as usefully, declining to decide.
 *
 * THE RULE THIS FILE IS BUILT AROUND
 *
 * A match is either certain or it does not exist. There is no similarity score,
 * no "probably", and no threshold to tune. Every rule below is an exact lookup
 * against something a human already established, and anything that is not an
 * exact hit comes back null so the reviewer picks by hand.
 *
 * That is a deliberate trade of recall for precision, and it is the right one
 * here: an unmatched line costs somebody twenty seconds in the picker, whereas a
 * wrongly matched line writes a delivery onto the wrong product's shelf and the
 * wrong product's cost history, where nothing downstream will ever question it.
 * The review screen is explicitly designed so that unmatched lines are visible
 * and blocking, so the cost of saying "I don't know" is bounded and loud, while
 * the cost of being confidently wrong is silent.
 *
 * THE EVIDENCE, IN ORDER OF STRENGTH
 *
 *   barcode              The line carries a barcode and exactly one product has
 *                        it. Product.barcode is unique, so this is an identity,
 *                        not a resemblance.
 *
 *   supplierCode         This supplier's stock code was resolved to a product on
 *                        an invoice somebody already applied. A person decided
 *                        this; we are only remembering it.
 *
 *   supplierDescription  Same, but keyed on the line's wording, for the many
 *                        suppliers who print no code at all.
 *
 * WHAT IS NOT HERE
 *
 * Fuzzy name matching against the catalogue. It was considered and rejected:
 * "AYÇİÇEK YAĞI 5L" and "AYÇİÇEK YAĞI 1L" differ by two characters and are
 * different products, and any scorer loose enough to catch real abbreviations is
 * loose enough to confuse those. The picker already prefills its search box with
 * the line's description, which gets the reviewer to the same place in one tap
 * without ever guessing on their behalf.
 *
 * CONFLICTS
 *
 * When two rules fire and name different products, that is not a tie to be
 * broken by precedence - it is a sign that one of them is stale (a supplier
 * reusing an old code, a barcode typed onto the wrong product). Precedence would
 * silently pick a winner. Instead the line comes back unmatched and flagged, and
 * the reviewer is told the two disagree.
 */

export type MatchEvidence = "barcode" | "supplierCode" | "supplierDescription";

/** Why a line came back with no product, when it is worth explaining. */
export type MatchRefusal = "conflict";

export type LineMatch = {
  productId: number;
  productName: string;
  productBrand: string | null;
  matchedBy: MatchEvidence;
};

export type LineMatchResult = {
  match: LineMatch | null;
  /** Set only when evidence existed but was refused. Null means simply unknown. */
  refusedBecause: MatchRefusal | null;
};

/** The fields of a parsed line this file looks at. */
export type MatchableLine = {
  barcode: string | null;
  code: string | null;
  description: string;
};

const SUPPLIER_ITEM_CODE = "CODE";
const SUPPLIER_ITEM_DESC = "DESC";

/**
 * Lengths that mean a barcode is a GTIN: EAN-8, UPC-A, EAN-13, ITF-14. Anything
 * else is a shop's own internal label, which is checked differently below.
 */
const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/**
 * Whether an all-digit barcode carries its own correct check digit.
 *
 * This is the guard that makes barcode matching safe against OCR. A photographed
 * invoice is read by a model, and the failure that matters is a single misread
 * digit landing on some *other* product's real barcode. The GTIN check digit
 * exists precisely to catch single-digit errors, and it catches essentially all
 * of them - so a barcode that fails it is discarded rather than looked up.
 */
const hasValidGtinCheckDigit = (digits: string): boolean => {
  const length = digits.length;
  if (!GTIN_LENGTHS.has(length)) return false;

  let sum = 0;
  // Weights alternate 3, 1, 3, 1 ... starting at the digit immediately left of
  // the check digit and working leftwards.
  for (let index = length - 2; index >= 0; index -= 1) {
    const weight = (length - 2 - index) % 2 === 0 ? 3 : 1;
    sum += Number(digits[index]) * weight;
  }

  return (10 - (sum % 10)) % 10 === Number(digits[length - 1]);
};

/**
 * The barcode to look up, or null if this one must not be trusted.
 *
 * Two shapes are accepted. An all-digit code of GTIN length has to pass its
 * check digit. Anything else is a shop-internal label, which has no check digit
 * to verify - those are still allowed through, because the lookup is an exact
 * match against a string the shop typed in itself, and a misread landing exactly
 * on a different product's internal label is a far smaller risk than losing
 * barcode matching entirely for shops that use them.
 */
export const usableBarcode = (raw: string | null): string | null => {
  const barcode = raw?.trim();
  if (!barcode) return null;

  if (/^\d+$/.test(barcode)) {
    return hasValidGtinCheckDigit(barcode) ? barcode : null;
  }

  // Long enough not to collide by accident, short enough to be a real label.
  return barcode.length >= 4 && barcode.length <= 64 ? barcode : null;
};

const distinct = <T>(values: T[]): T[] => [...new Set(values)];

type Candidate = { productId: number; by: MatchEvidence };

/**
 * Resolves every line of one invoice at once.
 *
 * Batched rather than per-line on purpose: D1 charges a round trip per query and
 * an invoice can be fifty lines, so this is three queries whatever the length.
 */
export const matchInvoiceLines = async (
  client: Prisma.TransactionClient,
  supplierId: number,
  lines: MatchableLine[]
): Promise<LineMatchResult[]> => {
  const barcodes = distinct(
    lines.map((line) => usableBarcode(line.barcode)).filter((b): b is string => b !== null)
  );
  const codeKeys = distinct(
    lines
      .map((line) => (line.code ? codeKey(line.code) : ""))
      .filter((value) => value.length > 0)
  );
  const descKeys = distinct(
    lines
      .map((line) => textFingerprint(line.description))
      .filter((value) => value.length > 0)
  );

  const [byBarcode, learned] = await Promise.all([
    barcodes.length
      ? client.product.findMany({
          where: { barcode: { in: barcodes } },
          select: { id: true, name: true, brand: true, barcode: true },
        })
      : Promise.resolve([]),
    codeKeys.length || descKeys.length
      ? client.supplierItem.findMany({
          where: {
            supplierId,
            OR: [
              ...(codeKeys.length
                ? [{ kind: SUPPLIER_ITEM_CODE, value: { in: codeKeys } }]
                : []),
              ...(descKeys.length
                ? [{ kind: SUPPLIER_ITEM_DESC, value: { in: descKeys } }]
                : []),
            ],
          },
          select: {
            kind: true,
            value: true,
            product: { select: { id: true, name: true, brand: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const productByBarcode = new Map(
    byBarcode
      .filter((product) => product.barcode !== null)
      .map((product) => [product.barcode as string, product])
  );
  const learnedByKey = new Map(
    learned.map((item) => [`${item.kind}:${item.value}`, item.product])
  );

  return lines.map((line) => {
    const candidates: Candidate[] = [];
    const named = new Map<number, { name: string; brand: string | null }>();

    const remember = (
      product: { id: number; name: string; brand: string | null },
      by: MatchEvidence
    ) => {
      candidates.push({ productId: product.id, by });
      named.set(product.id, { name: product.name, brand: product.brand });
    };

    const barcode = usableBarcode(line.barcode);
    const fromBarcode = barcode ? productByBarcode.get(barcode) : undefined;
    if (fromBarcode) remember(fromBarcode, "barcode");

    const code = line.code ? codeKey(line.code) : "";
    const fromCode = code ? learnedByKey.get(`${SUPPLIER_ITEM_CODE}:${code}`) : undefined;
    if (fromCode) remember(fromCode, "supplierCode");

    const desc = textFingerprint(line.description);
    const fromDesc = desc ? learnedByKey.get(`${SUPPLIER_ITEM_DESC}:${desc}`) : undefined;
    if (fromDesc) remember(fromDesc, "supplierDescription");

    if (candidates.length === 0) {
      return { match: null, refusedBecause: null };
    }

    // Every rule that fired has to name the same product. Two that disagree mean
    // one of them is out of date, and there is no way to tell which from here.
    const agreedIds = distinct(candidates.map((candidate) => candidate.productId));
    if (agreedIds.length > 1) {
      return { match: null, refusedBecause: "conflict" };
    }

    const productId = agreedIds[0]!;
    const product = named.get(productId)!;
    // Reported as the strongest rule that fired, which is the order they were
    // pushed in - it is what the review screen shows as the reason.
    const matchedBy = candidates[0]!.by;

    return {
      match: {
        productId,
        productName: product.name,
        productBrand: product.brand,
        matchedBy,
      },
      refusedBecause: null,
    };
  });
};

/**
 * Records what a person decided, so the next invoice from this supplier does not
 * ask them again.
 *
 * Called only from the apply path, and only for lines that were actually
 * applied. That restriction is the whole basis for treating a stored mapping as
 * certain later: every row here is a decision somebody committed to, not a
 * suggestion they happened to leave on screen.
 *
 * Returns un-awaited writes for the caller's batch - see invoiceApply.ts for why
 * everything there is built before anything runs.
 */
export const rememberLineDecisions = (
  client: Prisma.TransactionClient,
  supplierId: number,
  decisions: Array<{ productId: number; code: string | null; description: string }>
): Prisma.PrismaPromise<unknown>[] => {
  // One entry per (kind, value): if the same code appears on two lines of one
  // invoice pointing at different products, the invoice is telling us something
  // we cannot act on, so neither line teaches us anything.
  const proposals = new Map<
    string,
    { kind: string; value: string; productId: number; text: string } | null
  >();

  const propose = (kind: string, value: string, productId: number, text: string) => {
    if (!value) return;
    const key = `${kind}:${value}`;

    if (!proposals.has(key)) {
      proposals.set(key, { kind, value, productId, text });
      return;
    }

    const existing = proposals.get(key);
    // Already poisoned, or now contradicted - either way, learn nothing from it.
    if (!existing || existing.productId !== productId) {
      proposals.set(key, null);
    }
  };

  for (const decision of decisions) {
    if (decision.code) {
      propose(SUPPLIER_ITEM_CODE, codeKey(decision.code), decision.productId, decision.code);
    }
    propose(
      SUPPLIER_ITEM_DESC,
      textFingerprint(decision.description),
      decision.productId,
      decision.description
    );
  }

  const writes: Prisma.PrismaPromise<unknown>[] = [];

  for (const proposal of proposals.values()) {
    if (!proposal) continue;

    writes.push(
      client.supplierItem.upsert({
        where: {
          supplierId_kind_value: {
            supplierId,
            kind: proposal.kind,
            value: proposal.value,
          },
        },
        // The newest decision wins outright. A supplier who retires a code and
        // reuses it for something else corrects itself on the first apply,
        // rather than leaving two rows to disagree forever.
        update: {
          productId: proposal.productId,
          lastSeenText: proposal.text,
          timesSeen: { increment: 1 },
          updatedAt: new Date(),
        },
        create: {
          supplierId,
          kind: proposal.kind,
          value: proposal.value,
          productId: proposal.productId,
          lastSeenText: proposal.text,
        },
      })
    );
  }

  return writes;
};
