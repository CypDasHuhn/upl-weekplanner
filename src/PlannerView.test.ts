import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planner } from "./stores/planner";

vi.mock("./stores/planner", async () => {
  const { ref } = await import("vue");
  return {
    planner: {
      weekStart: ref(new Date(2026, 3, 6)),
      blocks: ref([]),
      selectedId: ref("new"),
      selectedIds: ref(["new"]),
      selectedTask: ref({ id: "new", "std.name": "New task" }),
      tasks: ref([]),
      error: ref(null),
      loading: ref(false),
      saving: ref(false),
      syncError: ref(null),
      load: vi.fn(),
      document: ref({ id: "week", kind: "container", tasks: [] }),
      nameFocusId: ref(null),
      undo: vi.fn(() => true),
      redo: vi.fn(() => true),
      deleteTask: vi.fn(),
      importDocument: vi.fn(),
      clearNameFocus: vi.fn(),
      select: vi.fn(),
      addToSelection: vi.fn(),
      selectMany: vi.fn(),
      focusSelection: vi.fn(),
      copySelection: vi.fn(),
      cutSelection: vi.fn(),
      pasteClipboard: vi.fn(),
      createTask: vi.fn(),
      previewMove: vi.fn(),
      moveTask: vi.fn(),
      previewMoveTasks: vi.fn(),
      moveTasks: vi.fn(),
      previewEdge: vi.fn(),
      applyEdge: vi.fn(),
      renameTask: vi.fn(),
      setClosed: vi.fn(),
      setTags: vi.fn(),
      clearPreview: vi.fn(),
      shiftWeek: vi.fn(),
      goToday: vi.fn(),
    },
  };
});

import PlannerView from "./PlannerView.vue";

let wrapper: VueWrapper | null = null;

function mountApp(): VueWrapper {
  return mount(PlannerView, {
    attachTo: document.body,
    global: { stubs: { WeekGrid: true, TaskSidebar: true } },
  });
}

function pressTaskName(key: string, value: string): KeyboardEvent {
  const input = document.createElement("input");
  input.dataset.role = "task-name";
  input.value = value;
  wrapper?.element.appendChild(input);
  const event = new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(planner.undo).mockReturnValue(true);
  vi.mocked(planner.redo).mockReturnValue(true);
  vi.mocked(planner.copySelection).mockReturnValue(true);
  vi.mocked(planner.cutSelection).mockReturnValue(true);
  vi.mocked(planner.pasteClipboard).mockReturnValue(true);
  wrapper = mountApp();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
});

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

describe("app keyboard clipboard", () => {
  it("copies, cuts and pastes selections", () => {
    expect(press("c").defaultPrevented).toBe(true);
    expect(press("x").defaultPrevented).toBe(true);
    expect(press("v").defaultPrevented).toBe(true);

    expect(planner.copySelection).toHaveBeenCalledOnce();
    expect(planner.cutSelection).toHaveBeenCalledOnce();
    expect(planner.pasteClipboard).toHaveBeenCalledOnce();
  });

  it("leaves native clipboard shortcuts alone while editing", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    const event = new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true, cancelable: true });

    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(planner.copySelection).not.toHaveBeenCalled();
  });
});

describe("app keyboard history", () => {
  it("undoes a fresh creation while the name field is still pristine", () => {
    const event = pressTaskName("z", "New task");

    expect(planner.undo).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves native undo alone when the name field has edits", () => {
    const event = pressTaskName("z", "Edited");

    expect(planner.undo).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
