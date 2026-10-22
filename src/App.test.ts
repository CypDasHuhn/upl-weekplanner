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
      selectedTask: ref({ id: "new", "std.name": "New task" }),
      error: ref(null),
      document: ref({ id: "week", kind: "container", tasks: [] }),
      nameFocusId: ref(null),
      undo: vi.fn(() => true),
      redo: vi.fn(() => true),
      deleteTask: vi.fn(),
      importDocument: vi.fn(),
      clearNameFocus: vi.fn(),
      select: vi.fn(),
      createTask: vi.fn(),
      previewMove: vi.fn(),
      moveTask: vi.fn(),
      previewEdge: vi.fn(),
      applyEdge: vi.fn(),
      renameTask: vi.fn(),
      setClosed: vi.fn(),
      clearPreview: vi.fn(),
      shiftWeek: vi.fn(),
      goToday: vi.fn(),
    },
  };
});

import App from "./App.vue";

let wrapper: VueWrapper | null = null;

function mountApp(): VueWrapper {
  return mount(App, {
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
  wrapper = mountApp();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
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
