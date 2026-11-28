// Tests for diff-model.js against real `git diff` output in a temp repo.
// Run: node --test dg-file-view/tests/diff-model.test.mjs   (or: bun test dg-file-view/tests)
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, chmodSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse, added, hunkPatch, gaps, unified, split, widest, untab, MOST, LONG, TRUNCATED } from "../mods/dg-file-view/diff-model.js";

let dir;
const git = (args, input) => execFileSync("git", args, { cwd: dir, input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
const FLAGS = ["--full-index", "--src-prefix=a/", "--dst-prefix=b/", "--no-renames"];
// --literal-pathspecs is a global option: `git --literal-pathspecs diff ...`.
const G = ["--literal-pathspecs"];
const diff = (file, extra = []) => git([...G, "diff", ...FLAGS, ...extra, "--", file]);
const write = (file, text) => writeFileSync(join(dir, file), text);
const commit = (msg) => { git(["add", "-A"]); git(["commit", "-qm", msg]); };
const nums = (n, f = (i) => `line ${i}`) => Array.from({ length: n }, (_, i) => f(i + 1)).join("\n") + "\n";

// Every hunk's patch must apply to the index; returns the patches.
function checkAll(parsed, extraArgs = []) {
  const out = [];
  parsed.hunks.forEach((_, i) => {
    const patch = hunkPatch(parsed, i);
    assert.ok(patch, `hunk ${i} has a patch`);
    git(["apply", "--cached", "--check", ...extraArgs], patch);
    out.push(patch);
  });
  return out;
}

before(() => {
  dir = mkdtempSync(join(tmpdir(), "diff-model-"));
  git(["init", "-q"]);
  git(["config", "user.email", "t@t"]);
  git(["config", "user.name", "t"]);
  git(["config", "core.autocrlf", "false"]);
  git(["config", "commit.gpgsign", "false"]);
});
after(() => rmSync(dir, { recursive: true, force: true }));

describe("parse + hunkPatch against real git", () => {
  test("normal file with two hunks", () => {
    write("n.txt", nums(60));
    commit("n");
    write("n.txt", nums(60).replace("line 3\n", "THREE\n").replace("line 50\n", "FIFTY\nextra\n"));
    const p = parse(diff("n.txt"));
    assert.equal(p.hunks.length, 2);
    assert.ok(p.header[0].startsWith("diff --git a/n.txt b/n.txt"));
    assert.match(p.oldBlob, /^[0-9a-f]{40}$/);
    assert.equal(p.newFile, false);
    assert.equal(p.deletedFile, false);
    const patches = checkAll(p);
    assert.ok(patches[0].includes("-line 3") && !patches[0].includes("FIFTY"));
    assert.ok(patches[1].includes("+extra") && !patches[1].includes("THREE"));
    // Really stage one hunk and see only it in the index, then take it out again.
    git(["apply", "--cached"], patches[0]);
    assert.match(git(["diff", "--cached", "--", "n.txt"]), /\+THREE/);
    assert.doesNotMatch(git(["diff", "--cached", "--", "n.txt"]), /FIFTY/);
    const staged = parse(git([...G, "diff", "--cached", ...FLAGS, "--", "n.txt"]));
    git(["apply", "--cached", "--reverse"], hunkPatch(staged, 0));
    assert.equal(git(["diff", "--cached", "--", "n.txt"]), "");
  });

  test("CRLF file keeps the \\r in the patch and out of the text", () => {
    write("c.txt", nums(10).replace(/\n/g, "\r\n"));
    commit("c");
    write("c.txt", nums(10).replace("line 5\n", "FIVE\n").replace(/\n/g, "\r\n"));
    const p = parse(diff("c.txt"));
    assert.equal(p.hunks.length, 1);
    const minus = p.hunks[0].lines.find((l) => l.kind === "-");
    assert.equal(minus.text, "line 5");
    assert.equal(minus.original, "line 5");
    const [patch] = checkAll(p);
    assert.ok(patch.includes("-line 5\r\n"));
  });

  test("tab: shown padded, patch keeps the tab", () => {
    write("t.txt", "a\n\tindented\nb\nc\nd\n");
    commit("t");
    write("t.txt", "a\n\tindented too\nb\nc\nd\n");
    const p = parse(diff("t.txt"));
    const plus = p.hunks[0].lines.find((l) => l.kind === "+");
    assert.equal(plus.text, "    indented too");
    assert.equal(plus.original, "\tindented too");
    const [patch] = checkAll(p);
    assert.ok(patch.includes("+\tindented too"));
    assert.equal(untab("a\tb"), "a   b");
  });

  test("no newline at end of file", () => {
    write("e.txt", "one\ntwo\nthree");
    commit("e");
    write("e.txt", "one\ntwo\nthree\nfour");
    const p = parse(diff("e.txt"));
    assert.ok(p.hunks[0].patch.includes("\\ No newline at end of file"));
    // the marker is not a line
    assert.ok(p.hunks[0].lines.every((l) => !l.text.startsWith("\\")));
    const [patch] = checkAll(p);
    assert.ok(patch.includes("\\ No newline at end of file"));
  });

  test("deleted file (unstaged) applies, and unstaging a staged one too", () => {
    write("d.txt", "x\ny\nz\n");
    commit("d");
    unlinkSync(join(dir, "d.txt"));
    const p = parse(diff("d.txt"));
    assert.equal(p.deletedFile, true);
    assert.equal(p.newFile, false);
    const [patch] = checkAll(p);
    assert.ok(patch.includes("deleted file mode 100644"));
    git(["checkout", "--", "d.txt"]);
  });

  test("new file (staged) can be unstaged; a multi-hunk or mixed new file is refused", () => {
    write("new.txt", "a\nb\nc\n");
    git(["add", "new.txt"]);
    const p = parse(git([...G, "diff", "--cached", ...FLAGS, "--", "new.txt"]));
    assert.equal(p.newFile, true);
    assert.equal(p.oldBlob, null);
    checkAll(p, ["--reverse"]);
    git(["reset", "-q", "--", "new.txt"]);
    // fake a header that lies: two hunks in a new file
    const fake = { ...p, hunks: [p.hunks[0], p.hunks[0]] };
    assert.equal(hunkPatch(fake, 0), null);
    git(["rm", "-qf", "--cached", "--ignore-unmatch", "new.txt"]);
    unlinkSync(join(dir, "new.txt"));
  });

  test("mode change is refused (alone: no hunks; with an edit: null)", () => {
    write("m.sh", nums(10));
    commit("m");
    chmodSync(join(dir, "m.sh"), 0o755);
    const only = parse(diff("m.sh"));
    assert.equal(only.hunks.length, 0);
    assert.equal(hunkPatch(only, 0), null);
    write("m.sh", nums(10).replace("line 5\n", "FIVE\n"));
    const both = parse(diff("m.sh"));
    assert.equal(both.hunks.length, 1);
    assert.ok(both.header.some((l) => l.startsWith("old mode ")));
    assert.equal(hunkPatch(both, 0), null);
    chmodSync(join(dir, "m.sh"), 0o644);
    git(["checkout", "--", "m.sh"]);
  });

  test("other modes, binary, cut, conflict and out of range give null", () => {
    write("n2.txt", nums(10));
    commit("n2");
    write("n2.txt", nums(10).replace("line 5\n", "FIVE\n"));
    const p = parse(diff("n2.txt"));
    assert.ok(hunkPatch(p, 0));
    assert.equal(hunkPatch(p, 1), null);
    assert.equal(hunkPatch({ ...p, cut: true }, 0), null);
    assert.equal(hunkPatch({ ...p, binary: true }, 0), null);
    assert.equal(hunkPatch({ ...p, conflict: true }, 0), null);
    const sym = { ...p, header: p.header.map((l) => l.replace(/^index (\w+)\.\.(\w+) 100644$/, "index $1..$2 120000")) };
    assert.equal(hunkPatch(sym, 0), null);
    assert.equal(hunkPatch(parse(diff("n2.txt"), { capture: false }), 0), null);
  });

  test("binary file", () => {
    writeFileSync(join(dir, "b.bin"), Buffer.from([0, 1, 2, 3, 0, 255]));
    commit("b");
    writeFileSync(join(dir, "b.bin"), Buffer.from([0, 9, 2, 3, 0, 255, 0]));
    const p = parse(diff("b.bin"));
    assert.equal(p.binary, true);
    assert.equal(p.hunks.length, 0);
    assert.equal(hunkPatch(p, 0), null);
  });

  test("long lines are capped; long diffs are cut", () => {
    write("l.txt", "short\n");
    commit("l");
    write("l.txt", "x".repeat(LONG + 50) + "\n");
    const p = parse(diff("l.txt"));
    const plus = p.hunks[0].lines.find((l) => l.kind === "+");
    assert.equal(plus.text, "x".repeat(LONG) + TRUNCATED);
    assert.equal("original" in plus, false);
    assert.equal(hunkPatch(p, 0) !== null, true);
    write("l.txt", nums(MOST + 10));
    const big = parse(diff("l.txt"));
    assert.equal(big.cut, true);
    assert.equal(big.hunks[0].lines.length, MOST);
    assert.equal(hunkPatch(big, 0), null);
    git(["checkout", "--", "l.txt"]);
  });

  test("hunk without counts (one-line file) parses", () => {
    write("o.txt", "a\n");
    commit("o");
    write("o.txt", "b\n");
    const p = parse(diff("o.txt"));
    assert.equal(p.hunks[0].oldCount, 1);
    assert.equal(p.hunks[0].nextCount, 1);
    checkAll(p);
  });
});

describe("added", () => {
  test("untracked text is one + hunk", () => {
    const d = added("a\r\nb\n");
    assert.equal(d.newFile, true);
    assert.equal(d.hunks.length, 1);
    assert.deepEqual(d.hunks[0].lines.map((l) => l.text), ["a", "b"]);
    assert.equal(d.hunks[0].nextCount, 2);
    assert.equal(hunkPatch(d, 0), null);
    assert.deepEqual(added("").hunks, []);
    assert.equal(added(nums(MOST + 1)).cut, true);
  });
});

describe("rows", () => {
  const text = [
    "diff --git a/f b/f", "index 1111111..2222222 100644", "--- a/f", "+++ b/f",
    "@@ -5,5 +5,6 @@ fn a", " c1", "-old1", "-old2", "+new1", "+new2", "+new3", " c2",
    "@@ -20,2 +21,2 @@", " c3", "-gone", "+here",
  ].join("\n");
  const d = parse(text);

  test("gaps before each hunk, none at the end without total", () => {
    const g = gaps(d);
    assert.equal(g.length, 3);
    assert.deepEqual(g[0], { kind: "gap", hunk: 0, old: 1, next: 1, count: 4 });
    // hunk 0 ends at old 10 / new 11; hunk 1 starts at old 20 / new 21
    assert.deepEqual(g[1], { kind: "gap", hunk: 1, old: 10, next: 11, count: 10 });
    assert.equal(g[2], null);
    const t = gaps({ ...d, total: 30 });
    assert.deepEqual(t[2], { kind: "gap", hunk: 2, old: 22, next: 23, count: 8 });
  });

  test("unified: hunk header rows keep kind '@', lines share objects, pairs", () => {
    const rows = unified(d);
    const kinds = rows.map((r) => r.kind);
    assert.deepEqual(kinds, ["gap", "@", " ", "-", "-", "+", "+", "+", " ", "gap", "@", " ", "-", "+"]);
    const at = rows.find((r) => r.kind === "@");
    assert.equal(at.text, "@@ -5 +5 @@ fn a");
    assert.equal(at.hunk, 0);
    const minus = rows.filter((r) => r.kind === "-");
    assert.equal(minus[0].line, d.hunks[0].lines[1]);
    assert.equal(minus[0].pair, d.hunks[0].lines[3]);
    assert.equal(rows.filter((r) => r.kind === "+")[2].pair, null);
    assert.equal(rows.find((r) => r.kind === "+").next, 6);
    assert.equal(minus[1].old, 7);
    assert.equal(rows.filter((r) => r.kind === "gap")[0].action, "show");
  });

  test("unified with expanded lines: show/hide rows and numbering", () => {
    const rows = unified(d, new Map([[0, ["a", "b"]], [1, Array.from({ length: 10 }, (_, i) => `g${i}`)]]));
    assert.deepEqual(rows.slice(0, 5).map((r) => [r.kind, r.action ?? r.old]), [["gap", "show"], ["gap", "hide"], [" ", 1], [" ", 2], ["@", 5]]);
    // gap 1 fully shown: only Hide
    const g1 = rows.filter((r) => r.kind === "gap" && r.hunk === 1);
    assert.deepEqual(g1.map((r) => r.action), ["hide"]);
    assert.equal(rows.find((r) => r.text === "g0").old, 10);
    assert.equal(rows.find((r) => r.text === "g0").next, 11);
  });

  test("tail gap rows with total", () => {
    const rows = unified({ ...d, total: 30 });
    assert.equal(rows.at(-1).kind, "gap");
    assert.equal(rows.at(-1).hunk, 2);
    assert.equal(rows.at(-1).count, 8);
    const s = split({ ...d, total: 30 }, new Map([[2, ["t1"]]]));
    assert.equal(s.at(-1).left.text, "t1");
    assert.equal(s.at(-1).left.n, 22);
    assert.equal(s.at(-1).right.n, 23);
  });

  test("split: pairs deletions with additions, null where a side is empty", () => {
    const rows = split(d);
    const body = rows.filter((r) => r.kind === undefined);
    // c1, (old1|new1), (old2|new2), (-|new3), c2, c3, (gone|here)
    assert.equal(body.length, 7);
    assert.equal(body[1].left.text, "old1");
    assert.equal(body[1].right.text, "new1");
    assert.equal(body[1].left.pair, d.hunks[0].lines[3]);
    assert.equal(body[3].left, null);
    assert.equal(body[3].right.text, "new3");
    assert.equal(body[3].right.n, 8);
    assert.equal(body[0].left.line, body[0].right.line);
    assert.equal(rows.filter((r) => r.kind === "@").length, 2);
  });

  test("rows from a real diff cover every line of every hunk", () => {
    const real = parse(diff("n.txt"));
    const u = unified(real).filter((r) => [" ", "+", "-"].includes(r.kind));
    assert.equal(u.length, real.hunks.reduce((n, h) => n + h.lines.length, 0));
    const s = split(real).filter((r) => r.left !== undefined);
    const sides = s.flatMap((r) => [r.left, r.right]).filter((x) => x && x.kind !== " ").length;
    assert.equal(sides, u.filter((r) => r.kind !== " ").length);
  });

  test("widest", () => {
    assert.equal(widest(d), 4);
    assert.equal(widest({ hunks: [] }), 0);
  });
});
