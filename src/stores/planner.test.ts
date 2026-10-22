import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { instantFor, startOfWeek } from "../core/time";
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

vi.mock("../core/uniplanner", () => core);

import { createPlanner } from "./planner";

const DOCUMENT_KEY = "upl-weekplanner.document.v1";
const LANE_ORDER_KEY = "upl-weekplanner.lane-order.v1";

function storeDocument(): void {
  const week = startOfWeek(new Date());
  const document: UplDocument = {
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
  localStorage.setItem(DOCUMENT_KEY, JSON.stringify(document));
  localStorage.setItem(LANE_ORDER_KEY, JSON.stringify(["a", "b"]));
}

beforeEach(() => {
  core.applyMutation.mockImplementation(core.apply);
  core.previewMutation.mockImplementation(core.apply);
  localStorage.clear();
  storeDocument();
});

afterEach(() => {
  localStorage.clear();
});

describe("planner undo", () => {
  it("undoes and redoes field mutations", () => {
    const planner = createPlanner();

    expect(planner.renameTask("a", "Renamed")).toBe(true);
    expect(planner.tasks.value.find((task) => task.id === "a")?.["std.name"]).toBe("Renamed");

    expect(planner.undo()).toBe(true);
    expect(planner.tasks.value.find((task) => task.id === "a")?.["std.name"]).toBe("Alpha");

    expect(planner.redo()).toBe(true);
    expect(planner.tasks.value.find((task) => task.id === "a")?.["std.name"]).toBe("Renamed");
  });

  it("restores a deleted task on undo", () => {
    const planner = createPlanner();

    planner.deleteTask("a");
    expect(planner.tasks.value.some((task) => task.id === "a")).toBe(false);

    expect(planner.undo()).toBe(true);
    expect(planner.tasks.value.find((task) => task.id === "a")?.["std.name"]).toBe("Alpha");

    expect(planner.redo()).toBe(true);
    expect(planner.tasks.value.some((task) => task.id === "a")).toBe(false);
  });

  it("removes a created task on undo and recreates it on redo", () => {
    const planner = createPlanner();
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
    const planner = createPlanner();
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
