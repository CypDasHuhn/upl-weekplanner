# upl-weekplanner

Vue 3 + TypeScript week planner built on the [UniPlanner](../uniplanner) protocol. The planner reads and writes `.upl.json`
containers; every write goes through the compiled UniPlanner Core gatekeeper in the browser.

- [idea.md](idea.md) — interaction design
- [docs/README.md](docs/README.md) — planning home and current state
- [docs/workflow.md](docs/workflow.md) — agent workflow
- [STYLEGUIDE.md](STYLEGUIDE.md) — code rules

## Layout

| Path              | Responsibility                                            |
| ----------------- | --------------------------------------------------------- |
| `src/core/`       | UPL API adapter, time/ISO duration parsing, lane geometry |
| `src/stores/`     | planner state, mutations, persistence                     |
| `src/components/` | week grid, task sidebar                                   |
| `scripts/`        | sync the compiled UniPlanner JS API                       |
| `.opencode/`      | architect, coder, reviewer, scribe roles                  |
| `justfile`        | local command recipes                                     |

## Run

```sh
npm install
npm run sync-core
npm run dev
```

`sync-core` builds `uniplanner:js-api` and copies `uniplanner-core.js` into `public/`. `dev` and `build` run it first.

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
renders local wall time.

## Current scope

Move blocks, double-click empty time to create, shared-edge Push/Pull/Stretch/Overlap, rename/close/delete, undo/redo, week navigation,
localStorage autosave, JSON import/export.
Box selection and multi-block move are next.
