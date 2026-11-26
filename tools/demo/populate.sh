#!/usr/bin/env bash
# Fill the demo window (run.sh) with mock spaces, tabs and agents, and a folder config for the sidebar.
set -euo pipefail
FH="${1:-/dev/shm/fh}"
export HC_SESSION=demo HERDR_APP_HOME="$FH/.config/herdr-app"
do_() { herdr-app 'do' "$@" > /dev/null; }

do_ space.new --name acme-api --folder "$FH/acme-api"
do_ tab.new --name claude --folder "$FH/acme-api" --argv '["claude","working"]'
do_ tab.new --name pi --folder "$FH/acme-api" --argv '["pi","idle"]'
do_ space.new --name web-app --folder "$FH/web-app" --argv '["claude","blocked","ask"]'
do_ space.new --name docs-site --folder "$FH/docs-site" --argv '["claude","done"]'
sleep 3

# Group the spaces in one folder, so space-folders draws icons and colors like the real setup
herdr-app ls | python3 -I -c '
import json, sys, time
from pathlib import Path
ids = {s["name"]: s["id"] for s in json.load(sys.stdin)["spaces"]}
cfg = {
    "list": [{"id": "demo", "name": "Demo", "folded": False, "path": "", "match": "", "color": "ansi4"}],
    "of": {ids[n]: "demo" for n in ("acme-api", "web-app", "docs-site")},
    "profiles": [{"id": "personal", "name": "Personal"}, {"id": "work", "name": "Work"}],
    "spaceProfiles": {ids[n]: "personal" for n in ids},
    "at": int(time.time() * 1000),
}
Path(sys.argv[1]).write_text(json.dumps(cfg))
' "$FH/.config/herdr-space-folders.json"
do_ space.select --index 1
