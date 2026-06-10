import { defineConfig } from "vitest/config";

/* V21.21.27 — financial test-suite config (Roadmap Phase 1.1).
   Node environment: the suite targets the PURE accounting logic
   (postingRules, posting validation) — no DOM, no Firebase emulator. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.js", "api/**/__tests__/**/*.test.js"],
  },
});
