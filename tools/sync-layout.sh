#!/usr/bin/env bash
# Build dg-main-folders/ (the gallery layout) from setup/.
# Usage: tools/sync-layout.sh        (run it after changing setup/)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/dg-main-folders"
mkdir -p "$out/layouts"
cp "$root/setup/main-folders.json" "$out/layouts/dg-main-folders.json"
# the keys of the layout bind under its name
sed 's/"layout:main-folders"/"layout:dg-main-folders"/' "$root/setup/keys.json" > "$out/keys.json"
echo "dg-main-folders: layout and keys synced"
