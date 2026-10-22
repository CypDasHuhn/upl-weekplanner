# Workflow

How work is planned, executed, reviewed and committed in upl-weekplanner.

## Roles

All agents run on the `opencode` provider.

| Agent                | Variant         | Job                                                                               | Writes               |
| -------------------- | --------------- | --------------------------------------------------------------------------------- | -------------------- |
| primary (build)      | session default | Orchestrates: owns the ticket queue, spawns workers, commits.                     | anything             |
| `architect`          | max             | Designs schemas, interaction algorithms, module boundaries; drafts tickets.       | nothing              |
| `reviewer`           | max             | Correctness review of one ticket's changes.                                       | its report file only |
| `coder`              | high            | The only agent that edits source. Implements one ticket, owns build/tests/format. | source + tests       |
| `scribe`             | low             | Maintains `docs/`: tickets, plans, module docs.                                   | `docs/` only         |
| `explore` (built-in) | cheap           | Read-only reconnaissance.                                                         | nothing              |

Depth is 1: subagents never spawn subagents.

## Pipeline

Per ticket (`docs/tasks/NNN-slug.md`):

1. The coder implements the ticket and leaves the tree green, reporting the exact commands and their results.
2. The reviewer reviews the diff: logic, state, data and contracts only. It writes `docs/reviews/<id>/correctness.md` and
   returns a one-paragraph summary.
3. The coder addresses every finding: fix it, or defer it to a named ticket with a reason.
4. Round 2 runs only if round 1 produced findings. Zero findings closes the ticket.
5. Commit. Any acceptance criterion that cannot be automated goes to `docs/manual-test.md`, naming the ticket.

## Verification ownership

- The coder is the only agent that runs build, tests and formatter. Reviewers assume a green handover.
- Reviewers read and reason only. `git diff`/`git log`/`git status` are allowed; build commands are not.
- A suspected failure is a finding with a reproduction path; the coder reproduces it.

## Ticket format

`docs/tasks/NNN-slug.md` with YAML frontmatter:

```yaml
---
name: Human readable title
status: todo | in-progress | review | done | blocked
depends-on: [NNN]
reviewers: [correctness]
---
```

Body: goal, scope, acceptance criteria, out of scope, notes.

## Commits

- Conventional commits: `type(domain): description`, imperative, lowercase, ≤72 chars, no trailing period.
- One commit per unit of completed work; stage precisely, never `git add -A`.
- No authorship or tool trailers. Never push, merge or force-push unless asked.

## Definition of done

- Acceptance criteria met; `npm run typecheck`, `npm test` and `npm run build` green.
- Reviews complete; every finding fixed or explicitly deferred to a named ticket with a reason.
- Non-automatable criteria recorded in `docs/manual-test.md`.
- Ticket `status: done`.
