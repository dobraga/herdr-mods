import { test, expect } from "bun:test";
import { groupTabs, tabKey } from "../mods/dg-spaces/groups.js";

const MAIN = "/w/repo", WT = "/w/repo-wt", REPO = JSON.stringify([null, "/w/repo/.git"]);
const key = (cwd) => JSON.stringify([null, cwd]);
const info = (top, branch, linked) => ({ top, branch, linked, repo: REPO, ahead: 0, behind: 0 });
const git = {
  [key(MAIN)]: info(MAIN, "master", false),
  [key(WT)]: info(WT, "feat/x", true),
};
const space = (id, tabs, extra = {}) => ({ id, name: id, active: false, tabs, ...extra });
const row = (w, i, cwd, tree = null) => ({ w, i, g: git[key(cwd)], tree });
const pane = (tab, cwd, extra = {}) => ({ tab, cwd, ...extra });

test("a tab cd'd into a worktree with no space gets a virtual row after its checkout, named by branch", () => {
  const main = space("s1", [{ id: "t1" }, { id: "t2" }]);
  const ps = [pane("t1", MAIN), pane("t2", WT)];
  const out = groupTabs([row(main, 0, MAIN)], ps, git);
  expect(out.map((r) => r.w.name)).toEqual(["s1", "feat/x"]);
  expect(out[1].virtual).toBe(true);
  expect(out[1].tree).toBe("└─");
  expect(out[0].items.map((x) => x.tab.id)).toEqual(["t1"]);
  expect(out[1].items.map((x) => [x.w.id, x.tab.id])).toEqual([["s1", "t2"]]);
});

test("a space already on the worktree takes the tab, no virtual row", () => {
  const main = space("s1", [{ id: "t1" }, { id: "t2" }]);
  const wt = space("s2", [{ id: "t3" }]);
  const ps = [pane("t1", MAIN), pane("t2", WT), pane("t3", WT)];
  const out = groupTabs([row(main, 0, MAIN), row(wt, 1, WT, "└─")], ps, git);
  expect(out.some((r) => r.virtual)).toBe(false);
  expect(out[1].items.map((x) => x.tab.id)).toEqual(["t3", "t2"]);
  expect(out[1].items.find((x) => x.tab.id === "t2").w.id).toBe("s1");
});

test("the tab goes back when it leaves the worktree", () => {
  const main = space("s1", [{ id: "t1" }, { id: "t2" }]);
  const ps = [pane("t1", MAIN), pane("t2", MAIN)];
  const out = groupTabs([row(main, 0, MAIN)], ps, git);
  expect(out).toHaveLength(1);
  expect(out[0].items.map((x) => x.tab.id)).toEqual(["t1", "t2"]);
});

test("unknown git, no cwd, or a main checkout hidden: the tab stays", () => {
  const main = space("s1", [{ id: "t1" }, { id: "t2" }, { id: "t3" }]);
  const ps = [pane("t1", "/tmp/else"), pane("t2", null)];
  const out = groupTabs([row(main, 0, MAIN)], ps, git);
  expect(out).toHaveLength(1);
  expect(out[0].items).toHaveLength(3);
  // worktree tab but the repo has no checkout row in the list
  const lone = space("s9", [{ id: "t9" }]);
  const other = { ...row(lone, 0, "/tmp/else"), g: null };
  expect(groupTabs([other], [pane("t9", WT)], git)).toHaveLength(1);
});

test("all tabs moved: the host is emptied; virtual row status shows the most urgent tab", () => {
  const main = space("s1", [{ id: "t1", status: "working" }, { id: "t2", status: "blocked" }]);
  const anchor = space("s0", [{ id: "t0" }]);
  const ps = [pane("t0", MAIN), pane("t1", WT), pane("t2", WT)];
  const out = groupTabs([row(anchor, 0, MAIN), { ...row(main, 1, "/tmp/else"), g: info("/tmp/else", "x", false) }], ps, git);
  const host = out.find((r) => r.w.id === "s1");
  expect(host.emptied).toBe(true);
  expect(out.find((r) => r.virtual).w.status).toBe("blocked");
});

test("a tab of the worktree's own space stays; tree glyphs close the block", () => {
  const main = space("s1", [{ id: "t1" }]);
  const wt = space("s2", [{ id: "t3" }, { id: "t4" }]);
  const ps = [pane("t1", MAIN), pane("t3", WT), pane("t4", WT)];
  const out = groupTabs([row(main, 0, MAIN), row(wt, 1, WT, "└─")], ps, git);
  expect(out[1].items.map((x) => x.tab.id)).toEqual(["t3", "t4"]);
  expect(out[1].tree).toBe("└─");
});

test("tabKey prefers the agent pane's cwd and ignores panes without one", () => {
  const ps = [pane("t", "/a"), pane("t", "/b", { program: { agent: "claude" } }), pane("x", null)];
  expect(tabKey(null, "t", ps)).toBe(JSON.stringify([null, "/b"]));
  expect(tabKey("m", "x", ps)).toBeNull();
});

test("worktreesFirst puts each checkout's worktrees before it", async () => {
  const { worktreesFirst } = await import("../mods/dg-spaces/groups.js");
  const r = (id, tree = null) => ({ w: { id }, tree });
  expect(worktreesFirst([r("a"), r("w1", "├─"), r("w2", "└─"), r("b"), r("w3", "└─"), r("c")]).map((x) => x.w.id))
    .toEqual(["w1", "w2", "a", "w3", "b", "c"]);
});

test("a tab in a non-git folder other than its space's gets a row named by the folder", () => {
  const main = space("s1", [{ id: "t1" }, { id: "t2" }, { id: "t3" }]);
  const ps = [pane("t1", MAIN), pane("t2", "/tmp/else"), pane("t3", MAIN + "/src")];
  const g = { ...git, [key("/tmp/else")]: null, [key(MAIN + "/src")]: info(MAIN, "master", false) };
  const out = groupTabs([row(main, 0, MAIN)], ps, g);
  expect(out.map((r) => r.w.name)).toEqual(["s1", "else"]);
  expect(out[1].virtual).toBe(true);
  expect(out[1].g).toBeNull();
  expect(out[0].items.map((x) => x.tab.id)).toEqual(["t1", "t3"]);
  expect(out[1].items.map((x) => x.tab.id)).toEqual(["t2"]);
});

test("a subfolder of a non-git space's folder is the same place; unasked git keeps the tab", () => {
  const s = space("s1", [{ id: "t1" }, { id: "t2" }, { id: "t3" }]);
  const ps = [pane("t1", "/tmp/a"), pane("t2", "/tmp/a/b"), pane("t3", "/tmp/c")];
  const g = { [key("/tmp/a")]: null, [key("/tmp/a/b")]: null };
  const out = groupTabs([{ w: s, i: 0, g: null, tree: null }], ps, g);
  expect(out).toHaveLength(1);
  expect(out[0].items).toHaveLength(3);
});

test("a plain folder never joins an existing space: it gets its own row", () => {
  const main = space("s1", [{ id: "t1" }, { id: "t2" }]);
  const home = space("s2", [{ id: "t3" }]);
  const ps = [pane("t1", MAIN), pane("t2", "/h"), pane("t3", "/h")];
  const g = { ...git, [key("/h")]: info("/h", "main", false) };
  const out = groupTabs([row(main, 0, MAIN), { w: home, i: 1, g: g[key("/h")], tree: null }], ps, g);
  const v = out.find((r) => r.virtual);
  expect(v.w.name).toBe("h");
  expect(v.items.map((x) => x.tab.id)).toEqual(["t2"]);
  expect(out.find((r) => r.w.id === "s2").items.map((x) => x.tab.id)).toEqual(["t3"]);
  expect(out.map((r) => r.w.name)).toEqual(["s1", "h", "s2"]);
});

test("two spaces with a tab in the same plain folder each get their own row under themselves", () => {
  const a = space("a", [{ id: "t1" }, { id: "t2" }]);
  const b = space("b", [{ id: "t3" }, { id: "t4" }]);
  const ps = [pane("t1", MAIN), pane("t2", "/h"), pane("t3", "/tmp/x"), pane("t4", "/h")];
  const g = { ...git, [key("/h")]: null, [key("/tmp/x")]: null };
  const out = groupTabs([{ w: a, i: 0, g: git[key(MAIN)], tree: null }, { w: b, i: 1, g: null, tree: null }], ps, g);
  expect(out.map((r) => r.w.name)).toEqual(["a", "h", "b", "h"]);
  expect(out[1].items.map((x) => x.tab.id)).toEqual(["t2"]);
  expect(out[3].items.map((x) => x.tab.id)).toEqual(["t4"]);
});
