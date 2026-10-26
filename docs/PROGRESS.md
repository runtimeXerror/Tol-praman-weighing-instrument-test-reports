# Progress

Run instructions: see the root `README.md`.

## Done

- [x] Step 0 – Project brief (`CLAUDE.md`), frontend/backend in separate folders.
- [x] Step 1 – Monorepo (npm workspaces: `shared/*`, `backend`, `frontend`).
- [x] Data – Official sources downloaded to `docs/standards/` (OIML R 76-1:2006, R 76-2:2007, LM (General) Rules 2011 and
      amendments from consumeraffairs.gov.in). Heading A OCR'd (Windows OCR) to `docs/standards/india/HeadingA_NAWI_OCR.txt`.
- [x] Step 2 – Rule packs + JSON Schema + loader (IN deep-merges over OIML; frozen; SHA-256 pack hash).
      India pack includes G.S.R. 568(E) dt. 03-07-2026 (substitution rule, Hdg A 9(2)(ii)).
- [x] Step 3 – Engine core: instrument validation (Table 3/17, 1-2-5 form, Min, aux devices, Table 4/18), MPE incl.
      multi-interval and in-service, error/changeover formulas, decision rules.
- [x] Step 4 – Test kernels T01–T17 + applicability; golden tests on every band boundary; fast-check properties (95 % stmt coverage).
- [x] Step 5 – Weights (min-set chooser, expiry, 1/3 mpe check, conventional mass) and uncertainty budget; CONDITIONAL rule.
- [x] Step 6 – API: JWT + refresh + revocation, RBAC on every route, maker-checker, status machine (incl. two-level),
      hash-chained readings + audit log, time-plausibility flags, attachments with SHA-256, seed.
- [x] Step 7 – Web app, engineer flow: live engine in the browser, forms generated per test, autosave, env log, attachments checklist, submit readiness.
- [x] Step 8 – Web Serial scale link (4 parser profiles) + in-browser simulator; DEVICE/MANUAL source tagging.
- [x] Step 9 – Approver dashboard (KPIs, charts), review screen (per-test notes, return/approve), admin pages, impact simulator.
- [x] Step 10 – Reports: bilingual HTML → PDF (Puppeteer) with QR + footer on every page, DOCX, SHA-256, public verify + upload check, revoke.
- [x] Step 11 (partial) – Responsive 1440 → 375 px verified (no horizontal scroll); helmet, CORS allow-list, bcrypt, rate limits; Dockerfiles + compose.
- [x] 2026-09-25 – Returned cases moved into My Cases (badge on the menu item); cards show tests left per case and a work-left summary.
- [x] 2026-09-25 – T01 error-vs-load chart with the ±MPE envelope (`mpeEnvelope` in the engine; Recharts on the web, SVG in the PDF).
- [x] 2026-09-25 – Ed25519 lab signature over {report no., verification ID, PDF SHA-256, time, key ID}; shown on the verify page; offline bundle + public key.
- [x] 2026-09-25 – CSV / Excel-paste import and CSV export on readings tables; CSV export of the report repository.
- [x] 2026-09-25 – T17 checklist moved into the rule packs (OIML 2006.1.1, IN 2026.07.03.1) with R 76-1 5.5 / Annex G software and data-storage items;
      the engine takes label, clause and "mandatory" from the pack. Cases evaluated earlier stay locked to their old version.
- [x] 2026-09-25 – Lab In-charge role (sample receipt, assign / reassign, workload dashboard); senior engineer reviews test by test
      (approve / send back, notes for FAIL / CONDITIONAL, approve-all-passing); approvals tied to reading + profile hashes;
      approved tests locked on return; unchanged-resubmit confirmation; signed-case revision with superseded reports.
      Existing cases upgraded in place by the seed (no data removed).
- [x] 2026-09-25 – PS SIH26035 saved in `docs/problem/problem.md` and checked line by line against the code.
- [x] 2026-09-25 – New tests from the PS gap check: T18 zero-setting range and accuracy (R76-1 4.5.1 / 4.5.2 / A.4.2) and
      T19 static temperatures (A.5.3.1), both profiles, 21 hand-worked golden tests; forms, demo data, report columns.
      Rule packs OIML 2006.1.2 and IN 2026.07.03.3 (Heading A 9(13)(i) read from the scanned gazette page).
- [x] 2026-09-25 – OIML R 76 is the default profile (PS wording); IN reports print the pack's list of differences from R 76.
- [x] 2026-09-25 – Report search by serial number; "Instrument history" (every report and revision of one model).
- [x] 2026-09-25 – Backend fails fast when the database is down (503, `/api/health` shows `db`); exits if the embedded MongoDB stops.
- [x] 2026-09-25 – Docker Compose keeps the lab signing key on a volume (`KEYS_DIR`), so earlier reports keep verifying after a rebuild.
- [x] 2026-09-25 – `docs/ARCHITECTURE.md`, `docs/CALCULATIONS.md`, `docs/DEPLOYMENT.md`.
- [x] 2026-09-25 – Standards status checked: R 76-1:2006 / R 76-2:2007 still current (revision at committee draft, Oct 2025);
      LM (General) Fifth Amendment Rules 2026 concern electricity meters, not NAWI.
- [x] 2026-09-26 – Proposed workflow (Lab In-Charge → Test Engineer → Senior Engineer/Authorized Signatory → report) cross-checked
      against the code: already the implemented `INCHARGE` → `ENGINEER` → `APPROVER` roles, one-for-one. `docs/ARCHITECTURE.md`
      §3 now states that mapping for reviewers.
- [x] 2026-09-26 – A case may be received unassigned (`assignedEngineer` optional) and picked up later from Assignments;
      `PUT /cases/:id/assign` logs `CASE_ASSIGNED` the first time and `CASE_REASSIGNED` after, and the Lab dashboard
      shows an "Unassigned" count.
- [x] 2026-09-26 – Every sub-page in every role now has a "← back" link to that role's home (`PageHeader`'s new `back` prop),
      matching the pattern the Approver's case list already used. Added 5 more demo Test Engineers (Arjun Mehta, Kavita
      Reddy, Sanjay Gupta, Neha Joshi, Vikram Singh) for workload/assignment testing.
- [x] 2026-09-27 – Public verify page redesigned (frontend only, same API): result chip in the banner, three check tiles
      (lab register, digital signature, your PDF copy), instrument and tamper-evidence cards, copy-fingerprint button,
      "how this check works" strip; verdict chip drops below the title on phones.
- [x] 2026-09-28 – Cleaner report tables: a test with rows of different kinds (T08, T09, T10, T18) prints one table per kind,
      so no column of dashes; reference rows read "Reference reading"; computed values rounded for display only
      (U to 2 significant figures, other computed masses to e/100); report ends with the standard "results relate only to the
      instrument tested" line instead of the verify paragraph. Seed lab profile no longer says "Demo".
- [x] 2026-09-28 – Typed-entry checks (warn only, value kept, verdict unaffected): indication not a multiple of d
      (R76-1 T.3.2.2; e_i of the range also accepted on multi-range instruments) and change-point load ΔL outside 0..e
      (R76-1 A.4.4.3). `shared/engine/src/entry.ts` + 22 golden tests (engine now 1,158); amber field + ⚠ with the
      clause in the reading forms.

## Next

- [ ] eSign / DSC (CCA-licensed certificate) path for the approver's personal signature, alongside the lab Ed25519 seal.

- [ ] Differential test against the Python prototype (`legacy/r76_engine.py` was not provided).
- [ ] Hardware rig doc (Arduino + HX711) and a WebSocket serial simulator.
- [ ] MinIO for files in production; backup script; `USER_GUIDE.md`, `DEMO.md`.
- [ ] RRSL to confirm the `TODO-VERIFY` items in the India rule pack (creep classes; Heading A 9(13)(i) "low temperature or 5 °C").
