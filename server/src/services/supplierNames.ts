/**
 * Supplier names are typed by hand, by different people, over years. Two layers
 * guard against ending up with the same supplier recorded twice:
 *
 *   supplierNameKey    - a strict identity. Names that differ only by letter
 *                        case or spacing are the *same* supplier, enforced by a
 *                        unique index in the database.
 *
 *   supplierNameFingerprint - a loose identity, also ignoring accents and
 *                        punctuation. Not enforced, because two suppliers could
 *                        legitimately differ only by an accent. Used to warn the
 *                        user and let them decide.
 *
 * The loose layer matters for this data in particular: the existing suppliers
 * were entered without Turkish diacritics ("Celikayna", "Duru Ahsap"), so the
 * likeliest duplicate is someone later typing "Çelikayna" correctly.
 */

/** Collapses runs of any whitespace to one space and trims the ends. */
const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

/**
 * The name as it should be stored: tidied, but with the user's own capitalisation
 * and spelling preserved, because that is what they will want to read back.
 */
export const supplierDisplayName = (value: string) =>
  collapseWhitespace(value.normalize("NFKC"));

/**
 * Strict identity. "xyz", "XYZ", "Xyz" and " Xyz " all produce the same key, so
 * only one of them can exist.
 */
export const supplierNameKey = (value: string) =>
  supplierDisplayName(value).toLowerCase();

/**
 * Loose identity, for spotting probable duplicates.
 *
 * Accents are removed by decomposing and dropping the combining marks. The
 * Turkish dotless "ı" is a base letter that does not decompose, so it is folded
 * to "i" explicitly - without that, "Işık" and "ISIK" would look unrelated.
 */
export const supplierNameFingerprint = (value: string) =>
  supplierNameKey(value)
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
