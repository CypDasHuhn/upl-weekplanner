import { readTags } from "./tags.ts";
import type { UplDocument } from "./types";

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
export const SNAP_MINUTES = 15;
export const MIN_DURATION_MINUTES = 15;
export const HOUR_PX = 56;

export interface PlanBlock {
  taskId: string;
  title: string;
  closed: boolean;
  dayIndex: number;
  startMinutes: number;
  durationMinutes: number;
  tags: string[];
  lane: number;
  laneCount: number;
}

export function startOfWeek(reference: Date): Date {
  const date = new Date(reference);
  date.setHours(0, 0, 0, 0);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return date;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function dayIndexFor(date: Date, weekStart: Date): number {
  for (let index = 0; index < 7; index += 1) {
    if (isSameDay(addDays(weekStart, index), date)) return index;
  }
  return -1;
}

export function minutesIntoDay(date: Date): number {
  return date.getHours() * MINUTES_PER_HOUR + date.getMinutes() + date.getSeconds() / 60;
}

export function instantFor(weekStart: Date, dayIndex: number, minutes: number): Date {
  const date = addDays(weekStart, dayIndex);
  date.setHours(0, 0, 0, 0);
  date.setMinutes(Math.round(minutes));
  return date;
}

export function snap(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function parseIsoDuration(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value.trim());
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  if (!days && !hours && !minutes && !seconds) return null;
  return (
    Number(days ?? 0) * MINUTES_PER_DAY +
    Number(hours ?? 0) * MINUTES_PER_HOUR +
    Number(minutes ?? 0) +
    Number(seconds ?? 0) / 60
  );
}

export function formatIsoDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const days = Math.floor(minutes / MINUTES_PER_DAY);
  const rest = minutes % MINUTES_PER_DAY;
  const hours = Math.floor(rest / MINUTES_PER_HOUR);
  const mins = rest % MINUTES_PER_HOUR;
  if (days > 0 && hours === 0 && mins === 0) return `P${days}D`;
  const time = `${hours > 0 ? `${hours}H` : ""}${mins > 0 ? `${mins}M` : ""}`;
  return `${days > 0 ? `P${days}D` : "P"}T${time || "0M"}`;
}

export function formatClock(minutes: number): string {
  const normalized = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / MINUTES_PER_HOUR);
  const mins = normalized % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function readBlocks(document: UplDocument, weekStart: Date, laneOrder: readonly string[] = []): PlanBlock[] {
  const blocks: PlanBlock[] = [];
  for (const task of document.tasks ?? []) {
    const startValue = task["std.time.start"];
    const durationMinutes = parseIsoDuration(task["std.time.duration"]);
    if (typeof startValue !== "string" || durationMinutes === null || durationMinutes <= 0) continue;

    const start = new Date(startValue);
    if (Number.isNaN(start.getTime())) continue;

    const dayIndex = dayIndexFor(start, weekStart);
    if (dayIndex < 0) continue;

    const startMinutes = snap(minutesIntoDay(start));
    const available = MINUTES_PER_DAY - startMinutes;
    const clampedDuration = clamp(Math.round(durationMinutes), MIN_DURATION_MINUTES, available);
    blocks.push({
      taskId: task.id,
      title: typeof task["std.name"] === "string" ? task["std.name"] : "Untitled",
      closed: task["std.status.closed"] === true,
      dayIndex,
      startMinutes,
      durationMinutes: clampedDuration,
      tags: readTags(task),
      lane: 0,
      laneCount: 1,
    });
  }
  return assignLanes(blocks, laneOrder);
}

export function assignLanes(blocks: PlanBlock[], laneOrder: readonly string[] = []): PlanBlock[] {
  const byDay = new Map<number, PlanBlock[]>();
  for (const block of blocks) {
    const day = byDay.get(block.dayIndex);
    if (day) day.push(block);
    else byDay.set(block.dayIndex, [block]);
  }

  const rank = new Map(laneOrder.map((taskId, index) => [taskId, index] as const));
  const result: PlanBlock[] = [];
  for (const dayBlocks of byDay.values()) {
    result.push(...assignDayLanes(dayBlocks, rank));
  }
  return result;
}

function assignDayLanes(blocks: PlanBlock[], rank: Map<string, number>): PlanBlock[] {
  const visited = new Set<number>();
  const result: PlanBlock[] = [];

  blocks.forEach((_, index) => {
    if (visited.has(index)) return;
    const component: PlanBlock[] = [];
    const stack = [index];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined || visited.has(current)) continue;
      visited.add(current);
      component.push(blocks[current]);
      blocks.forEach((other, otherIndex) => {
        if (!visited.has(otherIndex) && overlaps(blocks[current], other)) stack.push(otherIndex);
      });
    }
    result.push(...assignComponentLanes(component, rank));
  });

  return result;
}

function assignComponentLanes(blocks: PlanBlock[], rank: Map<string, number>): PlanBlock[] {
  const sorted = [...blocks].sort(
    (left, right) => left.startMinutes - right.startMinutes || right.durationMinutes - left.durationMinutes,
  );
  const laneEnds: number[] = [];
  const assigned = sorted.map((block) => {
    let lane = laneEnds.findIndex((end) => end <= block.startMinutes);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = block.startMinutes + block.durationMinutes;
    return { ...block, lane };
  });

  const laneRanks = new Map<number, number>();
  for (const block of assigned) {
    const blockRank = rank.get(block.taskId) ?? Number.POSITIVE_INFINITY;
    const laneRank = laneRanks.get(block.lane);
    if (laneRank === undefined || blockRank < laneRank) laneRanks.set(block.lane, blockRank);
  }

  const laneOrder = [...laneRanks.keys()].sort((left, right) => {
    const leftRank = laneRanks.get(left) ?? Number.POSITIVE_INFINITY;
    const rightRank = laneRanks.get(right) ?? Number.POSITIVE_INFINITY;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left - right;
  });
  const remap = new Map(laneOrder.map((lane, index) => [lane, index] as const));

  return assigned.map((block) => ({
    ...block,
    lane: remap.get(block.lane)!,
    laneCount: laneOrder.length,
  }));
}

function overlaps(left: PlanBlock, right: PlanBlock): boolean {
  return (
    left.startMinutes < right.startMinutes + right.durationMinutes &&
    right.startMinutes < left.startMinutes + left.durationMinutes
  );
}
