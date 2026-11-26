#!/usr/bin/env bash
# Build a throwaway "fake home" with mock data, to take Herdr mod previews without showing real data.
#   tools/demo/setup.sh            -> /dev/shm/fh   (short path: control sockets have a length limit; no username in any path)
#   tools/demo/run.sh              -> launch Herdr against it, in its own herdr-core session
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
FH="${1:-/dev/shm/fh}"
real_home="$HOME"
rm -rf "$FH"
mkdir -p "$FH/.config/herdr-app/layouts" "$FH/.config/herdr-app/mods" "$FH/.local/bin" "$FH/.local/share"

# Herdr config: layout, keys, mods (a copy, so the demo can stub network helpers)
cp "$real_home/src/dotfiles/herdr-app/"{keys.json,settings.json} "$FH/.config/herdr-app/"
cp "$real_home/src/dotfiles/herdr-app/layouts/main-folders.json" "$FH/.config/herdr-app/layouts/"
cp -r "$repo"/mods/* "$FH/.config/herdr-app/mods/"
ln -s "$real_home/.local/share/fonts" "$FH/.local/share/fonts" 2>/dev/null || true

# Shell: neutral prompt, fake agent CLIs first on PATH
cat > "$FH/.zshenv" <<ZSH
export PATH="\$HOME/.local/bin:$real_home/.local/bin:/usr/local/bin:/usr/bin:/bin"
ZSH
echo "PROMPT='%F{blue}%~%f ❯ '" > "$FH/.zshrc"
# Fake agent CLIs: report a status through OSC 7501 (usage: claude working | codex blocked | pi idle | claude done)
for a in claude codex pi; do
  cat > "$FH/.local/bin/$a" <<'AGENT'
#!/bin/sh
app=$(basename "$0"); state=${1:-idle}
printf 'demo %s agent (%s)\n' "$app" "$state"
while true; do printf '\033]7501;state=%s:app=%s\033\\' "$state" "$app"; sleep 0.5; done
AGENT
  chmod +x "$FH/.local/bin/$a"
done

# Demo projects: a real git repo each, fake content, uncommitted changes in acme-api
git_demo() { git -c user.email=demo@example.com -c user.name=Demo "$@"; }
for p in acme-api web-app docs-site; do mkdir -p "$FH/$p"; git -C "$FH/$p" init -q -b main; done
cd "$FH/acme-api"
mkdir -p src docs tests assets .claude/skills/release-notes .claude/skills/db-migrate
cat > README.md <<'R'
# Acme API

A small demo service used for Herdr mod previews.

## Run

```sh
npm run dev
```

| Route | Purpose |
|---|---|
| `/health` | liveness check |
| `/greet/:name` | returns a greeting |
R
echo '{"name":"acme-api","version":"0.1.0","scripts":{"dev":"node src/index.js","test":"node --test","lint":"eslint src","build":"tsc"}}' > package.json
printf 'build:\n\techo building\ntest:\n\tnode --test\n' > Makefile
printf 'import { greet } from "./greet.js";\nconsole.log(greet("world"));\n' > src/index.js
printf 'export function greet(name) {\n  return `hello ${name}`;\n}\n' > src/greet.js
printf 'def greet(name: str) -> str:\n    return f"hello {name}"\n' > src/app.py
printf 'import test from "node:test";\nimport assert from "node:assert";\nimport { greet } from "../src/greet.js";\ntest("greet", () => assert.equal(greet("a"), "hello a"));\n' > tests/greet.test.js
printf '# Notes\n\n- first\n- second\n' > docs/notes.md
printf '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="28" fill="#4f8cff"/></svg>\n' > assets/logo.svg
printf -- '---\nname: release-notes\ndescription: Draft release notes from merged PRs\n---\nDraft notes.\n' > .claude/skills/release-notes/SKILL.md
printf -- '---\nname: db-migrate\ndescription: Create and check a database migration\n---\nMigrate.\n' > .claude/skills/db-migrate/SKILL.md
echo '{"mcpServers":{"postgres":{"command":"npx","args":["-y","pg-mcp"]},"github":{"command":"gh-mcp","args":[]}}}' > .mcp.json
git add -A
git_demo commit -qm "init acme-api"
git checkout -q -b feat/greeting
git remote add origin https://github.com/acme/acme-api.git
printf 'export function bye(name) {\n  return `bye ${name}`;\n}\n' >> src/greet.js
printf '\n## Deploy\n\nPush to main.\n' >> README.md
git add README.md
printf 'def bye(name: str) -> str:\n    return f"bye {name}"\n' >> src/app.py
printf '# Changelog\n\n- add bye()\n' > docs/CHANGELOG.md
for p in web-app docs-site; do
  cd "$FH/$p"
  echo "# $p" > README.md
  git add -A
  git_demo commit -qm init
  git remote add origin "https://github.com/acme/$p.git"
done

# First-run state: no welcome dialog, our layout, a big window
echo '{"layout":"main-folders","frame.welcomed":"finished","workspace.panels":["files","changes"]}' > "$FH/.config/herdr-app/shared.json"
echo '{"state":"maximized","bounds":[0.0,0.0,1920.0,1032.0],"display":"00000000-0000-0000-0000-000000000000"}' > "$FH/.config/herdr-app/window.json"
cp -rL "$real_home/.config/herdr-app/mods/new-chat" "$FH/.config/herdr-app/mods/"  # herdr-chat's launcher, which the layout uses

# Mock usage: fake `agy`, fake Claude credentials, and the Claude usage URL pointed at tools/demo/usage_server.py
cat > "$FH/.local/bin/agy" <<'A'
#!/bin/sh
cat <<'J'
{"command":{"data":{"groups":[{"name":"Gemini Models","buckets":[{"window":"5h","remaining_fraction":0.64},{"window":"weekly","remaining_fraction":0.81}]}]}}}
J
A
chmod +x "$FH/.local/bin/agy"
mkdir -p "$FH/.claude"
echo '{"claudeAiOauth":{"accessToken":"demo-token","subscriptionType":"pro","expiresAt":4102444800000}}' > "$FH/.claude/.credentials.json"
sed -i 's#https://api.anthropic.com/api/oauth/usage#http://127.0.0.1:8799/usage#' "$FH/.config/herdr-app/mods/workspace-status-usage/main.js"

# Mock PRs (GitHub profile "personal"): the helper's network call is stubbed in the demo copy
echo '{"profiles":{"personal":{"github":{"enabled":true,"account":"octocat"}}}}' > "$FH/.config/herdr-forge.json"
python3 -I "$repo/tools/demo/stub_forge.py" "$FH/.config/herdr-app/mods/prs-panel/forge-helper.py"
echo "fake home ready: $FH"
