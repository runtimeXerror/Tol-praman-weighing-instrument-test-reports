# Calculation methodology

How TOLPRAMAN turns test observations into errors, limits and verdicts. Everything here lives in
`shared/engine` (pure TypeScript, the same code runs in the browser and on the server) and reads every
limit from a rule pack in `shared/rulepacks/packs/`. No AI or statistics model is used anywhere in this path.

## 1. Two evaluation profiles

| Profile | Rule pack | Version | Source |
|---|---|---|---|
| **OIML** (default) | `oiml_r76_rulepack.json` | 2006.1.2 | OIML R 76-1:2006 and R 76-2:2007 (still the current edition: the R 76 revision was at committee-draft stage as of October 2025) |
| **IN** | `in_lm_gr2011_sch7a_rulepack.json` | 2026.07.03.3 | Legal Metrology (General) Rules 2011, Seventh Schedule, Heading A, as amended up to G.S.R. 568(E) dt. 03-07-2026 |

The IN pack **extends** the OIML pack. It changes only what the gazette changes, and every changed value
carries its Heading A clause. The accuracy classes, the MPE table and the error formula are identical in both.
The IN pack also lists its differences from R 76 (`differences_from_base`), and every IN report prints
that list, so a reader never sees an unexplained contradiction.

A case is locked to the exact pack version (and its SHA-256) it was created with. A new pack version
applies only to new cases.

## 2. Units and instrument data

- All masses are grams (JS doubles). Results are cleaned to 1e-9 g to remove floating-point noise, and
  comparisons such as `|Ec| <= mpe` use a relative tolerance of 1e-9, so a value exactly on a limit passes.
- A load is also expressed as m = L / e.
- Multi-interval and multiple-range instruments: e at a load is the e_i of the partial range that contains
  it (R76-1 3.3 example, A.4.4.3 note). Near zero, e = e1 (the smallest e).
- Instrument validation (`validateInstrument`): accuracy class from e and n = Max / e (R76-1 Table 3 /
  Hdg A Table 17), Min (in e) for the class, scale-interval form 1, 2 or 5 × 10^k, and the multi-interval
  boundary rule (Table 4 / Table 18).

## 3. Error of a reading (R76-1 A.4.4.3, Hdg A 9(1))

```
E  = I + ½ e − ΔL − L      (changeover method: ΔL = extra load, in steps of 0.1 e, until the indication rises by e)
E  = I − L                  (when d ≤ 0.2 e: the indication is read directly, R76-1 3.5.3.2)
Ec = E − E0                 (E0 = error at or near zero, same formula)
```

## 4. Maximum permissible error (R76-1 3.5.1 Table 6 / Hdg A Table 20)

| Class | ±0.5 e | ±1.0 e | ±1.5 e |
|---|---|---|---|
| I | 0 ≤ m ≤ 50 000 | 50 000 < m ≤ 200 000 | m > 200 000 |
| II | 0 ≤ m ≤ 5 000 | 5 000 < m ≤ 20 000 | 20 000 < m ≤ 100 000 |
| III | 0 ≤ m ≤ 500 | 500 < m ≤ 2 000 | 2 000 < m ≤ 10 000 |
| IIII | 0 ≤ m ≤ 50 | 50 < m ≤ 200 | 200 < m ≤ 1 000 |

Band edges belong to the lower band (m = 500 in class III gives 0.5 e). In-service (inspection) MPE is
2 × this value (R76-1 3.5.2 / Hdg A 3(6)(ii)).

## 5. Decision rule and uncertainty

- **Simple** (OIML default): PASS if |Ec| ≤ mpe, else FAIL. U is reported for information.
- **Guarded** (lab option, ILAC-G8): PASS if |Ec| + U ≤ mpe; CONDITIONAL if |Ec| ≤ mpe < |Ec| + U; FAIL if |Ec| > mpe.
- U = k · √(u_w² + u_res² + u_rep²), k = 2; u_w = Σ U_i / 2 of the weights used (from their certificates,
  added linearly), u_res = 0.1 e / √3 (changeover method).
- Test weights: error (or, for E2 and better, uncertainty) ≤ 1/3 of the MPE at the applied load
  (R76-1 3.7.1 / Hdg A 9(2)(i)). The weight picker finds the fewest valid (not expired) weights for a load.
- Aggregation: a test is FAIL if any row fails, then NOT_TESTED if anything is missing, then CONDITIONAL,
  else PASS. The case verdict is the worst verdict over the applicable tests.

## 6. The tests

Which tests apply is decided by each test's `applies_if` in the pack (class, electronic or not, indication
type, tare device, liable to be tilted, Max). A test that does not apply is reported as NOT APPLICABLE with the reason.

| Test | Name | OIML R 76 | Heading A | Pass rule |
|---|---|---|---|---|
| T01 | Weighing performance | 3.5 / A.4.4 | Pt II 3(6) / 9(3) | \|Ec\| ≤ mpe for every load, up and down; at least 10 loads incl. Min, mpe change points, Max |
| T02 | Temperature effect on no-load indication | 3.9.2.3 / A.5.3.2 | 3(9)(ii)(c) | change ≤ 1 e per 1 °C (class I) or per 5 °C |
| T03 | Eccentricity | 3.6.2 / A.4.7 | 3(7)(ii) / 9(6) | \|Ec\| ≤ mpe at every position; load 1/3 (Max + T+) or per support |
| T04 | Discrimination | 3.8 / A.4.8 | 3(8) / 9(7) | digital: 1.4 d extra load changes the indication by d; analog: displacement ≥ 0.7 × extra load |
| T05 | Sensitivity (non-self-indicating) | 6.1 / A.4.9 | 6(1) | displacement ≥ required mm |
| T06 | Repeatability | 3.6.1 / A.4.10 | 3(7)(i) / 9(8) | Emax − Emin ≤ \|mpe\| and each \|E\| ≤ mpe |
| T07a | Return to zero | 3.9.4.2 / A.4.11.2 | 3(9)(iv)(b) | \|ΔE0\| ≤ 0.5 e1 |
| T07b | Creep | 3.9.4.1 / A.4.11.1 | 3(9)(iv)(a) / 9(9) | 30 min: ≤ 0.5 e and 15→30 min ≤ 0.2 e; otherwise 4 h: ≤ \|mpe\| |
| T08 | Stability of equilibrium | 4.4.2 / A.4.12 | Pt II 4 | printed value within 1 e; zero / tare E0 ≤ 0.25 e |
| T09 | Tilting | 3.9.1 / A.5.1 | 3(9)(i) | no load \|ΔI\| ≤ 2 e; loaded \|Ec\| ≤ mpe |
| T10 | Tare | 3.5.3.3 / 4.6.3 / A.4.6 | 3(6)(iii)(b) / 9(5) | \|Ec\| ≤ mpe on net loads; tare setting ≤ 0.25 e |
| T11 | Warm-up time | 5.3.5 / A.5.2 | 5(3)(v) / 9(12) | \|EL − E0\| ≤ \|mpe\| at 0 / 5 / 15 / 30 min |
| T12 | Power supply variations | 3.9.3 / A.5.4 | 3(9)(iii) | \|Ec\| ≤ mpe at the supply limits |
| T13 | Disturbances (EMC) | 5.3.4 / B.3 | 5(3)(iv) / Annexure A | \|I_with − I_without\| ≤ e, or the fault is detected |
| T14 | Damp heat, steady state | 5.3.2 / B.2 | 5(3)(ii) / Annexure A 2(2) | \|Ec\| ≤ mpe in all 3 phases |
| T15 | Span stability | 5.3.3 / B.4 | 5(3)(iii) / Annexure A 4 | \|Ec\| ≤ mpe; max difference ≤ max(0.5 e, 0.5 \|mpe\|) |
| T16 | Endurance | 3.9.4.3 / A.6 | 3(9)(iv)(c) / 9(15) | \|E_after − E_before\| ≤ \|mpe\| |
| T18 | Zero-setting: range and accuracy | 4.5.1 / 4.5.2 / A.4.2 | Pt II 4 | initial range ≤ 20 % Max; zero-setting + tracking ≤ 4 % Max; \|E0\| ≤ 0.25 e |
| T19 | Static temperatures | 3.9.2.1 / 3.9.2.2 / A.5.3.1 | 3(9)(ii) / 9(13)(i) | \|Ec\| ≤ mpe at reference, high, low (and 5 °C) and reference temperature |
| T17 | Examination checklist | 7 / 4 / A.1–A.3, Annex G | Pt II 4 / 7 | every mandatory item "yes"; any "no" fails |

### T18 zero-setting in detail
- Range (A.4.2.1): the initial zero-setting range is the positive plus the negative portion; the overall
  range covers the other zero-setting and zero-tracking devices. Both are compared as % of Max.
  OIML: the 4 % limit does not apply to class IIII unless used for commercial transactions, and an initial
  range above 20 % is accepted if the supplementary weighing test A.4.4.2 was done. Heading A has neither exception.
- Accuracy (A.4.2.3): after zero-setting, add weights until 0 changes to e: E0 = I + ½ e − ΔL. With automatic
  zero-setting the error at about 10 e is taken as the zero error. Limit 0.25 e; Heading A: 0.5 d with an
  auxiliary indicating device.

### T19 static temperatures in detail
- Temperature limits: those marked on the instrument, else −10 / +40 °C (3.9.2.1). The range must be at least
  5 / 15 / 30 °C for class I / II / III and IIII (3.9.2.2); a narrower range is reported.
- Required weighing tests, in order: reference (20 °C; class I: the mean of the limits), high, low, 5 °C
  (OIML: if low ≤ 0 °C; Heading A: if low < 10 °C) and the reference again. A test temperature within
  ±2 °C of the nominal counts.
- Absolute humidity ≤ 20 g/m³ (OIML: at the high temperature; Heading A: at every temperature), computed
  from T and RH with the Magnus formula (20 g/m³ = 39 % RH at 40 °C, the R 76-1 note).
- Each temperature needs at least 5 loads (A.4.4.1). A missing temperature, too few loads or too humid
  air make the test NOT TESTED.

## 7. Items to confirm with RRSL (`TODO-VERIFY` in the IN pack)

1. Heading A 3(9)(iv) names classes I, II, III for creep and return to zero; OIML names II, III, IIII.
   The engine follows the gazette.
2. Heading A 9(13)(i) reads "at the specified low temperature **or** at 5 °C if the specified low temperature
   is below 10 °C". The engine requires both (the stricter reading).

## 8. How correctness is checked

`npm test` runs 1,122 engine tests: golden cases worked out by hand from the clauses, every band edge of
Table 6 / Table 20 for both profiles, the MPE envelope, weight selection against brute force, and property tests.
