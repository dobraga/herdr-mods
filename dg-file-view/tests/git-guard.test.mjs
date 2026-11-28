import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probe, guard, APPLY, applyArgs } from "../mods/dg-file-view/git-guard.js";
import { parse, hunkPatch } from "../mods/dg-file-view/diff-model.js";

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

// End to end, as main.js stageHunk does it: parse the `git diff` main.js runs, hunkPatch, guard, then
// exec("sh", applyArgs(patch, reverse)) in a temp repo. Stages hunk 1 only, then unstages it again.
test("stage and unstage one hunk in a temp repo through sh -c APPLY", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fv-stage-"));
  try {
    const sh = (cmd, args) => {
      const r = spawnSync(cmd, args, { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
      return { code: r.status, stdout: r.stdout, stderr: r.stderr };
    };
    const run = async (cmd, args) => sh(cmd, args);
    const git = async (args) => sh("git", args);
    const g = (...args) => { const r = sh("git", args); assert.equal(r.code, 0, r.stderr); return r.stdout; };
    g("init", "-q", "-b", "main");
    g("config", "user.email", "t@t"); g("config", "user.name", "t");
    mkdirSync(join(dir, "src"));
    const lines = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`);
    writeFileSync(join(dir, "src/a.txt"), lines.join("\n") + "\n");
    g("add", "."); g("commit", "-q", "-m", "init");
    const edited = [...lines]; edited[2] = "line 3 changed"; edited[35] = "line 36 changed";
    writeFileSync(join(dir, "src/a.txt"), edited.join("\n") + "\n");
    const args = (cached) => ["--literal-pathspecs", "diff", "--full-index", "--src-prefix=a/", "--dst-prefix=b/", "--no-renames",
      ...(cached ? ["--cached"] : []), "--no-ext-diff", "--no-textconv", "--no-color", "--", "src/a.txt"];
    const root = g("rev-parse", "--show-toplevel").trim();
    const expect = { root, branch: "main", refs: [["HEAD", g("rev-parse", "HEAD").trim()]] };

    const changes = parse(g(...args(false)));
    assert.equal(changes.hunks.length, 2);
    assert.equal(await guard(run, git, expect), null);
    let r = sh("sh", applyArgs(hunkPatch(changes, 1), false));
    assert.equal(r.code, 0, r.stderr);
    const staged = parse(g(...args(true)));
    assert.equal(staged.hunks.length, 1);
    assert.ok(staged.hunks[0].lines.some((l) => l.text === "line 36 changed"));
    assert.equal(parse(g(...args(false))).hunks.length, 1);

    r = sh("sh", applyArgs(hunkPatch(staged, 0), true));
    assert.equal(r.code, 0, r.stderr);
    assert.equal(g(...args(true)), "");
    assert.equal(parse(g(...args(false))).hunks.length, 2);

    // A stale patch (already staged once) fails with git's message and leaves the index alone.
    sh("sh", applyArgs(hunkPatch(changes, 1), false));
    r = sh("sh", applyArgs(hunkPatch(changes, 1), false));
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /patch does not apply|error/);

    // HEAD moved since load: guard refuses before anything is applied.
    g("commit", "-q", "-m", "partial");
    assert.match(await guard(run, git, expect), /HEAD is not what it was/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
