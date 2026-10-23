import { ServerError } from "./server";

export type AuditStatus = "applied" | "rejected";
export type AuditOp = "mutation" | "replace";

export interface AuditChange {
  field: string;
  target: string | null;
  oldValue: unknown;
  newValue: unknown;
}

export interface AuditDocumentSummary {
  id?: string;
  kind?: string;
  taskCount?: number;
}

export interface AuditReplacement {
  before: AuditDocumentSummary | null;
  after: AuditDocumentSummary | null;
}

export interface AuditRemovedTask {
  id: string;
  [field: string]: unknown;
}

export interface AuditEntry {
  id: string;
  serverId: string | null;
  timestamp: string;
  op: AuditOp | string;
  status: AuditStatus | string;
  path: string;
  document: AuditDocumentSummary | null;
  principal: string | null;
  requester: string | null;
  request: unknown;
  changes: AuditChange[];
  createdTaskIds: string[];
  removedTasks: AuditRemovedTask[];
  replacement: AuditReplacement | null;
  reason: string | null;
  raw: unknown;
}

export interface AuditDay {
  date: string;
  count: number;
}

export interface AuditHistoryQuery {
  date?: string;
  path?: string | null;
  status?: AuditStatus | null;
  op?: AuditOp | string | null;
  limit?: number;
  before?: string | null;
}

export interface AuditHistoryPage {
  date?: string | null;
  timeZone?: string | null;
  entries: AuditEntry[];
  cursor: string | null;
}

export async function loadAuditHistoryDays(): Promise<AuditDay[]> {
  const response = await request("/api/history/days");
  return readDays(await response.json());
}

export async function loadAuditHistory(query: AuditHistoryQuery = {}): Promise<AuditHistoryPage> {
  const response = await request(historyUrl(query));
  return readPage(await response.json(), query.limit ?? 100);
}

function historyUrl(query: AuditHistoryQuery): string {
  const params = new URLSearchParams();
  appendParam(params, "date", query.date);
  appendParam(params, "path", query.path);
  appendParam(params, "status", query.status);
  appendParam(params, "op", query.op);
  appendParam(params, "limit", query.limit);
  appendParam(params, "before", query.before);
  const search = params.toString();
  return search ? `/api/history?${search}` : "/api/history";
}

function appendParam(params: URLSearchParams, key: string, value: string | number | null | undefined): void {
  if (value === null || value === undefined || value === "") return;
  params.set(key, String(value));
}

async function request(path: string): Promise<Response> {
  const response = await fetch(path, { credentials: "same-origin" });
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

//region (Parsing)

function readDays(body: unknown): AuditDay[] {
  const record = asRecord(body);
  const rawDays = Array.isArray(body) ? body : readArray(record, ["days", "items", "results"]);
  const days = rawDays.flatMap(readDay);
  return days.sort((left, right) => right.date.localeCompare(left.date));
}

function readDay(value: unknown): AuditDay[] {
  if (typeof value === "string") return [{ date: value, count: 0 }];
  const record = asRecord(value);
  const date = readString(record, ["date", "day", "key"]);
  if (!record || !date) return [];
  const entries = readArray(record, ["entries"]);
  const count =
    readNumber(record, ["count", "total", "entries"]) ?? (Array.isArray(record.entries) ? entries.length : 0);
  return [{ date, count }];
}

function readPage(body: unknown, limit: number): AuditHistoryPage {
  const record = asRecord(body);
  const rawEntries = Array.isArray(body)
    ? body
    : readArray(record, ["entries", "items", "records", "history", "results"]);
  const entries = rawEntries.map((entry, index) => readEntry(entry, index));
  const explicitCursor = readCursor(record);
  const hasMore = record ? record.hasMore : undefined;
  const fallbackCursor = entries.length > 0 && entries.length >= limit ? (entries.at(-1)?.serverId ?? null) : null;
  const cursor = explicitCursor ?? (hasMore === false ? null : fallbackCursor);
  return {
    date: readString(record, ["date"]),
    timeZone: readString(record, ["timeZone", "timezone"]),
    entries,
    cursor,
  };
}

function readCursor(record: Record<string, unknown> | null): string | null {
  if (!record) return null;
  return readString(record, ["nextCursor", "cursor", "before", "next"]);
}

function readEntry(value: unknown, index: number): AuditEntry {
  const record = asRecord(value) ?? {};
  const request = record.request;
  const changes = Array.isArray(record.changes) ? record.changes.flatMap(readChange) : readRequestChanges(request);
  const serverId = readString(record, ["id"]);

  return {
    id: serverId ?? stableId(value, index),
    serverId,
    timestamp: readString(record, ["timestamp", "time", "at"]) ?? "",
    op: readString(record, ["op"]) ?? "unknown",
    status: readString(record, ["status"]) ?? "unknown",
    path: readString(record, ["path"]) ?? "",
    document: readSummary(record.document),
    principal: readString(record, ["principal"]),
    requester: readString(record, ["requester"]),
    request,
    changes,
    createdTaskIds: readIds(record.createdTaskIds ?? record.createdTasks),
    removedTasks: readRemovedTasks(record.removedTasks),
    replacement: readReplacement(record.replacement),
    reason: readString(record, ["reason"]),
    raw: value,
  };
}

function readChange(value: unknown): AuditChange[] {
  const record = asRecord(value);
  const field = readString(record, ["field"]);
  if (!record || !field) return [];
  return [
    {
      field,
      target: readString(record, ["target"]),
      oldValue: "oldValue" in record ? record.oldValue : (record.old ?? record.from ?? null),
      newValue: "newValue" in record ? record.newValue : (record.new ?? record.to ?? null),
    },
  ];
}

function readRequestChanges(request: unknown): AuditChange[] {
  const record = asRecord(request);
  return readArray(record, ["mutations"]).flatMap((value) => {
    const mutation = asRecord(value);
    const field = readString(mutation, ["field"]);
    if (!mutation || !field) return [];
    return [{ field, target: readString(mutation, ["target"]), oldValue: null, newValue: mutation.value ?? null }];
  });
}

function readIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [item];
    const id = readString(asRecord(item), ["id"]);
    return id ? [id] : [];
  });
}

function readRemovedTasks(value: unknown): AuditRemovedTask[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [{ id: item }];
    const record = asRecord(item);
    const id = readString(record, ["id"]);
    return record && id ? [{ ...record, id }] : [];
  });
}

function readSummary(value: unknown): AuditDocumentSummary | null {
  const record = asRecord(value);
  if (!record) return null;
  const tasks = record.tasks;
  const taskCount = readNumber(record, ["taskCount", "tasks"]) ?? (Array.isArray(tasks) ? tasks.length : undefined);
  const summary: AuditDocumentSummary = {
    id: readString(record, ["id"]) ?? undefined,
    kind: readString(record, ["kind"]) ?? undefined,
    taskCount,
  };
  return summary.id || summary.kind || taskCount !== undefined ? summary : null;
}

function readReplacement(value: unknown): AuditReplacement | null {
  const record = asRecord(value);
  if (!record) return null;
  const before = readSummary(record.before ?? record.beforeDocument);
  const after = readSummary(record.after ?? record.afterDocument);
  return before || after ? { before, after } : null;
}

function stableId(value: unknown, index: number): string {
  const text = safeStringify(value);
  let hash = 2166136261;
  for (let position = 0; position < text.length; position += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(position), 16777619);
  }
  return `entry-${(hash >>> 0).toString(36)}-${index}`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

function readArray(record: Record<string, unknown> | null, keys: string[]): unknown[] {
  if (!record) return [];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function readString(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readNumber(record: Record<string, unknown> | null, keys: string[]): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

//endregion
