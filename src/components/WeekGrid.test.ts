import { enableAutoUnmount, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOUR_PX, type PlanBlock } from "../core/time";
import WeekGrid from "./WeekGrid.vue";

const planner = vi.hoisted(() => ({
  weekStart: { value: new Date(2026, 3, 1) },
  select: vi.fn(),
  createTask: vi.fn(() => "new-task"),
  previewMove: vi.fn(() => true),
  moveTask: vi.fn(),
  previewEdge: vi.fn(() => true),
  applyEdge: vi.fn(),
  clearPreview: vi.fn(),
}));

vi.mock("../stores/planner", () => ({ planner }));

beforeEach(() => {
  vi.clearAllMocks();
  planner.previewMove.mockReturnValue(true);
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
    lane: 0,
    laneCount: 1,
    ...overrides,
  };
}

function mountGrid(blocks: PlanBlock[] = [planBlock()]): VueWrapper {
  return mount(WeekGrid, {
    attachTo: document.body,
    props: { blocks, selectedId: null },
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

function pointerDown(element: Element, clientY: number, init: MouseEventInit = {}): void {
  element.dispatchEvent(
    new MouseEvent("pointerdown", { clientY, clientX: 20, bubbles: true, cancelable: true, ...init }),
  );
}

function pointerMove(clientY: number): void {
  window.dispatchEvent(new MouseEvent("pointermove", { clientY, clientX: 20, bubbles: true }));
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

    expect(planner.createTask).toHaveBeenCalledWith(3, 9 * 60);
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
    expect(planner.previewMove).toHaveBeenCalledWith("a", 2, 10 * 60);
    expect(planner.moveTask).toHaveBeenCalledWith("a", 2, 10 * 60);
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
