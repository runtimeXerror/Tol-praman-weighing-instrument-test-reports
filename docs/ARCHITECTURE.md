# Software architecture

TOLPRAMAN records NAWI type-evaluation data, evaluates it against OIML R 76 (or LM (General) Rules 2011,
Heading A) and issues signed PDF and Word test reports. This document covers the structure; see
[CALCULATIONS.md](CALCULATIONS.md) for the calculation methodology and [DEPLOYMENT.md](DEPLOYMENT.md) for deployment.
The problem statement is in [problem/problem.md](problem/problem.md).

## 1. Components

```
 Browser (Next.js web app, desktop first, works down to 375 px)
   │  forms per test, live verdicts ── shared/engine (same code as the server)
   │  HTTPS, JSON (REST) via the Next.js rewrite /api/* → backend
   ▼
 Backend (Node.js + Express)
   ├─ auth: JWT access + refresh tokens, bcrypt, role guard on every route
   ├─ cases, readings (hash chain), review, sign & lock, revisions
   ├─ shared/engine: re-evaluates every submission (the server result is the one that counts)
   ├─ reports: HTML → PDF (Puppeteer), DOCX (docx), QR code, SHA-256, Ed25519 lab signature
   └─ public /api/verify/:id (QR target, no login)
   ▼
 MongoDB (cases, readings, rule packs, reports, audit log)      File storage (attachments, PDF, DOCX)
```

| Folder | Package | What it is |
|---|---|---|
| `frontend/` | `@tolpraman/frontend` | Next.js App Router, Tailwind. One responsive web app. |
| `backend/` | `@tolpraman/backend` | Express API, Mongoose models, report generation. |
| `shared/engine/` | `@tolpraman/engine` | Deterministic calculation engine. No Node APIs, runs in browser and server. |
| `shared/rulepacks/` | `@tolpraman/rulepacks` | Rule packs (JSON), JSON Schema, loader, validator. |

Frontend and backend never import each other; both import only from `shared/`.

## 2. The standard is data

Every limit, band, clause and pass rule is in a rule pack (`shared/rulepacks/packs/*.json`), validated
against `rulepack.schema.json`. The engine reads limits through `lim(pack, "…")`, which throws if a key is
missing, so a pack can never silently fall back to a hard-coded number. The India pack extends the OIML
pack with overrides only, and lists its differences from R 76 for the report.

When OIML or the gazette changes: the administrator uploads a new pack version (Admin → Standard Versions).
It is schema-checked, and the impact simulator shows which existing cases would change verdict. Existing
cases stay locked to the version (and SHA-256) they were evaluated with; new cases use the active version.

## 3. Roles and workflow

| Role | Can | Cannot |
|---|---|---|
| Lab In-charge | record sample receipt, create cases (assigning an engineer at receipt, or leaving the case unassigned for later), assign / reassign engineers, see assignment history | see readings, results or reports |
| Test Engineer | enter the instrument profile, readings, environment, attachments; submit | approve or sign |
| Senior Engineer (Approver) | approve or send back each test, approve the case, sign and lock, reopen for revision, revoke | approve or sign a case they entered readings for |
| Administrator | users, lab profile, weights and equipment register, rule packs, audit log | open test cases or reports |

These map directly onto how a physical model-approval lab works (application received → sample tested →
senior engineer signs off): the roles are named for that real workflow rather than for generic CRUD access.

| Lab role | TOLPRAMAN role code | Manufacturer / Applicant |
|---|---|---|
| Lab In-Charge | `INCHARGE` | not a TOLPRAMAN role — `Case.manufacturer` / `Case.applicant` are data fields on the case, entered by the In-charge from the application. TOLPRAMAN is the lab's internal testing system, not the government model-approval portal. |
| Test Engineer | `ENGINEER` | |
| Senior Engineer / Authorized Signatory | `APPROVER` | |
| Administrator | `ADMIN` (kept out of the testing workflow) | |

Case status: DRAFT → SUBMITTED → RETURNED (only the sent-back tests reopen) or APPROVED (every applicable
test approved) → SIGNED (locked). A signed case can be reopened; the revised report supersedes the old one,
which stays valid, marked "under revision", until the new one is signed. Optional two-level approval:
reviewer, then a different approver.

A case's `assignedEngineer` may be left unset at receipt (the In-charge picks an engineer later, from
Assignments); until then the case is `DRAFT` with no engineer and cannot be opened by anyone. The first
`PUT /cases/:id/assign` call on such a case records `CASE_ASSIGNED`; every call after that is `CASE_REASSIGNED` —
both are logged the same way as the rest of the assignment history.

Maker-checker is enforced by the API, not only the UI: anyone who entered readings for a case is refused
on approve and sign.

## 4. Data integrity

- **Readings**: every save appends a record `hash = SHA-256(canonicalJSON(record) + previous hash)`. Signing
  is refused if the chain does not verify.
- **Approvals** are tied to hashes of the test's readings and the instrument profile; changing either
  cancels that approval.
- **Audit log**: the same hash chain, for every significant action.
- **Reports**: the final PDF bytes are hashed (SHA-256). The lab signs a statement {report no., verification
  ID, PDF SHA-256, signing time, key ID} with Ed25519. The public key is at `/api/verify/public-key`.
  The QR code on every page opens `/verify/<id>`; uploading a PDF there says AUTHENTIC or MODIFIED.
- **Time plausibility**: time-based tests (creep, warm-up, damp heat, static temperatures) are flagged when
  the data claims more time than has passed since the first entry.

## 5. Main API routes

| Route | Who |
|---|---|
| `POST /api/auth/login`, `/refresh`, `/logout`, `/password`; `GET /api/auth/me` | everyone |
| `POST /api/cases`, `PUT /api/cases/:id/assign`, `GET /api/cases/assignments/history` | Lab In-charge |
| `PUT /api/cases/:id/instrument`, `PUT /api/cases/:id/tests/:testId`, `POST …/sessions`, `…/attachments`, `…/submit` | assigned Test Engineer |
| `POST /api/cases/:id/tests/:testId/approve` (or `/unapprove`), `…/return`, `…/approve`, `…/reopen`, `POST /api/cases/:id/sign` | Senior Engineer |
| `GET /api/reports?q=&model=&manufacturer=&verdict=&from=&to=` | Test Engineer (own cases), Senior Engineer |
| `GET /api/reports/:id/pdf`, `/docx`; `POST /api/reports/:id/revoke` | Senior Engineer (revoke) |
| `GET /api/verify/:id`, `POST /api/verify/:id/file`, `GET /api/verify/:id/signature`, `GET /api/verify/public-key` | public |
| `/api/admin/*` | Administrator |

## 6. Tests

`npm test` from the repo root: rule packs (12), engine (1,122), API with supertest and an in-memory
MongoDB (36: role matrix, receipt and assignment, per-test review, locks, revisions, chain integrity,
sign and verify, search), and web (17: CSV import and export).
