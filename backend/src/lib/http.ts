import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError, type ZodTypeAny, type z } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const bad = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const forbidden = (msg = "You do not have permission for this action") => new HttpError(403, msg);
export const notFound = (what = "Resource") => new HttpError(404, `${what} not found`);
export const conflict = (msg: string, details?: unknown) => new HttpError(409, msg, details);

/** Wrap async handlers so thrown errors reach the error middleware. */
export const ah = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw bad("Invalid input", r.error.flatten());
  return r.data;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err instanceof ZodError) return res.status(400).json({ error: "Invalid input", details: err.flatten() });
  const e = err as any;
  if (e?.name === "CastError") return res.status(404).json({ error: "Not found" });
  if (e?.code === 11000) return res.status(409).json({ error: "Duplicate value", details: e.keyValue });
  if (e?.name === "MulterError") return res.status(400).json({ error: e.message });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
