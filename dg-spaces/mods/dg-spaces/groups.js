// Tabs placed by their own cwd: a tab inside a linked worktree is listed under that
// worktree even when its space sits on the main checkout. Visual only; the tab stays
// in its space. Pure (no herdr imports) so it can be tested.

const URGENT = ["blocked", "done", "working"];

// The directory a tab is in: its agent's pane first, else any pane with one.
export const leadCwd = (tabId, ps) =>
  (ps.find((p) => p.tab === tabId && p.program?.agent && p.cwd) ?? ps.find((p) => p.tab === tabId && p.cwd))?.cwd ?? null;

// Same shape as where(): [machine, cwd], the key of the git cache.
export const tabKey = (machine, tabId, ps) => {
  const cwd = leadCwd(tabId, ps);
  return cwd ? JSON.stringify([machine ?? null, cwd]) : null;
};

// `rows`: ordered() rows ({ w, i, g, tree }), `git`: the cache ({ top, repo, linked, branch, ... }).
// Every row gets `items` ([{ w, tab }]: the tabs it lists, `w` being the tab's own space) and
// `emptied` (it had tabs and all moved away). A worktree with no space of its own gets a virtual
// row after its checkout's rows, named after its branch.
const baseName = (path) => path.replace(/\/+$/, "").split("/").pop() || path;

// Where a space lives: its checkout's top, else its first terminal's folder, else where it was made.
const homeOf = (r, ps) => {
  if (r.g?.top) return r.g.top;
  const tabs = new Set((r.w.tabs ?? []).map((t) => t.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || r.w.folder || null;
};

// A tab's own place: its git top, else its folder. Null while unknown (cwd missing or git not asked yet).
const placeOf = (machine, tab, ps, git) => {
  const key = tabKey(machine, tab.id, ps);
  if (!key || !(key in git)) return null;
  const info = git[key];
  return { info, top: info?.top ?? JSON.parse(key)[1] };
};

// One rule: a tab sits under the place of its own folder. Other than its space's own place (a subfolder
// of a non-git place counts as the same), it gets a row of its own right below, named by branch or folder.
export function groupTabs(rows, ps, git) {
  const out = rows.map((r) => ({ ...r, items: [] }));
  const groups = new Map(); // [machine, top] -> { info, machine, top, items, host }
  for (const r of out) {
    const home = homeOf(r, ps);
    for (const tab of r.w.tabs ?? []) {
      const at = placeOf(r.w.machine, tab, ps, git);
      const same = !at || !home || at.top === home || (!at.info && at.top.startsWith(home.replace(/\/+$/, "") + "/"));
      if (same) { r.items.push({ w: r.w, tab }); continue; }
      // A worktree's tabs gather from every space; a plain folder's stay with the space they live in.
      const gk = JSON.stringify([r.w.machine ?? null, at.top, at.info?.linked ? null : r.w.id]);
      if (!groups.has(gk)) groups.set(gk, { info: at.info, machine: r.w.machine ?? null, top: at.top, items: [], host: r });
      groups.get(gk).items.push({ w: r.w, tab });
    }
  }
  for (const [gk, group] of groups) {
    const own = !group.info?.linked ? null : out.find((r) => !r.virtual && (r.w.machine ?? null) === group.machine && homeOf(r, ps) === group.top);
    if (own) { own.items.push(...group.items); continue; }
    const tabs = group.items.map((x) => x.tab);
    const row = {
      virtual: true,
      i: -1,
      g: group.info ?? null,
      tree: "└─",
      items: group.items,
      w: {
        id: `wt:${gk}`,
        name: group.info?.linked ? group.info.branch : baseName(group.top),
        named: true,
        machine: group.machine,
        active: group.items.some((x) => x.w.active && x.tab.active),
        status: URGENT.find((s) => tabs.some((t) => t.status === s)) ?? null,
        tabs,
        top: group.top,
      },
    };
    // Under its repo's main checkout when listed, else under the space it came from.
    const main = group.info?.linked ? out.findIndex((r) => r.g?.repo === group.info.repo && !r.g.linked && !r.tree && !r.virtual) : -1;
    let at = main >= 0 ? main : out.indexOf(group.host);
    while (out[at + 1]?.tree) at++;
    out.splice(at + 1, 0, row);
  }
  out.forEach((r, n) => {
    if (r.tree) r.tree = out[n + 1]?.tree ? "├─" : "└─";
    r.emptied = (r.w.tabs ?? []).length > 0 && r.items.length === 0 && !r.virtual;
  });
  return out;
}

// A folder's rows with each checkout's worktrees before the checkout (they follow it in `rows`).
export function worktreesFirst(rows) {
  const out = [];
  let main = null, kids = [];
  const flush = () => { out.push(...kids); if (main) out.push(main); main = null; kids = []; };
  for (const r of rows) {
    if (r.tree) kids.push(r);
    else { flush(); main = r; }
  }
  flush();
  return out;
}
