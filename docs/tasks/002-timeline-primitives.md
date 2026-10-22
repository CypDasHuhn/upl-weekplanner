---
name: Timeline primitives
status: todo
depends-on: [001]
reviewers: [correctness]
---

# Timeline primitives

## Goal

Implement the edge drag modes from `idea.md` on top of the current move/resize baseline.

## Scope

- Push: top neighbour grows, bottom shrinks; no gap.
- Pull: edge moves, one entry shrinks, a gap remains.
- Stretch: one entry grows and everything downstream shifts, gaps absorbing first.
- Neighbour discovery per day and lane.
- Atomic batches with preview; any rejection aborts the whole drag.
- Not-allowed cursor from the same preview path.

## Acceptance criteria

- Push, pull and stretch map to the documented mutation counts for start+duration.
- A rejected batch leaves the document unchanged.
- Gap absorption is deterministic.
- Unit tests cover each primitive in both directions and at day boundaries.

## Out of scope

- Cross-day chains.
- Storing lane assignments.
- Minimum duration or overlap as Core-level rules.
