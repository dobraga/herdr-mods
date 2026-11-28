// Adapted from herdr-powertools (github.com/stefanoginella/herdr-powertools, packages/git-diff,
// Apache-2.0, Copyright 2026 Stefano Ginella); changed: line caps kept from dg-file-view (3000
// lines, 1200 chars + "… (line truncated)"), rows reference shared line objects (so tokens and word
// marks are computed once per line for both layouts), hunk header rows keep kind "@", hunkPatch
// refuses any mode change, `words`/`changes`/numstat helpers left out.
//
// A diff from git as rows to draw. Pure: nothing here touches herdr, so it runs under `node`.

export const MOST = 3000, LONG = 1200, TRUNCATED = "… (line truncated)";

// Text draws a tab as nothing: each is padded to the next 4-column stop.
export const untab = (text) => (text.includes("\t") ? text.replace(/[^\t]*\t/g, (s) => s.slice(0, -1).padEnd((s.length - 1) - (s.length - 1) % 4 + 4)) : text);
export const showLine = (text) => untab(text.length > LONG ? text.slice(0, LONG) + TRUNCATED : text);

// A file's diff as git prints it: { header, hunks, binary, cut, conflict, oldBlob, newFile,
// deletedFile }. A hunk is { old, oldCount, next, nextCount, note, lines, patch? }, a line
// { kind: " " | "+" | "-", text (tabs padded, capped), original? (the raw text, when not capped) }.
// `capture` (default on) keeps the header lines and each hunk's raw patch lines, which hunkPatch
// needs. `cut`: the diff was longer than MOST lines.
export function parse(text, { capture = true } = {}) {
  const out = { header: [], hunks: [], binary: false, cut: false, conflict: false, oldBlob: null, newFile: false, deletedFile: false };
  let hunk = null, count = 0;
  for (const line of text.split("\n")) {
    // A file with Windows line ends: the \r is not something to show.
    const raw = line.endsWith("\r") ? line.slice(0, -1) : line;
    // A file in conflict is compared with both sides at once: not a diff this can draw.
    if (raw.startsWith("@@@")) { out.conflict = true; continue; }
    if (raw.startsWith("@@")) {
      const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/.exec(raw);
      if (!m) continue;
      hunk = { old: Number(m[1]), oldCount: Number(m[2] ?? 1), next: Number(m[3]), nextCount: Number(m[4] ?? 1), note: m[5], lines: [] };
      if (capture) hunk.patch = [line];
      out.hunks.push(hunk);
      continue;
    }
    if (!hunk) {
      if (raw.startsWith("Binary files ") || raw.startsWith("GIT binary patch")) out.binary = true;
      if (raw.startsWith("new file mode ")) out.newFile = true;
      if (raw.startsWith("deleted file mode ")) out.deletedFile = true;
      const index = /^index ([a-f0-9]+)\.\.[a-f0-9]+/.exec(raw);
      if (index && /[1-9a-f]/.test(index[1])) out.oldBlob = index[1];
      if (capture && line) out.header.push(line);
      continue;
    }
    const kind = raw[0];
    // "\ No newline at end of file" is about the line before it, and is not a line.
    if (line === "\\ No newline at end of file") hunk.patch?.push(line);
    if (kind !== " " && kind !== "+" && kind !== "-") continue;
    if (++count > MOST) { out.cut = true; break; }
    const body = raw.slice(1);
    hunk.patch?.push(line);
    hunk.lines.push({ kind, text: showLine(body), ...(body.length <= LONG ? { original: body } : {}) });
  }
  return out;
}

// A file git doesn't have yet (untracked), as one hunk of added lines.
export function added(text) {
  const all = text.replace(/\r?\n$/, "").split(/\r?\n/);
  const lines = all.slice(0, MOST).map((l) => ({ kind: "+", text: showLine(l), ...(l.length <= LONG ? { original: l } : {}) }));
  return {
    header: [], binary: false, conflict: false, oldBlob: null, newFile: true, deletedFile: false,
    hunks: text ? [{ old: 0, oldCount: 0, next: 1, nextCount: all.length, note: "", lines }] : [],
    cut: all.length > MOST,
  };
}

// The patch that stages (or, with `git apply --reverse`, unstages) one hunk, or null when that is
// not safe: cut, binary, conflict, any mode change, a mode other than 100644/100755, or a new or
// deleted file that has more than one hunk. It uses the text git printed, so tabs, CRLF and the
// missing-newline marker survive.
export function hunkPatch(parsed, index) {
  const { hunks, cut, binary, conflict, header } = parsed;
  const hunk = hunks[index];
  if (cut || binary || conflict || !hunk?.patch?.length || !header?.[0]?.startsWith("diff --git ")) return null;
  if (header.some((line) => /^(old|new) mode /.test(line))) return null;
  const modes = header.flatMap((line) => /^(?:(?:new file|deleted file) mode |index [a-f0-9]+\.\.[a-f0-9]+ )(\d{6})$/.exec(line)?.slice(1) ?? []);
  if (modes.some((mode) => mode !== "100644" && mode !== "100755")) return null;
  const fileMode = header.find((line) => /^(new|deleted) file mode /.test(line));
  if (fileMode && (hunks.length !== 1 || (hunk.oldCount && hunk.nextCount))) return null;
  const paths = header.filter((line) => line.startsWith("--- ") || line.startsWith("+++ "));
  if (paths.length !== 2) return null;
  const patch = [header[0], ...(fileMode ? [fileMode] : []), ...paths, ...hunk.patch].join("\n") + "\n";
  // exec has no stdin. A shell on the checkout's machine pipes this one argument to git.
  return patch.length <= 20000 && !/[\0�]/.test(patch) ? patch : null;
}

// The lines of a hunk in groups: runs of unchanged lines, and changes as the lines taken out with
// the lines put in their place. Each keeps the shared line object.
function groups(hunk) {
  const out = [];
  let old = hunk.old, next = hunk.next, i = 0;
  const lines = hunk.lines;
  while (i < lines.length) {
    if (lines[i].kind === " ") {
      out.push({ same: { line: lines[i], old: old++, next: next++ } });
      i++;
      continue;
    }
    const del = [], add = [];
    while (i < lines.length && lines[i].kind === "-") del.push({ line: lines[i++], n: old++ });
    while (i < lines.length && lines[i].kind === "+") add.push({ line: lines[i++], n: next++ });
    out.push({ del, add });
  }
  return out;
}

// The unchanged lines not shown before hunk `i` (i === hunks.length: after the last one, only
// when `total`, the line count of the new file, is known): { hunk, old, next, count } or null.
function gap(d, i) {
  const { hunks, total } = d;
  const before = hunks[i - 1];
  const old = before ? before.old + Math.max(1, before.oldCount) : 1;
  const next = before ? before.next + Math.max(1, before.nextCount) : 1;
  const hunk = hunks[i];
  const count = hunk
    ? Math.min(hunk.old + Number(hunk.oldCount === 0) - old, hunk.next + Number(hunk.nextCount === 0) - next)
    : (total ?? 0) - next + 1;
  return count > 0 ? { kind: "gap", hunk: i, old, next, count } : null;
}

// Every gap of a diff: [{ hunk, old, next, count } | null], one per hunk, and one more for the
// end of the file when `d.total` is set.
export function gaps(d) {
  const out = [];
  for (let i = 0; i <= d.hunks.length; i++) out.push(i === d.hunks.length && d.total == null ? null : gap(d, i));
  return out;
}

// `expanded`: Map hunk index -> the unchanged lines (strings) shown for that gap, from its start
// on, in order. A gap gets a "show" row while lines are left, and a "hide" row once any are shown.
function gapRows(rows, d, i, expanded, same) {
  const area = gap(d, i);
  if (!area) return;
  const lines = expanded?.get(i) ?? [];
  if (lines.length < area.count) rows.push({ ...area, action: "show", showing: lines.length });
  if (lines.length) rows.push({ ...area, action: "hide", showing: lines.length });
  lines.forEach((t, j) => rows.push(same({ line: { kind: " ", text: showLine(t), original: t }, old: area.old + j, next: area.next + j })));
}

const unifiedSame = ({ line, old, next }) => ({ kind: " ", old, next, text: line.text, line });
const splitSame = ({ line, old, next }) => ({ left: { n: old, kind: " ", text: line.text, line, pair: null }, right: { n: next, kind: " ", text: line.text, line, pair: null } });

function heading(rows, d, i, expanded, same) {
  gapRows(rows, d, i, expanded, same);
  const { old, next, note } = d.hunks[i];
  rows.push({ kind: "@", hunk: i, old, next, note, text: `@@ -${old} +${next} @@${note ? " " + note : ""}` });
}

// Rows, one under the other: gap rows { kind: "gap", hunk, old, next, count, action, showing },
// hunk header rows { kind: "@", hunk, old, next, note, text }, and lines { kind: " " | "+" | "-",
// old?, next?, text, line, pair } where `line` is the shared line object and `pair` the line this
// one replaced or was replaced by (null if none): what word marks compare it with.
export function unified(d, expanded) {
  const rows = [];
  d.hunks.forEach((hunk, i) => {
    heading(rows, d, i, expanded, unifiedSame);
    for (const g of groups(hunk)) {
      if (g.same) { rows.push(unifiedSame(g.same)); continue; }
      g.del.forEach((l, k) => rows.push({ kind: "-", old: l.n, text: l.line.text, line: l.line, pair: g.add[k]?.line ?? null }));
      g.add.forEach((l, k) => rows.push({ kind: "+", next: l.n, text: l.line.text, line: l.line, pair: g.del[k]?.line ?? null }));
    }
  });
  gapRows(rows, d, d.hunks.length, expanded, unifiedSame);
  return rows;
}

// Rows, side by side: gap and hunk header rows as above, and { left, right }, each
// { n, kind, text, line, pair } or null where that side has no line.
export function split(d, expanded) {
  const rows = [];
  d.hunks.forEach((hunk, i) => {
    heading(rows, d, i, expanded, splitSame);
    for (const g of groups(hunk)) {
      if (g.same) { rows.push(splitSame(g.same)); continue; }
      for (let k = 0; k < Math.max(g.del.length, g.add.length); k++) {
        const a = g.del[k], b = g.add[k];
        rows.push({
          left: a ? { n: a.n, kind: "-", text: a.line.text, line: a.line, pair: b?.line ?? null } : null,
          right: b ? { n: b.n, kind: "+", text: b.line.text, line: b.line, pair: a?.line ?? null } : null,
        });
      }
    }
  });
  gapRows(rows, d, d.hunks.length, expanded, splitSame);
  return rows;
}

// The longest line, in characters: how wide the rows must be.
export function widest(d) {
  let n = 0;
  for (const h of d.hunks) for (const l of h.lines) if (l.text.length > n) n = l.text.length;
  return n;
}
