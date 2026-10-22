# upl-weekplanner planning

Week planner over UniPlanner containers. The grid is a view; all writes go through the compiled Core gatekeeper.

- [concept.md](concept.md) — data and interaction model
- [workflow.md](workflow.md) — how work is planned, executed, reviewed and committed
- `tasks/` — tickets, one file per unit of work
- `reviews/` — review reports per ticket
- [manual-test.md](manual-test.md) — acceptance criteria that cannot be automated

## Current state

Vue 3 + TypeScript + Vite app with Tailwind. It renders a Monday-based week and loads `01-personal/planner/2026-W43.upl.json`
through the authenticated UniPlanner server API. The compiled `js-api` Core still previews and validates locally, so drag
feedback stays synchronous.

Implemented: token login/logout, server document load, per-request server sync, import replacement, double-click to create,
move by dragging the body, shared-edge Push/Pull/Stretch/Overlap, rename, close, delete, undo/redo, week navigation,
import/export. Times are UTC ISO instants; durations are ISO 8601 strings.

Undo/redo records the mutation requests produced by each action, replays their inverses locally, and sends the same requests
to the server; multi-request edge actions undo as one step. Import clears history.

Next candidates: box and Ctrl selection, multi-block move, backlog of unplaced tasks, per-week document paths, keyboard
navigation.
