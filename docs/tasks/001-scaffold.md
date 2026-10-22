---
name: Scaffold week planner
status: done
depends-on: []
reviewers: [correctness]
---

# Scaffold week planner

## Goal

A running Vue app that reads and writes a UniPlanner container through the compiled Core JS API, with a usable week grid.

## Scope

- Vite + Vue 3 + TypeScript + Tailwind project.
- Stateless JS API adapter (`js-api`: `applyMutation`/`previewMutation`).
- Time helpers: UTC ISO instants, ISO 8601 durations, local day/minute conversion, 15-minute snap, lane assignment.
- Planner store: seed document, localStorage, import/export.
- Week grid: create on empty space, move body, resize bottom edge, derived lanes, 10% gutter.
- Task sidebar: rename, close, delete, week task list.
- Agent role configs on the `opencode` provider.

## Acceptance criteria

- `npm run typecheck`, `npm test` and `npm run build` are green.
- Creating, moving and resizing produce one atomic mutation request.
- Moving across day columns changes only `std.time.start`.
- Resizing changes only `std.time.duration`.
- Rendering uses local wall time; stored values are UTC.
- Overlapping blocks split the 90% content width.
- The week starts Monday and navigation moves seven days.
- Component tests simulate create, move, resize and rejected-preview interactions.

## Out of scope

- Push/pull/stretch primitives.
- Box selection, Ctrl selection and multi-block move.
- Undo/redo.
- File System Access API.
- Backlog of unplaced tasks.
