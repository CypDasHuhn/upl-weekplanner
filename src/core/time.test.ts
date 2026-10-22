import { describe, expect, it } from "vitest";
import {
  addDays,
  assignLanes,
  dayIndexFor,
  formatClock,
  formatIsoDuration,
  instantFor,
  minutesIntoDay,
  parseIsoDuration,
  readBlocks,
  startOfWeek,
  type PlanBlock,
} from "./time";

function block(taskId: string, startMinutes: number, durationMinutes: number): PlanBlock {
  return { taskId, title: taskId, closed: false, dayIndex: 0, startMinutes, durationMinutes, lane: 0, laneCount: 1 };
}

describe("iso durations", () => {
  it("parses hours, minutes and days", () => {
    expect(parseIsoDuration("PT2H")).toBe(120);
    expect(parseIsoDuration("PT1H30M")).toBe(90);
    expect(parseIsoDuration("PT45M")).toBe(45);
    expect(parseIsoDuration("P1D")).toBe(1440);
    expect(parseIsoDuration("nope")).toBeNull();
  });

  it("formats the compact week planner duration", () => {
    expect(formatIsoDuration(120)).toBe("PT2H");
    expect(formatIsoDuration(90)).toBe("PT1H30M");
    expect(formatIsoDuration(45)).toBe("PT45M");
    expect(formatIsoDuration(1440)).toBe("P1D");
  });
});

describe("week geometry", () => {
  it("starts the week on monday", () => {
    const week = startOfWeek(new Date(2026, 3, 1, 15, 30));

    expect(week.getDay()).toBe(1);
    expect(week.getDate()).toBe(30);
    expect(week.getMonth()).toBe(2);
  });

  it("round trips a day and minute through a utc instant", () => {
    const week = startOfWeek(new Date(2026, 3, 1));
    const instant = instantFor(week, 2, 9 * 60 + 30);

    expect(dayIndexFor(instant, week)).toBe(2);
    expect(minutesIntoDay(instant)).toBe(570);
  });

  it("formats clock values", () => {
    expect(formatClock(570)).toBe("09:30");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(1440)).toBe("00:00");
  });
});

describe("lane assignment", () => {
  it("splits overlapping blocks into lanes", () => {
    const lanes = assignLanes([block("a", 9 * 60, 120), block("b", 10 * 60, 120)]);

    expect(lanes.map((item) => item.laneCount)).toEqual([2, 2]);
    expect(lanes.map((item) => item.lane)).toEqual([0, 1]);
  });

  it("keeps touching blocks in one lane", () => {
    const lanes = assignLanes([block("a", 9 * 60, 60), block("b", 10 * 60, 60)]);

    expect(lanes.map((item) => item.laneCount)).toEqual([1, 1]);
    expect(lanes.map((item) => item.lane)).toEqual([0, 0]);
  });
});

describe("reading blocks", () => {
  it("keeps only tasks inside the week", () => {
    const week = startOfWeek(new Date(2026, 3, 1));
    const inside = instantFor(week, 0, 9 * 60).toISOString();
    const outside = addDays(week, 8).toISOString();
    const document = {
      id: "week",
      kind: "container",
      tasks: [
        { id: "inside", "std.name": "Inside", "std.time.start": inside, "std.time.duration": "PT1H" },
        { id: "outside", "std.name": "Outside", "std.time.start": outside, "std.time.duration": "PT1H" },
      ],
    };

    const blocks = readBlocks(document, week);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.taskId).toBe("inside");
  });
});
