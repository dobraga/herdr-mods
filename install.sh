#!/usr/bin/env bash
# Install herdr-mods into Herdr: link the mods, and the herdr-tasks scheduler the Tasks panel needs.
#
#   ./install.sh                 every mod + herdr-tasks (when bun is installed)
#   ./install.sh dg-tasks dg-inbox   only these mods (herdr-tasks is installed when `dg-tasks` is among them)
#   ./install.sh --no-tasks      every mod, without the scheduler
#   ./install.sh --setup         also link our layout (dg-main-folders) and its keys, the setup the mods are built for
#   ./install.sh --uninstall     remove the links (and the herdr-tasks login service)
#
# Mods are symlinked, so `git pull` here updates them. HERDR_APP_HOME picks another Herdr home.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
tasks_dir="$root/tools/tasks"

main() {
  local want_tasks=1 want_setup=0 uninstall=0 names=()
  for arg in "$@"; do
    case "$arg" in
      --no-tasks) want_tasks=0 ;;
      --setup) want_setup=1 ;;
      --uninstall) uninstall=1 ;;
      -h | --help) sed -n '2,10p' "$0"; return 0 ;;
      *) names+=("$arg") ;;
    esac
  done
  [ "${#names[@]}" -gt 0 ] || mapfile -t names < <(list_mods)
  if [ "$uninstall" -eq 1 ]; then uninstall_all "${names[@]}"; return 0; fi

  for name in "${names[@]}"; do link_mod "$name"; done
  if [ "$want_tasks" -eq 1 ] && printf '%s\n' "${names[@]}" | grep -qx dg-tasks; then install_tasks; fi
  if [ "$want_setup" -eq 1 ]; then install_setup; fi
  echo "Done. Restart Herdr if it does not pick the mods up."
}

# Gallery layout: <name>/mods/<name>/ (+ RECIPE.md, preview.png) per mod
list_mods() {
  for dir in "$root"/*/mods/*/; do
    [ -f "${dir}mod.json" ] && basename "$dir"
  done | sort -u
}

link_mod() {
  local name="$1" src="$root/$1/mods/$1" dst="$home/mods/$1"
  [ -f "$src/mod.json" ] || { echo "no such mod: $name" >&2; return 1; }
  mkdir -p "$home/mods"
  if [ -e "$dst" ] && [ ! -L "$dst" ]; then
    local backup="$home/.backups/mods/$name.$(date +%Y%m%d%H%M%S)"
    mkdir -p "$(dirname "$backup")"
    mv "$dst" "$backup"
    echo "  backed up existing $dst -> $backup"
  fi
  ln -sfn "$src" "$dst"
  echo "  linked $name"
}

# Our shared layout and keys (setup/). The layout is linked (a real file of yours is backed up);
# keys are linked only when you have none, otherwise merge setup/keys.json by hand.
install_setup() {
  local layout="$home/layouts/dg-main-folders.json"
  mkdir -p "$home/layouts"
  if [ -e "$layout" ] && [ ! -L "$layout" ]; then
    local backup="$home/.backups/layouts/dg-main-folders.json.$(date +%Y%m%d%H%M%S)"
    mkdir -p "$(dirname "$backup")"
    mv "$layout" "$backup"
    echo "  backed up existing $layout -> $backup"
  fi
  ln -sfn "$root/dg-main-folders/layouts/dg-main-folders.json" "$layout"
  echo "  linked layout dg-main-folders (pick it in Settings > Look)"
  if [ ! -e "$home/keys.json" ]; then
    ln -s "$root/dg-main-folders/keys.json" "$home/keys.json"
    echo "  linked keys.json"
  else
    echo "  keys.json already exists: merge $root/dg-main-folders/keys.json by hand"
  fi
}

# The scheduler behind the Tasks panel: bun + a login service (systemd user unit / launchd agent).
install_tasks() {
  if ! command -v bun > /dev/null 2>&1; then
    echo "  herdr-tasks: bun not found. Install bun (https://bun.sh), then run ./install.sh dg-tasks again." >&2
    return 0
  fi
  mkdir -p "$HOME/.local/bin" "$HOME/.local/state/herdr/tasks"
  ln -sf "$tasks_dir/bin/herdr-tasks" "$HOME/.local/bin/herdr-tasks"
  HERDR_TASKS_BIN="$tasks_dir/bin/herdr-tasks" "$tasks_dir/bin/herdr-tasks" service install \
    || echo "  herdr-tasks: service install failed; start it by hand with: herdr-tasks daemon" >&2
  case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) echo "  add ~/.local/bin to PATH so the Tasks panel finds herdr-tasks" ;; esac
}

uninstall_all() {
  for name in "$@"; do
    [ -L "$home/mods/$name" ] && rm "$home/mods/$name" && echo "  unlinked $name"
  done
  if [ -L "$home/layouts/dg-main-folders.json" ]; then
    rm "$home/layouts/dg-main-folders.json" && echo "  unlinked layout dg-main-folders"
  fi
  # The scheduler goes only when the tasks mod does
  if printf '%s\n' "$@" | grep -qx dg-tasks && [ -x "$tasks_dir/bin/herdr-tasks" ] && command -v bun > /dev/null 2>&1; then
    "$tasks_dir/bin/herdr-tasks" service uninstall || true
    if [ -L "$HOME/.local/bin/herdr-tasks" ]; then rm "$HOME/.local/bin/herdr-tasks"; fi
  fi
}

main "$@"
