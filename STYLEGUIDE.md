# Styleguide

## Regions

Use `//region (Name)` and `//endregion` in TypeScript and inside Vue `<script setup>` when a file has distinct sections.
A collapsed file should fit roughly one to one and a half screens. Keep related symbols next to each other; helpers at the bottom.

## Readability

Always prioritize readability over cleverness. Ternary only when short and obvious; otherwise extract the condition into a named
variable. Prefer explicit names over dense inline expressions.

## Vue

- Always `<script setup lang="ts">`.
- Tailwind first; custom CSS only when Tailwind is not a natural fit.
- Keep components about rendering and delegation. Domain logic belongs in `src/core/`, state in `src/stores/`.
- Use Pinia or a shared store only for cross-component state; local refs stay local.

## Architecture + Splits

A directory should rarely exceed 5 subdirectories and 5 files. A file over 200-300 lines deserves a second look, but readability wins.
Keep time, parsing and geometry as pure functions so they can be tested without a browser.

## Time and storage

- Store instants as UTC ISO strings; display local time.
- Durations are ISO 8601 strings (`PT1H30M`).
- Snap user input before it reaches the protocol.

## Comments

Avoid comments. Prefer short caveman talk only when a non-obvious why cannot be inferred. No TSDoc/JSDoc for functions and classes.
