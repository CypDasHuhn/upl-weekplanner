import { enableAutoUnmount, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOUR_PX, type PlanBlock } from "../core/time";
import WeekGrid from "./WeekGrid.vue";

const planner = vi.hoisted(() => ({
  weekStart: { value: new Date(2026, 3, 1) },
  selectedIds: { value: [] as string[] },
  select: vi.fn(),
  addToSelection: vi.fn(),
  selectMany: vi.fn(),
  focusSelection: vi.fn(),
  createTask: vi.fn(() => "new-task"),
  previewMove: vi.fn(() => true),
  moveTask: vi.fn(),
  previewMoveTasks: vi.fn(() => true),
  moveTasks: vi.fn(),
  previewEdge: vi.fn(() => true),
  applyEdge: vi.fn(),
  clearPreview: vi.fn(),
}));

vi.mock("../stores/planner", () => ({ planner }));

beforeEach(() => {
  vi.clearAllMocks();
  planner.weekStart = ref(new Date(2026, 3, 1));
  planner.selectedIds.value = [];
  planner.select.mockImplementation((taskId: string | null) => {
    planner.selectedIds.value = taskId ? [taskId] : [];
  });
  planner.addToSelection.mockImplementation((taskId: string) => {
    if (!planner.selectedIds.value.includes(taskId)) planner.selectedIds.value = [...planner.selectedIds.value, taskId];
  });
  planner.previewMove.mockReturnValue(true);
  planner.previewMoveTasks.mockReturnValue(true);
  planner.previewEdge.mockReturnValue(true);
});

enableAutoUnmount(afterEach);

afterEach(() => {
  document.body.innerHTML = "";
});

function planBlock(overrides: Partial<PlanBlock> = {}): PlanBlock {
  return {
    taskId: "a",
    title: "Alpha",
    closed: false,
    dayIndex: 0,
    startMinutes: 9 * 60,
    durationMinutes: 120,
    tags: [],
    lane: 0,
    laneCount: 1,
    ...overrides,
  };
}

function mountGrid(blocks: PlanBlock[] = [planBlock()], selectedIds: string[] = []): VueWrapper {
  planner.selectedIds.value = [...selectedIds];
  return mount(WeekGrid, {
    attachTo: document.body,
    props: { blocks, selectedId: null, selectedIds },
  });
}

function stubColumnAt(wrapper: VueWrapper, dayIndex: number): void {
  const column = wrapper.findAll("[data-day-index]")[dayIndex];
  if (!column) throw new Error(`missing day column ${dayIndex}`);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => column.element,
  });
}

function pointerDown(element: Element, clientY: number, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent("pointerdown", { clientY, clientX: 20, bubbles: true, cancelable: true, ...init });
  element.dispatchEvent(event);
  return event;
}

function pointerMove(clientY: number, clientX = 20): void {
  window.dispatchEvent(new MouseEvent("pointermove", { clientY, clientX, bubbles: true }));
}

function pointerUp(): void {
  window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
}

function doubleClick(element: Element, clientY: number): void {
  element.dispatchEvent(new MouseEvent("dblclick", { clientY, clientX: 20, bubbles: true, cancelable: true }));
}

function edgeAt(wrapper: VueWrapper, minutes: number) {
  return wrapper.get(`[data-edge-minutes='${minutes}']`);
}

describe("week grid interactions", () => {
  it("creates a task on double click", async () => {
    const wrapper = mountGrid([]);

    doubleClick(wrapper.get("[data-day-index='3']").element, 9 * HOUR_PX);
    await nextTick();

    expect(planner.createTask).toHaveBeenCalledWith(3, 9 * 60, 30);
  });

  it("creates a task from a real double-click pointer sequence", async () => {
    const wrapper = mountGrid([]);
    const column = wrapper.get("[data-day-index='3']").element;

    const first = pointerDown(column, 9 * HOUR_PX);
    pointerUp();
    pointerDown(column, 9 * HOUR_PX, { detail: 2 });
    pointerUp();
    doubleClick(column, 9 * HOUR_PX);
    await nextTick();

    expect(first.defaultPrevented).toBe(false);
    expect(planner.createTask).toHaveBeenCalledWith(3, 9 * 60, 30);
  });

  it("floors the start to the previous quarter hour", async () => {
    const wrapper = mountGrid([]);

    doubleClick(wrapper.get("[data-day-index='3']").element, 9 * HOUR_PX + 5);
    await nextTick();

    expect(planner.createTask).toHaveBeenCalledWith(3, 9 * 60, 30);
  });

  it("ends a new task at the next task in the same lane", async () => {
    const wrapper = mountGrid([planBlock({ taskId: "b", title: "Beta", startMinutes: 9 * 60 + 15 })]);

    doubleClick(wrapper.get("[data-day-index='0']").element, 9 * HOUR_PX + 5);
    await nextTick();

    expect(planner.createTask).toHaveBeenCalledWith(0, 9 * 60, 15);
  });

  it("does not create a task on a single click", async () => {
    const wrapper = mountGrid([]);

    pointerDown(wrapper.get("[data-day-index='3']").element, 9 * HOUR_PX);
    await nextTick();

    expect(planner.createTask).not.toHaveBeenCalled();
  });

  it("does not create a task on occupied time", async () => {
    const wrapper = mountGrid();

    doubleClick(wrapper.get("[data-day-index='0']").element, 9 * HOUR_PX + HOUR_PX / 2);
    await nextTick();

    expect(planner.createTask).not.toHaveBeenCalled();
  });

  it("does not create a task when double-clicking a block", async () => {
    const wrapper = mountGrid();

    doubleClick(wrapper.get("[title^='Alpha']").element, 9 * HOUR_PX);
    await nextTick();

    expect(planner.createTask).not.toHaveBeenCalled();
  });

  it("moves the body across day columns", async () => {
    const wrapper = mountGrid();
    const block = wrapper.get("[title^='Alpha']");

    pointerDown(block.element, 100);
    await nextTick();
    stubColumnAt(wrapper, 2);
    pointerMove(100 + HOUR_PX);
    pointerUp();

    expect(planner.select).toHaveBeenCalledWith("a");
    expect(planner.previewMoveTasks).toHaveBeenCalledWith([{ taskId: "a", dayIndex: 2, startMinutes: 10 * 60 }]);
    expect(planner.moveTasks).toHaveBeenCalledWith([{ taskId: "a", dayIndex: 2, startMinutes: 10 * 60 }]);
  });

  it("moves the whole selection together", async () => {
    const wrapper = mountGrid(
      [planBlock(), planBlock({ taskId: "b", title: "Beta", dayIndex: 1, startMinutes: 10 * 60 })],
      ["a", "b"],
    );
    const block = wrapper.get("[title^='Alpha']");

    pointerDown(block.element, 100);
    await nextTick();
    stubColumnAt(wrapper, 2);
    pointerMove(100 + HOUR_PX);
    pointerUp();

    expect(planner.focusSelection).toHaveBeenCalledWith("a");
    expect(planner.select).not.toHaveBeenCalled();
    expect(planner.previewMoveTasks).toHaveBeenCalledWith([
      { taskId: "a", dayIndex: 2, startMinutes: 10 * 60 },
      { taskId: "b", dayIndex: 3, startMinutes: 11 * 60 },
    ]);
    expect(planner.moveTasks).toHaveBeenCalledWith([
      { taskId: "a", dayIndex: 2, startMinutes: 10 * 60 },
      { taskId: "b", dayIndex: 3, startMinutes: 11 * 60 },
    ]);
  });

  it("selects a task on plain click and expands on Ctrl click", () => {
    const wrapper = mountGrid();
    const block = wrapper.get("[title^='Alpha']").element;

    pointerDown(block, 100);
    pointerDown(block, 100, { ctrlKey: true });

    expect(planner.select).toHaveBeenCalledWith("a");
    expect(planner.addToSelection).toHaveBeenCalledWith("a");
  });

  it("clears the selection when starting a plain marquee", async () => {
    const wrapper = mountGrid();

    pointerDown(wrapper.get("[data-day-index='0']").element, 10, { clientX: 10 });

    expect(planner.selectMany).toHaveBeenCalledWith([], false);
  });

  it("selects intersecting tasks with a marquee", async () => {
    const wrapper = mountGrid();
    const block = wrapper.get("[title^='Alpha']").element;
    Object.defineProperty(block, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 100, bottom: 100 }),
    });

    pointerDown(wrapper.get("[data-day-index='0']").element, 10, { clientX: 10 });
    pointerMove(120, 120);

    expect(planner.selectMany).toHaveBeenLastCalledWith(["a"], false);
  });

  it("adds marquee hits to the existing selection with Ctrl", async () => {
    const wrapper = mountGrid();
    const block = wrapper.get("[title^='Alpha']").element;
    Object.defineProperty(block, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 100, bottom: 100 }),
    });

    pointerDown(wrapper.get("[data-day-index='0']").element, 10, { clientX: 10, ctrlKey: true });
    pointerMove(120, 120);

    expect(planner.selectMany).toHaveBeenLastCalledWith(["a"], true);
  });

  it("pushes a shared edge with no modifier", async () => {
    const wrapper = mountGrid([planBlock(), planBlock({ taskId: "b", title: "Beta", startMinutes: 11 * 60 })]);

    pointerDown(edgeAt(wrapper, 11 * 60).element, 100);
    await nextTick();
    pointerMove(100 + HOUR_PX);
    pointerUp();

    expect(planner.previewEdge).toHaveBeenCalledWith(
      expect.objectContaining({ minutes: 11 * 60 }),
      "push",
      60,
      expect.any(Array),
    );
    expect(planner.applyEdge).toHaveBeenCalledWith(
      expect.objectContaining({ minutes: 11 * 60 }),
      "push",
      60,
      expect.any(Array),
    );
  });

  it("pulls with Shift", async () => {
    const wrapper = mountGrid([planBlock(), planBlock({ taskId: "b", title: "Beta", startMinutes: 11 * 60 })]);

    pointerDown(edgeAt(wrapper, 11 * 60).element, 100, { shiftKey: true });
    await nextTick();
    pointerMove(100 + HOUR_PX);
    pointerUp();

    expect(planner.previewEdge).toHaveBeenCalledWith(expect.any(Object), "pull", 60, expect.any(Array));
    expect(planner.applyEdge).toHaveBeenCalledWith(expect.any(Object), "pull", 60, expect.any(Array));
  });

  it("stretches with Ctrl", async () => {
    const wrapper = mountGrid([planBlock(), planBlock({ taskId: "b", title: "Beta", startMinutes: 11 * 60 })]);

    pointerDown(edgeAt(wrapper, 11 * 60).element, 100, { ctrlKey: true });
    await nextTick();
    pointerMove(100 + HOUR_PX);
    pointerUp();

    expect(planner.previewEdge).toHaveBeenCalledWith(expect.any(Object), "stretch", 60, expect.any(Array));
    expect(planner.applyEdge).toHaveBeenCalledWith(expect.any(Object), "stretch", 60, expect.any(Array));
  });

  it("overlaps with Alt", async () => {
    const wrapper = mountGrid([planBlock(), planBlock({ taskId: "b", title: "Beta", startMinutes: 11 * 60 })]);

    pointerDown(edgeAt(wrapper, 11 * 60).element, 100, { altKey: true });
    await nextTick();
    pointerMove(100 + HOUR_PX);
    pointerUp();

    expect(planner.previewEdge).toHaveBeenCalledWith(expect.any(Object), "overlap", 60, expect.any(Array));
    expect(planner.applyEdge).toHaveBeenCalledWith(expect.any(Object), "overlap", 60, expect.any(Array));
  });

  it("locks the mode at drag start", async () => {
    const wrapper = mountGrid([planBlock(), planBlock({ taskId: "b", title: "Beta", startMinutes: 11 * 60 })]);

    pointerDown(edgeAt(wrapper, 11 * 60).element, 100);
    await nextTick();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", ctrlKey: true }));
    pointerMove(100 + HOUR_PX);
    pointerUp();

    expect(planner.previewEdge).toHaveBeenCalledWith(expect.any(Object), "push", 60, expect.any(Array));
    expect(planner.applyEdge).toHaveBeenCalledWith(expect.any(Object), "push", 60, expect.any(Array));
  });

  it("changes the edge cursor while modifiers are held", async () => {
    const wrapper = mountGrid([planBlock(), planBlock({ taskId: "b", title: "Beta", startMinutes: 11 * 60 })]);
    const edge = edgeAt(wrapper, 11 * 60);

    expect((edge.element as HTMLElement).style.cursor).toBe("ns-resize");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", shiftKey: true }));
    await nextTick();
    expect((edge.element as HTMLElement).style.cursor).toBe("grab");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", ctrlKey: true }));
    await nextTick();
    expect((edge.element as HTMLElement).style.cursor).toBe("all-scroll");

    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Control", shiftKey: true }));
    await nextTick();
    expect((edge.element as HTMLElement).style.cursor).toBe("grab");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true }));
    await nextTick();
    expect((edge.element as HTMLElement).style.cursor).toBe("copy");
  });

  it("aborts when the preview rejects", async () => {
    planner.previewEdge.mockReturnValueOnce(false);
    const wrapper = mountGrid([planBlock(), planBlock({ taskId: "b", title: "Beta", startMinutes: 11 * 60 })]);

    pointerDown(edgeAt(wrapper, 11 * 60).element, 100);
    await nextTick();
    pointerMove(100 + HOUR_PX);
    pointerUp();

    expect(planner.clearPreview).toHaveBeenCalled();
    expect(planner.applyEdge).not.toHaveBeenCalled();
  });
});

describe("current time indicator", () => {
  const today = new Date(2026, 3, 1, 9, 30, 0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(today);
    planner.weekStart.value = new Date(2026, 3, 1);
  });

  afterEach(() => {
    vi.useRealTimers();
    planner.weekStart.value = new Date(2026, 3, 1);
  });

  function expectTopAt(wrapper: VueWrapper, minutes: number): void {
    const line = wrapper.get("[data-current-time]").element as HTMLElement;
    expect(Number.parseFloat(line.style.top)).toBeCloseTo((minutes / 60) * HOUR_PX);
  }

  it("renders a pointer-transparent line in today's column", () => {
    const wrapper = mountGrid([]);
    const line = wrapper.get("[data-current-time]").element as HTMLElement;
    const column = line.closest<HTMLElement>("[data-day-index]");

    expect(column?.dataset.dayIndex).toBe("0");
    expect(line.classList.contains("pointer-events-none")).toBe(true);
    expectTopAt(wrapper, 9 * 60 + 30);
  });

  it("hides when today is not in the displayed week", () => {
    planner.weekStart.value = new Date(2026, 3, 8);
    const wrapper = mountGrid([]);

    expect(wrapper.find("[data-current-time]").exists()).toBe(false);
  });

  it("advances after the clock crosses a minute", async () => {
    const wrapper = mountGrid([]);
    expectTopAt(wrapper, 9 * 60 + 30);

    vi.advanceTimersByTime(60_000);
    await nextTick();

    expectTopAt(wrapper, 9 * 60 + 31);
  });

  it("refreshes the position on focus after timers were suspended", async () => {
    const wrapper = mountGrid([]);
    vi.setSystemTime(new Date(2026, 3, 1, 9, 45, 0));

    window.dispatchEvent(new Event("focus"));
    await nextTick();

    expectTopAt(wrapper, 9 * 60 + 45);
  });

  it("reappears and refreshes the position after navigating back to today's week", async () => {
    planner.weekStart.value = new Date(2026, 3, 8);
    const wrapper = mountGrid([]);
    expect(wrapper.find("[data-current-time]").exists()).toBe(false);

    vi.setSystemTime(new Date(2026, 3, 1, 9, 45, 0));
    planner.weekStart.value = new Date(2026, 3, 1);
    await nextTick();

    expect(wrapper.find("[data-current-time]").exists()).toBe(true);
    expectTopAt(wrapper, 9 * 60 + 45);
  });
});
