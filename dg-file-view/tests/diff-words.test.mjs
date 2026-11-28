import test from "node:test";
import assert from "node:assert/strict";
import { words, markTokens, newBudget, WORDS } from "../mods/dg-file-view/diff-words.js";

test("words marks only the changed word", () => {
  const t = "const total = price + tax;";
  assert.deepEqual(words(t, "const total = price + fee;"), [[22, 25]]);
  assert.equal(t.slice(22, 25), "tax");
});

test("identical or missing other gives null", () => {
  assert.equal(words("a b", "a b"), null);
  assert.equal(words("a b", null), null);
});

test("under 30% in common gives null", () => {
  assert.equal(words("alpha beta gamma", "one two three four"), null);
});

test("emoji stay whole", () => {
  const r = words("hi 😀 there", "hi 😎 there");
  assert.deepEqual(r, [[3, 5]]);
  const r2 = words("say 😀 now ok", "say 😀 later ok");
  assert.deepEqual(r2, [[7, 10]]);
});

test("budget: spent budget gives null, and is charged", () => {
  const b = newBudget(10);
  assert.equal(words("a b c d e f g", "a b c d e f h", b), null);
  const big = newBudget();
  assert.notEqual(words("let x = 1;", "let x = 2;", big), null);
  assert.ok(big.left < 6e6);
  assert.equal(words("x ".repeat(WORDS), "y ".repeat(WORDS)), null);
});

test("markTokens cuts syntax tokens at mark boundaries", () => {
  const toks = [{ kind: "kw", text: "const" }, { kind: "", text: " total = " }, { kind: "num", text: "12" }];
  const out = markTokens(toks, [[3, 8], [14, 15]]);
  assert.deepEqual(out, [
    { kind: "kw", text: "con" },
    { kind: "kw", text: "st", marked: true },
    { kind: "", text: " to", marked: true },
    { kind: "", text: "tal = " },
    { kind: "num", text: "1", marked: true },
    { kind: "num", text: "2" },
  ]);
  assert.equal(out.map((t) => t.text).join(""), "const total = 12");
  assert.equal(toks[0].text, "const");
});

test("markTokens without tokens makes one token; without marks returns input", () => {
  assert.deepEqual(markTokens([], [[1, 2]], "abc"), [
    { kind: "", text: "a" }, { kind: "", text: "b", marked: true }, { kind: "", text: "c" },
  ]);
  const toks = [{ kind: "", text: "x" }];
  assert.equal(markTokens(toks, null), toks);
});

test("markTokens keeps surrogate pairs whole when marks come from words()", () => {
  const text = "hi 😀 there", marks = words(text, "hi 😎 there");
  const out = markTokens([{ kind: "", text }], marks);
  assert.equal(out.find((t) => t.marked).text, "😀");
  assert.equal(out.map((t) => t.text).join(""), text);
});
