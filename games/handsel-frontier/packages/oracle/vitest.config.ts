import { defineConfig } from "vitest/config";

// Local config so vitest does not climb to the MUD monorepo's root config.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
