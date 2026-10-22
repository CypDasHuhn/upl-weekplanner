import { describe, expect, it } from "vitest";
import { buildHistoryEntry, type AppliedRequest } from "./history";
import type { UplDocument, UplRequest } from "./types";

function task(id: string, fields: Record<string, unknown> = {}): UplDocument {
  return {
    id: "week",
    kind: "container",
    tasks: [{ id, "std.name": id, ...fields }],
  };
}

function applied(
  before: UplDocument,
  request: UplRequest,
  after: UplDocument,
  changes: AppliedRequest["result"]["changes"],
): AppliedRequest {
  return { before, request, result: { ok: true, document: after, changes } };
}

describe("history requests", () => {
  it("inverts field changes with old values", () => {
    const before = task("a", { "std.name": "Before" });
    const after = task("a", { "std.name": "After" });
    const entry = buildHistoryEntry([
      applied(before, { requester: "gantt", mutations: [{ field: "std.name", value: "After", target: "a" }] }, after, [
        { field: "std.name", oldValue: "Before", newValue: "After", target: "a" },
      ]),
    ]);

    expect(entry?.undo).toEqual([
      { requester: "gantt", mutations: [{ field: "std.name", value: "Before", target: "a" }] },
    ]);
    expect(entry?.redo).toEqual([
      { requester: "gantt", mutations: [{ field: "std.name", value: "After", target: "a" }] },
    ]);
  });

  it("does not invert fields derived by handlers", () => {
    const before = task("a", {
      "std.time.start": "2026-04-06T09:00:00.000Z",
      "std.time.duration": "PT1H",
      "std.time.end": "2026-04-06T10:00:00.000Z",
    });
    const after = task("a", {
      "std.time.start": "2026-04-06T09:30:00.000Z",
      "std.time.duration": "PT1H",
      "std.time.end": "2026-04-06T10:30:00.000Z",
    });
    const entry = buildHistoryEntry([
      applied(
        before,
        {
          requester: "gantt",
          mutations: [{ field: "std.time.start", value: "2026-04-06T09:30:00.000Z", target: "a" }],
        },
        after,
        [
          {
            field: "std.time.start",
            oldValue: "2026-04-06T09:00:00.000Z",
            newValue: "2026-04-06T09:30:00.000Z",
            target: "a",
          },
          {
            field: "std.time.end",
            oldValue: "2026-04-06T10:00:00.000Z",
            newValue: "2026-04-06T10:30:00.000Z",
            target: "a",
          },
        ],
      ),
    ]);

    expect(entry?.undo).toEqual([
      {
        requester: "gantt",
        mutations: [{ field: "std.time.start", value: "2026-04-06T09:00:00.000Z", target: "a" }],
      },
    ]);
  });

  it("removes a created task on undo", () => {
    const before = task("a");
    const after: UplDocument = { ...task("a"), tasks: [...task("a").tasks!, { id: "b", "std.name": "B" }] };
    const request: UplRequest = {
      requester: "gantt",
      mutations: [],
      createTasks: [{ id: "b", "std.name": "B" }],
    };
    const entry = buildHistoryEntry([
      applied(before, request, after, [{ field: "std.name", oldValue: null, newValue: "B", target: "b" }]),
    ]);

    expect(entry?.undo).toEqual([{ requester: "gantt", mutations: [], removeTasks: ["b"] }]);
    expect(entry?.redo).toEqual([request]);
  });

  it("restores a removed task snapshot on undo", () => {
    const before = task("a", { "std.time.start": "2026-04-06T09:00:00.000Z" });
    const after: UplDocument = { ...task("a"), tasks: [] };
    const request: UplRequest = { requester: "gantt", mutations: [], removeTasks: ["a"] };
    const entry = buildHistoryEntry([applied(before, request, after, [])]);

    expect(entry?.undo).toEqual([
      {
        requester: "gantt",
        mutations: [],
        createTasks: [{ id: "a", "std.name": "a", "std.time.start": "2026-04-06T09:00:00.000Z" }],
      },
    ]);
  });

  it("unwinds multiple requests in reverse order", () => {
    const before = task("a", { "std.name": "Before" });
    const middle = task("a", { "std.name": "Middle" });
    const after = task("a", { "std.name": "After" });
    const first = applied(
      before,
      { requester: "gantt", mutations: [{ field: "std.name", value: "Middle", target: "a" }] },
      middle,
      [{ field: "std.name", oldValue: "Before", newValue: "Middle", target: "a" }],
    );
    const second = applied(
      middle,
      { requester: "gantt", mutations: [{ field: "std.name", value: "After", target: "a" }] },
      after,
      [{ field: "std.name", oldValue: "Middle", newValue: "After", target: "a" }],
    );

    const entry = buildHistoryEntry([first, second]);

    expect(entry?.undo.map((request) => request.mutations[0]?.value)).toEqual(["Middle", "Before"]);
    expect(entry?.redo).toEqual([first.request, second.request]);
  });
});
