#!/usr/bin/env bash
# Copy the shared setup (layout + keys) from the dotfiles repo, which owns them, into setup/.
# Usage: tools/sync-setup.sh [path-to-herdr-app-dir]   (default ~/src/dotfiles/herdr-app)
set -euo pipefail
src="${1:-$HOME/src/dotfiles/herdr-app}"
dst="$(cd "$(dirname "$0")/.." && pwd)/setup"
cp "$src/layouts/main-folders.json" "$dst/main-folders.json"
cp "$src/keys.json" "$dst/keys.json"
echo "synced setup/ from $src"
