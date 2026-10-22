import type { UplDocument, UplRequest } from "./types";

export class ServerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ServerError";
  }
}

export async function loadDocumentFromServer(path: string): Promise<UplDocument> {
  const response = await request(`/api/document?path=${encodeURIComponent(path)}`);
  return (await response.json()) as UplDocument;
}

export async function loadTagsFromServer(path: string): Promise<string[]> {
  const response = await request(`/api/tags?path=${encodeURIComponent(path)}`);
  const body = (await response.json()) as { tags?: unknown };
  if (!Array.isArray(body.tags)) return [];
  return body.tags.filter((tag): tag is string => typeof tag === "string");
}

export async function applyRequestsOnServer(path: string, requests: UplRequest[]): Promise<UplDocument> {
  let document: UplDocument | null = null;

  for (const requestBody of requests) {
    const response = await request(`/api/mutation?path=${encodeURIComponent(path)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const body = (await response.json()) as { document: UplDocument };
    document = body.document;
  }

  if (!document) throw new ServerError("No mutation was sent", 400);
  return document;
}

export async function replaceDocumentOnServer(path: string, document: UplDocument): Promise<UplDocument> {
  const response = await request(`/api/document?path=${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(document),
  });
  const body = (await response.json()) as { document: UplDocument };
  return body.document;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, { credentials: "same-origin", ...init });
  if (response.status === 401) throw new ServerError("Authentication required", 401);
  if (!response.ok) throw new ServerError(await errorMessage(response), response.status);
  return response;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {
    return `Request failed (${response.status})`;
  }
  return `Request failed (${response.status})`;
}
