import { describe, expect, it } from "vitest";
import { importRows, parseDelimited, parseNumber, templateHeader, toCsv } from "../lib/csv";
import type { Col } from "../lib/forms";

const cols: Col[] = [
  { key: "dir", label: "Dir.", type: "select", options: [{ value: "up", label: "↑ up" }, { value: "down", label: "↓ down" }] },
  { key: "L", label: "Load L", unit: "g", type: "number" },
  { key: "I", label: "Indication I", unit: "g", type: "number" },
  { key: "dL", label: "ΔL", unit: "g", type: "number" },
];

describe("parseDelimited", () => {
  it("comma, semicolon and tab (Excel paste)", () => {
    expect(parseDelimited("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseDelimited("a;b\r\n1,5;2")).toEqual([["a", "b"], ["1,5", "2"]]);
    expect(parseDelimited("a\tb\n1\t2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("quotes, escaped quotes, BOM and blank lines", () => {
    expect(parseDelimited('﻿x,y\n"a, b","say ""hi"""\n\n')).toEqual([["x", "y"], ["a, b", 'say "hi"']]);
    expect(parseDelimited('"multi\nline",2')).toEqual([["multi\nline", "2"]]);
  });
});

describe("parseNumber", () => {
  it.each([["1234.5", 1234.5], ["+0.2", 0.2], ["-3", -3], ["1,5", 1.5], ["60,000,000", 60000000], ["1 000", 1000], ["", null], ["abc", null]])("%s", (s, n) => {
    expect(parseNumber(s)).toBe(n);
  });
});

describe("importRows", () => {
  it("header by label with units, any column order", () => {
    const r = importRows(cols, "Indication I (g),Load L (g),Dir.\n1000.5,1000,up\n999.5,1000,↓ down");
    expect(r.problems).toEqual([]);
    expect(r.rows).toEqual([{ I: 1000.5, L: 1000, dir: "up" }, { I: 999.5, L: 1000, dir: "down" }]);
  });
  it("header by key and ΔL label", () => {
    expect(importRows(cols, "L\tI\tΔL\n10\t10\t0.5").rows).toEqual([{ L: 10, I: 10, dL: 0.5 }]);
    expect(importRows(cols, "dir,L,dL\nup,5,1").rows).toEqual([{ dir: "up", L: 5, dL: 1 }]);
  });
  it("no header: columns in the form's order", () => {
    expect(importRows(cols, "up,100,100.2,0\ndown,50,50,").rows).toEqual([{ dir: "up", L: 100, I: 100.2, dL: 0 }, { dir: "down", L: 50, I: 50 }]);
  });
  it("reports bad cells and unknown columns without losing good values", () => {
    const r = importRows(cols, "Dir.,Load L,Colour\nsideways,20,red");
    expect(r.rows).toEqual([{ L: 20 }]);
    expect(r.problems.join(" ")).toMatch(/Colour/);
    expect(r.problems.join(" ")).toMatch(/sideways.*up \/ down/);
  });
  it("empty input", () => {
    expect(importRows(cols, "  \n").problems).toEqual(["No data found."]);
  });
  it("round-trip: template header + exported CSV imports back to the same rows", () => {
    const data = [{ dir: "up", L: 0.001, I: 0.0012, dL: 0 }, { dir: "down", L: 60000000, I: 60000020, dL: 5 }];
    const csv = toCsv(templateHeader(cols), data.map((d) => cols.map((c) => (d as any)[c.key])));
    expect(importRows(cols, csv).rows).toEqual(data);
  });
});

describe("toCsv", () => {
  it("BOM, CRLF, quoting", () => {
    expect(toCsv(["a", "b"], [["x,y", 'q"'], [1.1, null]])).toBe('﻿a,b\r\n"x,y","q"""\r\n1.1,\r\n');
  });
});
