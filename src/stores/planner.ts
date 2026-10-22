import { computed, ref } from "vue";
import { applyRequestsOnServer, loadDocumentFromServer, replaceDocumentOnServer, ServerError } from "../core/server";
import { normalizeTags } from "../core/tags";
import { applyMutation, previewMutation } from "../core/uniplanner";
import { planEdge, type EdgeChange, type EdgeMode, type PlanEdge } from "../core/edges";
import { buildHistoryEntry, type AppliedRequest, type HistoryEntry } from "../core/history";
import {
  addDays,
  clamp,
  dayIndexFor,
  formatIsoDuration,
  instantFor,
  MIN_DURATION_MINUTES,
  MINUTES_PER_DAY,
  minutesIntoDay,
  readBlocks,
  snap,
  startOfWeek,
  type PlanBlock,
} from "../core/time";
import { emptyWeekDocument, weekDocumentPath } from "../core/week";
import { session } from "./session";
import type { UplDocument, UplMutation, UplRequest, UplResult, UplTask } from "../core/types";

const REQUESTER = "gantt";

export interface TaskMove {
  taskId: string;
  dayIndex: number;
  startMinutes: number;
}

export function createPlanner(initial?: UplDocument) {
  const initialStart = startOfWeek(new Date());
  const weekStart = ref(initialStart);
  const documentState = ref<UplDocument>(initial ?? emptyWeekDocument(initialStart));
  const laneOrder = ref<string[]>(documentLaneOrder(documentState.value));
  const undoStack = ref<HistoryEntry[]>([]);
  const redoStack = ref<HistoryEntry[]>([]);
  const preview = ref<UplDocument | null>(null);
  const error = ref<string | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const syncError = ref<string | null>(null);
  const selectedId = ref<string | null>(null);
  const selectedIds = ref<string[]>([]);
  const nameFocusId = ref<string | null>(null);

  let syncQueue: Promise<void> = Promise.resolve();
  let pendingSync = 0;
  let navigationStart = initialStart;
  let documentPath = weekDocumentPath(initialStart);
  let missingDocument = false;
  let loadGeneration = 0;
  let clipboard: UplTask[] = [];
  const pendingCreates = new Map<string, UplDocument>();

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
    if (requests.length > 0) {
      const path = documentPath;
      if (missingDocument && !pendingCreates.has(path)) {
        pendingCreates.set(path, emptyWeekDocument(weekStart.value));
      }
      enqueueSync(path, () => applyRequestsOnServer(path, requests));
    }
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

  async function load(start: Date = weekStart.value): Promise<boolean> {
    const target = startOfWeek(start);
    const path = weekDocumentPath(target);
    const generation = ++loadGeneration;
    loading.value = true;
    syncError.value = null;

    try {
      const document = await loadDocumentFromServer(path);
      if (generation !== loadGeneration) return false;
      if (document.kind !== "container") {
        error.value = "Server document is not a container";
        return false;
      }
      weekStart.value = target;
      hydrate(document, path, false);
      return true;
    } catch (caught) {
      if (generation !== loadGeneration) return false;
      if (caught instanceof ServerError && caught.status === 401) {
        session.expire();
        return false;
      }
      if (caught instanceof ServerError && caught.status === 404) {
        weekStart.value = target;
        hydrate(emptyWeekDocument(target), path, true);
        return true;
      }
      error.value = message(caught);
      return false;
    } finally {
      if (generation === loadGeneration) loading.value = false;
    }
  }

  function hydrate(document: UplDocument, path: string, missing: boolean): void {
    navigationStart = weekStart.value;
    documentPath = path;
    missingDocument = missing;
    documentState.value = document;
    laneOrder.value = documentLaneOrder(document);
    preview.value = null;
    error.value = null;
    syncError.value = null;
    selectedId.value = null;
    selectedIds.value = [];
    nameFocusId.value = null;
    undoStack.value = [];
    redoStack.value = [];
  }

  function enqueueSync(path: string, operation: () => Promise<unknown>): void {
    pendingSync += 1;
    saving.value = true;
    syncQueue = syncQueue
      .then(async () => {
        try {
          const create = pendingCreates.get(path);
          if (create) {
            await replaceDocumentOnServer(path, create);
            pendingCreates.delete(path);
            if (documentPath === path) missingDocument = false;
          }
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
    const taskIds = new Set((document.tasks ?? []).map((task) => task.id));
    selectedIds.value = selectedIds.value.filter((id) => taskIds.has(id));
    if (selectedId.value && !taskIds.has(selectedId.value)) {
      selectedId.value = selectedIds.value.at(-1) ?? null;
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
    select(id);
    nameFocusId.value = id;
    return id;
  }

  function previewMove(taskId: string, dayIndex: number, startMinutes: number): boolean {
    return previewMoveTasks([{ taskId, dayIndex, startMinutes }]);
  }

  function moveTask(taskId: string, dayIndex: number, startMinutes: number): boolean {
    return moveTasks([{ taskId, dayIndex, startMinutes }]);
  }

  function previewMoveTasks(moves: TaskMove[]): boolean {
    return previewRun(moveMutations(moves));
  }

  function moveTasks(moves: TaskMove[]): boolean {
    return run(moveMutations(moves));
  }

  function moveMutations(moves: TaskMove[]): UplMutation[] {
    return moves.map((move) => ({
      field: "std.time.start",
      value: instantFor(weekStart.value, move.dayIndex, snap(move.startMinutes)).toISOString(),
      target: move.taskId,
    }));
  }

  function copySelection(): boolean {
    const tasks = selectionTasks();
    if (tasks.length === 0) return false;
    clipboard = tasks.map(cloneTask);
    return true;
  }

  function cutSelection(): boolean {
    const taskIds = [...selectedIds.value];
    if (!copySelection()) return false;
    if (!run([], undefined, taskIds)) return false;
    select(null);
    return true;
  }

  function pasteClipboard(): boolean {
    const created: UplTask[] = [];
    for (const task of clipboard) {
      const start = clipboardStart(task);
      if (!start) continue;
      const dayIndex = dayIndexFor(start, startOfWeek(start));
      if (dayIndex < 0) continue;
      const { id: _id, "std.time.end": _end, ...fields } = task;
      created.push({
        ...fields,
        id: taskId(),
        "std.time.start": instantFor(weekStart.value, dayIndex, snap(minutesIntoDay(start))).toISOString(),
      });
    }
    if (created.length === 0) return false;
    if (!run([], created)) return false;
    selectMany(
      created.map((task) => task.id),
      false,
    );
    return true;
  }

  function clipboardStart(task: UplTask): Date | null {
    const value = task["std.time.start"];
    if (typeof value !== "string") return null;
    const start = new Date(value);
    return Number.isNaN(start.getTime()) ? null : start;
  }

  function selectionTasks(): UplTask[] {
    const tasks = documentState.value.tasks ?? [];
    return selectedIds.value.flatMap((id) => {
      const task = tasks.find((candidate) => candidate.id === id);
      return task ? [task] : [];
    });
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

  function setTags(taskId: string, tags: string[]): boolean {
    const normalized = normalizeTags(tags);
    return run([{ field: "std.tags", value: normalized.length > 0 ? normalized : null, target: taskId }]);
  }

  function deleteTask(taskId: string): boolean {
    const removed = run([], undefined, [taskId]);
    if (!removed) return false;
    selectedIds.value = selectedIds.value.filter((id) => id !== taskId);
    if (selectedId.value === taskId) selectedId.value = selectedIds.value.at(-1) ?? null;
    return true;
  }

  function select(taskId: string | null): void {
    selectedId.value = taskId;
    selectedIds.value = taskId ? [taskId] : [];
  }

  function addToSelection(taskId: string): void {
    if (!selectedIds.value.includes(taskId)) selectedIds.value = [...selectedIds.value, taskId];
    selectedId.value = taskId;
  }

  function selectMany(taskIds: string[], additive: boolean): void {
    const next = additive ? [...new Set([...selectedIds.value, ...taskIds])] : [...new Set(taskIds)];
    selectedIds.value = next;
    if (selectedId.value && next.includes(selectedId.value)) return;
    selectedId.value = next[0] ?? null;
  }

  function focusSelection(taskId: string): void {
    if (selectedIds.value.includes(taskId)) selectedId.value = taskId;
  }

  function clearNameFocus(): void {
    nameFocusId.value = null;
  }

  function clearPreview(): void {
    preview.value = null;
  }

  function shiftWeek(weeks: number): void {
    void load(addDays(navigationStart, weeks * 7));
  }

  function goToday(): void {
    void load(startOfWeek(new Date()));
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
        const path = documentPath;
        if (!pendingCreates.has(path)) missingDocument = false;
        enqueueSync(path, async () => {
          await replaceDocumentOnServer(path, result.document);
          if (documentPath === path) missingDocument = false;
        });
        setLaneOrder(result.document);
        select(null);
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
    selectedIds,
    selectedTask,
    nameFocusId,
    createTask,
    previewMove,
    moveTask,
    previewMoveTasks,
    moveTasks,
    previewEdge,
    applyEdge,
    renameTask,
    setClosed,
    setTags,
    deleteTask,
    undo,
    redo,
    select,
    addToSelection,
    selectMany,
    focusSelection,
    copySelection,
    cutSelection,
    pasteClipboard,
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

function taskId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneTask(task: UplTask): UplTask {
  return JSON.parse(JSON.stringify(task)) as UplTask;
}
