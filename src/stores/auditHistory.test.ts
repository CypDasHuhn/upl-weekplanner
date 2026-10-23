import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  loadAuditHistoryDays: vi.fn(),
  loadAuditHistory: vi.fn(),
}));

const sessionMock = vi.hoisted(() => ({ expire: vi.fn() }));

vi.mock("../core/auditHistory", () => api);
vi.mock("./session", () => ({ session: sessionMock }));

import type { AuditEntry, AuditHistoryPage } from "../core/auditHistory";
import { ServerError } from "../core/server";
import { createAuditHistory } from "./auditHistory";

const WEEK = "01-personal/planner/2026-W43.upl.json";
const OTHER = "01-personal/planner/2026-W42.upl.json";

beforeEach(() => {
  vi.resetAllMocks();
  api.loadAuditHistoryDays.mockResolvedValue([]);
  api.loadAuditHistory.mockResolvedValue({ entries: [], cursor: null });
});

describe("audit history store", () => {
  it("opens on today with the displayed week path", async () => {
    const store = createAuditHistory();
    api.loadAuditHistory.mockResolvedValue({ date: "2026-10-24", entries: [entry({ id: "a" })], cursor: null });

    await store.open(WEEK);

    expect(store.selectedDay.value).toBe("2026-10-24");
    expect(store.pathFilter.value).toBe(WEEK);
    expect(api.loadAuditHistory).toHaveBeenCalledWith({
      date: undefined,
      path: WEEK,
      status: null,
      limit: 50,
    });
    expect(store.entries.value.map((item) => item.id)).toEqual(["a"]);
  });

  it("refetches when the day changes", async () => {
    const store = createAuditHistory();
    await store.open(WEEK);
    api.loadAuditHistory.mockClear();

    await store.setDay("2026-10-20");

    expect(api.loadAuditHistory).toHaveBeenLastCalledWith(expect.objectContaining({ date: "2026-10-20" }));
  });

  it("refetches with the status filter and filters client-side", async () => {
    const store = createAuditHistory();
    api.loadAuditHistory.mockResolvedValue({
      entries: [
        entry({ id: "applied", status: "applied", path: WEEK }),
        entry({ id: "rejected", status: "rejected", path: WEEK }),
        entry({ id: "other", status: "applied", path: OTHER }),
      ],
      cursor: null,
    });

    await store.open(WEEK);
    expect(store.entries.value.map((item) => item.id)).toEqual(["applied", "rejected"]);

    await store.setStatus("rejected");

    expect(api.loadAuditHistory).toHaveBeenLastCalledWith(expect.objectContaining({ status: "rejected" }));
    expect(store.entries.value.map((item) => item.id)).toEqual(["rejected"]);
  });

  it("clears the path for all documents and stops following the week", async () => {
    const store = createAuditHistory();
    await store.open(WEEK);

    await store.setPath("");

    expect(store.pathFilter.value).toBeNull();
    expect(api.loadAuditHistory).toHaveBeenLastCalledWith(expect.objectContaining({ path: null }));

    api.loadAuditHistory.mockClear();
    store.setWeekPath(OTHER);

    expect(store.weekPath.value).toBe(OTHER);
    expect(store.pathFilter.value).toBeNull();
    expect(api.loadAuditHistory).not.toHaveBeenCalled();
  });

  it("appends older pages without duplicates", async () => {
    const store = createAuditHistory();
    api.loadAuditHistory.mockResolvedValueOnce({
      entries: [entry({ id: "3", timestamp: "2026-10-23T12:00:00.000Z" })],
      cursor: "3",
    });
    await store.open(WEEK);

    api.loadAuditHistory.mockResolvedValueOnce({
      entries: [
        entry({ id: "3", timestamp: "2026-10-23T12:00:00.000Z" }),
        entry({ id: "2", timestamp: "2026-10-23T11:00:00.000Z" }),
        entry({ id: "1", timestamp: "2026-10-23T10:00:00.000Z" }),
      ],
      cursor: "1",
    });

    await store.loadMore();

    expect(api.loadAuditHistory).toHaveBeenLastCalledWith(expect.objectContaining({ before: "3" }));
    expect(store.entries.value.map((item) => item.id)).toEqual(["3", "2", "1"]);
    expect(store.cursor.value).toBe("1");
  });

  it("shows unavailable for a missing endpoint", async () => {
    const store = createAuditHistory();
    api.loadAuditHistoryDays.mockRejectedValue(new ServerError("missing", 404));

    await store.open(WEEK);

    expect(store.unavailable.value).toBe(true);
    expect(store.error.value).toBeNull();
  });

  it("expires the session on 401", async () => {
    const store = createAuditHistory();
    api.loadAuditHistory.mockRejectedValue(new ServerError("auth", 401));

    await store.open(WEEK);

    expect(sessionMock.expire).toHaveBeenCalledOnce();
  });

  it("ignores a stale response after filters change", async () => {
    const first = deferred<AuditHistoryPage>();
    api.loadAuditHistory.mockReturnValueOnce(first.promise).mockResolvedValueOnce({
      entries: [entry({ id: "new", status: "rejected" })],
      cursor: null,
    });

    const store = createAuditHistory();
    const firstLoad = store.open(WEEK);
    await store.setStatus("rejected");

    first.resolve({ entries: [entry({ id: "old", status: "applied" })], cursor: null });
    await firstLoad;

    expect(store.entries.value.map((item) => item.id)).toEqual(["new"]);
  });
});

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "entry",
    serverId: "entry",
    timestamp: "2026-10-23T10:00:00.000Z",
    op: "mutation",
    status: "applied",
    path: WEEK,
    document: null,
    principal: "alice",
    requester: "gantt",
    request: {},
    changes: [],
    createdTaskIds: [],
    removedTasks: [],
    replacement: null,
    reason: null,
    raw: {},
    ...overrides,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
