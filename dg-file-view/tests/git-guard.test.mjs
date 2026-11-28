import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { probe, guard, APPLY, applyArgs } from "../mods/dg-file-view/git-guard.js";

const probeOut = (...flags) => ({ code: 0, stdout: ["/r", "/r/.git", "/r/.git", ...flags].join("\n") + "\n", stderr: "" });
const runWith = (r) => async () => r;
const gitWith = (map) => async (args) => map[args[0]] ?? { code: 1, stdout: "", stderr: "" };

test("probe: clean checkout has no state", async () => {
  assert.deepEqual(await probe(runWith(probeOut())), { root: "/r", dir: "/r/.git", common: "/r/.git", state: null });
});
test("probe: not a repo -> null", async () => {
  assert.equal(await probe(runWith({ code: 3, stdout: "", stderr: "" })), null);
});
test("guard: rebase in progress", async () => {
  for (const f of ["rebase-merge", "rebase-apply"]) {
    assert.match(await guard(runWith(probeOut(f)), gitWith({}), null), /Rebase in progress/);
  }
});
test("guard: merge in progress", async () => {
  assert.match(await guard(runWith(probeOut("MERGE_HEAD")), gitWith({}), null), /Merge in progress/);
});
test("guard: different checkout", async () => {
  assert.match(await guard(runWith(probeOut()), gitWith({}), { root: "/other" }), /no longer the same/);
  assert.match(await guard(runWith({ code: 3, stdout: "", stderr: "" }), gitWith({}), null), /no longer the same/);
});
test("guard: clean -> null", async () => {
  const git = gitWith({
    "symbolic-ref": { code: 0, stdout: "refs/heads/main\n" },
    "rev-parse": { code: 0, stdout: "abc\n" },
  });
  assert.equal(await guard(runWith(probeOut()), git, { root: "/r", branch: "main", refs: [["HEAD", "abc"]] }), null);
  assert.equal(await guard(runWith(probeOut()), git, null), null);
});
test("guard: branch moved", async () => {
  const git = gitWith({ "symbolic-ref": { code: 0, stdout: "refs/heads/dev\n" } });
  assert.match(await guard(runWith(probeOut()), git, { branch: "main" }), /branch changed \(now dev\)/);
  const detached = gitWith({});
  assert.match(await guard(runWith(probeOut()), detached, { branch: "main" }), /no branch/);
});
test("guard: HEAD moved", async () => {
  const git = gitWith({ "rev-parse": { code: 0, stdout: "def\n" } });
  assert.match(await guard(runWith(probeOut()), git, { refs: [["HEAD", "abc"]] }), /HEAD is not what it was/);
});
test("guard: checkOperation=false skips probe", async () => {
  const run = async () => { throw new Error("probe ran"); };
  assert.equal(await guard(run, gitWith({}), null, false), null);
});
test("applyArgs: reverse flag", () => {
  assert.deepEqual(applyArgs("p").slice(0, 4), ["-c", APPLY, "git-diff-apply", "p"]);
  assert.equal(applyArgs("p").length, 4);
  assert.deepEqual(applyArgs("p", true).slice(4), ["--reverse"]);
});
test("APPLY: patch with quotes/$/backticks reaches the pipe verbatim", () => {
  const patch = "it's \"q\" $HOME `id` $(id) \\n %s\n";
  const script = APPLY.replace(/\| git .*$/, "| cat");
  const [, s, name, p] = applyArgs(patch);
  assert.equal(s, APPLY);
  const r = spawnSync("sh", ["-c", script, name, p], { encoding: "utf8" });
  assert.equal(r.stdout, patch);
});
