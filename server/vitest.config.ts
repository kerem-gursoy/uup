import { defineConfig } from "vitest/config";

/**
 * Plain Node, no Workers runtime and no database.
 *
 * Everything under test here is deliberately pure: the matcher takes a client
 * and is exercised with a stub, and the rest is arithmetic and string folding.
 * That is not a limitation being worked around - it is why these are the parts
 * worth testing. They are the ones where being quietly wrong writes bad numbers
 * into a real stock history.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
