# herdr-mods

Mods for [Herdr](https://herdr.dev), each in its own folder with a `RECIPE.md` (a brief an agent can rebuild it from) and a `preview.png`.

## Layout

Gallery layout (herdr.dev/mods): every mod is a top-level folder with its files in `mods/<name>/`, plus `RECIPE.md` and `preview.png`.
A mod's tests live in its own folder (`<name>/tests/`). `tools/` (the Tasks scheduler, preview tooling) and `install.sh` are not mods.

```
inbox/
  mods/dg-inbox/      main.js, mod.json, ...
  tests/           the mod's tests
  RECIPE.md
  preview.png
tools/tasks/       herdr-tasks, the scheduler the `dg-tasks` mod needs
```

## Install

Ask your Herdr agent to add `herdr.dev/mods/dobraga/herdr-mods--<name>`: it reads the recipe and every file first, and tells you if a mod reaches the network or runs programs.

Or clone the repo and link the mods yourself:

```sh
git clone https://github.com/dobraga/herdr-mods.git ~/src/herdr-mods
cd ~/src/herdr-mods
./install.sh                 # every mod, plus the Tasks scheduler (needs bun)
./install.sh dg-inbox dg-prs # only some mods
./install.sh --no-tasks      # every mod, without the scheduler
./install.sh --uninstall     # remove the links and the scheduler service
```

Mods (`<name>/mods/<name>/`) are symlinked into `~/.config/herdr-app/mods/`, so `git pull` updates them. An existing real folder with the same name is moved to `~/.config/herdr-app/.backups/mods/`.

### The Tasks scheduler (`tools/tasks`)

The `dg-tasks` mod is only the panel. Scheduled tasks run in `herdr-tasks`, a small program in this repo (TypeScript on [bun](https://bun.sh)). `./install.sh` links it to `~/.local/bin/herdr-tasks` and installs it as a login service (systemd user unit on Linux, launchd agent on macOS). Without it the panel still lists and runs scripts, but shows "Scheduler stopped" and scheduled tasks never run.

```sh
herdr-tasks service status   # is the scheduler running?
herdr-tasks daemon           # run it by hand, if the service could not be installed
cd tools/tasks && bun test
```

Mods work together through shared state; each recipe lists what it assumes.
Eight are modified forks of Herdr's own mods (Apache-2.0, see [NOTICE](NOTICE)).

| Mod | What it is |
|---|---|
| `dg-agents` | A sidebar list of every running agent, grouped by space or sorted by urgency (Needs you, Done, Working, Idle). |
| `dg-changes` | A Git changes sidebar for the active space. |
| `dg-desktop-toast` | A replacement for Herdr's notification toast. |
| `dg-file-picker` | A popup that drops from the top of the window (Ctrl+P) with a search box and a list of files in the active space's folder. |
| `dg-files` | A side panel that lists the folder you are working in as a lazy file tree. |
| `dg-file-view` | A tab that opens one file and shows it the right way: an editable code view with find, a rendered Markdown preview, an SVG/image viewer, an audio player with waveform, a video poster with a storyboard, a PDF page viewer with text search, a git diff view, or an "Open with" screen that lists desktop apps for files it cannot show. |
| `dg-inbox` | One ranked list of everything that needs you, in a right-hand panel: agents that are blocked or finished, pull-request alerts, scheduled task runs, and "ask cards" that let you answer a waiting agent right from the list. |
| `dg-loadout` | A side-panel inventory of everything an AI coding setup has configured for the folder you are working in: skills, MCP servers and installed plugins, across Claude, Antigravity, Codex and Gemini. |
| `dg-new-menu` | A small popup that opens from the "+" button in the tab bar. |
| `dg-new-tab` | A small centered dialog that opens when you want a new tab. |
| `dg-prs` | A right-docked panel that lists your open GitHub and Bitbucket Cloud pull requests across profiles (for example Personal and Work). |
| `dg-settings` | A 900x640 modal dialog that replaces Herdr's native Settings with one that has a left nav and a scrolling body. |
| `dg-spaces` | The sidebar's list of spaces, rebuilt around folders and profiles. |
| `dg-tabs` | A top tab bar for Herdr's window. |
| `dg-tasks` | A side panel for the folder you are working in. |
| `dg-workspace-chrome` | The thin strip at the top of the Herdr sidebar and the Settings / Add machine footer at the bottom of it. |
| `dg-workspace-status` | A status bar along the bottom of the window (a chrome-colored strip with a top border). |

License: Apache-2.0.

## Keeping forks in sync

Eight mods are forks of mods shipped with Herdr (`forks.json`). After a Herdr update:

```sh
tools/check-forks.sh                 # lists forks whose upstream mod changed
# diff ~/.config/herdr-app/mods/<upstream>/main.js against <fork>/mods/<fork>/main.js, merge, then:
tools/check-forks.sh --sync <fork>   # or: --sync all
```

## Development

```sh
bun test */tests/                                    # JS tests (of every mod, or one: bun test inbox/tests)
uv run --with pytest pytest prs-panel/tests file-view/tests   # Python tests
herdr-app check <name>/mods/<name>                    # load a mod once
uv run tools/crop.py <mod> shot.png                   # crop a full-window shot into <name>/preview.png
```

### Previews without real data

`tools/demo/` runs Herdr in a throwaway fake home (`/dev/shm/fh`) and its own herdr-core session (`HC_SESSION=demo`), with mock projects, agents, PRs, skills and usage, so previews never show real data:

```sh
tools/demo/setup.sh      # build the fake home
tools/demo/run.sh &      # open the demo window
tools/demo/populate.sh   # mock spaces, tabs and agents
tools/demo/shoot.sh      # shoot and crop every preview (or: shoot.sh <mod>...)
```

