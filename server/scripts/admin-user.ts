import { execFileSync } from "node:child_process";
import { hashPassword } from "../src/services/passwordHash.js";

/**
 * Creates a user, or changes an existing user's password, directly against D1.
 *
 * Replaces the old create-user.ts / set-password.ts pair, which talked to a
 * local SQLite file through Prisma. There is no local database any more, and
 * standing up an admin HTTP endpoint would mean securing a second way into the
 * system, so this goes through the Wrangler CLI instead.
 *
 * The hash is computed here with the SAME module the Worker uses, so the stored
 * value is byte-identical to one produced at runtime - `crypto.subtle` exists in
 * both Node 20+ and Workers.
 *
 * Usage:
 *   npx tsx scripts/admin-user.ts <username> <password> [--local]
 */

const escapeSqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

async function main() {
  const args = process.argv.slice(2);
  const local = args.includes("--local");
  const [username, password] = args.filter((arg) => !arg.startsWith("--"));

  if (!username || !password) {
    console.error(
      "Usage: tsx scripts/admin-user.ts <username> <password> [--local]"
    );
    process.exit(1);
  }

  const hashed = await hashPassword(password);

  // SQLite has no MERGE; this upsert keeps the script idempotent so the same
  // command both creates a user and resets an existing one's password.
  const sql = `INSERT INTO User (username, password) VALUES (${escapeSqlString(
    username
  )}, ${escapeSqlString(hashed)})
     ON CONFLICT(username) DO UPDATE SET password = excluded.password;`;

  // execFileSync with an argv ARRAY, never a composed shell string: the password
  // and username never reach a shell, so no quoting or injection concern arises.
  execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "uup-db",
      local ? "--local" : "--remote",
      "--command",
      sql,
    ],
    { stdio: "inherit", cwd: new URL("..", import.meta.url).pathname }
  );

  console.log(
    `\nUser '${username}' created or updated on the ${local ? "local" : "remote"} database.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
