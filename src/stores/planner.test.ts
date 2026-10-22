import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, instantFor, startOfWeek } from "../core/time";
import { weekDocumentPath } from "../core/week";
import type { UplChange, UplDocument, UplRequest, UplResult } from "../core/types";

const core = vi.hoisted(() => {
  const apply = (document: UplDocument, request: UplRequest): UplResult => {
    const next = JSON.parse(JSON.stringify(document)) as UplDocument;
    const changes: UplChange[] = [];

    if (request.removeTasks) next.tasks = (next.tasks ?? []).filter((task) => !request.removeTasks?.includes(task.id));
    for (const created of request.createTasks ?? []) {
      next.tasks = [...(next.tasks ?? []), created];
      for (const [field, value] of Object.entries(created)) {
        if (field === "id") continue;
        changes.push({ field, oldValue: null, newValue: value, target: created.id });
      }
    }
    for (const mutation of request.mutations) {
      const task = next.tasks?.find((item) => item.id === mutation.target);
      if (!task) continue;
      const oldValue = task[mutation.field] ?? null;
      if (oldValue === mutation.value) continue;
      task[mutation.field] = mutation.value;
      changes.push({
        field: mutation.field,
        oldValue,
        newValue: mutation.value,
        target: mutation.target,
      });
    }

    return { ok: true, document: next, changes };
  };
  return { applyMutation: vi.fn(apply), previewMutation: vi.fn(apply), apply };
});

const server = vi.hoisted(() => {
  class ServerError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
      this.name = "ServerError";
    }
  }
  return {
    loadDocumentFromServer: vi.fn(),
    applyRequestsOnServer: vi.fn(),
    replaceDocumentOnServer: vi.fn(),
    ServerError,
  };
});

vi.mock("../core/uniplanner", () => core);
vi.mock("../core/server", () => server);

import { ServerError } from "../core/server";
import { createPlanner } from "./planner";

function planDocument(): UplDocument {
  const week = startOfWeek(new Date());
  return {
    id: "week",
    kind: "container",
    tasks: [
      {
        id: "a",
        "std.name": "Alpha",
        "std.time.start": instantFor(week, 0, 9 * 60).toISOString(),
        "std.time.duration": "PT2H",
      },
      {
        id: "b",
        "std.name": "Beta",
        "std.time.start": instantFor(week, 0, 10 * 60).toISOString(),
        "std.time.duration": "PT2H",
      },
    ],
  };
}

beforeEach(() => {
  core.applyMutation.mockImplementation(core.apply);
  core.previewMutation.mockImplementation(core.apply);
  server.loadDocumentFromServer.mockResolvedValue(planDocument());
  server.applyRequestsOnServer.mockImplementation(async () => planDocument());
  server.replaceDocumentOnServer.mockImplementation(async (_path: string, document: UplDocument) => document);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("planner undo", () => {
  it("undoes and redoes field mutations", () => {
    const planner = createPlanner(planDocument());

    expect(planner.renameTask("a", "Renamed")).toBe(true);
    expect(planner.tasks.value.find((task) => task.id === "a")?.["std.name"]).toBe("Renamed");

    expect(planner.undo()).toBe(true);
    expect(planner.tasks.value.find((task) => task.id === "a")?.["std.name"]).toBe("Alpha");

    expect(planner.redo()).toBe(true);
    expect(planner.tasks.value.find((task) => task.id === "a")?.["std.name"]).toBe("Renamed");
  });

  it("restores a deleted task on undo", () => {
    const planner = createPlanner(planDocument());

    planner.deleteTask("a");
    expect(planner.tasks.value.some((task) => task.id === "a")).toBe(false);

    expect(planner.undo()).toBe(true);
    expect(planner.tasks.value.find((task) => task.id === "a")?.["std.name"]).toBe("Alpha");

    expect(planner.redo()).toBe(true);
    expect(planner.tasks.value.some((task) => task.id === "a")).toBe(false);
  });

  it("removes a created task on undo and recreates it on redo", () => {
    const planner = createPlanner(planDocument());
    const id = planner.createTask(0, 9 * 60);

    expect(id).not.toBeNull();
    expect(planner.tasks.value.some((task) => task.id === id)).toBe(true);

    expect(planner.undo()).toBe(true);
    expect(planner.tasks.value.some((task) => task.id === id)).toBe(false);

    expect(planner.redo()).toBe(true);
    expect(planner.tasks.value.some((task) => task.id === id)).toBe(true);
  });
});

describe("planner lane order", () => {
  it("keeps lane sides stable while a task crosses another", () => {
    const planner = createPlanner(planDocument());
    const laneOf = (taskId: string) => planner.blocks.value.find((block) => block.taskId === taskId)?.lane;

    expect(laneOf("a")).toBe(0);
    expect(laneOf("b")).toBe(1);

    expect(planner.previewMove("a", 0, 10 * 60 + 30)).toBe(true);

    expect(laneOf("a")).toBe(0);
    expect(laneOf("b")).toBe(1);

    expect(planner.moveTask("a", 0, 10 * 60 + 30)).toBe(true);
    expect(planner.blocks.value.find((block) => block.taskId === "a")?.startMinutes).toBe(10 * 60 + 30);

    expect(laneOf("a")).toBe(0);
    expect(laneOf("b")).toBe(1);
  });
});

describe("planner server sync", () => {
  it("loads the document from the current week path", async () => {
    const planner = createPlanner();

    await expect(planner.load()).resolves.toBe(true);

    expect(server.loadDocumentFromServer).toHaveBeenCalledWith(weekDocumentPath(startOfWeek(new Date())));
    expect(planner.document.value.id).toBe("week");
    expect(planner.tasks.value.map((task) => task.id)).toEqual(["a", "b"]);
  });

  it("sends local mutations to the week path", async () => {
    const planner = createPlanner(planDocument());

    expect(planner.renameTask("a", "Renamed")).toBe(true);

    await vi.waitFor(() => expect(server.applyRequestsOnServer).toHaveBeenCalled());
    expect(server.applyRequestsOnServer).toHaveBeenCalledWith(weekDocumentPath(startOfWeek(new Date())), [
      expect.objectContaining({
        requester: "gantt",
        mutations: [{ field: "std.name", value: "Renamed", target: "a" }],
      }),
    ]);
  });

  it("creates a missing week before its first mutation", async () => {
    server.loadDocumentFromServer.mockRejectedValueOnce(new ServerError("Missing", 404));
    const planner = createPlanner();
    const path = weekDocumentPath(startOfWeek(new Date()));

    await expect(planner.load()).resolves.toBe(true);
    expect(planner.tasks.value).toEqual([]);

    expect(planner.createTask(0, 9 * 60)).not.toBeNull();

    await vi.waitFor(() => expect(server.replaceDocumentOnServer).toHaveBeenCalled());
    expect(server.replaceDocumentOnServer).toHaveBeenCalledWith(
      path,
      expect.objectContaining({ id: expect.any(String), kind: "container", tasks: [] }),
    );
    expect(server.applyRequestsOnServer).toHaveBeenCalledWith(path, [
      expect.objectContaining({
        requester: "gantt",
        createTasks: [expect.objectContaining({ id: expect.any(String) })],
      }),
    ]);
  });

  it("keeps the displayed week after a failed load", async () => {
    const planner = createPlanner();
    await planner.load();
    const current = planner.weekStart.value;
    const failed = addDays(current, -7);
    server.loadDocumentFromServer.mockRejectedValueOnce(new ServerError("Offline", 500));

    await expect(planner.load(failed)).resolves.toBe(false);
    server.loadDocumentFromServer.mockResolvedValueOnce(planDocument());
    planner.shiftWeek(-1);

    await vi.waitFor(() => expect(planner.weekStart.value).toEqual(failed));
    expect(server.loadDocumentFromServer).toHaveBeenLastCalledWith(weekDocumentPath(failed));
  });

  it("loads the previous ISO week", async () => {
    const planner = createPlanner();
    await planner.load();
    const current = planner.weekStart.value;
    const previous = addDays(current, -7);

    planner.shiftWeek(-1);

    await vi.waitFor(() => expect(planner.weekStart.value).toEqual(previous));
    expect(server.loadDocumentFromServer).toHaveBeenLastCalledWith(weekDocumentPath(previous));
  });
});

describe("planner selection", () => {
  it("replaces and expands the selection", () => {
    const planner = createPlanner(planDocument());

    planner.select("a");
    expect(planner.selectedIds.value).toEqual(["a"]);
    expect(planner.selectedId.value).toBe("a");

    planner.addToSelection("b");
    expect(planner.selectedIds.value).toEqual(["a", "b"]);
    expect(planner.selectedId.value).toBe("b");

    planner.selectMany(["a"], true);
    expect(planner.selectedIds.value).toEqual(["a", "b"]);

    planner.selectMany(["b"], false);
    expect(planner.selectedIds.value).toEqual(["b"]);
    expect(planner.selectedId.value).toBe("b");

    planner.select(null);
    expect(planner.selectedIds.value).toEqual([]);
    expect(planner.selectedId.value).toBeNull();
  });

  it("moves multiple tasks as one request", async () => {
    const planner = createPlanner(planDocument());
    planner.selectMany(["a", "b"], false);

    expect(
      planner.moveTasks([
        { taskId: "a", dayIndex: 1, startMinutes: 10 * 60 },
        { taskId: "b", dayIndex: 2, startMinutes: 11 * 60 },
      ]),
    ).toBe(true);

    await vi.waitFor(() => expect(server.applyRequestsOnServer).toHaveBeenCalled());
    expect(server.applyRequestsOnServer).toHaveBeenCalledWith(weekDocumentPath(startOfWeek(new Date())), [
      expect.objectContaining({
        mutations: [
          expect.objectContaining({ field: "std.time.start", target: "a" }),
          expect.objectContaining({ field: "std.time.start", target: "b" }),
        ],
      }),
    ]);
  });

  it("copies, cuts and pastes the selection", () => {
    const planner = createPlanner(planDocument());
    planner.selectMany(["a", "b"], false);

    expect(planner.copySelection()).toBe(true);
    expect(planner.pasteClipboard()).toBe(true);

    const pasted = planner.tasks.value.slice(2);
    expect(pasted.map((task) => task["std.name"])).toEqual(["Alpha", "Beta"]);
    expect(pasted.map((task) => task.id)).not.toEqual(["a", "b"]);
    expect(planner.selectedIds.value).toEqual(pasted.map((task) => task.id));
    expect(planner.selectedId.value).toBe(pasted[0]?.id);

    planner.selectMany(["a", "b"], false);
    expect(planner.cutSelection()).toBe(true);
    expect(planner.tasks.value.map((task) => task.id)).toEqual(pasted.map((task) => task.id));
    expect(planner.selectedIds.value).toEqual([]);

    expect(planner.pasteClipboard()).toBe(true);
    expect(planner.tasks.value.slice(2).map((task) => task["std.name"])).toEqual(["Alpha", "Beta"]);
  });

  it("drops deleted tasks from the selection", () => {
    const planner = createPlanner(planDocument());
    planner.selectMany(["a", "b"], false);

    planner.deleteTask("b");

    expect(planner.selectedIds.value).toEqual(["a"]);
    expect(planner.selectedId.value).toBe("a");
  });
});

describe("planner tags", () => {
  it("stores normalized tags and syncs them", async () => {
    const planner = createPlanner(planDocument());

    expect(planner.setTags("a", [" #work ", "work", "urgent"])).toBe(true);
    expect(planner.tasks.value.find((task) => task.id === "a")?.["std.tags"]).toEqual(["work", "urgent"]);

    await vi.waitFor(() => expect(server.applyRequestsOnServer).toHaveBeenCalled());
    expect(server.applyRequestsOnServer).toHaveBeenCalledWith(weekDocumentPath(startOfWeek(new Date())), [
      expect.objectContaining({
        requester: "gantt",
        mutations: [{ field: "std.tags", value: ["work", "urgent"], target: "a" }],
      }),
    ]);
  });
});
