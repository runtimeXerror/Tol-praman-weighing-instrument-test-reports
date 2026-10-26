import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config";
import { dbReady } from "./db";
import { HttpError, errorHandler } from "./lib/http";
import { adminRouter } from "./routes/admin";
import { authRouter } from "./routes/auth";
import { casesRouter } from "./routes/cases";
import { dashboardRouter } from "./routes/dashboard";
import { reportsRouter, verifyRouter } from "./routes/reports";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
    credentials: true,
  }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    const db = dbReady();
    res.status(db ? 200 : 503).json({ ok: db, db: db ? "up" : "down", service: "tolpraman-backend", time: new Date().toISOString() });
  });
  // Without a database every query would wait; answer at once instead.
  app.use("/api", (_req, _res, next) => next(dbReady() ? undefined : new HttpError(503, "Database not available. Restart the backend.")));
  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/cases", casesRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/verify", verifyRouter);
  app.use("/api", reportsRouter);

  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
  app.use(errorHandler);
  return app;
}
