#!/usr/bin/env bash
# Build dg-workbench-layout/ (the gallery layout) from setup/.
# Usage: tools/sync-layout.sh        (run it after changing setup/)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/dg-workbench-layout"
mkdir -p "$out/layouts"
cp "$root/setup/main-folders.json" "$out/layouts/dg-workbench-layout.json"
# the keys of the layout bind under its name
sed 's/"layout:main-folders"/"layout:dg-workbench-layout"/' "$root/setup/keys.json" > "$out/keys.json"
echo "dg-workbench-layout: layout and keys synced"
