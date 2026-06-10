import { defineConfig } from "vitest/config";

/* V21.21.35 — إعداد منفصل لاختبارات قواعد Firestore.
   منفصلة عن `npm test` لأنها محتاجة المحاكي (Firestore Emulator) شغال.
   التشغيل: npm run test:rules  (بيشغّل المحاكي ويجري الاختبارات جواه) */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.js"],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
