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
 *
 * The folding itself now lives in textKeys.ts, because products and invoice
 * lines need exactly the same rules. These stay as named wrappers: they are what
 * the supplier code reads as, and the unique index in the database is defined in
 * terms of supplierNameKey specifically.
 */
import { displayText, textFingerprint, textKey } from "./textKeys.js";

/**
 * The name as it should be stored: tidied, but with the user's own capitalisation
 * and spelling preserved, because that is what they will want to read back.
 */
export const supplierDisplayName = displayText;

/**
 * Strict identity. "xyz", "XYZ", "Xyz" and " Xyz " all produce the same key, so
 * only one of them can exist.
 */
export const supplierNameKey = textKey;

/** Loose identity, for spotting probable duplicates. */
export const supplierNameFingerprint = textFingerprint;
