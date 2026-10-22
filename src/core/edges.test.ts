import { describe, expect, it } from "vitest";
import { buildEdges, planEdge } from "./edges";
import type { PlanBlock } from "./time";

function block(
  id: string,
  startMinutes: number,
  durationMinutes: number,
  overrides: Partial<PlanBlock> = {},
): PlanBlock {
  return {
    taskId: id,
    title: id,
    closed: false,
    dayIndex: 0,
    startMinutes,
    durationMinutes,
    tags: [],
    lane: 0,
    laneCount: 1,
    ...overrides,
  };
}

function edgeAt(blocks: PlanBlock[], minutes: number, lane = 0) {
  const edge = buildEdges(blocks).find((item) => item.minutes === minutes && item.lane === lane);
  if (!edge) throw new Error(`missing edge at ${minutes}`);
  return edge;
}

function changeFor(changes: ReturnType<typeof planEdge>, id: string) {
  return changes?.find((change) => change.block.taskId === id);
}

describe("edge building", () => {
  it("shares a boundary between touching tasks", () => {
    const blocks = [block("a", 540, 60), block("b", 600, 60)];

    const shared = edgeAt(blocks, 600);

    expect(shared.above?.taskId).toBe("a");
    expect(shared.below?.taskId).toBe("b");
    expect(buildEdges(blocks)).toHaveLength(3);
  });

  it("keeps free boundaries single-sided", () => {
    const blocks = [block("a", 540, 60), block("b", 630, 60)];

    expect(edgeAt(blocks, 600).above?.taskId).toBe("a");
    expect(edgeAt(blocks, 600).below).toBeNull();
    expect(edgeAt(blocks, 630).above).toBeNull();
    expect(edgeAt(blocks, 630).below?.taskId).toBe("b");
  });

  it("does not merge boundaries across lanes", () => {
    const blocks = [block("a", 540, 60), block("b", 600, 60, { lane: 1 })];

    expect(edgeAt(blocks, 600, 0).below).toBeNull();
    expect(edgeAt(blocks, 600, 1).above).toBeNull();
  });
});

describe("push", () => {
  it("grows the upper task and shrinks the lower one", () => {
    const blocks = [block("a", 540, 60), block("b", 600, 60), block("c", 660, 60)];

    const changes = planEdge(edgeAt(blocks, 600), "push", 30, blocks);

    expect(changeFor(changes, "a")).toMatchObject({ startMinutes: 540, durationMinutes: 90 });
    expect(changeFor(changes, "b")).toMatchObject({ startMinutes: 630, durationMinutes: 30 });
    expect(changeFor(changes, "c")).toBeUndefined();
  });

  it("mirrors when dragged up", () => {
    const blocks = [block("a", 540, 60), block("b", 600, 60)];

    const changes = planEdge(edgeAt(blocks, 600), "push", -30, blocks);

    expect(changeFor(changes, "a")).toMatchObject({ startMinutes: 540, durationMinutes: 30 });
    expect(changeFor(changes, "b")).toMatchObject({ startMinutes: 570, durationMinutes: 90 });
  });

  it("resizes into free space below", () => {
    const blocks = [block("a", 540, 60)];

    const changes = planEdge(edgeAt(blocks, 600), "push", 30, blocks);

    expect(changeFor(changes, "a")).toMatchObject({ startMinutes: 540, durationMinutes: 90 });
  });

  it("resizes into free space above", () => {
    const blocks = [block("b", 600, 60)];

    const changes = planEdge(edgeAt(blocks, 600), "push", 30, blocks);

    expect(changeFor(changes, "b")).toMatchObject({ startMinutes: 630, durationMinutes: 30 });
  });

  it("stops at the minimum duration", () => {
    const blocks = [block("a", 540, 60), block("b", 600, 15)];

    expect(planEdge(edgeAt(blocks, 600), "push", 30, blocks)).toEqual([]);
  });

  it("pushes a later task across a gap instead of overlapping it", () => {
    const blocks = [block("a", 540, 60), block("b", 660, 60)];

    const changes = planEdge(edgeAt(blocks, 600), "push", 120, blocks);

    expect(changeFor(changes, "a")).toMatchObject({ startMinutes: 540, durationMinutes: 165 });
    expect(changeFor(changes, "b")).toMatchObject({ startMinutes: 705, durationMinutes: 15 });
  });

  it("pushes an earlier task across a gap when dragging up", () => {
    const blocks = [block("a", 540, 60), block("b", 660, 60)];

    const changes = planEdge(edgeAt(blocks, 660), "push", -120, blocks);

    expect(changeFor(changes, "a")).toMatchObject({ startMinutes: 540, durationMinutes: 15 });
    expect(changeFor(changes, "b")).toMatchObject({ startMinutes: 555, durationMinutes: 165 });
  });
});

describe("overlap", () => {
  it("grows the upper task over the lower one", () => {
    const blocks = [block("a", 540, 60), block("b", 600, 60)];

    const changes = planEdge(edgeAt(blocks, 600), "overlap", 30, blocks);

    expect(changeFor(changes, "a")).toMatchObject({ startMinutes: 540, durationMinutes: 90 });
    expect(changeFor(changes, "b")).toBeUndefined();
  });

  it("grows the lower task over the upper one", () => {
    const blocks = [block("a", 540, 60), block("b", 600, 60)];

    const changes = planEdge(edgeAt(blocks, 600), "overlap", -30, blocks);

    expect(changeFor(changes, "a")).toBeUndefined();
    expect(changeFor(changes, "b")).toMatchObject({ startMinutes: 570, durationMinutes: 90 });
  });

  it("grows a free bottom edge over a later task", () => {
    const blocks = [block("a", 540, 60), block("b", 660, 60)];

    const changes = planEdge(edgeAt(blocks, 600), "overlap", 120, blocks);

    expect(changeFor(changes, "a")).toMatchObject({ startMinutes: 540, durationMinutes: 180 });
    expect(changeFor(changes, "b")).toBeUndefined();
  });

  it("grows a free top edge over an earlier task", () => {
    const blocks = [block("a", 540, 60), block("b", 660, 60)];

    const changes = planEdge(edgeAt(blocks, 660), "overlap", -120, blocks);

    expect(changeFor(changes, "a")).toBeUndefined();
    expect(changeFor(changes, "b")).toMatchObject({ startMinutes: 540, durationMinutes: 180 });
  });
});

describe("pull", () => {
  it("shrinks the lower task and leaves a gap above", () => {
    const blocks = [block("a", 540, 60), block("b", 600, 60)];

    const changes = planEdge(edgeAt(blocks, 600), "pull", 30, blocks);

    expect(changeFor(changes, "a")).toBeUndefined();
    expect(changeFor(changes, "b")).toMatchObject({ startMinutes: 630, durationMinutes: 30 });
  });

  it("shrinks the upper task and leaves a gap below", () => {
    const blocks = [block("a", 540, 60), block("b", 600, 60)];

    const changes = planEdge(edgeAt(blocks, 600), "pull", -30, blocks);

    expect(changeFor(changes, "a")).toMatchObject({ startMinutes: 540, durationMinutes: 30 });
    expect(changeFor(changes, "b")).toBeUndefined();
  });

  it("does nothing when the dragged-into side is free", () => {
    const blocks = [block("a", 540, 60)];

    expect(planEdge(edgeAt(blocks, 600), "pull", 30, blocks)).toBeNull();
    expect(planEdge(edgeAt(blocks, 540), "pull", -30, blocks)).toBeNull();
  });
});

describe("stretch", () => {
  it("moves the whole touching chain down", () => {
    const blocks = [block("a", 540, 60), block("b", 600, 60), block("c", 660, 60)];

    const changes = planEdge(edgeAt(blocks, 600), "stretch", 30, blocks);

    expect(changeFor(changes, "a")).toMatchObject({ startMinutes: 540, durationMinutes: 90 });
    expect(changeFor(changes, "b")).toMatchObject({ startMinutes: 630, durationMinutes: 60 });
    expect(changeFor(changes, "c")).toMatchObject({ startMinutes: 690, durationMinutes: 60 });
  });

  it("moves the whole touching chain up", () => {
    const blocks = [block("a", 540, 60), block("b", 600, 60), block("c", 660, 60)];

    const changes = planEdge(edgeAt(blocks, 600), "stretch", -30, blocks);

    expect(changeFor(changes, "a")).toMatchObject({ startMinutes: 510, durationMinutes: 60 });
    expect(changeFor(changes, "b")).toMatchObject({ startMinutes: 570, durationMinutes: 90 });
    expect(changeFor(changes, "c")).toBeUndefined();
  });

  it("lets gaps absorb the shift before moving later tasks", () => {
    const blocks = [block("a", 540, 60), block("b", 630, 60), block("c", 720, 60)];

    const changes = planEdge(edgeAt(blocks, 600), "stretch", 45, blocks);

    expect(changeFor(changes, "a")).toMatchObject({ startMinutes: 540, durationMinutes: 105 });
    expect(changeFor(changes, "b")).toMatchObject({ startMinutes: 645, durationMinutes: 60 });
    expect(changeFor(changes, "c")).toMatchObject({ startMinutes: 720, durationMinutes: 60 });
  });

  it("reaches later tasks from a free bottom edge", () => {
    const blocks = [block("a", 540, 60), block("b", 630, 60)];

    const changes = planEdge(edgeAt(blocks, 600), "stretch", 45, blocks);

    expect(changeFor(changes, "a")).toMatchObject({ startMinutes: 540, durationMinutes: 105 });
    expect(changeFor(changes, "b")).toMatchObject({ startMinutes: 645, durationMinutes: 60 });
  });

  it("reaches earlier tasks from a free top edge", () => {
    const blocks = [block("a", 540, 60), block("b", 660, 60)];

    const changes = planEdge(edgeAt(blocks, 660), "stretch", -75, blocks);

    expect(changeFor(changes, "a")).toMatchObject({ startMinutes: 525, durationMinutes: 60 });
    expect(changeFor(changes, "b")).toMatchObject({ startMinutes: 585, durationMinutes: 135 });
  });

  it("rejects a chain that leaves the day", () => {
    const blocks = [block("a", 540, 60), block("b", 600, 60)];

    expect(planEdge(edgeAt(blocks, 600), "stretch", 1000, blocks)).toBeNull();
  });
});
