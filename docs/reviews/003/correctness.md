# Ticket 003 — mutation history panel (correctness)

## Round 1

Scope: ticket 003 files only — `src/core/auditHistory.ts`, `src/stores/auditHistory.ts`,
`src/components/AuditHistoryPanel.vue`, their tests, and the `PlannerView.vue` integration.
The concurrent `WeekGrid.vue` / `WeekGrid.test.ts` changes in the worktree belong to ticket 004
and were not reviewed here.

The API envelope matches ticket 002 (`{days:[{date,count}]}`, `{entries:[...]}`, entry fields
`id/timestamp/op/status/path/document/principal/requester/request/changes/createdTaskIds/removedTasks/reason/replacement`).
The findings below are the places where the client still diverges from that contract or mishandles state.

### 1. "Today" is computed in the browser zone but history days are keyed in the server zone

- Location: `src/stores/auditHistory.ts:16`, `src/stores/auditHistory.ts:34`, query built at
  `src/stores/auditHistory.ts:71-76` (always sends `date`).
- Problem: `selectedDay` is initialised and re-initialised with `localDateKey(new Date())`, and the
  client unconditionally sends it as `date`. Ticket 002 resolves days (and its no-`date` default)
  in `UPL_HISTORY_TIME_ZONE`, default `UTC`. When the browser zone differs from the server zone,
  the panel opens on the wrong daily file. The `days` list returned by `/api/history/days` is keyed
  in the server zone, so the selected day can also be absent from the day chips.
- Why it matters: the acceptance criterion "loads today by default" silently fails for any user
  whose local date differs from the server date (for example UTC+13 in the evening). The drawer
  reports "No history entries" while the server's today file has entries.
- Suggested fix: for the default/today load, omit `date` and let the server resolve today in its
  configured zone, then set `selectedDay` from a server-provided value (either echo the resolved
  date in the `/api/history` response or expose "today" from `/api/history/days`). Only send
  `date` once the user explicitly picks a day.

### 2. A failed "load older" hides the entries already loaded

- Location: `src/components/AuditHistoryPanel.vue:192` (the `v-else-if="error"` branch), with the
  state update in `src/stores/auditHistory.ts:114-119` and `src/stores/auditHistory.ts:133-135`.
- Problem: `loadMore()` sets `error` but deliberately keeps `entries` (`fail(caught, false)` does
  not clear them). The template's `v-else-if="error"` sits before the list, so a transient
  load-more failure replaces the entire already-rendered page with an error paragraph. The loaded
  entries are still in state but become invisible. (`reload()` clears entries via `clear(true)`;
  `loadMore` does not, so the two paths render inconsistently.)
- Why it matters: paging is the documented way to inspect older history; losing the visible page on
  a network blip makes already-fetched audit data unreachable and forces a retry of the whole view.
- Suggested fix: keep the list mounted when entries exist and render the error inline, e.g. show a
  full error state only when `entries.length === 0`, or track a separate `loadMoreError` and show it
  above the list. Retain the cursor so the footer retry still works.

### 3. Synthetic entry ids collide across pages and produce an invalid server cursor

- Location: `src/core/auditHistory.ts:154` (`id: ... ?? entry-${index}`), merge/dedupe at
  `src/stores/auditHistory.ts:155-165`, cursor assignment at `src/stores/auditHistory.ts:83` and
  `src/stores/auditHistory.ts:112`.
- Problem: when the fallback path is exercised (server entry without `id`), ids are
  `entry-0 … entry-(limit-1)` and restart at `entry-0` on the next page. `dedupe()` keys on `id`,
  so same-index entries from the next page are discarded as duplicates (older rows go missing), and
  the derived cursor (e.g. `entry-0`) is sent as `before`. The server treats `before` as a real
  entry id and answers 400 "unknown history cursor", so paging cannot continue.
- Why it matters: the ticket asks the client to tolerate older servers; this fallback turns missing
  optional data into both missing audit rows and a stuck next page.
- Suggested fix: do not synthesise ids for identity/paging. Use a stable content-derived key for
  rendering/merging (timestamp + path + request/change hash) and only expose a cursor when the last
  entry has a real server `id`; otherwise return `cursor: null` (or a `canPage` flag) so the client
  does not attempt to page with a fabricated cursor.

### 4. Missing or unknown status is presented as an applied write

- Location: `src/core/auditHistory.ts:156-157` (defaults `op` to `"mutation"` and `status` to
  `"applied"`), rendered at `src/components/AuditHistoryPanel.vue:210-218` and reason gate at
  `src/components/AuditHistoryPanel.vue:230-236`.
- Problem: any entry whose `status` is absent or unrecognised is rendered with the green applied
  styling (the class ternary only checks `=== "rejected"`), and its `reason` is suppressed because
  the reason block is gated on `entry.status === "rejected"`. A rejected record from an older or
  partial server can therefore be shown as successful with the reason hidden. Defaulting `op` to
  `"mutation"` likewise hides a `replace` entry's replacement summary.
- Why it matters: this is an audit view; asserting a successful write when the outcome is unknown is
  a data-correctness error, and the ticket explicitly requires rejected reasons to be visible and
  missing optional fields to be tolerated.
- Suggested fix: keep `status`/`op` nullable or as `"unknown"` when absent, render a neutral (not
  green) badge for unknown outcomes, show `reason` whenever it is present (or infer rejected from
  `reason` when status is absent), and only treat an explicit `"replace"` as a replacement.
