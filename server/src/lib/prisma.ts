import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { env } from "cloudflare:workers";

/**
 * Builds a PrismaClient bound to the D1 binding.
 *
 * DO NOT hoist this into a module-level singleton, however tempting it looks.
 * Workers forbids D1 I/O outside a request context, so a client constructed at
 * module scope throws the first time it is used. One client is created per
 * request by the middleware in `index.ts` and reached through `req.prisma`.
 *
 * This is the one mental-model shift from the old Express/SQLite setup, where a
 * single long-lived client was correct.
 */
export const getPrisma = () =>
  new PrismaClient({ adapter: new PrismaD1(env.DB) });

/**
 * Named to avoid colliding with the `Prisma` namespace that `@prisma/client`
 * exports, which several services already import for its input types.
 */
export type AppPrisma = ReturnType<typeof getPrisma>;
