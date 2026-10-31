import { defineConfig } from "vitest/config";

// Kept outside the default frontend test suite: this experiment runs 220 waves per process.
export default defineConfig({
  test: {
    include: ["scripts/vt062-load.load.tsx"],
    testTimeout: 600_000,
  },
});
