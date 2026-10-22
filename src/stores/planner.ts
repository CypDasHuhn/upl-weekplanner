import { computed, ref } from "vue";
import { applyMutation, previewMutation } from "../core/uniplanner";
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
} from "../core/time";
import type { UplDocument, UplMutation, UplRequest, UplResult, UplTask } from "../core/types";

const STORAGE_KEY = "upl-weekplanner.document.v1";
const REQUESTER = "gantt";

export function createPlanner() {
  const weekStart = ref(startOfWeek(new Date()));
  const documentState = ref<UplDocument>(loadDocument(weekStart.value));
  const preview = ref<UplDocument | null>(null);
  const error = ref<string | null>(null);
  const selectedId = ref<string | null>(null);

  const activeDocument = computed(() => preview.value ?? documentState.value);
  const blocks = computed(() => readBlocks(activeDocument.value, weekStart.value));
  const tasks = computed<UplTask[]>(() => activeDocument.value.tasks ?? []);
  const selectedTask = computed(() => tasks.value.find((task) => task.id === selectedId.value) ?? null);

  function request(mutations: UplMutation[], createTasks?: UplTask[], removeTasks?: string[]): UplRequest {
    return { requester: REQUESTER, mutations, createTasks, removeTasks };
  }

  function commit(result: UplResult): boolean {
    if (!result.ok) {
      preview.value = null;
      error.value = result.reason;
      return false;
    }
    documentState.value = result.document;
    preview.value = null;
    error.value = null;
    persist(documentState.value);
    return true;
  }

  function run(mutations: UplMutation[], createTasks?: UplTask[], removeTasks?: string[]): boolean {
    try {
      return commit(applyMutation(documentState.value, request(mutations, createTasks, removeTasks)));
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
    error.value = caught instanceof Error ? caught.message : String(caught);
    return false;
  }

  function createTask(dayIndex: number, startMinutes: number, durationMinutes = 60): boolean {
    const start = clamp(snap(startMinutes), 0, MINUTES_PER_DAY - MIN_DURATION_MINUTES);
    const duration = clamp(snap(durationMinutes), MIN_DURATION_MINUTES, MINUTES_PER_DAY - start);
    const task: UplTask = {
      id: taskId(),
      "std.name": "New task",
      "std.time.start": instantFor(weekStart.value, dayIndex, start).toISOString(),
      "std.time.duration": formatIsoDuration(duration),
      "std.status.closed": false,
    };
    return run([], [task]);
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

  function previewResize(taskId: string, durationMinutes: number): boolean {
    return previewRun([{ field: "std.time.duration", value: formatIsoDuration(durationMinutes), target: taskId }]);
  }

  function resizeTask(taskId: string, durationMinutes: number): boolean {
    return run([{ field: "std.time.duration", value: formatIsoDuration(durationMinutes), target: taskId }]);
  }

  function previewResizeStart(
    taskId: string,
    dayIndex: number,
    startMinutes: number,
    durationMinutes: number,
  ): boolean {
    try {
      const [durationRequest, startRequest] = resizeStartRequests(taskId, dayIndex, startMinutes, durationMinutes);
      const first = previewMutation(documentState.value, durationRequest);
      if (!first.ok) return previewResult(first);
      return previewResult(previewMutation(first.document, startRequest));
    } catch (caught) {
      return fail(caught);
    }
  }

  function resizeStart(taskId: string, dayIndex: number, startMinutes: number, durationMinutes: number): boolean {
    try {
      const [durationRequest, startRequest] = resizeStartRequests(taskId, dayIndex, startMinutes, durationMinutes);
      const first = applyMutation(documentState.value, durationRequest);
      if (!first.ok) return commit(first);
      return commit(applyMutation(first.document, startRequest));
    } catch (caught) {
      return fail(caught);
    }
  }

  function resizeStartRequests(
    taskId: string,
    dayIndex: number,
    startMinutes: number,
    durationMinutes: number,
  ): [UplRequest, UplRequest] {
    return [
      request([{ field: "std.time.duration", value: formatIsoDuration(durationMinutes), target: taskId }]),
      request([
        {
          field: "std.time.start",
          value: instantFor(weekStart.value, dayIndex, startMinutes).toISOString(),
          target: taskId,
        },
      ]),
    ];
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
      return commit(result);
    } catch (caught) {
      return fail(caught);
    }
  }

  return {
    document: documentState,
    weekStart,
    error,
    blocks,
    tasks,
    selectedId,
    selectedTask,
    createTask,
    previewMove,
    moveTask,
    previewResize,
    resizeTask,
    previewResizeStart,
    resizeStart,
    renameTask,
    setClosed,
    deleteTask,
    select,
    clearPreview,
    shiftWeek,
    goToday,
    importDocument,
  };
}

export const planner = createPlanner();

function loadDocument(weekStart: Date): UplDocument {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as UplDocument;
      const result = applyMutation(parsed, { requester: REQUESTER, mutations: [] });
      if (result.ok && result.document.kind === "container") return result.document;
    } catch {
      storage()?.removeItem(STORAGE_KEY);
    }
  }
  return seedDocument(weekStart);
}

function persist(document: UplDocument): void {
  storage()?.setItem(STORAGE_KEY, JSON.stringify(document));
}

function storage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function seedDocument(weekStart: Date): UplDocument {
  return {
    id: taskId(),
    kind: "container",
    "std.name": "Week plan",
    tasks: [
      {
        id: taskId(),
        "std.name": "Deep work",
        "std.time.start": instantFor(weekStart, 0, 9 * 60).toISOString(),
        "std.time.duration": "PT2H",
        "std.status.closed": false,
      },
      {
        id: taskId(),
        "std.name": "Review",
        "std.time.start": instantFor(weekStart, 1, 14 * 60).toISOString(),
        "std.time.duration": "PT1H",
        "std.status.closed": false,
      },
    ],
  };
}

function taskId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
