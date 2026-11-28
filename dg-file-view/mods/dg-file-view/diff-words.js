// Adapted from herdr-powertools (github.com/stefanoginella/herdr-powertools, packages/git-diff, Apache-2.0, Copyright 2026 Stefano Ginella); changed: words() takes an optional per-file budget, plus markTokens() to merge marks into syntax tokens. No imports so plain node can load it.

// A line as words, the space between them, and every other character by itself (a whole
// one: `u` keeps the two halves of an emoji together).
const tokens = (text) => text.match(/[A-Za-z0-9_]+|\s+|[^A-Za-z0-9_\s]/gu) ?? [];
// Longer lines than this (in tokens) are not compared word by word: the table is the square of it.
export const WORDS = 300;
// Table cells one file may spend on word diffs; past it, lines are shown without marks.
export const BUDGET = 6e6;

// A fresh per-file budget: pass it to every words() call of that file.
export const newBudget = (cells = BUDGET) => ({ left: cells });

// Which parts of `text` are not in `other`: [[start, end]] (UTF-16 offsets), or null when the
// two lines have too little in common for that to say anything (then the whole line changed),
// or when `budget` ({left}) is spent.
export function words(text, other, budget) {
  if (other === null || other === undefined || text === other) return null;
  const a = tokens(text), b = tokens(other);
  if (!a.length || !b.length || a.length > WORDS || b.length > WORDS) return null;
  if (budget) {
    const cost = a.length * b.length;
    if (cost > budget.left) return null;
    budget.left -= cost;
  }
  // The longest run of tokens both lines have, in order.
  const w = b.length + 1, table = new Uint16Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * w + j] = a[i] === b[j] ? table[(i + 1) * w + j + 1] + 1 : Math.max(table[(i + 1) * w + j], table[i * w + j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0, at = 0, kept = 0, total = 0;
  const mark = (from, to) => {
    const last = out[out.length - 1];
    if (last && last[1] === from) last[1] = to; else out.push([from, to]);
  };
  while (i < a.length) {
    const len = a[i].length, blank = !a[i].trim();
    if (j < b.length && a[i] === b[j]) { if (!blank) { kept += len; total += len; } i++; j++; }
    else if (j < b.length && table[i * w + j + 1] >= table[(i + 1) * w + j]) { j++; continue; }
    else { mark(at, at + len); if (!blank) total += len; i++; }
    at += len;
  }
  // Too little in common: the marks would be most of the line, and say nothing.
  if (!total || kept / total < 0.3) return null;
  return out;
}

// Cuts {kind, text} tokens at the boundaries of `marks` ([[start, end]], sorted) and sets
// `marked: true` on the pieces inside one. With no tokens the text becomes one token, so
// marks still show. Returns new objects; the input is not changed.
export function markTokens(toks, marks, text = "") {
  if (!marks || !marks.length) return toks;
  const src = toks && toks.length ? toks : [{ kind: "", text }];
  const out = [];
  let at = 0, m = 0;
  for (const t of src) {
    const end = at + t.text.length;
    let pos = at;
    while (pos < end) {
      while (m < marks.length && marks[m][1] <= pos) m++;
      const inside = m < marks.length && marks[m][0] <= pos;
      let stop = end;
      if (inside) stop = Math.min(end, marks[m][1]);
      else if (m < marks.length) stop = Math.min(end, marks[m][0]);
      const piece = { ...t, text: t.text.slice(pos - at, stop - at) };
      if (inside) piece.marked = true;
      out.push(piece);
      pos = stop;
    }
    at = end;
  }
  return out;
}
