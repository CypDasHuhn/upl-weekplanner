import type { UplDocument, UplRequest, UplResult, UplTask } from "./types";

export interface AppliedRequest {
  before: UplDocument;
  request: UplRequest;
  result: Extract<UplResult, { ok: true }>;
}

export interface HistoryEntry {
  undo: UplRequest[];
  redo: UplRequest[];
}

export function buildHistoryEntry(applied: AppliedRequest[]): HistoryEntry | null {
  const effective = applied.filter(hasEffect);
  if (effective.length === 0) return null;

  const undo = [...effective]
    .reverse()
    .map(inverseRequest)
    .filter((request): request is UplRequest => request !== null);
  const redo = effective.map((part) => part.request);
  return { undo, redo };
}

function hasEffect(part: AppliedRequest): boolean {
  return (
    part.result.changes.length > 0 ||
    (part.request.createTasks?.length ?? 0) > 0 ||
    (part.request.removeTasks?.length ?? 0) > 0
  );
}

function inverseRequest(part: AppliedRequest): UplRequest | null {
  const created = new Set((part.request.createTasks ?? []).map((task) => task.id));
  const removed = new Set(part.request.removeTasks ?? []);
  const createTasks = [...removed]
    .map((taskId) => findTask(part.before, taskId))
    .filter((task): task is UplTask => task !== null);
  const mutations = [...part.request.mutations]
    .reverse()
    .filter(
      (mutation) => mutation.target === undefined || (!created.has(mutation.target) && !removed.has(mutation.target)),
    )
    .map((mutation) => ({
      field: mutation.field,
      value: valueBefore(part.before, mutation.target, mutation.field),
      target: mutation.target,
    }));

  const request: UplRequest = {
    requester: part.request.requester,
    mutations,
  };
  if (createTasks.length > 0) request.createTasks = createTasks;
  if (created.size > 0) request.removeTasks = [...created];

  return hasRequestEffect(request) ? request : null;
}

function valueBefore(document: UplDocument, taskId: string | undefined, field: string): unknown {
  if (taskId === undefined) return document[field] ?? null;
  return findTask(document, taskId)?.[field] ?? null;
}

function findTask(document: UplDocument, taskId: string): UplTask | null {
  return document.tasks?.find((task) => task.id === taskId) ?? null;
}

function hasRequestEffect(request: UplRequest): boolean {
  return (
    request.mutations.length > 0 || (request.createTasks?.length ?? 0) > 0 || (request.removeTasks?.length ?? 0) > 0
  );
}
