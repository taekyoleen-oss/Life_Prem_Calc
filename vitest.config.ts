import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Python 대사 테스트가 인터프리터를 스폰하므로 기본 5초로는 부족
    testTimeout: 60_000,
  },
});
