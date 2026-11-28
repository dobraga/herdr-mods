// Pure diff layout: hard wrap, row heights, unified/split choice. No herdr imports (testable with node/bun).
// wrapDiffRow was moved here from main.js; segments now carry `marked` (word-diff mark) as well as `kind`.
export const DIFF_LINE_H = 20;
const rowHeight = (lines) => lines * DIFF_LINE_H + 2;

// Splits a row into display lines of at most `cols` characters (hard wrap, syntax tokens and marks kept).
export function wrapDiffRow(row, cols) {
  cols = Math.max(1, cols | 0);
  const toks = row.tokens ?? [{ kind: "", text: row.text ?? "" }];
  const lines = [[]];
  let used = 0;
  for (const tok of toks) {
    let rest = tok.text;
    while (rest.length) {
      if (used >= cols) { lines.push([]); used = 0; }
      const part = rest.slice(0, cols - used);
      lines[lines.length - 1].push({ kind: tok.kind, text: part, marked: !!tok.marked });
      used += part.length;
      rest = rest.slice(part.length);
    }
  }
  return lines;
}

// Unified: wrapped[i] is the array of display lines of rows[i]; hunk headers (kind "@") get 8 extra columns.
export function layoutUnified(rows, cols) {
  const wrapped = rows.map((row) => wrapDiffRow(row, row.kind === "@" ? cols + 8 : cols));
  return { wrapped, sizes: wrapped.map((w) => rowHeight(w.length)) };
}

// Split: rows are {left, right} (each a row-like object or null/undefined for an empty side). wrapped[i] is
// {left, right} with equal line counts (the shorter side padded with empty lines). A row without left/right
// (hunk header, gap) is full width: wrapped[i] = {left: lines, right: [], full: true}.
export function layoutSplit(rows, halfCols) {
  const wrapped = rows.map((row) => {
    if (!("left" in row) && !("right" in row)) return { left: wrapDiffRow(row, halfCols * 2 + 8), right: [], full: true };
    const left = row.left ? wrapDiffRow(row.left, halfCols) : [];
    const right = row.right ? wrapDiffRow(row.right, halfCols) : [];
    const n = Math.max(left.length, right.length, 1);
    while (left.length < n) left.push([]);
    while (right.length < n) right.push([]);
    return { left, right };
  });
  return { wrapped, sizes: wrapped.map((w) => rowHeight(Math.max(w.left.length, w.right.length, 1))) };
}

// Columns (characters) for a pane `width` px wide (monospace ~7.6 px per char). Width 0 (first frame) -> default.
export function colsFor(width, layout) {
  if (!(width > 0)) return layout === "split" ? 50 : 100;
  if (layout === "split") return Math.max(10, Math.floor(((width - 16) / 2 - 72) / 7.6));
  return Math.max(20, Math.floor((width - 92) / 7.6));
}

// mode: "unified" | "split" | "auto"; paneCols: colsFor(width, "unified") (0/undefined = not measured yet);
// doc: {newFile, deletedFile, untracked, widest} (widest = longest line in characters). Returns "unified" | "split".
export function pickLayout(mode, paneCols, doc = {}) {
  if (doc.newFile || doc.deletedFile || doc.untracked) return "unified";
  if (mode === "split") return "split";
  if (mode !== "auto" || !(paneCols > 0)) return "unified";
  const halfCols = colsFor(paneCols * 7.6 + 92, "split");
  return halfCols >= Math.min(doc.widest ?? 80, 80) ? "split" : "unified";
}
