# Plan: git diff viewer features in dg-file-view

Repo `herdr-mods`, branch `feat/file-view-git-diff` (off `main`). Scope: `dg-file-view` only, plus `NOTICE` and the root `README.md`. `dg-changes` is not touched.

## Context

`dg-file-view` diff mode (`mods/dg-file-view/main.js`) today:
- `load()` (l. 964-1020) runs `git diff [--cached | HEAD]` for one file. Which one depends on `slot.stage` (`"staged"`, `"changes"` or null), and `dg-changes` sets it. The code drops everything before the first `@@`, caps at 3000 lines and 1200 chars per line, and turns an untracked file into one `+` hunk.
- `diffRows()` (l. 54) turns lines into `{kind: "@"|"+"|"-"|" ", number, text}`. `colorRows()` (`syntax.js`) attaches `tokens`.
- `wrapDiffRow()` (l. 70) hard-wraps a row into lines of at most `cols` characters. `diffLayoutFor()` (l. 2309) caches `{cols, wrapped, sizes}` and bumps `diffVersion`. `v_virtual_list` (l. 2855) takes per-row heights (`lines * 20 + 2`). `diffRow()` (l. 2281) draws one row, tinted by the `diffTint` setting (0-30 %).
- The header has a Diff/File chip group (l. 2578). Keys are handled at l. 2389.

Upstream: `stefanoginella/herdr-powertools`, `packages/git-diff/mods/git-diff` @ `f1959ce`, Apache-2.0, Copyright 2026 Stefano Ginella. What we take from it:
- `diff.js`: `parse` with header capture, `added`, `hunkPatch`, `groups`, `gap`, `unified`, `split`, and `words` (an LCS over tokens, `null` when under 30 % in common).
- `git-guard.js`: `probe`/`guard` (refuses while a rebase or merge is under way, or after the branch or HEAD moved).
- `main.js`: `expand` (`git cat-file blob <old> | awk` for a line range, 80 lines per step, 640 at most), `stageHunk` (re-read the diff and compare it with the one shown, then `printf | git apply --cached [--reverse]` via `sh -c`, because exec has no stdin), `layout()` Auto, and the `S`/`W` keys.

Not taken: `review.js` and `notes.js` (branch review), the file list, J/K, Viewed, the file picker (second plan), and upstream `syntax.js` (ours is richer).

## Design decisions

1. **New pure modules, no imports from `herdr`, all testable with node**. `main.js` only wires them in.
   - `diff-model.js` (ported `diff.js`):
     - `parse(text, {capture})` returns `{header, hunks, binary, cut, oldBlob, newFile, deletedFile}`. Line objects are `{kind, text, original?}`. It keeps the current caps (3000 lines, 1200 chars + "… (line truncated)").
     - `added(text)`, `hunkPatch(parsed, i)`, `gaps`, `unified(d, expanded)`, `split(d, expanded)`.
     - Hunk header rows keep `kind: "@"`, so `colorRows()` (which resets comment state on `"@"`) keeps working unchanged.
     - Rows hold references to the shared line objects. Tokens and word marks are computed once per line and reused by both layouts.
   - `diff-words.js`: `words(text, other)` (ported), plus `markTokens(tokens, marks)`. `markTokens` cuts `{kind, text}` tokens at mark boundaries and sets `marked: true`. A per-file budget (`WORDS = 6e6`, from upstream) skips the rest.
   - `diff-layout.js`:
     - `wrapDiffRow` moves here and carries `marked` on each segment.
     - `layoutUnified(rows, cols)` and `layoutSplit(rows, halfCols)` return `{wrapped, sizes}`. A split row's height is `max(leftLines, rightLines) * 20 + 2`, and the shorter side is padded with blank lines.
     - `pickLayout(mode, paneCols, doc)` gives Auto: Split when `doc` is not one-sided (new, deleted or untracked) and `halfCols >= min(widest, 80)`; Unified otherwise.
     - `colsFor(width, layout)`.
   - `git-guard.js` (ported): `probe(run)` and `guard(run, git, expect)` take an injected exec, so they are testable. It also exports `APPLY` (the `sh -c` script) and `applyArgs(patch, reverse)`.
2. **Word highlight**: a `marked` segment gets a background of `ansi2`/`ansi1` at `min(60, 3 × diffTint)` %. The row tint stays at `diffTint`. With no tokens, the text becomes one token, so marks still show.
3. **Split + hard wrap + virtual list**:
   - The `diffLayout` cache key becomes `(cols, rows, layout)`. Switching layout or width recomputes `sizes` and bumps `diffVersion`, and with it the list id, so the list never sees a sizes array of the wrong length.
   - `diffRow` becomes `unifiedRow` and `splitRow`. Each split half has its own number gutter and draws its own wrapped segments. An empty side gets a `raised` filler.
4. **Fold/expand**:
   - The `load()` diff call adds `--full-index --src-prefix=a/ --dst-prefix=b/ --no-renames --literal-pathspecs` and keeps the header, which `oldBlob` and `hunkPatch` need. User diff settings (noprefix, mnemonicPrefix) can no longer break it.
   - A gap row ("Show N of M unchanged lines" / "Hide") sits before each hunk and after the last one when the file is longer. Expansion is kept per hunk in `this.diffExpanded`.
   - A reload whose raw diff text is unchanged returns early, which keeps the expansion and scroll. The folder watch reloads often, so this matters.
   - `W` / a "Whole file" chip reruns the diff with `-U100000`. There are no gaps then, and no staging.
5. **Clicks**: a `v_virtual_list` renderer may not hold `on_click` (it throws). Gap and hunk rows act through `on_item_click` on the list; the item key is `${diffVersion}-${i}` and gets parsed back. So the whole hunk header row is the Stage button, as upstream.
6. **Stage/unstage hunk**:
   - Only when `slot.stage` is `"changes"` (Stage) or `"staged"` (Unstage, `--reverse`), not in whole-file mode, not for an untracked or cut file, and only where `hunkPatch` is non-null.
   - The `stage == null` view (`git diff HEAD`) mixes the index and the worktree, so it gets no button.
   - Before applying: `guard()`, then re-read the diff and require it to equal the raw text shown; otherwise "file changed, try again". A module-level `staging` Set gives one apply per checkout at a time. After that, `this.load()`.
   - The other `dg-changes` tab picks up the index change through its folder watch.
7. **Keys** (diff mode only, no modifiers): `s` toggles Split/Unified (S on Auto picks the opposite of what it shows), `w` toggles whole file. A chip group `Unified | Split | Auto` sits next to Diff/File. The layout mode is kept in `localStorage` (try/catch), defaulting to `auto`.
8. **Licence**:
   - Each ported file starts with `Adapted from herdr-powertools (github.com/stefanoginella/herdr-powertools, packages/git-diff, Apache-2.0, Copyright 2026 Stefano Ginella); changed: …`.
   - `NOTICE` gets a paragraph listing the ported files.
   - The root `README.md` and `dg-file-view/README.md` mention it.

## Risks

- **Split sizes vs the virtual list**: a stale `sizes` (wrong length or old cols) breaks scrolling. The fix is to key the cache on the layout and to bump `diffVersion` on every recompute (unit-tested in `diff-layout`).
- **Width measurement**: `viewport_size()` is 0 on the first frame, and Auto must not flip Split ↔ Unified while it settles. Decide only once width > 0, and fall back to Unified.
- **Index writes**: a wrong patch alters the user's index. Mitigations: `hunkPatch` refuses mode changes, binary, cut, conflict and non-`100644/100755` modes; the guard runs before applying; the raw diff must still match; there is an end-to-end test against a temp repo.
- **Remote checkouts** (`on` set): there is no folder watch, so the other stage tab stays stale until reloaded. This is accepted, and the README says so.
- **`dg-changes` compatibility**: the slot shape and `slotKey` stay unchanged, and `git diff --stat main -- dg-changes` must stay empty.
- **Performance**: word diff is O(n·m) per line pair, held down by the budget and `WORDS` (300 tokens). Expansion is capped at 640 lines.

## Task table

| # | task | effort | model | owns (files) | depends on | group |
|---|---|---|---|---|---|---|
| T1 | Port `diff-model.js` (parse with header/oldBlob/caps, added, hunkPatch, gaps, unified, split) + tests against real `git diff` in a temp repo, including `git apply --cached --check` of every `hunkPatch` (normal, CRLF, tab, no-newline-at-EOF, new/deleted file, mode change refused) | med | mid | `dg-file-view/mods/dg-file-view/diff-model.js`, `dg-file-view/tests/diff-model.test.mjs` | – | 1 |
| T2 | Port `words()` + `markTokens()` + budget into `diff-words.js` + tests (marks merge into syntax tokens, emoji, <30 % in common → null) | low | mid | `dg-file-view/mods/dg-file-view/diff-words.js`, `dg-file-view/tests/diff-words.test.mjs` | – | 1 |
| T3 | `diff-layout.js`: move `wrapDiffRow` (keep `marked`), `layoutUnified`, `layoutSplit` (max-height rows), `pickLayout` Auto rule, `colsFor` + tests (sizes length == rows length, wrap at cols, one-sided → unified) | med | mid | `dg-file-view/mods/dg-file-view/diff-layout.js`, `dg-file-view/tests/diff-layout.test.mjs` | – | 1 |
| T4 | Port `git-guard.js` with injected exec, `APPLY`, `applyArgs` + tests with a fake exec (rebase in progress, branch/HEAD moved, clean → null) | low | mid | `dg-file-view/mods/dg-file-view/git-guard.js`, `dg-file-view/tests/git-guard.test.mjs` | – | 1 |
| T5 | Wire unified mode on the new modules: `load()` keeps the header and adds flags, `added()` for fresh files, unchanged-text early return, `colorRows` on line objects, word marks, `unifiedRow` with stronger marked tint; delete the old `diffRows`/`wrapDiffRow` | high | mid | `dg-file-view/mods/dg-file-view/main.js` | T1, T2, T3 | 2 |
| T6 | Split layout: `splitRow`, layout-keyed `diffLayoutFor`, `Unified\|Split\|Auto` chips, `s` key, `localStorage` mode, Auto only after width > 0 | high | mid | `dg-file-view/mods/dg-file-view/main.js` | T5 | 3 |
| T7 | Fold/expand gaps (`cat-file` + awk, 80/step, 640 cap, Hide), `on_item_click` routing, `W` key + Whole file chip (`-U100000`) | high | mid | `dg-file-view/mods/dg-file-view/main.js` | T6 | 4 |
| T8 | Stage/unstage hunk: hunk-row action in `changes`/`staged` slots only, guard + raw-diff recheck, `staging` lock, `applyArgs`, error strip with dismiss, reload after apply | med | strong | `dg-file-view/mods/dg-file-view/main.js` | T7, T4 | 5 |
| T9 | Docs + licence: NOTICE paragraph, root README credit, `dg-file-view/README.md` Usage (Diff: words, S/Auto, gaps, W, Stage hunk, remote caveat), `RECIPE.md` (new modules, behaviour, Done-when items) | low | cheap | `NOTICE`, `README.md`, `dg-file-view/README.md`, `dg-file-view/RECIPE.md` | T8 | 6 |
| T10 | Verify: run every command in Verification, send failures to the owning task (read-only) | low | cheap | – | T1-T9 | 7 |

## Verification

All commands run from the repo root.

| command | owner on failure |
|---|---|
| `node --test dg-file-view/tests/*.test.mjs` | T1-T4 (by file) |
| `bun test dg-file-view/tests` (repo convention) | T1-T4 |
| `uv run --with pytest pytest dg-file-view/tests` (open-with regression) | T5 |
| `herdr-app check dg-file-view/mods/dg-file-view` (mod loads) | last main.js task that changed: T8 → T7 → T6 → T5 |
| `git diff --stat main -- dg-changes` prints nothing | T5 |
| `grep -l "herdr-powertools" NOTICE README.md dg-file-view/README.md dg-file-view/mods/dg-file-view/diff-model.js dg-file-view/mods/dg-file-view/diff-words.js dg-file-view/mods/dg-file-view/git-guard.js` lists all six | T9 (docs), T1/T2/T4 (headers) |

Ruff is not run: no Python file changes, and the tree already has 57 ruff findings.

**Validated by build/tests only, NOT tested live.** Manual checks in Herdr (after `herdr-app` reload):
1. In `dg-changes`, open a modified file from **Changes** and from **Staged**. Both tabs open as before (same tab reuse, Diff/File chips).
2. Edit one word in a long line. Only that word gets the strong tint, and the line still hard-wraps. Change `diffTint` in `dg-settings` and check that both tints follow.
3. Widen and narrow the pane. Auto switches between Split and Unified; `S` toggles; a new or untracked file stays Unified. Scroll a long split diff with wrapped lines: no overlap or gaps between rows.
4. Click "Show 80 of N unchanged lines" until all are shown, then Hide. Press `W`: the whole file shows with no gaps or stage buttons; `W` again goes back.
5. In Changes, click a hunk header: the hunk moves to Staged (`git diff --cached` shows it). In Staged, click it again to unstage. Start `git rebase -i` in a terminal and try again: you get an error and the index is unchanged.
6. Open the combined (`stage` null) diff and a remote (`on`) file. There is no stage button, and nothing breaks.

## Todo

- [ ] T1 diff-model.js + tests
- [ ] T2 diff-words.js + tests
- [ ] T3 diff-layout.js + tests
- [ ] T4 git-guard.js + tests
- [ ] T5 unified wiring + word highlight in main.js
- [ ] T6 split layout + S/Auto
- [ ] T7 fold/expand gaps + W/Whole file
- [ ] T8 stage/unstage hunk
- [ ] T9 NOTICE + READMEs + RECIPE
- [ ] T10 verify (all Verification commands pass)
- [ ] Manual Herdr checks 1-6 done by the user
