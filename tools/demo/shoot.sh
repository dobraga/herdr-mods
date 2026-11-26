#!/usr/bin/env bash
# Take every mod's preview from the demo window (run.sh + populate.sh): put the window in the mod's state, shoot, crop.
# Usage: tools/demo/shoot.sh [mod...]   (default: all). Full-window shots go to $OUT for review before you trust them.
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
FH="${FH:-/dev/shm/fh}"
OUT="${OUT:-$FH/shots}"
export HC_SESSION=demo HERDR_APP_HOME="$FH/.config/herdr-app"
mkdir -p "$OUT"

act() { herdr-app 'do' "$@" > /dev/null; }
panel() { act layout.select --stack panel-body --child "$1"; act layout.show --id panel; sleep 2; }
snap() {
  herdr-app shot "$OUT/$1.png" > /dev/null
  uv run "$repo/tools/crop.py" "$1" "$OUT/$1.png" --dest "$repo" > /dev/null
  echo "ok $1"
}

all=(desktop-toast files-tabs changes-tabs prs-panel loadout tasks inbox tabs-folders space-folders agents-custom
  workspace-chrome-custom workspace-status-usage file-view file-picker new-tab settings-custom)
mods=("${@:-${all[@]}}")

for mod in "${mods[@]}"; do
  case "$mod" in
    desktop-toast)
      act space.new --name api-gateway --folder "$FH/web-app" --argv '["codex","blocked"]'; sleep 1; snap "$mod"
      act space.select --index 1 ;;
    files-tabs | changes-tabs | prs-panel | loadout | tasks | inbox)
      child="${mod%-tabs}"; panel "${child%-panel}"; snap "$mod" ;;
    tabs-folders | space-folders | agents-custom | workspace-chrome-custom | workspace-status-usage)
      panel files; snap "$mod" ;;
    file-view)
      act tab.new --name README.md --mod file-view --props \
        "{\"slotId\":\"demo-$(date +%s)\",\"kind\":\"file\",\"path\":\"README.md\",\"root\":\"$FH/acme-api\",\"name\":\"README.md\",\"preview\":false,\"updatedAt\":$(date +%s%3N)}"
      sleep 2; snap "$mod"; act tab.close ;;
    file-picker | new-tab | settings-custom)
      if [ "$mod" = settings-custom ]; then act app.settings; else act mod.open --name "$mod"; fi
      sleep 2; snap "$mod"; act overlay.close ;;
    *) echo "unknown mod $mod" >&2; exit 1 ;;
  esac
done
