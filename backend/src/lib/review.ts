import type { RulePack as Pack } from "@tolpraman/rulepacks";
import { applicable, toProfile } from "./compute";
import { canonicalJSON, sha256 } from "./hash";

/**
 * Per-test review by the senior engineer.
 *
 * Every applicable test is PENDING, APPROVED or RETURNED. An approval records the hash of the test's
 * readings and of the instrument profile at that moment; it only counts while both are unchanged, so
 * any later change to the readings, or to Max / e / class etc., sends the test back to PENDING by itself.
 */
export type ReviewState = "PENDING" | "APPROVED" | "RETURNED";

export interface StoredReview {
  state: ReviewState;
  by?: string;
  byName?: string;
  at?: string;
  note?: string;
  /** Hash of the test's readings when the decision was taken. */
  inputHash?: string;
  /** Hash of the metrological instrument profile when the decision was taken. */
  profileHash?: string;
  verdict?: string;
}

export interface TestReviewView extends StoredReview {
  testId: string;
  name: string;
  /** Engine verdict now. */
  current: string;
  /** Rows recorded / rows per verdict, for the review screen. */
  rows: number;
  counts: Record<string, number>;
  /** An approval was given but the readings or the instrument profile have changed since. */
  stale?: boolean;
  /** RETURNED and the readings have not changed since the test was returned. */
  unchanged?: boolean;
}

const plain = (x: unknown) => JSON.parse(JSON.stringify(x ?? null));
export const hashInput = (input: unknown) => sha256(canonicalJSON(plain(input)));
export const hashProfile = (c: any) => sha256(canonicalJSON(plain(toProfile(c))));

export const storedReviews = (c: any): Record<string, StoredReview> => ({ ...((c.testReviews as any) ?? {}) });

/** The review state of every applicable test, with stale approvals already turned back to PENDING. */
export function reviewView(c: any, pack: Pack): TestReviewView[] {
  const obj = c.toObject ? c.toObject() : c;
  const stored = storedReviews(obj);
  const results: any[] = obj.results ?? [];
  const pHash = hashProfile(obj);
  return applicable(obj, pack).filter((t) => t.applicable).map((t) => {
    const r = results.find((x) => x.testId === t.id);
    const s = stored[t.id];
    const iHash = hashInput(obj.testInputs?.[t.id]);
    const counts: Record<string, number> = {};
    for (const row of r?.rows ?? []) counts[row.verdict] = (counts[row.verdict] ?? 0) + 1;
    const base = { testId: t.id, name: t.name, current: r?.verdict ?? "NOT_TESTED", rows: r?.rows?.length ?? 0, counts };
    if (!s) return { ...base, state: "PENDING" as const };
    if (s.state === "APPROVED" && (s.inputHash !== iHash || s.profileHash !== pHash)) return { ...base, ...s, state: "PENDING" as const, stale: true };
    if (s.state === "RETURNED") return { ...base, ...s, unchanged: s.inputHash === iHash };
    return { ...base, ...s };
  });
}

/** Applicable tests that are not (validly) approved yet. */
export const notApproved = (c: any, pack: Pack) => reviewView(c, pack).filter((r) => r.state !== "APPROVED");

export function setReview(c: any, testId: string, r: StoredReview) {
  c.testReviews = { ...storedReviews(c), [testId]: plain(r) };
  c.markModified?.("testReviews");
}

/** An approval record for a test as it stands now. */
export function approvalFor(c: any, testId: string, user: { id: string; name: string }, note?: string): StoredReview {
  const obj = c.toObject ? c.toObject() : c;
  const r = (obj.results ?? []).find((x: any) => x.testId === testId);
  return {
    state: "APPROVED", by: user.id, byName: user.name, at: new Date().toISOString(), note,
    inputHash: hashInput(obj.testInputs?.[testId]), profileHash: hashProfile(obj), verdict: r?.verdict ?? "NOT_TESTED",
  };
}
