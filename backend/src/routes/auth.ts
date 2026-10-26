import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { ROLE_NAME, checkPassword, hashPassword, passwordProblem, requireAuth, signAccess, signRefresh, verifyRefresh, type AuthUser } from "../auth";
import { config } from "../config";
import { audit } from "../lib/audit";
import { HttpError, ah, parse } from "../lib/http";
import { ROLES, User, type Role } from "../models";

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.isTest ? 1000 : 20, standardHeaders: true, legacyHeaders: false });

const toAuthUser = (u: any): AuthUser => ({ id: String(u._id), role: u.role as Role, name: u.name, email: u.email });
const publicUser = (u: any) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role, designation: u.designation, mustChangePassword: !!u.mustChangePassword });

authRouter.post("/login", loginLimiter, ah(async (req, res) => {
  const { email, password, role } = parse(z.object({ email: z.string().email(), password: z.string().min(1), role: z.enum(ROLES).optional() }), req.body);
  const u = await User.findOne({ email: email.toLowerCase() });
  if (!u || !u.active || !(await checkPassword(password, u.passwordHash))) {
    await audit(null, "LOGIN_FAILED", "User", null, { email });
    throw new HttpError(401, "Invalid email or password");
  }
  // The role chosen on the login form must match the account's role.
  if (role && u.role !== role) {
    await audit(null, "LOGIN_FAILED", "User", String(u._id), { email, reason: "role mismatch", selected: role });
    throw new HttpError(403, `This account is not ${/^[AEIOU]/.test(ROLE_NAME[role]) ? "an" : "a"} ${ROLE_NAME[role]}. Choose the correct role.`);
  }
  u.lastLoginAt = new Date();
  await u.save();
  const au = toAuthUser(u);
  req.user = au;
  await audit(req, "LOGIN", "User", au.id);
  res.json({ accessToken: signAccess(au), refreshToken: signRefresh(au.id, u.tokenVersion ?? 0), user: publicUser(u) });
}));

authRouter.post("/refresh", ah(async (req, res) => {
  const { refreshToken } = parse(z.object({ refreshToken: z.string() }), req.body);
  let p: { sub: string; v: number };
  try { p = verifyRefresh(refreshToken); } catch { throw new HttpError(401, "Session expired, please log in again"); }
  const u = await User.findById(p.sub);
  if (!u || !u.active || (u.tokenVersion ?? 0) !== p.v) throw new HttpError(401, "Session expired, please log in again");
  res.json({ accessToken: signAccess(toAuthUser(u)), refreshToken: signRefresh(String(u._id), u.tokenVersion ?? 0), user: publicUser(u) });
}));

authRouter.post("/logout", requireAuth, ah(async (req, res) => {
  await User.updateOne({ _id: req.user!.id }, { $inc: { tokenVersion: 1 } });
  await audit(req, "LOGOUT", "User", req.user!.id);
  res.json({ ok: true });
}));

authRouter.get("/me", requireAuth, ah(async (req, res) => {
  const u = await User.findById(req.user!.id).lean();
  res.json({ user: publicUser(u) });
}));

authRouter.post("/password", requireAuth, ah(async (req, res) => {
  const { current, next } = parse(z.object({ current: z.string().min(1), next: z.string().min(1) }), req.body);
  const u = await User.findById(req.user!.id);
  if (!u || !(await checkPassword(current, u.passwordHash))) throw new HttpError(400, "Current password is wrong");
  const problem = passwordProblem(next);
  if (problem) throw new HttpError(400, problem);
  if (await checkPassword(next, u.passwordHash)) throw new HttpError(400, "New password must be different from the current one");
  u.passwordHash = await hashPassword(next);
  u.mustChangePassword = false;
  u.passwordChangedAt = new Date();
  u.tokenVersion = (u.tokenVersion ?? 0) + 1; // signs out every other session
  await u.save();
  await audit(req, "PASSWORD_CHANGED", "User", String(u._id));
  const au = toAuthUser(u);
  // fresh tokens so this session stays signed in
  res.json({ ok: true, accessToken: signAccess(au), refreshToken: signRefresh(au.id, u.tokenVersion), user: publicUser(u) });
}));
