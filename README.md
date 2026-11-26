# herdr-mods

Mods for [Herdr](https://herdr.dev), each in its own folder under `mods/` with a `RECIPE.md` (a brief an agent can rebuild it from) and a `preview.png`.

Install one by asking your Herdr agent to add `herdr.dev/mods/dobraga/<name>`. It reads the recipe and every file first, and tells you if a mod reaches the network or runs programs.

Mods work together through shared state; each recipe lists what it assumes.
Eight are modified forks of Herdr's own mods (Apache-2.0, see [NOTICE](NOTICE)).

| Mod | What it is |
|---|---|
| `agents-custom` | A sidebar list of every running agent, grouped by space or sorted by urgency (Needs you, Done, Working, Idle). |
| `changes-tabs` | A Git changes sidebar for the active space. |
| `desktop-toast` | A replacement for Herdr's notification toast. |
| `file-picker` | A popup that drops from the top of the window (Ctrl+P) with a search box and a list of files in the active space's folder. |
| `files-tabs` | A side panel that lists the folder you are working in as a lazy file tree. |
| `file-view` | A tab that opens one file and shows it the right way: an editable code view with find, a rendered Markdown preview, an SVG/image viewer, an audio player with waveform, a video poster with a storyboard, a PDF page viewer with text search, a git diff view, or an "Open with" screen that lists desktop apps for files it cannot show. |
| `inbox` | One ranked list of everything that needs you, in a right-hand panel: agents that are blocked or finished, pull-request alerts, scheduled task runs, and "ask cards" that let you answer a waiting agent right from the list. |
| `loadout` | A side-panel inventory of everything an AI coding setup has configured for the folder you are working in: skills, MCP servers and installed plugins, across Claude, Antigravity, Codex and Gemini. |
| `new-menu-custom` | A small popup that opens from the "+" button in the tab bar. |
| `new-tab` | A small centered dialog that opens when you want a new tab. |
| `prs-panel` | A right-docked panel that lists your open GitHub and Bitbucket Cloud pull requests across profiles (for example Personal and Work). |
| `settings-custom` | A 900x640 modal dialog that replaces Herdr's native Settings with one that has a left nav and a scrolling body. |
| `space-folders` | The sidebar's list of spaces, rebuilt around folders and profiles. |
| `tabs-folders` | A top tab bar for Herdr's window. |
| `tasks` | A side panel for the folder you are working in. |
| `workspace-chrome-custom` | The thin strip at the top of the Herdr sidebar and the Settings / Add machine footer at the bottom of it. |
| `workspace-status-usage` | A status bar along the bottom of the window (a chrome-colored strip with a top border). |

License: Apache-2.0.

## Development

```sh
bun test tests/ mods/*/*.test.mjs mods/inbox/test/   # JS tests
uv run --with pytest pytest tests                     # Python tests
herdr-app check mods/<name>                           # load a mod once
uv run tools/crop.py <mod> shot.png                   # crop a full-window shot into the mod's preview.png
```
