#!/usr/bin/env bash
# Launch Herdr against the fake home from setup.sh, isolated from your real data:
# HOME is fake (no real ~/.claude, ~/.config, git or gh credentials) and HC_SESSION gives it its own herdr-core.
set -euo pipefail
FH="${1:-/dev/shm/fh}"
python3 -I "$(dirname "$0")/usage_server.py" &
trap 'kill %1 2>/dev/null' EXIT
env -i HOME="$FH" HC_SESSION=demo HERDR_APP_HOME="$FH/.config/herdr-app" HERDR_TELEMETRY=0 \
  PATH="$FH/.local/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin" SHELL=/bin/zsh \
  DISPLAY="${DISPLAY:-}" WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-}" XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}" \
  XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}" DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-}" \
  herdr-app
