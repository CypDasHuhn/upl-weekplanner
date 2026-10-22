import { describe, expect, it } from "vitest";
import {
  buildWeekPlans,
  isoWeekForDate,
  parseDayPlanner,
  zonedTimeToUtc,
  type DayPlannerEntry,
} from "./dayPlannerImport";

const sample = [
  "# Day planner",
  "",
  "- [ ] 14:00 - 16:30 Work",
  "  ```yaml",
  "  planner:",
  "    log: []",
  "  ```",
  "- [x] 16:30 - 17:00 #eat",
  "- [ ] 17:00 - 18:00 Greet Folks + Eat #eat #leisure",
  "- [ ] 18:00 - 18:30 Chill + #eat",
  "- [ ] 21:30 - 22:10 #cool-off",
  "",
  "## Notes",
  "- [ ] 09:00 - 10:00 Not a plan",
].join("\n");

describe("parseDayPlanner", () => {
  it("reads timed tasks, tags and completion state", () => {
    const entries = parseDayPlanner(sample, "2026-08-09", "2026-08-09.md");

    expect(entries).toHaveLength(5);
    expect(entries[0]).toMatchObject({
      date: "2026-08-09",
      start: "14:00",
      end: "16:30",
      name: "Work",
      tags: [],
      closed: false,
      line: 3,
    });
    expect(entries[1]).toMatchObject({ name: "eat", tags: ["eat"], closed: true, line: 8 });
    expect(entries[2]).toMatchObject({ name: "Greet Folks + Eat", tags: ["eat", "leisure"] });
    expect(entries[3]).toMatchObject({ name: "Chill", tags: ["eat"] });
    expect(entries[4]).toMatchObject({ name: "cool-off", tags: ["cool-off"] });
  });

  it("uses a custom heading and ignores other sections", () => {
    const markdown = ["# Day planner", "- [ ] 08:00 - 09:00 Wrong", "## Plan", "- [ ] 09:00 - 10:00 Right"].join("\n");
    const entries = parseDayPlanner(markdown, "2026-08-09", "note.md", { heading: "Plan" });

    expect(entries.map((entry) => entry.name)).toEqual(["Right"]);
  });

  it("rejects overnight ranges and invalid dates", () => {
    expect(() => parseDayPlanner("# Day planner\n- [ ] 22:00 - 01:00 Sleep", "2026-08-09")).toThrow(
      "end time must be after start time",
    );
    expect(() => parseDayPlanner("", "2026-02-30")).toThrow("invalid date");
  });
});

describe("isoWeekForDate", () => {
  it("uses ISO week years across boundaries", () => {
    expect(isoWeekForDate("2026-08-09")).toMatchObject({
      year: 2026,
      week: 32,
      key: "2026-W32",
      documentId: "week_2026_W32",
      startDate: "2026-08-03",
      fileName: "2026-W32.upl.json",
    });
    expect(isoWeekForDate("2027-01-01")).toMatchObject({ key: "2026-W53", startDate: "2026-12-28" });
  });
});

describe("zonedTimeToUtc", () => {
  it("applies summer and winter offsets", () => {
    expect(zonedTimeToUtc("2026-08-09", "14:00", "Europe/Berlin").toISOString()).toBe("2026-08-09T12:00:00.000Z");
    expect(zonedTimeToUtc("2026-01-15", "09:00", "Europe/Berlin").toISOString()).toBe("2026-01-15T08:00:00.000Z");
  });
});

describe("buildWeekPlans", () => {
  it("groups by ISO week and converts wall-clock times", () => {
    const entries = [
      ...parseDayPlanner("# Day planner\n- [ ] 06:50 - 17:00 #work", "2026-08-10", "a.md"),
      ...parseDayPlanner("# Day planner\n- [ ] 05:40 - 18:00 #work", "2026-08-11", "b.md"),
    ];
    let next = 0;
    const plans = buildWeekPlans(entries, "Europe/Berlin", () => `task-${++next}`);

    expect(plans).toHaveLength(1);
    expect(plans[0]!.week).toMatchObject({ key: "2026-W33", name: "Week 33", startDate: "2026-08-10" });
    expect(plans[0]!.document).toMatchObject({
      id: "week_2026_W33",
      kind: "container",
      "std.name": "Week 33",
    });
    expect(plans[0]!.document.tasks).toEqual([
      {
        id: "task-1",
        "std.name": "work",
        "std.time.start": "2026-08-10T04:50:00.000Z",
        "std.time.duration": "PT10H10M",
        "std.status.closed": false,
        "std.tags": ["work"],
      },
      {
        id: "task-2",
        "std.name": "work",
        "std.time.start": "2026-08-11T03:40:00.000Z",
        "std.time.duration": "PT12H20M",
        "std.status.closed": false,
        "std.tags": ["work"],
      },
    ]);
  });

  it("sorts weeks and omits empty tags", () => {
    const entries: DayPlannerEntry[] = [
      ...parseDayPlanner("# Day planner\n- [ ] 10:00 - 11:00 Later", "2026-09-01"),
      ...parseDayPlanner("# Day planner\n- [ ] 10:00 - 11:00 Earlier", "2026-08-09"),
    ];
    const plans = buildWeekPlans(entries, "UTC", () => "id");

    expect(plans.map((plan) => plan.week.key)).toEqual(["2026-W32", "2026-W36"]);
    expect(plans[0]!.document.tasks?.[0]).not.toHaveProperty("std.tags");
    expect(plans[0]!.document.tasks?.[0]).not.toHaveProperty("std.time.end");
  });
});
