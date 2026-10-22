# Week Planner: Timeline Interaction Design

Hour-based week overview. Goal: nearly every plan change is a short sequence of
fast mouse gestures, without dialogs or typing times.

## 1. Layout rules

- An entry fills **90% of the column width**. The remaining **10% is a free
  gutter** so the empty space stays selectable.
- The gutter is what allows adding parallel or overlapping entries at any time.
- Open: whether the gutter is per overlap-lane group or per day column, and how
  width is split when several entries run in parallel (3 parallel entries = 30%
  of the 90% each?).

## 2. Selection targets

| Target                           | Behaviour                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| Edge (top or bottom of an entry) | The only handle for resizing and reallocating time. Always grabbable, with or without a neighbour. |
| Body                             | Selects the entry for moving. Ctrl+click adds to the selection, box drag selects several.          |
| Gutter / empty space             | Create a new entry (parallel or overlapping).                                                      |

Rule: between two touching entries, the click always selects the **edge**, never
the floor or ceiling of the other entry.

## 3. Edge drag modes

Edge E sits between upper entry A and lower entry B. Dragging E down by `d`:

| Mode        | Input        | A          | B                                    | Everything below B                           |
| ----------- | ------------ | ---------- | ------------------------------------ | -------------------------------------------- |
| **Push**    | drag         | grows by d | shrinks by d                         | unchanged                                    |
| **Pull**    | Shift + drag | unchanged  | shrinks by d, leaving a gap above it | unchanged                                    |
| **Stretch** | Ctrl + drag  | grows by d | moves down by d, same length         | moves down by d, gaps absorb the shift first |

Dragging up mirrors this:

- Push: B grows, A shrinks.
- Pull: A shrinks, leaving a gap below it.
- Stretch: B grows upward; A and everything above shift up.

Modes are independent of drag direction.

## 4. Move

Selecting one body, several bodies (Ctrl+click) or a box selection and dragging
translates the entries **without changing any duration**.

## 5. The four primitives

| Primitive | Effect on total time | Effect on the plan                              |
| --------- | -------------------- | ----------------------------------------------- |
| Push      | unchanged            | transfers time between two neighbours           |
| Pull      | one entry shrinks    | converts time into a gap                        |
| Stretch   | one entry grows      | the rest of the chain shifts, gaps absorb first |
| Move      | unchanged            | translates entries without changing durations   |

Typical workflow for an experienced user: push here, pull there, finish with a
move and a stretch.

## 6. No-op edges

Every entry has two edges regardless of neighbours. A drag with nothing to act
on (no donor for a push, nothing behind it to shift for a stretch) has no effect
and shows a **"not allowed" cursor**. No edge needs special-casing.

## 7. Mapping to mutation batches (UPL)

Dragging edge E down by `d`:

| Mode    | Mutations                                                                                 |
| ------- | ----------------------------------------------------------------------------------------- |
| Push    | 2: A.end += d, B.start += d                                                               |
| Pull    | 1: B.start += d                                                                           |
| Stretch | 1 + n: A.end += d, plus every downstream entry shifted by the remainder after gaps absorb |
| Move    | n: start and end of each selected entry                                                   |

- A batch is atomic. A rejected mutation (minimum duration, overlap rule) aborts
  the whole drag.
- The "not allowed" cursor and the live drag preview come from a Core dry-run,
  which uses the same path as the commit.
- Gaps are not stored. They are derived from the absence of entries in a lane.
- Lane assignment is a view hint, either stored or recomputed per render
  (undecided).
- Open: stored pair is start+duration or start+end; this determines how many
  fields each primitive touches.
