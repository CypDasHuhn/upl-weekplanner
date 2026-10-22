import { computed, ref } from "vue";
import { applyRequestsOnServer, loadDocumentFromServer, replaceDocumentOnServer, ServerError } from "../core/server";
import { applyMutation, previewMutation } from "../core/uniplanner";
import { planEdge, type EdgeChange, type EdgeMode, type PlanEdge } from "../core/edges";
import { buildHistoryEntry, type AppliedRequest, type HistoryEntry } from "../core/history";
import {
  addDays,
  clamp,
  formatIsoDuration,
  instantFor,
  MIN_DURATION_MINUTES,
  MINUTES_PER_DAY,
  readBlocks,
  snap,
  startOfWeek,
  type PlanBlock,
} from "../core/time";
import { session } from "./session";
import type { UplDocument, UplMutation, UplRequest, UplResult, UplTask } from "../core/types";

const REQUESTER = "gantt";

export function createPlanner(initial: UplDocument = emptyDocument()) {
  const weekStart = ref(startOfWeek(new Date()));
  const documentState = ref<UplDocument>(initial);
  const laneOrder = ref<string[]>(documentLaneOrder(initial));
  const undoStack = ref<HistoryEntry[]>([]);
  const redoStack = ref<HistoryEntry[]>([]);
  const preview = ref<UplDocument | null>(null);
  const error = ref<string | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const syncError = ref<string | null>(null);
  const selectedId = ref<string | null>(null);
  const nameFocusId = ref<string | null>(null);

  let syncQueue: Promise<void> = Promise.resolve();
  let pendingSync = 0;

  const activeDocument = computed(() => preview.value ?? documentState.value);
  const blocks = computed(() => readBlocks(activeDocument.value, weekStart.value, laneOrder.value));
  const tasks = computed<UplTask[]>(() => activeDocument.value.tasks ?? []);
  const selectedTask = computed(() => tasks.value.find((task) => task.id === selectedId.value) ?? null);

  function request(mutations: UplMutation[], createTasks?: UplTask[], removeTasks?: string[]): UplRequest {
    return { requester: REQUESTER, mutations, createTasks, removeTasks };
  }

  function commit(result: UplResult, requests: UplRequest[] = []): boolean {
    if (!result.ok) {
      preview.value = null;
      error.value = result.reason;
      return false;
    }
    return commitDocument(result.document, requests);
  }

  function commitDocument(document: UplDocument, requests: UplRequest[] = []): boolean {
    documentState.value = document;
    preview.value = null;
    error.value = null;
    if (requests.length > 0) enqueueSync(() => applyRequestsOnServer(requests));
    return true;
  }

  function run(mutations: UplMutation[], createTasks?: UplTask[], removeTasks?: string[]): boolean {
    try {
      const before = documentState.value;
      const historyRequest = request(mutations, createTasks, removeTasks);
      const result = applyMutation(before, historyRequest);
      if (!result.ok) return commit(result);
      const entry = buildHistoryEntry([{ before, request: historyRequest, result }]);
      const committed = commit(result, [historyRequest]);
      if (committed) recordHistory(entry);
      return committed;
    } catch (caught) {
      return fail(caught);
    }
  }

  function previewRun(mutations: UplMutation[], createTasks?: UplTask[], removeTasks?: string[]): boolean {
    try {
      return previewResult(previewMutation(documentState.value, request(mutations, createTasks, removeTasks)));
    } catch (caught) {
      return fail(caught);
    }
  }

  function previewResult(result: UplResult): boolean {
    if (!result.ok) {
      preview.value = null;
      error.value = result.reason;
      return false;
    }
    preview.value = result.document;
    error.value = null;
    return true;
  }

  function fail(caught: unknown): false {
    preview.value = null;
    error.value = message(caught);
    return false;
  }

  async function load(): Promise<boolean> {
    loading.value = true;
    syncError.value = null;

    try {
      const document = await loadDocumentFromServer();
      if (document.kind !== "container") {
        error.value = "Server document is not a container";
        return false;
      }
      hydrate(document);
      return true;
    } catch (caught) {
      if (caught instanceof ServerError && caught.status === 401) {
        session.expire();
        return false;
      }
      error.value = message(caught);
      return false;
    } finally {
      loading.value = false;
    }
  }

  function hydrate(document: UplDocument): void {
    documentState.value = document;
    laneOrder.value = documentLaneOrder(document);
    preview.value = null;
    error.value = null;
    syncError.value = null;
    selectedId.value = null;
    nameFocusId.value = null;
    undoStack.value = [];
    redoStack.value = [];
  }

  function enqueueSync(operation: () => Promise<unknown>): void {
    pendingSync += 1;
    saving.value = true;
    syncQueue = syncQueue
      .then(async () => {
        try {
          await operation();
          syncError.value = null;
        } catch (caught) {
          syncFailure(caught);
        }
      })
      .finally(() => {
        pendingSync -= 1;
        saving.value = pendingSync > 0;
      });
  }

  function syncFailure(caught: unknown): void {
    if (caught instanceof ServerError && caught.status === 401) {
      syncError.value = caught.message;
      session.expire();
      return;
    }
    syncError.value = message(caught);
  }

  function message(caught: unknown): string {
    return caught instanceof Error ? caught.message : String(caught);
  }

  function recordHistory(entry: HistoryEntry | null): void {
    if (!entry) return;
    undoStack.value.push(entry);
    if (undoStack.value.length > 100) undoStack.value.shift();
    redoStack.value = [];
  }

  function applyHistory(requests: UplRequest[]): boolean {
    let document = documentState.value;
    for (const historyRequest of requests) {
      const result = applyMutation(document, historyRequest);
      if (!result.ok) {
        preview.value = null;
        error.value = result.reason;
        return false;
      }
      document = result.document;
    }

    if (!commitDocument(document, requests)) return false;
    if (selectedId.value && !(document.tasks ?? []).some((task) => task.id === selectedId.value)) {
      selectedId.value = null;
      nameFocusId.value = null;
    }
    return true;
  }

  function undo(): boolean {
    const entry = undoStack.value.pop();
    if (!entry) return false;
    if (!applyHistory(entry.undo)) {
      undoStack.value.push(entry);
      return false;
    }
    redoStack.value.push(entry);
    return true;
  }

  function redo(): boolean {
    const entry = redoStack.value.pop();
    if (!entry) return false;
    if (!applyHistory(entry.redo)) {
      redoStack.value.push(entry);
      return false;
    }
    undoStack.value.push(entry);
    return true;
  }

  function setLaneOrder(document: UplDocument): void {
    laneOrder.value = documentLaneOrder(document);
  }

  function insertLaneOrder(taskId: string, dayIndex: number, startMinutes: number): void {
    const order = laneOrder.value.filter((id) => id !== taskId);
    const later = blocks.value
      .filter((block) => block.dayIndex === dayIndex && block.taskId !== taskId && block.startMinutes > startMinutes)
      .sort((left, right) => left.startMinutes - right.startMinutes)[0];
    const index = later ? order.indexOf(later.taskId) : -1;
    order.splice(index === -1 ? order.length : index, 0, taskId);
    laneOrder.value = order;
  }

  function createTask(dayIndex: number, startMinutes: number, durationMinutes = 60): string | null {
    const start = clamp(snap(startMinutes), 0, MINUTES_PER_DAY - MIN_DURATION_MINUTES);
    const duration = clamp(snap(durationMinutes), MIN_DURATION_MINUTES, MINUTES_PER_DAY - start);
    const id = taskId();
    const task: UplTask = {
      id,
      "std.name": "New task",
      "std.time.start": instantFor(weekStart.value, dayIndex, start).toISOString(),
      "std.time.duration": formatIsoDuration(duration),
      "std.status.closed": false,
    };
    if (!run([], [task])) return null;
    insertLaneOrder(id, dayIndex, start);
    selectedId.value = id;
    nameFocusId.value = id;
    return id;
  }

  function previewMove(taskId: string, dayIndex: number, startMinutes: number): boolean {
    const start = snap(startMinutes);
    return previewRun([
      { field: "std.time.start", value: instantFor(weekStart.value, dayIndex, start).toISOString(), target: taskId },
    ]);
  }

  function moveTask(taskId: string, dayIndex: number, startMinutes: number): boolean {
    const start = snap(startMinutes);
    return run([
      { field: "std.time.start", value: instantFor(weekStart.value, dayIndex, start).toISOString(), target: taskId },
    ]);
  }

  function previewEdge(edge: PlanEdge, mode: EdgeMode, delta: number, laneBlocks: PlanBlock[]): boolean {
    const changes = planEdge(edge, mode, delta, laneBlocks);
    if (changes === null) {
      preview.value = null;
      return false;
    }
    if (changes.length === 0) {
      preview.value = null;
      error.value = null;
      return true;
    }

    try {
      let document = documentState.value;
      for (const edgeRequest of edgeRequests(changes, edge.dayIndex)) {
        if (edgeRequest.mutations.length === 0) continue;
        const result = previewMutation(document, edgeRequest);
        if (!result.ok) return previewResult(result);
        document = result.document;
      }
      preview.value = document;
      error.value = null;
      return true;
    } catch (caught) {
      return fail(caught);
    }
  }

  function applyEdge(edge: PlanEdge, mode: EdgeMode, delta: number, laneBlocks: PlanBlock[]): boolean {
    const changes = planEdge(edge, mode, delta, laneBlocks);
    if (changes === null) {
      preview.value = null;
      return false;
    }
    if (changes.length === 0) {
      preview.value = null;
      error.value = null;
      return true;
    }

    try {
      let document = documentState.value;
      const applied: AppliedRequest[] = [];
      const requests: UplRequest[] = [];
      for (const edgeRequest of edgeRequests(changes, edge.dayIndex)) {
        if (edgeRequest.mutations.length === 0) continue;
        const before = document;
        const result = applyMutation(document, edgeRequest);
        if (!result.ok) return commit(result);
        applied.push({ before, request: edgeRequest, result });
        requests.push(edgeRequest);
        document = result.document;
      }
      const committed = commitDocument(document, requests);
      if (committed) recordHistory(buildHistoryEntry(applied));
      return committed;
    } catch (caught) {
      return fail(caught);
    }
  }

  function edgeRequests(changes: EdgeChange[], dayIndex: number): UplRequest[] {
    const durations: UplMutation[] = [];
    const starts: UplMutation[] = [];

    for (const change of changes) {
      if (change.durationMinutes !== change.block.durationMinutes) {
        durations.push({
          field: "std.time.duration",
          value: formatIsoDuration(change.durationMinutes),
          target: change.block.taskId,
        });
      }
      if (change.startMinutes !== change.block.startMinutes) {
        starts.push({
          field: "std.time.start",
          value: instantFor(weekStart.value, dayIndex, change.startMinutes).toISOString(),
          target: change.block.taskId,
        });
      }
    }

    return [request(durations), request(starts)];
  }

  function renameTask(taskId: string, name: string): boolean {
    return run([{ field: "std.name", value: name.trim() || "Untitled", target: taskId }]);
  }

  function setClosed(taskId: string, closed: boolean): boolean {
    return run([{ field: "std.status.closed", value: closed, target: taskId }]);
  }

  function deleteTask(taskId: string): boolean {
    const removed = run([], undefined, [taskId]);
    if (removed && selectedId.value === taskId) selectedId.value = null;
    return removed;
  }

  function select(taskId: string | null): void {
    selectedId.value = taskId;
  }

  function clearNameFocus(): void {
    nameFocusId.value = null;
  }

  function clearPreview(): void {
    preview.value = null;
  }

  function shiftWeek(weeks: number): void {
    weekStart.value = addDays(weekStart.value, weeks * 7);
  }

  function goToday(): void {
    weekStart.value = startOfWeek(new Date());
  }

  function importDocument(text: string): boolean {
    try {
      const parsed = JSON.parse(text) as UplDocument;
      const result = applyMutation(parsed, { requester: REQUESTER, mutations: [] });
      if (!result.ok) {
        error.value = result.reason;
        return false;
      }
      if (result.document.kind !== "container") {
        error.value = "Import a container document";
        return false;
      }
      const committed = commitDocument(result.document);
      if (committed) {
        enqueueSync(() => replaceDocumentOnServer(result.document));
        setLaneOrder(result.document);
        undoStack.value = [];
        redoStack.value = [];
      }
      return committed;
    } catch (caught) {
      return fail(caught);
    }
  }

  return {
    document: documentState,
    weekStart,
    error,
    loading,
    saving,
    syncError,
    load,
    blocks,
    tasks,
    selectedId,
    selectedTask,
    nameFocusId,
    createTask,
    previewMove,
    moveTask,
    previewEdge,
    applyEdge,
    renameTask,
    setClosed,
    deleteTask,
    undo,
    redo,
    select,
    clearNameFocus,
    clearPreview,
    shiftWeek,
    goToday,
    importDocument,
  };
}

export const planner = createPlanner();

function documentLaneOrder(document: UplDocument): string[] {
  return (document.tasks ?? [])
    .map((task, index) => ({ id: task.id, index, start: taskStart(task) }))
    .sort((left, right) => {
      if (left.start !== right.start) return left.start - right.start;
      return left.index - right.index;
    })
    .map((task) => task.id);
}

function taskStart(task: UplTask): number {
  const value = task["std.time.start"];
  if (typeof value !== "string") return Number.POSITIVE_INFINITY;
  const start = Date.parse(value);
  return Number.isNaN(start) ? Number.POSITIVE_INFINITY : start;
}

function emptyDocument(): UplDocument {
  return {
    id: "loading",
    kind: "container",
    "std.name": "Week plan",
    tasks: [],
  };
}

function taskId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
