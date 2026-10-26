import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config";
import { HttpError, forbidden } from "./lib/http";
import { User, type Role } from "./models";

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10);

/** Password policy: at least 8 characters with letters and numbers. Returns an error message or null. */
export function passwordProblem(p: string): string | null {
  if (p.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return "Password must contain letters and numbers";
  return null;
}
export const checkPassword = (p: string, h: string) => bcrypt.compare(p, h);

export function signAccess(u: AuthUser): string {
  return jwt.sign({ sub: u.id, role: u.role, name: u.name, email: u.email }, config.jwtSecret, { expiresIn: config.accessTtl as any });
}

export function signRefresh(id: string, tokenVersion: number): string {
  return jwt.sign({ sub: id, v: tokenVersion }, config.jwtRefreshSecret, { expiresIn: config.refreshTtl as any });
}

export function verifyRefresh(token: string): { sub: string; v: number } {
  return jwt.verify(token, config.jwtRefreshSecret) as { sub: string; v: number };
}

/** Requires a valid access token. Re-checks that the user still exists and is active. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const h = req.headers.authorization ?? "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) throw new HttpError(401, "Login required");
    let payload: any;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new HttpError(401, "Session expired, please log in again");
    }
    const u = await User.findById(payload.sub).lean();
    if (!u || !u.active) throw new HttpError(401, "Account disabled");
    if (u.mustChangePassword && !req.originalUrl.startsWith("/api/auth/")) {
      throw new HttpError(403, "Password change required. Set your own password to continue.");
    }
    req.user = { id: String(u._id), role: u.role as Role, name: u.name, email: u.email };
    next();
  } catch (e) {
    next(e);
  }
}

/** Display names for roles (the stored codes stay ENGINEER / APPROVER / ADMIN). */
export const ROLE_NAME: Record<Role, string> = { INCHARGE: "Lab In-charge", ENGINEER: "Test Engineer", APPROVER: "Senior Engineer", ADMIN: "Administrator" };

/** Role guard used on every protected route. */
export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new HttpError(401, "Login required"));
  if (!roles.includes(req.user.role)) return next(forbidden(`Only ${roles.map((r) => ROLE_NAME[r]).join(" / ")} can do this`));
  next();
};
