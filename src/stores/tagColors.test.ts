import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WORKSPACE_PATH } from "../core/workspace";

const server = vi.hoisted(() => {
  class ServerError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
      this.name = "ServerError";
    }
  }
  return {
    loadDocumentFromServer: vi.fn(),
    loadTagsFromServer: vi.fn(),
    applyRequestsOnServer: vi.fn(),
    replaceDocumentOnServer: vi.fn(),
    ServerError,
  };
});

vi.mock("../core/server", () => server);

import { createTagColors } from "./tagColors";

const work = { text: "#111111", background: "#222222" };

beforeEach(() => {
  server.loadTagsFromServer.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("tag color store", () => {
  it("loads colors from the planner workspace", async () => {
    server.loadDocumentFromServer.mockResolvedValue({
      id: "planner_workspace",
      kind: "workspace",
      "std.tag.colors": { work },
    });
    server.loadTagsFromServer.mockResolvedValue(["home", "work"]);
    const store = createTagColors({});

    await expect(store.load()).resolves.toBe(true);

    expect(server.loadDocumentFromServer).toHaveBeenCalledWith(WORKSPACE_PATH);
    expect(store.colors.value).toEqual({ work });
    expect(store.tags.value).toEqual(["home", "work"]);
  });

  it("creates a missing workspace and migrates local colors", async () => {
    server.loadDocumentFromServer.mockRejectedValueOnce(new server.ServerError("Missing", 404));
    server.replaceDocumentOnServer.mockResolvedValue({});
    server.applyRequestsOnServer.mockResolvedValue({});
    const store = createTagColors({ work });

    await expect(store.load()).resolves.toBe(true);
    await store.flush();

    expect(server.replaceDocumentOnServer).toHaveBeenCalledWith(
      WORKSPACE_PATH,
      expect.objectContaining({ kind: "workspace" }),
    );
    expect(server.applyRequestsOnServer).toHaveBeenCalledWith(WORKSPACE_PATH, [
      { requester: "weekplanner", mutations: [{ field: "std.tag.colors", value: { work } }] },
    ]);
  });

  it("persists color changes to the workspace", async () => {
    server.applyRequestsOnServer.mockResolvedValue({});
    const store = createTagColors({});

    store.setColor("work", work);
    await store.flush();

    expect(server.applyRequestsOnServer).toHaveBeenCalledWith(WORKSPACE_PATH, [
      { requester: "weekplanner", mutations: [{ field: "std.tag.colors", value: { work } }] },
    ]);
  });
});
