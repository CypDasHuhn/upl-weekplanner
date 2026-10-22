# Concept

## Document

One `.upl.json` container holds the week. The container has its own id and fields; each task is a child document with
`id` and namespaced fields. The planner uses:

- `std.name` — title
- `std.time.start` — UTC ISO instant
- `std.time.duration` — ISO 8601 duration
- `std.status.closed` — boolean

`std.time.end` is derived by the gantt handler and is never written by the planner. Time writes are requested as
`gantt`, because gantt owns `std.time.*`.

## Interaction

- Empty space creates a 60-minute task at the snapped pointer position.
- Body drag moves a task in time and across day columns without changing duration.
- Bottom-edge drag changes duration.
- Snap and minimum duration are 15 minutes.
- Lanes are derived per render by interval coloring; overlapping tasks split the non-gutter width.
- A rejected preview shows the not-allowed cursor and the drag commits nothing.

## Time

Storage and transport are UTC. Display is local wall time. The week starts Monday. Creating a block converts local
day/minute to an instant; rendering converts the instant back to local day/minute.
