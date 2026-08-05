import { execFileSync } from "node:child_process";
import { displayText, textFingerprint } from "../src/services/textKeys.js";

/**
 * Fills in Product.nameFingerprint for products that predate the column.
 *
 * The folding cannot be done in SQL. It needs Unicode normalisation and the
 * Turkish dotless-ı rule, neither of which SQLite has - and an approximation
 * written in SQL would be worse than nothing, because a fingerprint that
 * disagrees with the one textKeys.ts computes at runtime is a row that never
 * matches its own search. So the values are computed here, with the exact module
 * the Worker uses, and sent up as a single statement.
 *
 * Safe to run more than once: it only rewrites what it reads, and running it
 * twice produces identical values.
 *
 * Not required for correctness. Search ORs the fingerprint against a plain
 * `contains` on the name, and the duplicate check re-folds any row missing one,
 * so an un-backfilled product is still findable and still warns - it just does
 * not get Turkish-aware search until this has run.
 *
 * Usage:
 *   npx tsx scripts/backfill-fingerprints.ts [--local]
 */

const escapeSqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

const wrangler = (args: string[], capture: boolean) =>
  execFileSync("npx", ["wrangler", ...args], {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    cwd: new URL("..", import.meta.url).pathname,
  });

type ProductRow = { id: number; name: string };

async function main() {
  const local = process.argv.includes("--local");
  const target = local ? "--local" : "--remote";

  const raw = wrangler(
    [
      "d1",
      "execute",
      "uup-db",
      target,
      "--json",
      "--command",
      'SELECT id, name FROM "Product" WHERE "nameFingerprint" IS NULL;',
    ],
    true
  );

  // `--json` returns an array of result sets, one per statement.
  const parsed = JSON.parse(raw) as Array<{ results?: ProductRow[] }>;
  const rows = parsed[0]?.results ?? [];

  if (rows.length === 0) {
    console.log("Nothing to do - every product already has a fingerprint.");
    return;
  }

  const updates = rows
    .map((row) => {
      const fingerprint = textFingerprint(displayText(row.name));
      return `UPDATE "Product" SET "nameFingerprint" = ${escapeSqlString(
        fingerprint
      )} WHERE id = ${Number(row.id)};`;
    })
    .join("\n");

  wrangler(["d1", "execute", "uup-db", target, "--command", updates], false);

  console.log(
    `\nFingerprinted ${rows.length} product${rows.length === 1 ? "" : "s"} on the ${
      local ? "local" : "remote"
    } database.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
