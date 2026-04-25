# nucleo-mcp

MCP server for the [Nucleo](https://nucleoapp.com) icon library. Reads directly from Nucleo's local SQLite database and SVG files — the Nucleo app does not need to be running.

## Features

**Read-only (local SQLite)**
- `search_icons` — search by name/tag, filter by style (`glyph`, `colored`, `outline`, `outline-duo`, `glyph-duo`), group, or set
- `list_groups` — list icon families (UI, Core, Micro Bold, Sharp, Pixel)
- `list_sets` — list icon sets, optionally filtered by group
- `get_icon_svg` — get raw SVG content for an icon
- `export_icon_pdf` — export an icon to vector PDF via `rsvg-convert`

**Project management (Nucleo team sync API)**
- `list_projects` — list all projects/collections
- `create_project` — create a new project (syncs to both remote API and local DB)
- `add_icons_to_project` — add icons to a project
- `update_project` — update project title/colors

Project tools require a Nucleo Pro/Team account. The auth token is automatically decrypted from Nucleo's local `accountData.json`.

## Prerequisites

- [Bun](https://bun.sh) runtime
- [Nucleo](https://nucleoapp.com) desktop app installed (the local icon database must exist)
- `rsvg-convert` for PDF export (`brew install librsvg`)

## Setup

```bash
git clone https://github.com/Flo4604/nucleo-mcp.git
cd nucleo-mcp
bun install
```

### Claude Code

```bash
claude mcp add --transport stdio --scope user nucleo -- bun run /path/to/nucleo-mcp/src/index.ts
```

### Other MCP clients

The server uses stdio transport. Run it with:

```bash
bun run src/index.ts
```

## How it works

Nucleo stores its icon library in two places on disk:

| What | Where |
|------|-------|
| SQLite database | `~/Library/Application Support/Nucleo/icons/data.sqlite3` |
| SVG files | `~/Library/Application Support/Nucleo/icons/sets/{set_id}/{icon_id}.svg` |
| Encrypted account data | `~/Library/Application Support/Nucleo/storage/accountData.json` |

The server reads the SQLite database directly for search and browsing. For project management, it decrypts the account token and calls Nucleo's team sync API, then mirrors changes to the local database so the desktop app picks them up.

PDF export shells out to `rsvg-convert` to produce proper vector PDFs at the SVG's natural dimensions with a transparent background.

## License

MIT
