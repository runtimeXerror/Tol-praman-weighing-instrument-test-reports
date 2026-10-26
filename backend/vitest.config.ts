import { defineConfig } from "vitest/config";
export default defineConfig({ test: { testTimeout: 60_000, hookTimeout: 300_000, fileParallelism: false, env: { NODE_ENV: "test", STORAGE_DIR: "./storage/test-files" } } });
