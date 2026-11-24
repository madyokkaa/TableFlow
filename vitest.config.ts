import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.test.ts"],
    // These tests hit a real Supabase project (multiple round trips per
    // test: create user, sign in, call route handlers) - the 5s default is
    // too tight.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
