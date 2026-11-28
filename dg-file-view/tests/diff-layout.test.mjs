import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapDiffRow, layoutUnified, layoutSplit, pickLayout, colsFor, DIFF_LINE_H } from "../mods/dg-file-view/diff-layout.js";

const row = (text, kind = " ") => ({ kind, text, number: 1 });

test("wrapDiffRow hard-wraps at cols and keeps kind/marked", () => {
  const r = { kind: "+", text: "abcdefgh", tokens: [{ kind: "keyword", text: "abcd" }, { kind: "", text: "efgh", marked: true }] };
  const lines = wrapDiffRow(r, 3);
  assert.deepEqual(lines.map((l) => l.map((s) => s.text).join("")), ["abc", "def", "gh"]);
  assert.ok(lines.every((l) => l.reduce((n, s) => n + s.text.length, 0) <= 3));
  assert.equal(lines[0][0].kind, "keyword");
  assert.equal(lines[1][0].marked, false);
  assert.equal(lines[1][1].marked, true);
  assert.equal(lines[2][0].marked, true);
});

test("wrapDiffRow without tokens and empty text", () => {
  assert.equal(wrapDiffRow(row("abcde"), 5).length, 1);
  assert.equal(wrapDiffRow(row("abcdef"), 5).length, 2);
  assert.deepEqual(wrapDiffRow(row(""), 5), [[]]);
});

test("layoutUnified: sizes length equals rows length, heights follow lines", () => {
  const rows = [row("a".repeat(25)), row("b"), { kind: "@", text: "@@ -1 +1 @@" }];
  const { wrapped, sizes } = layoutUnified(rows, 10);
  assert.equal(sizes.length, rows.length);
  assert.equal(wrapped.length, rows.length);
  assert.deepEqual(sizes, [3 * DIFF_LINE_H + 2, DIFF_LINE_H + 2, DIFF_LINE_H + 2]);
  assert.deepEqual(layoutUnified([], 10).sizes, []);
});

test("layoutUnified: header rows get 8 extra columns", () => {
  const { wrapped } = layoutUnified([{ kind: "@", text: "x".repeat(18) }], 10);
  assert.equal(wrapped[0].length, 1);
});

test("layoutSplit: height is max of sides, shorter side padded", () => {
  const rows = [
    { left: row("a".repeat(25), "-"), right: row("b", "+") },
    { left: null, right: row("c".repeat(11), "+") },
    { left: row("d"), right: row("e") },
    { kind: "@", text: "@@ -1 +1 @@" },
  ];
  const { wrapped, sizes } = layoutSplit(rows, 10);
  assert.equal(sizes.length, rows.length);
  assert.equal(wrapped.length, rows.length);
  assert.deepEqual(sizes, [62, 42, 22, 22]);
  assert.equal(wrapped[0].left.length, 3);
  assert.equal(wrapped[0].right.length, 3);
  assert.deepEqual(wrapped[0].right[2], []);
  assert.equal(wrapped[1].left.length, 2);
  assert.equal(wrapped[3].full, true);
});

test("colsFor: unified, split, unmeasured width", () => {
  assert.equal(colsFor(0, "unified"), 100);
  assert.equal(colsFor(0, "split"), 50);
  assert.equal(colsFor(92 + 760, "unified"), 100);
  assert.equal(colsFor(10, "unified"), 20);
  assert.equal(colsFor(10, "split"), 10);
  assert.ok(colsFor(1600, "split") < colsFor(1600, "unified"));
});

test("pickLayout: one-sided docs are always unified", () => {
  for (const flag of ["newFile", "deletedFile", "untracked"]) {
    assert.equal(pickLayout("auto", 400, { [flag]: true }), "unified");
    assert.equal(pickLayout("split", 400, { [flag]: true }), "unified");
  }
});

test("pickLayout: explicit modes and unmeasured width", () => {
  assert.equal(pickLayout("unified", 400, { widest: 10 }), "unified");
  assert.equal(pickLayout("split", 10, { widest: 200 }), "split");
  assert.equal(pickLayout("auto", 0, { widest: 10 }), "unified");
  assert.equal(pickLayout("auto", undefined, {}), "unified");
});

test("pickLayout: Auto thresholds", () => {
  // widest 200 -> needs 80 columns per half
  const need = (widest) => {
    let c = 1;
    while (pickLayout("auto", c, { widest }) !== "split") c++;
    return c;
  };
  const wide = need(200);
  assert.equal(pickLayout("auto", wide - 1, { widest: 200 }), "unified");
  assert.equal(pickLayout("auto", wide, { widest: 200 }), "split");
  // short documents need fewer columns
  assert.ok(need(30) < wide);
  // beyond 80 the widest no longer matters
  assert.equal(need(500), wide);
});
