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

- Double-clicking empty time creates a 60-minute task at the snapped pointer position and focuses its name field. Occupied time is ignored, even when a different lane leaves visible space.
- Body drag moves a task in time and across day columns without changing duration.
- Edges are shared boundaries. Plain drag pushes, Shift-drag pulls, Ctrl/Meta-drag stretches and Alt-drag overlaps.
- Push reaches the next task across a gap and shrinks it from the far edge instead of overlapping.
- Free space behaves as a neighbour for Push. Stretch moves the whole lane chain, with gaps absorbing movement first.
- Overlap grows the dragged side over neighbouring tasks without moving them, including across gaps.
- The drag mode is locked at pointer-down; hovering an edge previews the mode through cursor and colour.
- Ctrl-Z undoes the last action and Ctrl-Y or Ctrl-Shift-Z redoes it. While a task name is focused, the shortcuts still
  undo/redo the app until the name field has unsaved edits.
- Snap and minimum duration are 15 minutes.
- Lanes use a stable side order, persisted separately from the container; overlapping tasks split the non-gutter width and sides do not switch during a drag.
- A rejected preview shows the not-allowed cursor and the drag commits nothing.

## History

Undo/redo is request-based. Each action keeps the mutation requests it sent; undo sends the inverse requests in reverse
order, redo replays the originals. Only fields explicitly requested are inverted, so handler-derived fields such as
`std.time.end` are recomputed instead of being replayed. Task creation and removal are inverted from the stored task
snapshots. Multi-request edge actions form one history entry. Import starts a new history.

## Time

Storage and transport are UTC. Display is local wall time. The week starts Monday. Creating a block converts local
day/minute to an instant; rendering converts the instant back to local day/minute.
