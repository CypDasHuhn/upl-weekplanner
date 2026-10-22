import { clamp, HOUR_PX, MIN_DURATION_MINUTES, MINUTES_PER_DAY, type PlanBlock } from "./time";

export type EdgeMode = "push" | "pull" | "stretch" | "overlap";

export interface PlanEdge {
  id: string;
  dayIndex: number;
  lane: number;
  minutes: number;
  above: PlanBlock | null;
  below: PlanBlock | null;
  left: number;
  width: number;
  height: number;
}

export interface EdgeChange {
  block: PlanBlock;
  startMinutes: number;
  durationMinutes: number;
}

interface BoundaryGroup {
  dayIndex: number;
  lane: number;
  minutes: number;
  above: PlanBlock[];
  below: PlanBlock[];
}

export function buildEdges(blocks: PlanBlock[]): PlanEdge[] {
  const groups = new Map<string, BoundaryGroup>();

  for (const block of blocks) {
    addBoundary(groups, block, block.startMinutes, "below");
    addBoundary(groups, block, block.startMinutes + block.durationMinutes, "above");
  }

  return [...groups.values()]
    .map((group) => {
      const above = group.above[0] ?? null;
      const below = group.below[0] ?? null;
      const rect = edgeRect(above, below);
      return {
        id: `${group.dayIndex}:${group.lane}:${group.minutes}`,
        dayIndex: group.dayIndex,
        lane: group.lane,
        minutes: group.minutes,
        above,
        below,
        ...rect,
        height: edgeHeight(above, below),
      };
    })
    .sort((left, right) => left.dayIndex - right.dayIndex || left.minutes - right.minutes || left.lane - right.lane);
}

export function planEdge(edge: PlanEdge, mode: EdgeMode, delta: number, laneBlocks: PlanBlock[]): EdgeChange[] | null {
  if (delta === 0) return [];
  if (mode === "push") return planPush(edge, delta, laneBlocks);
  if (mode === "pull") return planPull(edge, delta);
  if (mode === "overlap") return planOverlap(edge, delta);
  return planStretch(edge, delta, laneBlocks);
}

function addBoundary(
  groups: Map<string, BoundaryGroup>,
  block: PlanBlock,
  minutes: number,
  side: "above" | "below",
): void {
  const key = `${block.dayIndex}:${block.lane}:${minutes}`;
  const group = groups.get(key) ?? {
    dayIndex: block.dayIndex,
    lane: block.lane,
    minutes,
    above: [],
    below: [],
  };
  group[side].push(block);
  groups.set(key, group);
}

function edgeRect(above: PlanBlock | null, below: PlanBlock | null): Pick<PlanEdge, "left" | "width"> {
  if (above && below) {
    const upper = blockRect(above);
    const lower = blockRect(below);
    const left = Math.max(upper.left, lower.left);
    const right = Math.min(upper.left + upper.width, lower.left + lower.width);
    if (right > left) return { left, width: right - left };
  }
  const reference = above ?? below;
  if (!reference) return { left: 0, width: 90 };
  return blockRect(reference);
}

function blockRect(block: PlanBlock): Pick<PlanEdge, "left" | "width"> {
  const width = 90 / Math.max(1, block.laneCount);
  return { left: block.lane * width, width };
}

function edgeHeight(above: PlanBlock | null, below: PlanBlock | null): number {
  const heights = [above, below]
    .filter((block): block is PlanBlock => block !== null)
    .map((block) => Math.max((block.durationMinutes / 60) * HOUR_PX, 14));
  if (heights.length === 0) return 10;
  return clamp(Math.min(...heights) * 0.25, 8, 16);
}

function planPush(edge: PlanEdge, delta: number, laneBlocks: PlanBlock[]): EdgeChange[] | null {
  if (delta > 0) return planPushDown(edge, delta, laneBlocks);
  return planPushUp(edge, -delta, laneBlocks);
}

function planPushDown(edge: PlanEdge, distance: number, laneBlocks: PlanBlock[]): EdgeChange[] | null {
  const above = edge.above;
  const below = edge.below ?? (above ? nextTaskAfter(above, laneBlocks) : null);
  if (!above && !below) return null;

  let maximum = Number.POSITIVE_INFINITY;
  if (above) {
    maximum = Math.min(maximum, MINUTES_PER_DAY - (above.startMinutes + above.durationMinutes));
  }
  if (below) {
    if (above) {
      maximum = Math.min(
        maximum,
        below.startMinutes +
          below.durationMinutes -
          MIN_DURATION_MINUTES -
          (above.startMinutes + above.durationMinutes),
      );
    } else {
      maximum = Math.min(maximum, below.durationMinutes - MIN_DURATION_MINUTES);
    }
  }
  if (maximum <= 0) return [];

  const amount = Math.min(distance, maximum);
  if (amount <= 0) return [];

  const changes: EdgeChange[] = [];
  if (above) {
    changes.push({
      block: above,
      startMinutes: above.startMinutes,
      durationMinutes: above.durationMinutes + amount,
    });
  }
  if (below) {
    const startMinutes = above
      ? Math.max(below.startMinutes, above.startMinutes + above.durationMinutes + amount)
      : below.startMinutes + amount;
    changes.push({
      block: below,
      startMinutes,
      durationMinutes: below.startMinutes + below.durationMinutes - startMinutes,
    });
  }
  return changes;
}

function planPushUp(edge: PlanEdge, distance: number, laneBlocks: PlanBlock[]): EdgeChange[] | null {
  const below = edge.below;
  const above = edge.above ?? (below ? previousTaskBefore(below, laneBlocks) : null);
  if (!above && !below) return null;

  let maximum = Number.POSITIVE_INFINITY;
  if (below) {
    maximum = Math.min(maximum, below.startMinutes);
  }
  if (above) {
    if (below) {
      maximum = Math.min(maximum, below.startMinutes - above.startMinutes - MIN_DURATION_MINUTES);
    } else {
      maximum = Math.min(maximum, above.durationMinutes - MIN_DURATION_MINUTES);
    }
  }
  if (maximum <= 0) return [];

  const amount = Math.min(distance, maximum);
  if (amount <= 0) return [];

  const changes: EdgeChange[] = [];
  if (below) {
    changes.push({
      block: below,
      startMinutes: below.startMinutes - amount,
      durationMinutes: below.durationMinutes + amount,
    });
  }
  if (above) {
    const durationMinutes = below
      ? Math.min(above.durationMinutes, below.startMinutes - amount - above.startMinutes)
      : above.durationMinutes - amount;
    changes.push({
      block: above,
      startMinutes: above.startMinutes,
      durationMinutes,
    });
  }
  return changes;
}

function nextTaskAfter(block: PlanBlock, laneBlocks: PlanBlock[]): PlanBlock | null {
  return (
    laneBlocks
      .filter((item) => item.taskId !== block.taskId && item.startMinutes >= block.startMinutes + block.durationMinutes)
      .sort((left, right) => left.startMinutes - right.startMinutes)[0] ?? null
  );
}

function previousTaskBefore(block: PlanBlock, laneBlocks: PlanBlock[]): PlanBlock | null {
  return (
    laneBlocks
      .filter((item) => item.taskId !== block.taskId && item.startMinutes < block.startMinutes)
      .sort((left, right) => right.startMinutes - left.startMinutes)[0] ?? null
  );
}

function planPull(edge: PlanEdge, delta: number): EdgeChange[] | null {
  if (delta > 0) {
    if (!edge.below) return null;
    const distance = Math.min(delta, edge.below.durationMinutes - MIN_DURATION_MINUTES);
    if (distance <= 0) return [];
    return [
      {
        block: edge.below,
        startMinutes: edge.below.startMinutes + distance,
        durationMinutes: edge.below.durationMinutes - distance,
      },
    ];
  }

  if (!edge.above) return null;
  const distance = Math.max(delta, MIN_DURATION_MINUTES - edge.above.durationMinutes);
  if (distance >= 0) return [];
  return [
    {
      block: edge.above,
      startMinutes: edge.above.startMinutes,
      durationMinutes: edge.above.durationMinutes + distance,
    },
  ];
}

function planOverlap(edge: PlanEdge, delta: number): EdgeChange[] | null {
  if (delta > 0) {
    if (edge.above) {
      const maximum = MINUTES_PER_DAY - (edge.above.startMinutes + edge.above.durationMinutes);
      const amount = Math.min(delta, maximum);
      if (amount <= 0) return [];
      return [
        {
          block: edge.above,
          startMinutes: edge.above.startMinutes,
          durationMinutes: edge.above.durationMinutes + amount,
        },
      ];
    }
    if (!edge.below) return null;
    const amount = Math.min(delta, edge.below.durationMinutes - MIN_DURATION_MINUTES);
    if (amount <= 0) return [];
    return [
      {
        block: edge.below,
        startMinutes: edge.below.startMinutes + amount,
        durationMinutes: edge.below.durationMinutes - amount,
      },
    ];
  }

  if (edge.below) {
    const maximum = edge.below.startMinutes;
    const amount = Math.min(-delta, maximum);
    if (amount <= 0) return [];
    return [
      {
        block: edge.below,
        startMinutes: edge.below.startMinutes - amount,
        durationMinutes: edge.below.durationMinutes + amount,
      },
    ];
  }
  if (!edge.above) return null;
  const amount = Math.min(-delta, edge.above.durationMinutes - MIN_DURATION_MINUTES);
  if (amount <= 0) return [];
  return [
    {
      block: edge.above,
      startMinutes: edge.above.startMinutes,
      durationMinutes: edge.above.durationMinutes - amount,
    },
  ];
}

function planStretch(edge: PlanEdge, delta: number, laneBlocks: PlanBlock[]): EdgeChange[] | null {
  if (delta > 0) {
    if (!edge.above) return planPush(edge, delta, laneBlocks);

    const above = edge.above;
    const aboveDuration = above.durationMinutes + delta;
    if (aboveDuration > MINUTES_PER_DAY - above.startMinutes) return null;

    const changes = new Map<string, EdgeChange>();
    changes.set(above.taskId, {
      block: above,
      startMinutes: above.startMinutes,
      durationMinutes: aboveDuration,
    });

    let cursor = above.startMinutes + aboveDuration;
    const downstream = laneBlocks
      .filter((block) => block.taskId !== above.taskId && block.startMinutes >= above.startMinutes)
      .sort((left, right) => left.startMinutes - right.startMinutes);

    for (const block of downstream) {
      const startMinutes = block.startMinutes + Math.max(0, cursor - block.startMinutes);
      const end = startMinutes + block.durationMinutes;
      if (end > MINUTES_PER_DAY) return null;
      changes.set(block.taskId, {
        block,
        startMinutes,
        durationMinutes: block.durationMinutes,
      });
      cursor = end;
    }

    return [...changes.values()];
  }

  if (!edge.below) return planPush(edge, delta, laneBlocks);

  const below = edge.below;
  const belowStart = below.startMinutes + delta;
  const belowDuration = below.durationMinutes - delta;
  if (belowStart < 0) return null;

  const changes = new Map<string, EdgeChange>();
  changes.set(below.taskId, {
    block: below,
    startMinutes: belowStart,
    durationMinutes: belowDuration,
  });

  let cursor = belowStart;
  const upstream = laneBlocks
    .filter((block) => block.taskId !== below.taskId && block.startMinutes < below.startMinutes)
    .sort((left, right) => right.startMinutes - left.startMinutes);

  for (const block of upstream) {
    const end = block.startMinutes + block.durationMinutes;
    const startMinutes = block.startMinutes - Math.max(0, end - cursor);
    if (startMinutes < 0) return null;
    changes.set(block.taskId, {
      block,
      startMinutes,
      durationMinutes: block.durationMinutes,
    });
    cursor = startMinutes;
  }

  return [...changes.values()];
}
