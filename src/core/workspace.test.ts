import { describe, expect, it } from "vitest";
import { emptyWorkspaceDocument, readTagColors, serializeTagColors } from "./workspace";

describe("workspace document", () => {
  it("builds an empty planner workspace", () => {
    expect(emptyWorkspaceDocument()).toEqual({
      id: "planner_workspace",
      kind: "workspace",
      "std.name": "Planner",
    });
  });

  it("reads normalized tag colors", () => {
    expect(
      readTagColors({
        " #work ": { text: "#111111", background: "#222222" },
        broken: { text: "#333333" },
        other: null,
      }),
    ).toEqual({ work: { text: "#111111", background: "#222222" } });
  });

  it("drops empty tag color maps", () => {
    expect(serializeTagColors({})).toBeNull();
    expect(serializeTagColors({ work: { text: "#111111", background: "#222222" } })).toEqual({
      work: { text: "#111111", background: "#222222" },
    });
  });
});
