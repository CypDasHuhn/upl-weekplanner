import { afterEach, describe, expect, it, vi } from "vitest";
import { applyRequestsOnServer, DOCUMENT_PATH, loadDocumentFromServer, ServerError } from "./server";
import type { UplDocument } from "./types";

const document: UplDocument = { id: "week", kind: "container", tasks: [] };
const endpoint = `/api/mutation?path=${encodeURIComponent(DOCUMENT_PATH)}`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("server document API", () => {
  it("loads the planner document", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(document));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadDocumentFromServer()).resolves.toEqual(document);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/document?path=${encodeURIComponent(DOCUMENT_PATH)}`,
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("reports authentication failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 401)));

    await expect(loadDocumentFromServer()).rejects.toMatchObject({ status: 401 });
    await expect(loadDocumentFromServer()).rejects.toBeInstanceOf(ServerError);
  });

  it("applies requests in order", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ document }));
    vi.stubGlobal("fetch", fetchMock);

    await applyRequestsOnServer([
      { requester: "gantt", mutations: [] },
      { requester: "gantt", mutations: [] },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(endpoint, expect.objectContaining({ method: "POST" }));
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
