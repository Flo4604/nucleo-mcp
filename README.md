# nucleo-mcp

A hosted MCP server for the [Nucleo](https://nucleoapp.com) icon library. It mirrors the
whole library from Nucleo's own API, keeps it current in the background, and serves it over
HTTP so any MCP client can reach it. No desktop app, no local database, no Mac in the loop.

## How it differs from v1

v1 read the Nucleo desktop app's SQLite file and SVG folder on your own machine over stdio.
v2 downloads the library straight from Nucleo, so it runs anywhere as a container.

| | v1 | v2 |
|---|---|---|
| Source of icons | local desktop app files | Nucleo's library API |
| Transport | stdio, one user | HTTP, many users |
| Requires a Mac | yes | no |
| Auth | none needed | each caller's own Nucleo credential |

## How the library sync works

Nucleo's desktop app downloads its library from an endpoint that needs nothing but an
account token, and every icon's SVG markup travels inside that payload. The server uses the
same route:

1. `GET https://nucleoapp.com/api/database-<family>/latest?token=<token>` returns a presigned
   archive URL and a `last_update` watermark. The URL expires in about two minutes.
2. The archive holds one `icons.json` with the family's sets, its icons, and the SVG markup.
3. If `last_update` is newer than the stored watermark, the server rewrites that family's rows
   in a single transaction.

The five families are `axis` (Nucleo UI), `core`, `micro` (Micro Bold), `sharp`, and `pixel` —
about 44,000 icons and 9MB of archives in total, which takes roughly ten seconds to seed.

Nucleo has no delta endpoint. Its `icons-*` route looks like one but returns the same full
archive regardless of the `last_update` you pass, so the server re-reads a family whole rather
than pretending to apply a diff.

The mirror is disposable. It rebuilds itself from Nucleo on boot, so the volume is a cache and
an empty one costs a few seconds of startup, not a restore.

## Authentication

Callers authenticate with their own Nucleo credential, and the server validates it against
Nucleo on first use:

```
Authorization: Bearer <nucleo-user-id>:<nucleo-token>
```

Validation calls `GET /api/users/<id>/teams?token=<token>`, which fails when the token is wrong
or the licence has lapsed. So access tracks a real Nucleo licence instead of a shared password,
and a lapsed account loses access on its own once the cached verdict expires (`AUTH_CACHE_MINUTES`,
default 60). Nothing but a hash of each credential is held in memory.

The project tools act on the caller's own account and team, using the caller's token — never the
server's. The server's own credential is used only to mirror the library.

To print your credential from a machine with Nucleo installed:

```bash
bun run credential          # prints <id>:<token> for a client
bun run credential --env    # prints NUCLEO_USER_ID / NUCLEO_TOKEN for the server
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `NUCLEO_USER_ID` | required | Account the server mirrors the library with |
| `NUCLEO_TOKEN` | required | Token for that account |
| `PORT` | `8080` | Listen port |
| `DATA_DIR` | `/data` | Where the SQLite mirror lives |
| `DB_PATH` | `$DATA_DIR/nucleo.db` | Override the database path |
| `SYNC_INTERVAL_MINUTES` | `360` | How often to re-check Nucleo |
| `AUTH_CACHE_MINUTES` | `60` | How long a validated credential stays trusted |

## Running it

```bash
docker build -t nucleo-mcp .
docker run -p 8080:8080 -v nucleo-data:/data \
  -e NUCLEO_USER_ID=... -e NUCLEO_TOKEN=... nucleo-mcp
```

`GET /health` reports `200` once at least one family is mirrored and `503` while seeding, which
makes it usable as a readiness probe. `POST /mcp` is the MCP endpoint.

Locally on macOS, `bun run scripts/dev.ts` boots the server using the Nucleo credentials already
on the machine, so you do not have to put a token in your shell.

## Connecting a client

```bash
claude mcp add --transport http nucleo https://your-host/mcp \
  --header "Authorization: Bearer <nucleo-user-id>:<nucleo-token>"
```

## Tools

**Library, read-only**
- `search_icons` — search by name or tag; filter by `style` (`glyph`, `outline`, `outline-duo`,
  `glyph-duo`), `group`, or `set_id`. Exact name matches rank above prefixes above tag hits.
- `list_groups` — the families held, with icon counts and last sync time
- `list_sets` — sets, with icon counts, optionally for one family
- `get_icon_svg` — full SVG markup, with an optional `color`
- `export_icon_pdf` — vector PDF, base64-encoded, rendered by `rsvg-convert`

**Projects, on the caller's account**
- `list_projects`, `create_project`, `add_icons_to_project`, `update_project`

Project tools need a Nucleo Pro or Team plan, since they call the team sync service.

## Notes

The stored markup has no `<svg>` wrapper; the desktop app builds one at render time and so does
this server, reproducing its `nc-icon-wrapper` group. The `color` argument sets that group's
`fill`, so it recolors fills but not strokes that carry their own `stroke` attribute.

An icon belongs to zero or more sets, and the same name exists once per style and size within a
family, so a search for a common word legitimately returns several distinct icons that differ
only by `style`, `size`, and `group`.

## Licensing

Icon data is licensed from Nucleo. Keep the endpoint authenticated: an open one republishes a
commercial library. Caller validation is the mechanism, so do not disable it.

## License

MIT for this server's code. The icons are not covered by it.
