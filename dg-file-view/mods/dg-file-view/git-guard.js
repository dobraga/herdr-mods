// Adapted from herdr-powertools (github.com/stefanoginella/herdr-powertools, packages/git-diff, Apache-2.0, Copyright 2026 Stefano Ginella); changed: pure module, exec injected (probe/guard take `run`), added APPLY/applyArgs.
// Refuses to write while a rebase/merge/etc. is under way, or after the branch or a ref moved.
// `run(cmd, args)` resolves to {code, stdout, stderr} (the caller binds cwd and `on`).
// `git(args)` runs git in the checkout the same way.

const PROBE = 'top=$(git rev-parse --show-toplevel 2>/dev/null) || exit 3; dir=$(git rev-parse --absolute-git-dir) || exit 3; '
  + 'common=$(cd "$(git rev-parse --git-common-dir)" && pwd -P) || exit 3; printf "%s\\n%s\\n%s\\n" "$top" "$dir" "$common"; '
  + 'for f in rebase-merge rebase-apply MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD BISECT_LOG; do if [ -e "$dir/$f" ]; then echo "$f"; fi; done';
const UNDER_WAY = { "rebase-merge": "Rebase", "rebase-apply": "Rebase", MERGE_HEAD: "Merge", CHERRY_PICK_HEAD: "Cherry-pick", REVERT_HEAD: "Revert", BISECT_LOG: "Bisect" };

// The patch comes in as $1 (exec has no stdin); extra args (e.g. --reverse) follow.
export const APPLY = 'patch=$1; shift; printf "%s" "$patch" | git -c apply.ignoreWhitespace=no apply --cached --whitespace=nowarn "$@" -';

// Arguments for exec("sh", ...) that apply `patch` to the index. The patch is a plain argv
// element, never interpolated into the script, so it needs no quoting.
export function applyArgs(patch, reverse = false) {
  return ["-c", APPLY, "git-diff-apply", patch, ...(reverse ? ["--reverse"] : [])];
}

export async function probe(run) {
  const r = await run("sh", ["-c", PROBE, "git-probe"]);
  if (r.code !== 0) return null;
  const [root, dir, common, ...rest] = r.stdout.split("\n");
  if (!root) return null;
  return { root, dir, common, state: UNDER_WAY[rest.find((line) => UNDER_WAY[line])] ?? null };
}

// Returns null when it is safe to go on, else the reason. expect: {root?, branch?, refs?: [[name, sha]]}.
export async function guard(run, git, expect, checkOperation = true) {
  if (checkOperation) {
    const at = await probe(run);
    if (!at || (expect?.root && at.root !== expect.root)) return "This is no longer the same Git checkout";
    if (at.state) return `${at.state} in progress: finish or abort it in a terminal first`;
  }
  if (!expect) return null;
  if ("branch" in expect) {
    const head = await git(["symbolic-ref", "-q", "HEAD"]);
    const branch = head.code === 0 ? head.stdout.trim().replace(/^refs\/heads\//, "") : null;
    if (branch !== (expect.branch ?? null)) return `The branch changed (now ${branch ?? "no branch"}): nothing was done`;
  }
  for (const [name, sha] of expect.refs ?? []) {
    const now = await git(["rev-parse", "-q", "--verify", name]);
    const found = now.code === 0 ? now.stdout.trim() : null;
    if (found !== sha) return `${name} is not what it was a moment ago: nothing was done`;
  }
  return null;
}
