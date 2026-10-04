import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 60000,
    // every test file makes its own scratch folder and its own servers on spare ports
    fileParallelism: false,
  },
});
