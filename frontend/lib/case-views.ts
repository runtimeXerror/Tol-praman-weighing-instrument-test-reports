/** Case views for the Senior Engineer: each dashboard card opens one of these as its own page. */

export type ViewId = "all" | "active" | "review" | "sign" | "conditional" | "failing" | "signed-month" | "signed";

export interface CaseView {
  id: ViewId;
  title: string;
  description: string;
  empty: string;
  /** Primary action shown on each row. */
  action: "review" | "sign" | "open";
  match: (c: any) => boolean;
}

const monthStart = () => { const m = new Date(); m.setDate(1); m.setHours(0, 0, 0, 0); return m; };
const unsigned = (c: any) => c.status !== "SIGNED";

export const VIEWS: CaseView[] = [
  { id: "active", title: "In process", description: "Cases the test engineers are still working on (in data entry or returned for correction).", empty: "No cases are in data entry right now.", action: "open", match: (c) => ["DRAFT", "RETURNED"].includes(c.status) },
  { id: "review", title: "Awaiting review", description: "Cases submitted by test engineers. Review each test, then return with comments or approve.", empty: "Nothing is waiting for review.", action: "review", match: (c) => ["SUBMITTED", "REVIEWED"].includes(c.status) },
  { id: "sign", title: "Awaiting signature", description: "Approved cases waiting for the digital signature and QR seal.", empty: "Nothing is waiting for signature.", action: "sign", match: (c) => c.status === "APPROVED" },
  { id: "conditional", title: "Conditional flags", description: "Unsigned cases where a result is within the limit but its measurement uncertainty crosses it.", empty: "No unsigned case has a conditional result.", action: "open", match: (c) => unsigned(c) && c.verdict === "CONDITIONAL" },
  { id: "failing", title: "Failing (unsigned)", description: "Unsigned cases where at least one test fails.", empty: "No unsigned case is failing.", action: "open", match: (c) => unsigned(c) && c.verdict === "FAIL" },
  { id: "signed-month", title: "Signed this month", description: "Reports signed since the 1st of this month.", empty: "No reports signed this month yet.", action: "open", match: (c) => c.status === "SIGNED" && !!c.signedAt && new Date(c.signedAt) >= monthStart() },
  { id: "signed", title: "All signed", description: "Every signed and locked report.", empty: "No signed reports yet.", action: "open", match: (c) => c.status === "SIGNED" },
  { id: "all", title: "All cases", description: "Every case in the laboratory.", empty: "No cases yet. Create one with New Case + Assign.", action: "open", match: () => true },
];

export const viewById = (id: string | null | undefined): CaseView => VIEWS.find((v) => v.id === id) ?? VIEWS[VIEWS.length - 1];
