/**
 * Turning text a human typed - or a model read off a photograph - into something
 * two of them can be compared by.
 *
 * This started life inside supplierNames.ts, which needed exactly this to stop
 * "Acme", "ACME" and "acme" becoming three suppliers. Products and invoice lines
 * need the same folding for the same reason, so it lives here now and that file
 * delegates to it.
 *
 * A note on Turkish, because it is the one thing here that is easy to get wrong
 * in a way that only shows up in production:
 *
 *   textKey uses the INVARIANT toLowerCase, deliberately. It is what
 *   Supplier.nameKey is stored and uniquely indexed by, so changing it would
 *   mean every existing row no longer matched its own recomputed key - a lookup
 *   would miss, and creating the same supplier again would insert a duplicate
 *   past a unique index that no longer agreed with the code.
 *
 *   The Turkish letters are handled in textFingerprint instead, which is
 *   computed on demand and stored nowhere, so it is free to be as clever as it
 *   needs to be. It folds I, İ and ı together, which is what search and
 *   duplicate detection actually want.
 */

/** Collapses runs of any whitespace to one space and trims the ends. */
const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

/**
 * The text as it should be stored: tidied, but with the writer's own
 * capitalisation and spelling preserved, because that is what they will want to
 * read back.
 */
export const displayText = (value: string) =>
  collapseWhitespace(value.normalize("NFKC"));

/**
 * Strict identity. "xyz", "XYZ", "Xyz" and " Xyz " all produce the same key, so
 * only one of them can exist where a unique index says so.
 */
export const textKey = (value: string) => displayText(value).toLowerCase();

/**
 * Loose identity, for spotting things that are probably the same.
 *
 * Accents are removed by decomposing and dropping the combining marks, which
 * also disposes of the dot on "İ": toLowerCase turns it into "i" plus a
 * combining dot above, and the dot is a diacritic. The dotless "ı" is a base
 * letter that does not decompose, so it is folded to "i" explicitly - without
 * that, "Işık" and "ISIK" would look unrelated.
 *
 * Punctuation and spacing go entirely, so "Coca-Cola 1 L" and "coca cola 1l"
 * agree. Digits stay: in a product name they are usually the size, and "1L" and
 * "2L" are emphatically not the same product.
 */
export const textFingerprint = (value: string) =>
  textKey(value)
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * A supplier's own code for an item, folded for comparison.
 *
 * Codes are printed inconsistently across a supplier's own paperwork - "AB-1234",
 * "ab 1234" and "AB1234" are one code - so separators go and case is folded.
 * Nothing else is touched: unlike a description, every remaining character of a
 * code is significant, so no accent stripping and no dropping of symbols that
 * might be part of the code itself.
 */
export const codeKey = (value: string) =>
  textKey(value).replace(/[\s._\-/\\]+/gu, "");
