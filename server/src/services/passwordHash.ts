/**
 * Password hashing with PBKDF2 via WebCrypto.
 *
 * bcrypt is not usable here: at cost 10 it burns roughly 200ms of CPU per hash,
 * about twenty times the Workers free-plan budget of 10ms per request, so every
 * login and registration would fail outright with a CPU-time error. PBKDF2
 * through `crypto.subtle` is hardware-backed and fits.
 *
 * 100,000 iterations is the Workers cap for PBKDF2-SHA-256, and it is below
 * current OWASP guidance (600,000). That is a deliberate trade for a small
 * single-tenant internal tool, not a claim that this is bank-grade. If CPU
 * errors still appear under load, lower the iteration count rather than raising
 * it - stored hashes record their own iteration count, so old passwords keep
 * verifying after a change.
 *
 * `crypto.subtle` exists in both Workers and Node 20+, so the admin CLI script
 * produces byte-identical hashes to the deployed Worker.
 */

const ALGORITHM = "pbkdf2";
const ITERATIONS = 100_000;
const HASH = "SHA-256";
const SALT_BYTES = 16;
const KEY_BITS = 256;

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const deriveBits = async (
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: HASH },
    key,
    KEY_BITS
  );

  return new Uint8Array(bits);
};

/**
 * Returns a single self-describing string stored in `User.password` - same
 * column, no schema change. Carrying the iteration count and salt inside the
 * value is what allows the cost to be tuned later without invalidating
 * existing passwords.
 *
 * Format: pbkdf2$<iterations>$<saltBase64>$<hashBase64>
 */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await deriveBits(password, salt, ITERATIONS);

  return [ALGORITHM, ITERATIONS, toBase64(salt), toBase64(derived)].join("$");
};

/**
 * Constant-time comparison. A plain `===` on the base64 strings would leak how
 * many leading bytes matched through its early exit, which is enough to
 * reconstruct a hash one byte at a time.
 */
const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a[i]! ^ b[i]!;
  }
  return difference === 0;
};

export const verifyPassword = async (
  password: string,
  stored: string
): Promise<boolean> => {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== ALGORITHM) return false;

  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;

  try {
    const salt = fromBase64(parts[2]!);
    const expected = fromBase64(parts[3]!);
    const derived = await deriveBits(password, salt, iterations);

    return timingSafeEqual(derived, expected);
  } catch {
    // A malformed stored value is a failed verification, not a crash.
    return false;
  }
};
