/**
 * The signing secret, read from a Wrangler secret via `process.env`
 * (`nodejs_compat` mirrors Workers vars and secrets into it).
 *
 * There is deliberately NO fallback value. The previous
 * `process.env.JWT_SECRET || "super-secret-dev-key"` meant that a deployment
 * which forgot to set the secret would still boot and happily issue tokens that
 * anyone reading this repository could forge. Failing loudly is the only safe
 * behaviour.
 *
 * Read per call rather than at module scope: bindings are populated for the
 * request context, so a module-level constant can evaluate before they exist.
 */
export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Run `wrangler secret put JWT_SECRET`, or add it to .dev.vars in the repo root (beside wrangler.jsonc) for local development."
    );
  }

  return secret;
};
