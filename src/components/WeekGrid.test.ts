import { enableAutoUnmount, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOUR_PX, type PlanBlock } from "../core/time";
import WeekGrid from "./WeekGrid.vue";

const planner = vi.hoisted(() => ({
  weekStart: { value: new Date(2026, 3, 1) },
  select: vi.fn(),
  createTask: vi.fn(),
  previewMove: vi.fn(() => true),
  moveTask: vi.fn(),
  previewResize: vi.fn(() => true),
  resizeTask: vi.fn(),
  clearPreview: vi.fn(),
}));

vi.mock("../stores/planner", () => ({ planner }));

beforeEach(() => {
  vi.clearAllMocks();
  planner.previewMove.mockReturnValue(true);
  planner.previewResize.mockReturnValue(true);
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

function pointerDown(element: Element, clientY: number): void {
  element.dispatchEvent(new MouseEvent("pointerdown", { clientY, clientX: 20, bubbles: true, cancelable: true }));
}

function pointerMove(clientY: number): void {
  window.dispatchEvent(new MouseEvent("pointermove", { clientY, clientX: 20, bubbles: true }));
}

function pointerUp(): void {
  window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
}

describe("week grid interactions", () => {
  it("creates a task at the pointer position", async () => {
    const wrapper = mountGrid([]);

    pointerDown(wrapper.get("[data-day-index='3']").element, 9 * HOUR_PX);
    await nextTick();

    expect(planner.createTask).toHaveBeenCalledWith(3, 9 * 60);
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

  it("resizes from the bottom edge", async () => {
    const wrapper = mountGrid();
    const handle = wrapper.get("[title^='Alpha']").get(".cursor-ns-resize");

    pointerDown(handle.element, 100);
    await nextTick();
    pointerMove(100 + HOUR_PX);
    pointerUp();

    expect(planner.previewResize).toHaveBeenCalledWith("a", 3 * 60);
    expect(planner.resizeTask).toHaveBeenCalledWith("a", 3 * 60);
  });

  it("aborts when the preview rejects", async () => {
    planner.previewMove.mockReturnValueOnce(false);
    const wrapper = mountGrid();
    const block = wrapper.get("[title^='Alpha']");

    pointerDown(block.element, 100);
    await nextTick();
    stubColumnAt(wrapper, 1);
    pointerMove(100 + HOUR_PX);
    pointerUp();

    expect(planner.clearPreview).toHaveBeenCalled();
    expect(planner.moveTask).not.toHaveBeenCalled();
  });
});
