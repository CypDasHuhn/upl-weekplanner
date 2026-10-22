# upl-weekplanner

Vue 3 + TypeScript week planner built on the [UniPlanner](../uniplanner) protocol. The planner reads and writes a
`.upl.json` container through the hosted UniPlanner server; the browser Core provides instant preview and validation.

- [idea.md](idea.md) — interaction design
- [docs/README.md](docs/README.md) — planning home and current state
- [docs/workflow.md](docs/workflow.md) — agent workflow
- [STYLEGUIDE.md](STYLEGUIDE.md) — code rules

## Layout

| Path              | Responsibility                                                        |
| ----------------- | --------------------------------------------------------------------- |
| `src/core/`       | UPL API adapter, server API, time/ISO duration parsing, lane geometry |
| `src/stores/`     | planner state, server sync, session state                             |
| `src/components/` | week grid, task sidebar                                               |
| `src/views/`      | login form                                                            |
| `scripts/`        | sync the compiled UniPlanner JS API                                   |
| `.opencode/`      | architect, coder, reviewer, scribe roles                              |
| `justfile`        | local command recipes                                                 |

## Run

```sh
npm install
npm run sync-core
UPL_SERVER_URL=http://127.0.0.1:8090 npm run dev
```

`sync-core` builds `uniplanner:js-api` and copies `uniplanner-core.js` into `public/`. `dev` and `build` run it first. The
Vite dev server proxies `/api`, `/auth`, and `/health` to `UPL_SERVER_URL`.

## Just

`just` wraps the npm scripts:

```sh
just install
just dev
just check
just build
```

`just verify` runs typecheck, tests, format check and the production build. `just clean` removes `dist/` and the copied core bundle.

## Verify

```sh
npm run typecheck
npm test
npm run build
```

## Data model

The document is a UniPlanner container:

```json
{
  "id": "week",
  "kind": "container",
  "std.name": "Week plan",
  "tasks": [
    {
      "id": "t1",
      "std.name": "Deep work",
      "std.time.start": "2026-04-01T09:00:00Z",
      "std.time.duration": "PT2H",
      "std.status.closed": false
    }
  ]
}
```

The weekplanner requests mutations as the `gantt` handler because gantt owns `std.time.*`. Times are stored in UTC; the grid
renders local wall time. The server document is `01-personal/planner/2026-W43.upl.json`; the UI signs in with the planner
token and syncs each applied request to the server. Imports replace the server document atomically. The browser still uses
the compiled Core for previews and undo replay, so dragging stays immediate.

## Current scope

Move blocks, double-click empty time to create, shared-edge Push/Pull/Stretch/Overlap, rename/close/delete, undo/redo, week navigation,
server sync, login/logout, JSON import/export.
Box selection and multi-block move are next.
