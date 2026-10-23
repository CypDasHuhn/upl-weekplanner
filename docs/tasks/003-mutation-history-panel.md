---
name: Mutation history panel
status: done
depends-on: [002]
reviewers: [correctness]
---

# Mutation history panel

## Goal

Expose the server mutation history as a read-only weekplanner drawer so users can inspect what changed, when, and by whom without leaving the planner.

## Scope

- Client API and types for `GET /api/history/days` and `GET /api/history`.
  - Put these in a new module (for example `src/core/auditHistory.ts`); the existing `src/core/history.ts` is undo/redo history and must not be overloaded.
  - Tolerate unknown fields and missing optional fields from older servers.
- Store (for example `src/stores/auditHistory.ts`), separate from the planner store:
  - Selected day, path filter, status filter, loading, error, entries, days, cursor.
  - Path filter defaults to the currently displayed week document; an "all documents" option clears it.
  - Requests are cancelled or generation-guarded when the week or filters change.
- Header entry point in `PlannerView.vue` opening a drawer/panel component.
- Entry rendering:
  - Local time, `applied`/`rejected`, document path, requester, principal.
  - Change summaries (field, target, old → new) and created/removed task labels.
  - Replacement before/after summaries for `replace` entries.
  - Expandable raw JSON for the whole entry.
- 401 expires the session through `session.expire()`; 404 or an old server without the endpoints shows an "unavailable" state without breaking the planner.
- No undo/revert control; existing undo/redo behavior is untouched.
- Tests for store filtering/paging/error states and for component visible/hidden/expanded/unavailable states.
- Update this repo's docs or footer only if needed.

## Acceptance criteria

- The panel opens from the header and loads today by default with the current week path filter.
- Changing day, path, or status refetches and renders the matching entries newest first.
- `limit`/`before` paging appends older entries without duplicates.
- A rejected entry shows its reason; an applied entry shows all change summaries and task ids.
- A 401 response calls `session.expire()`; a 404 renders an unavailable state and leaves the week grid usable.
- Raw JSON expands and collapses per entry.
- No revert/undo action exists in the panel; undo/redo tests stay green.
- `npm run typecheck`, `npm test`, and `npm run build` are green.

## Out of scope

- Revert or replay from history.
- Live updates or polling.
- Any write operation from the panel.

## Notes

- Depends on ticket `002-mutation-history.md` in the **UniPlanner** repo (`/home/cyp/repos/uniplanner/docs/tasks/002-mutation-history.md`); it provides the history endpoints and entry schema v1.
- History is read-only in the client; the document stays the source of truth.
