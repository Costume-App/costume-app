import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Foundation lands before any test files exist; keep the suite green until then.
    passWithNoTests: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
