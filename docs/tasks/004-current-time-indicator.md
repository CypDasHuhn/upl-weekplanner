---
name: Current time indicator
status: done
depends-on: []
reviewers: [correctness]
---

# Current time indicator

## Goal

Show where "now" falls in the week grid so the current moment is readable at a glance without changing any planner data.

## Scope

- In `WeekGrid.vue`, render a thin current-time line only in today's day column.
- Show it only when the displayed week contains today; hide it otherwise.
- Time runs vertically in the grid, so the indicator is a **horizontal line** at the current local minute of the day, spanning the day column width.
  - Position: `top = (minutesIntoDay(now) / 60) * HOUR_PX`, using the existing `minutesIntoDay` / `dayIndexFor` helpers.
- Update automatically at most once per minute, and on week change/re-render.
- Style distinctly in light and dark mode.
- Must be non-interactive: `pointer-events: none`, no effect on drag, selection, or hit-testing.
- Tests with fake timers and a fixed current date: visible in today's column, hidden in other weeks, correct position, and no pointer interception.
- Add a `docs/manual-test.md` entry naming this ticket if the visual result needs a manual check.

## Acceptance criteria

- When today is in the displayed week, one horizontal line appears only in today's column at the correct minute offset.
- When today is not in the displayed week, no line renders.
- The line advances after the clock crosses a minute and after navigating weeks, without a manual refresh.
- The line uses distinct, legible colors in light and dark mode.
- Pointer events pass through the line; drag, marquee selection, create, and edge interactions are unaffected.
- Unit/component tests cover visibility, hidden state, position, and non-interference.
- `npm run typecheck`, `npm test`, and `npm run build` are green.

## Out of scope

- Timezone switching or per-user timezones.
- Labels, avatars, or time text on the line.
- Scroll-to-now on load.
- Changes to how task times are stored or rendered.

## Notes

- "Today" is the browser's local date, matching the grid's existing local wall-time rendering.
- The grid already derives day columns from `planner.weekStart`; reuse that instead of introducing a second week source.
