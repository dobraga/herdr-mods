#!/usr/bin/env bash
# Build dg-main-folders/ (the gallery layout) from setup/ and the mods in this repo.
# The layout folder carries its own copy of every mod it needs, as the gallery asks.
# Usage: tools/sync-layout.sh        (run it after changing a mod, setup/ or the layout)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/dg-main-folders"
mkdir -p "$out/layouts" "$out/mods"
cp "$root/setup/main-folders.json" "$out/layouts/dg-main-folders.json"
# the keys of the layout bind under its name
sed 's/"layout:main-folders"/"layout:dg-main-folders"/' "$root/setup/keys.json" > "$out/keys.json"
for dir in "$root"/dg-*/mods/dg-*/; do
  name="$(basename "$dir")"
  [ -f "${dir}mod.json" ] || continue
  case "$dir" in "$out"/*) continue ;; esac  # not the copies in the layout folder
  rsync -a --delete \
    --exclude='.complexipy_cache' --exclude='.ruff_cache' --exclude='.pytest_cache' --exclude='__pycache__' \
    --exclude='*.pyc' --exclude='gpui-kit.d.ts' --exclude='jsconfig.json' \
    "$dir" "$out/mods/$name/"
done
echo "dg-main-folders: layout, keys and $(find "$out/mods" -mindepth 1 -maxdepth 1 -type d | wc -l) mods"
