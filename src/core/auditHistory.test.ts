import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAuditHistory, loadAuditHistoryDays } from "./auditHistory";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("audit history API", () => {
  it("loads days from an object response and sorts newest first", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          days: [{ date: "2026-10-21", count: 2, extra: true }, "2026-10-23"],
        }),
      ),
    );

    await expect(loadAuditHistoryDays()).resolves.toEqual([
      { date: "2026-10-23", count: 0 },
      { date: "2026-10-21", count: 2 },
    ]);
  });

  it("accepts a bare history array and unknown fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          {
            id: "entry-1",
            timestamp: "2026-10-23T10:00:00.000Z",
            status: "applied",
            op: "mutation",
            path: "2026-W43.upl.json",
            extraField: "ignored",
          },
        ]),
      ),
    );

    const page = await loadAuditHistory({ date: "2026-10-23", limit: 100 });

    expect(page.entries[0]).toMatchObject({
      id: "entry-1",
      status: "applied",
      path: "2026-W43.upl.json",
      changes: [],
      createdTaskIds: [],
      removedTasks: [],
    });
    expect(page.cursor).toBeNull();
  });

  it("reads wrapped entries, changes, replacement summaries and cursor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          entries: [
            {
              id: "entry-2",
              timestamp: "2026-10-23T10:00:00.000Z",
              op: "replace",
              status: "rejected",
              path: "week.upl.json",
              reason: "invalid",
              changes: [{ field: "std.name", target: "task-1", oldValue: "Old", newValue: "New" }],
              createdTaskIds: ["task-2"],
              removedTasks: [{ id: "task-3", "std.name": "Gone" }],
              replacement: {
                before: { id: "week", kind: "container", taskCount: 3 },
                after: { id: "week", kind: "container", tasks: [] },
              },
            },
          ],
          nextCursor: "entry-2",
        }),
      ),
    );

    const page = await loadAuditHistory({ date: "2026-10-23", limit: 50 });

    expect(page.cursor).toBe("entry-2");
    expect(page.entries[0]).toMatchObject({
      reason: "invalid",
      changes: [{ field: "std.name", target: "task-1", oldValue: "Old", newValue: "New" }],
      createdTaskIds: ["task-2"],
      removedTasks: [{ id: "task-3", "std.name": "Gone" }],
      replacement: {
        before: { id: "week", kind: "container", taskCount: 3 },
        after: { id: "week", kind: "container", taskCount: 0 },
      },
    });
  });

  it("reads response metadata and keeps unknown outcomes neutral", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          date: "2026-10-23",
          timeZone: "Europe/Berlin",
          entries: [{ timestamp: "2026-10-23T10:00:00.000Z", path: "week.upl.json" }],
        }),
      ),
    );

    const page = await loadAuditHistory({ date: "2026-10-23", limit: 2 });

    expect(page.date).toBe("2026-10-23");
    expect(page.timeZone).toBe("Europe/Berlin");
    expect(page.entries[0]).toMatchObject({ status: "unknown", op: "unknown", serverId: null });
    expect(page.cursor).toBeNull();
  });

  it("builds query parameters and falls back to the last id as cursor", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ entries: [{ id: "a" }, { id: "b" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const page = await loadAuditHistory({
      date: "2026-10-23",
      path: "week.upl.json",
      status: "rejected",
      limit: 2,
      before: "older",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/history?date=2026-10-23&path=week.upl.json&status=rejected&limit=2&before=older",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(page.cursor).toBe("b");
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
