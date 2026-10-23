# Manual test

Acceptance criteria that cannot be automated.

| Area            | Check                                                                                                                                                                      | Status     | Ticket |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| Drag feedback   | Body drag follows the pointer, snaps to 15 minutes and commits on release.                                                                                                 | unverified | 001    |
| Reject feedback | An invalid preview shows the not-allowed cursor and leaves the document unchanged.                                                                                         | unverified | 001    |
| Timezone        | A block created at 09:00 local renders at 09:00 and is stored as the corresponding UTC instant.                                                                            | unverified | 001    |
| Import/export   | Export downloads a container that re-imports without loss.                                                                                                                 | unverified | 001    |
| History panel   | With a real server, open History; today loads, filters and paging work, raw JSON expands, 401 signs out, and an old server shows unavailable without breaking the planner. | unverified | 003    |
| Current time    | Today's column shows a legible line at the current local time in light and dark mode, and it advances without blocking drag/select/create.                                 | unverified | 004    |
