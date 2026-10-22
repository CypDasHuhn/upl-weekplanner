import { describe, expect, it } from "vitest";
import { normalizeTags, parseTags, readTags, tagPaint } from "./tags";

describe("tags", () => {
  it("parses comma and space separated tags", () => {
    expect(parseTags("work, #urgent work, home")).toEqual(["work", "urgent", "home"]);
  });

  it("normalizes and deduplicates tag arrays", () => {
    expect(normalizeTags([" #work ", "work", 42, "", "#home"])).toEqual(["work", "home"]);
  });

  it("reads tags from a task", () => {
    expect(readTags({ id: "a", "std.tags": ["focus", "#work"] })).toEqual(["focus", "work"]);
  });
});

describe("tag paint", () => {
  const colors = {
    work: { text: "#112233", background: "#aabbcc" },
    urgent: { text: "#445566", background: "#ddeeff" },
  };

  it("uses a neutral block without tags", () => {
    expect(tagPaint([], colors)).toEqual({ color: "#1e293b", backgroundColor: "#f8fafc" });
  });

  it("uses the configured tag colors", () => {
    expect(tagPaint(["work"], colors)).toEqual({ color: "#112233", backgroundColor: "#aabbcc" });
  });

  it("stripes the block for multiple tags", () => {
    const paint = tagPaint(["work", "urgent"], colors);

    expect(paint.color).toBe("#112233");
    expect(paint.backgroundColor).toBe("#aabbcc");
    expect(paint.backgroundImage).toContain("#aabbcc");
    expect(paint.backgroundImage).toContain("#ddeeff");
    expect(paint.backgroundImage).toContain("repeating-linear-gradient");
  });
});
