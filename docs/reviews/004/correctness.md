# Ticket 004 — Current time indicator — correctness

## Round 1

Reviewed `src/components/WeekGrid.vue` and `src/components/WeekGrid.test.ts` only. The unrelated `PlannerView.vue` / `AuditHistoryPanel` changes in the working tree are outside this ticket and were not considered.

### `src/components/WeekGrid.vue:416-434` — the clock is advanced only by the recursive `setTimeout`

`now` is refreshed on mount and then only from `scheduleClock`. Browsers throttle timers in background tabs and can suspend them entirely; after returning to the foreground there is no `visibilitychange`/`focus` handler that refreshes `now` and re-arms the timer. The pending timeout can therefore fire late (or not have fired yet), leaving `now` older than the current wall-clock minute and the indicator at the wrong offset until the next firing. It also means system-sleep or long-idle gaps can leave the line stale on return. This conflicts with the requirement that the line advance without a manual refresh.

Fix: register a `document` `visibilitychange` handler (and optionally `window` `focus`) that, when the document is visible, refreshes `now` and reschedules the timeout. Rescheduling must clear the existing `clockTimer` first so only one timer survives, and the listener must be removed in `onBeforeUnmount`.

### `src/components/WeekGrid.vue:51,538-545` — week changes recompute visibility but never refresh the time

`todayIndex` correctly re-evaluates when `planner.weekStart` changes, but the style at `currentTimeStyle()` still reads the last value set by the minute timer. The ticket explicitly requires an update on week change/re-render. If the clock was stale (background throttling, sleep, or simply the moment just before the next tick), navigating to a week containing today can show the line in the right column at the previous minute until the timer fires. Conversely, navigating at midnight with a stale `now` can briefly keep the line in yesterday's column.

Fix: watch `planner.weekStart` and call a shared refresh-and-reschedule routine (refresh `now`, clear the pending timer, arm the next minute boundary), so visibility and position are both current after navigation.

### Verified

- Position math matches the ticket: `top = (minutesIntoDay(now) / 60) * HOUR_PX`, expressed via `MINUTES_PER_HOUR` and `HOUR_PX` (`WeekGrid.vue:190-194`).
- `dayIndexFor` against `planner.weekStart` gives the correct today column and `-1` outside the displayed week (`WeekGrid.vue:51,538`).
- `pointer-events-none` is on the full-width wrapper, so the line does not take part in hit-testing; drag, selection, create and edge handlers are unaffected (`WeekGrid.vue:537-545`).
- The timer is cleared on unmount (`WeekGrid.vue:440-445`).
