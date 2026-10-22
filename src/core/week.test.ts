import { describe, expect, it } from "vitest";
import { emptyWeekDocument, isoWeekForLocalDate, localDateKey, weekDocumentPath } from "./week";

describe("week paths", () => {
  it("maps local dates to ISO week files", () => {
    const date = new Date(2026, 7, 9);

    expect(localDateKey(date)).toBe("2026-08-09");
    expect(isoWeekForLocalDate(date)).toMatchObject({ key: "2026-W32", startDate: "2026-08-03" });
    expect(weekDocumentPath(date)).toBe("01-personal/planner/2026-W32.upl.json");
  });

  it("builds an empty week container", () => {
    expect(emptyWeekDocument(new Date(2026, 8, 25))).toEqual({
      id: "week_2026_W39",
      kind: "container",
      "std.name": "Week 39",
      tasks: [],
    });
  });
});
