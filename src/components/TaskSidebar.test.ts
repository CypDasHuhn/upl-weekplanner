import { enableAutoUnmount, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UplTask } from "../core/types";
import { planner } from "../stores/planner";
import TaskSidebar from "./TaskSidebar.vue";

vi.mock("../stores/planner", async () => {
  const { ref } = await import("vue");
  return {
    planner: {
      selectedTask: ref<UplTask | null>(null),
      selectedId: ref<string | null>(null),
      blocks: ref([]),
      nameFocusId: ref<string | null>(null),
      renameTask: vi.fn(),
      setClosed: vi.fn(),
      setTags: vi.fn(),
      deleteTask: vi.fn(),
      select: vi.fn(),
      clearNameFocus: vi.fn(),
    },
  };
});

interface MockPlanner {
  selectedTask: { value: UplTask | null };
  selectedId: { value: string | null };
  nameFocusId: { value: string | null };
  clearNameFocus: ReturnType<typeof vi.fn>;
}

const mocked = planner as unknown as MockPlanner;

enableAutoUnmount(afterEach);

beforeEach(() => {
  vi.clearAllMocks();
  mocked.selectedTask.value = null;
  mocked.selectedId.value = null;
  mocked.nameFocusId.value = null;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("task sidebar", () => {
  it("focuses the name input when a task is created", async () => {
    const wrapper = mount(TaskSidebar, { attachTo: document.body });

    mocked.selectedTask.value = {
      id: "a",
      "std.name": "New task",
      "std.status.closed": false,
    };
    mocked.selectedId.value = "a";
    await nextTick();
    mocked.nameFocusId.value = "a";
    await nextTick();
    await nextTick();

    const input = wrapper.get("input[type='text']");
    expect(document.activeElement).toBe(input.element);
    expect(mocked.clearNameFocus).toHaveBeenCalledTimes(1);
  });

  it("commits tags for the selected task", async () => {
    const wrapper = mount(TaskSidebar, { attachTo: document.body });

    mocked.selectedTask.value = { id: "a", "std.name": "New task", "std.tags": ["work"] };
    mocked.selectedId.value = "a";
    await nextTick();

    const tags = wrapper.findAll("input[type='text']")[1];
    if (!tags) throw new Error("missing tags input");
    await tags.setValue("work, urgent");
    await tags.trigger("change");

    expect(planner.setTags).toHaveBeenCalledWith("a", ["work", "urgent"]);
  });
});
