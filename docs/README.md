# upl-weekplanner planning

Week planner over UniPlanner containers. The grid is a view; all writes go through the compiled Core gatekeeper.

- [concept.md](concept.md) — data and interaction model
- [workflow.md](workflow.md) — how work is planned, executed, reviewed and committed
- `tasks/` — tickets, one file per unit of work
- `reviews/` — review reports per ticket
- [manual-test.md](manual-test.md) — acceptance criteria that cannot be automated

## Current state

Scaffolded Vue 3 + TypeScript + Vite app with Tailwind. It renders a Monday-based week, stores a container document in
localStorage, and commits mutations through the stateless `js-api` build of UniPlanner.

Implemented: double-click to create, move by dragging the body, shared-edge Push/Pull/Stretch/Overlap, rename, close, delete,
undo/redo, week navigation, import/export. Times are UTC ISO instants; durations are ISO 8601 strings. Lane sides use a
stable order persisted separately from the container.

Undo/redo records the mutation requests produced by each action and replays their inverses; multi-request edge actions undo
as one step. Import clears history.

Next candidates: box and Ctrl selection, multi-block move, backlog of unplaced tasks, File System Access persistence,
keyboard navigation.
