import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyRequestsOnServer,
  loadDocumentFromServer,
  loadTagsFromServer,
  replaceDocumentOnServer,
  ServerError,
} from "./server";
import type { UplDocument } from "./types";

const document: UplDocument = { id: "week", kind: "container", tasks: [] };
const path = "01-personal/planner/2026-W43.upl.json";
const endpoint = `/api/mutation?path=${encodeURIComponent(path)}`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("server document API", () => {
  it("loads a document path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(document));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadDocumentFromServer(path)).resolves.toEqual(document);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/document?path=${encodeURIComponent(path)}`,
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("reports authentication failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 401)));

    await expect(loadDocumentFromServer(path)).rejects.toMatchObject({ status: 401 });
    await expect(loadDocumentFromServer(path)).rejects.toBeInstanceOf(ServerError);
  });

  it("loads directory tags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ tags: ["home", "work"] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadTagsFromServer("01-personal/planner")).resolves.toEqual(["home", "work"]);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/tags?path=${encodeURIComponent("01-personal/planner")}`,
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("applies requests in order", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ document }));
    vi.stubGlobal("fetch", fetchMock);

    await applyRequestsOnServer(path, [
      { requester: "gantt", mutations: [] },
      { requester: "gantt", mutations: [] },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(endpoint, expect.objectContaining({ method: "POST" }));
  });

  it("replaces a document path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ document }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(replaceDocumentOnServer(path, document)).resolves.toEqual(document);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/document?path=${encodeURIComponent(path)}`,
      expect.objectContaining({ method: "PUT", body: JSON.stringify(document) }),
    );
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
