# upl-weekplanner planning

Week planner over UniPlanner containers. The grid is a view; all writes go through the compiled Core gatekeeper.

- [concept.md](concept.md) — data and interaction model
- [workflow.md](workflow.md) — how work is planned, executed, reviewed and committed
- `tasks/` — tickets, one file per unit of work
- `reviews/` — review reports per ticket
- [manual-test.md](manual-test.md) — acceptance criteria that cannot be automated

## Current state

Vue 3 + TypeScript + Vite app with Tailwind. It renders a Monday-based week and loads the matching
`01-personal/planner/YYYY-Www.upl.json` document; a missing week opens empty and is created on first edit.
through the authenticated UniPlanner server API. The compiled `js-api` Core still previews and validates locally, so drag
feedback stays synchronous.

Implemented: token login/logout, per-week server document load, server-side week creation, per-request server sync, import
replacement, double-click to create up to 30 minutes in the clicked lane, Ctrl-click and drag-marquee selection, collective selection drag with overlap,
Ctrl-C/Ctrl-X/Ctrl-V clipboard, move by dragging the body, shared-edge Push/Pull/Stretch/Overlap, rename, close, delete,
tags with configurable text and block colors, dark mode, undo/redo, week navigation, import/export. Times are UTC ISO
instants; durations are ISO 8601 strings. Tags
live in task `std.tags` arrays; multiple tags stripe the block background. Tag colors are workspace data in
`01-personal/planner/workspace.upl.json` (`std.tag.colors`), not browser-local. The settings list loads the tag union for
the whole planner directory.

Undo/redo records the mutation requests produced by each action, replays their inverses locally, and sends the same requests
to the server; multi-request edge actions undo as one step. Import clears history.

Old Obsidian Day Planner notes are converted with `scripts/import-day-planner.ts`, which writes one `.upl.json` container
per ISO week and leaves existing files alone unless run with `--overwrite`.

Next candidates: backlog of unplaced tasks, keyboard
navigation.
