import { DocumentLine, DocumentTotals, TotalsCheck } from "./invoiceTypes.js";

/**
 * Whether the lines that were read account for the total printed on the invoice.
 *
 * This is the one check in the pipeline that can notice a line the model never
 * returned at all. Everything else validates rows against themselves, and a row
 * that was dropped leaves nothing behind to validate - the invoice simply comes
 * back shorter, the review screen says "38 lines ready", and a delivery goes
 * unrecorded with nobody any the wiser.
 *
 * It lives in its own file because both halves of the pipeline need it: parsing
 * produces the figures, and the review state rebuilds the check on every read
 * without re-reading the document. Putting it in either one would have made them
 * import each other.
 */

/**
 * How far the lines may fall short of the printed total before it is worth
 * raising.
 *
 * Relative rather than fixed, because an invoice's own per-line rounding
 * accumulates with its length; with a floor, so a small invoice is not held to
 * an impossible standard. Both sit well below the value of a real line, which is
 * the thing this is meant to catch.
 */
const tolerance = (documentTotal: number) =>
  Math.max(0.5, Math.abs(documentTotal) * 0.005);

/**
 * Compared against the goods subtotal rather than the payable total, because the
 * line totals are themselves pre-VAT. Where no subtotal was printed but a grand
 * total was, the grand total is NOT substituted: the two differ by exactly the
 * VAT, so "disagrees" would fire on every correctly-read invoice in the country.
 */
export const checkTotals = (
  lines: DocumentLine[],
  totals: DocumentTotals
): TotalsCheck => {
  const linesMissingTotal = lines.filter((line) => line.totalPrice === null).length;
  const linesTotal = lines.reduce((sum, line) => sum + (line.totalPrice ?? 0), 0);
  const documentTotal = totals.subtotal;

  // Nothing to compare against, or an incomplete sum to compare with. Reported
  // as unknown rather than as agreement: this check has to mean something when
  // it is silent, so it must never be silent merely because it could not look.
  if (documentTotal === null || linesMissingTotal > 0 || lines.length === 0) {
    return {
      status: "unknown",
      linesTotal,
      documentTotal,
      difference: null,
      linesMissingTotal,
    };
  }

  const difference = documentTotal - linesTotal;

  return {
    status: Math.abs(difference) <= tolerance(documentTotal) ? "agrees" : "disagrees",
    linesTotal,
    documentTotal,
    difference,
    linesMissingTotal,
  };
};
