import type { AppPrisma } from "../lib/prisma.js";

/**
 * `req.prisma` is attached by the middleware in `index.ts`.
 *
 * Declaration merging is what lets every controller reach the request-scoped
 * client without importing it, which is the whole point: on Workers there is no
 * module-level client to import.
 */
declare global {
  namespace Express {
    interface Request {
      prisma: AppPrisma;
    }
  }
}

export {};
