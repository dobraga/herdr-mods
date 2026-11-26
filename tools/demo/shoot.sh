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
  [ -n "${NOCROP:-}" ] || uv run "$repo/tools/crop.py" "$1" "$OUT/$1.png" --dest "$repo" > /dev/null
  echo "ok $1"
}

# dg-desktop-toast goes last: its toast stays on screen and would cover the next shots
all=(dg-files dg-changes dg-prs dg-loadout dg-tasks dg-inbox dg-tabs dg-spaces dg-agents
  dg-workspace-chrome dg-workspace-status dg-file-view dg-file-picker dg-new-tab dg-settings dg-new-menu dg-desktop-toast)
mods=("${@:-${all[@]}}")

for mod in "${mods[@]}"; do
  case "$mod" in
    dg-desktop-toast)
      act space.new --name api-gateway --folder "$FH/web-app" --argv '["codex","blocked"]'; sleep 1; snap "$mod"
      act space.select --index 1 ;;
    dg-files | dg-changes | dg-prs | dg-loadout | dg-tasks | dg-inbox)
      panel "${mod#dg-}"; [ "$mod" = dg-inbox ] && sleep "${INBOX_WAIT:-45}"  # PR alerts need a second sync
      snap "$mod" ;;
    dg-tabs | dg-spaces | dg-agents | dg-workspace-chrome | dg-workspace-status)
      panel files; snap "$mod" ;;
    dg-file-view)
      act tab.new --name README.md --mod dg-file-view --props \
        "{\"slotId\":\"demo-$(date +%s)\",\"kind\":\"file\",\"path\":\"README.md\",\"root\":\"$FH/acme-api\",\"name\":\"README.md\",\"preview\":false,\"updatedAt\":$(date +%s%3N)}"
      sleep 2; snap "$mod"; act tab.close ;;
    dg-file-picker | dg-new-tab | dg-settings)
      act mod.open --name "$mod"
      sleep 2; snap "$mod"; act overlay.close ;;
    dg-new-menu)  # opened by the tab bar's + as a popup; as a pane it shows the same menu
      act pane.split --direction right --mod dg-new-menu; sleep 2; snap "$mod"; act pane.close ;;
    *) echo "unknown mod $mod" >&2; exit 1 ;;
  esac
done
