import "dotenv/config";
import path from "node:path";

const env = (k: string, d = "") => process.env[k] ?? d;

export const config = {
  port: Number(env("PORT", "4000")),
  mongoUri: env("MONGO_URI"),
  jwtSecret: env("JWT_SECRET", "dev-secret"),
  jwtRefreshSecret: env("JWT_REFRESH_SECRET", "dev-refresh-secret"),
  accessTtl: env("ACCESS_TTL", "15m"),
  refreshTtl: env("REFRESH_TTL", "7d"),
  corsOrigins: env("CORS_ORIGINS", "http://localhost:3000").split(",").map((s) => s.trim()),
  publicWebUrl: env("PUBLIC_WEB_URL", "http://localhost:3000"),
  storageDir: path.resolve(env("STORAGE_DIR", "./storage/files")),
  keysDir: path.resolve(env("KEYS_DIR", "./storage/keys")),
  mongoDataDir: path.resolve(env("MONGO_DATA_DIR", "./storage/mongo")),
  isTest: process.env.NODE_ENV === "test" || !!process.env.VITEST,
};
