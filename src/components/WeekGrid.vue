<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { buildEdges, type EdgeMode, type PlanEdge } from "../core/edges";
import { tagPaint } from "../core/tags";
import {
  addDays,
  clamp,
  formatClock,
  HOUR_PX,
  MIN_DURATION_MINUTES,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  snap,
  type PlanBlock,
} from "../core/time";
import { planner, type TaskMove } from "../stores/planner";
import { tagColors } from "../stores/tagColors";

const props = defineProps<{
  blocks: PlanBlock[];
  selectedId: string | null;
  selectedIds: string[];
}>();

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = Array.from({ length: 24 }, (_, hour) => hour);
const modeLabels: Record<EdgeMode, string> = {
  push: "Push",
  pull: "Pull",
  stretch: "Stretch",
  overlap: "Overlap",
};
const root = ref<HTMLElement | null>(null);
const dragging = ref(false);
const marquee = ref<MarqueeBox | null>(null);
const hoveredEdgeId = ref<string | null>(null);
const shiftHeld = ref(false);
const ctrlHeld = ref(false);
const altHeld = ref(false);
const metaHeld = ref(false);
const dragMode = ref<EdgeMode | null>(null);

const days = computed(() => Array.from({ length: 7 }, (_, index) => addDays(planner.weekStart.value, index)));
const edges = computed(() => buildEdges(props.blocks));
const hoverMode = computed<EdgeMode>(() => {
  if (altHeld.value) return "overlap";
  if (ctrlHeld.value || metaHeld.value) return "stretch";
  if (shiftHeld.value) return "pull";
  return "push";
});
const shownMode = computed<EdgeMode>(() => dragMode.value ?? hoverMode.value);
const marqueeActive = computed(() => {
  if (!marquee.value) return false;
  return Math.abs(marquee.value.x - marquee.value.startX) >= 3 || Math.abs(marquee.value.y - marquee.value.startY) >= 3;
});
const marqueeStyle = computed<Record<string, string>>(() => {
  if (!marquee.value) return { left: "0px", top: "0px", width: "0px", height: "0px" };
  const left = Math.min(marquee.value.startX, marquee.value.x);
  const top = Math.min(marquee.value.startY, marquee.value.y);
  const width = Math.abs(marquee.value.x - marquee.value.startX);
  const height = Math.abs(marquee.value.y - marquee.value.startY);
  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
  };
});

interface MarqueeBox {
  startX: number;
  startY: number;
  x: number;
  y: number;
}

interface MoveTarget {
  taskId: string;
  dayIndex: number;
  startMinutes: number;
  durationMinutes: number;
}

interface MoveDrag {
  kind: "move";
  anchorX: number;
  anchorY: number;
  anchorDay: number;
  moved: boolean;
  targets: MoveTarget[];
  lastMoves: TaskMove[];
  valid: boolean;
}

interface EdgeDrag {
  kind: "edge";
  edge: PlanEdge;
  mode: EdgeMode;
  laneBlocks: PlanBlock[];
  startY: number;
  lastDelta: number;
  valid: boolean;
}

interface SelectionDrag {
  kind: "selection";
  startX: number;
  startY: number;
  x: number;
  y: number;
  additive: boolean;
}

type DragState = MoveDrag | EdgeDrag | SelectionDrag;

let drag: DragState | null = null;

function blocksForDay(dayIndex: number): PlanBlock[] {
  return props.blocks.filter((block) => block.dayIndex === dayIndex);
}

function edgesForDay(dayIndex: number): PlanEdge[] {
  return edges.value.filter((edge) => edge.dayIndex === dayIndex);
}

function blockStyle(block: PlanBlock): Record<string, string> {
  const laneWidth = 90 / Math.max(1, block.laneCount);
  return {
    top: `${(block.startMinutes / MINUTES_PER_HOUR) * HOUR_PX}px`,
    height: `${Math.max((block.durationMinutes / MINUTES_PER_HOUR) * HOUR_PX, 14)}px`,
    left: `${block.lane * laneWidth}%`,
    width: `${laneWidth}%`,
    ...tagPaint(block.tags, tagColors.colors.value),
  };
}

function edgeStyle(edge: PlanEdge): Record<string, string> {
  return {
    top: `${(edge.minutes / MINUTES_PER_HOUR) * HOUR_PX}px`,
    left: `${edge.left}%`,
    width: `${edge.width}%`,
    height: `${edge.height}px`,
    cursor: modeCursor(shownMode.value),
  };
}

function edgeClasses(edge: PlanEdge): Record<string, boolean> {
  const active = hoveredEdgeId.value === edge.id;
  return {
    "bg-slate-900/10 dark:bg-slate-100/15": !active,
    "bg-slate-700/50": active && shownMode.value === "push",
    "bg-amber-500/60": active && shownMode.value === "pull",
    "bg-sky-500/60": active && shownMode.value === "stretch",
    "bg-violet-500/60": active && shownMode.value === "overlap",
  };
}

function modeCursor(mode: EdgeMode): string {
  if (mode === "pull") return "grab";
  if (mode === "stretch") return "all-scroll";
  if (mode === "overlap") return "copy";
  return "ns-resize";
}

function enterEdge(edge: PlanEdge): void {
  hoveredEdgeId.value = edge.id;
}

function leaveEdge(edge: PlanEdge): void {
  if (hoveredEdgeId.value === edge.id) hoveredEdgeId.value = null;
}

function columnStyle(): Record<string, string> {
  return {
    height: `${24 * HOUR_PX}px`,
    backgroundImage:
      "repeating-linear-gradient(to bottom, var(--grid-line) 0, var(--grid-line) 1px, transparent 1px, transparent 100%)",
    backgroundSize: `100% ${HOUR_PX}px`,
  };
}

function createAt(event: MouseEvent, dayIndex: number): void {
  if (dragging.value) return;
  const element = event.currentTarget as HTMLElement;
  const rect = element.getBoundingClientRect();
  const minutes = ((event.clientY - rect.top) / HOUR_PX) * MINUTES_PER_HOUR;
  const start = clamp(snap(minutes), 0, MINUTES_PER_DAY - MIN_DURATION_MINUTES);
  const occupied = blocksForDay(dayIndex).some(
    (block) => start >= block.startMinutes && start < block.startMinutes + block.durationMinutes,
  );
  if (occupied) return;
  planner.createTask(dayIndex, start);
}

function startMove(event: PointerEvent, block: PlanBlock): void {
  if (event.ctrlKey || event.metaKey) planner.addToSelection(block.taskId);
  else if (props.selectedIds.includes(block.taskId)) planner.focusSelection(block.taskId);
  else planner.select(block.taskId);

  const selected = new Set(planner.selectedIds.value);
  const targets = props.blocks
    .filter((candidate) => selected.has(candidate.taskId))
    .map((candidate) => ({
      taskId: candidate.taskId,
      dayIndex: candidate.dayIndex,
      startMinutes: candidate.startMinutes,
      durationMinutes: candidate.durationMinutes,
    }));
  drag = {
    kind: "move",
    anchorX: event.clientX,
    anchorY: event.clientY,
    anchorDay: block.dayIndex,
    moved: false,
    targets,
    lastMoves: targets.map((target) => ({ ...target })),
    valid: true,
  };
  beginDrag();
}

function startEdge(event: PointerEvent, edge: PlanEdge): void {
  const block = edge.above ?? edge.below;
  if (!block) return;
  planner.select(block.taskId);
  const mode = modeFromEvent(event);
  drag = {
    kind: "edge",
    edge,
    mode,
    laneBlocks: props.blocks.filter((item) => item.dayIndex === edge.dayIndex && item.lane === edge.lane),
    startY: event.clientY,
    lastDelta: 0,
    valid: true,
  };
  dragMode.value = mode;
  beginDrag();
}

function startSelection(event: PointerEvent): void {
  if (event.detail > 1) return;
  const additive = event.ctrlKey || event.metaKey;
  if (!additive) planner.selectMany([], false);
  drag = {
    kind: "selection",
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    additive,
  };
  marquee.value = { startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY };
  beginDrag("crosshair");
}

function beginDrag(cursor = "grabbing"): void {
  dragging.value = true;
  document.body.style.cursor = cursor;
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
}

function onPointerMove(event: PointerEvent): void {
  if (!drag) return;

  if (drag.kind === "selection") {
    drag.x = event.clientX;
    drag.y = event.clientY;
    marquee.value = { startX: drag.startX, startY: drag.startY, x: drag.x, y: drag.y };
    applyMarqueeSelection(drag);
    return;
  }

  if (drag.kind === "edge") {
    const delta = snap(((event.clientY - drag.startY) / HOUR_PX) * MINUTES_PER_HOUR);
    drag.lastDelta = delta;
    drag.valid = planner.previewEdge(drag.edge, drag.mode, delta, drag.laneBlocks);
    document.body.style.cursor = drag.valid ? "grabbing" : "not-allowed";
    return;
  }

  const delta = snap(((event.clientY - drag.anchorY) / HOUR_PX) * MINUTES_PER_HOUR);
  const dayIndex = dayFromEvent(event) ?? drag.anchorDay;
  const dayDelta = dayIndex - drag.anchorDay;
  const dayShift = clamp(dayDelta, -minDay(drag.targets), 6 - maxDay(drag.targets));
  const minuteShift = clamp(delta, -minStart(drag.targets), MINUTES_PER_DAY - maxEnd(drag.targets));
  drag.moved = drag.moved || Math.hypot(event.clientX - drag.anchorX, event.clientY - drag.anchorY) > 3;
  drag.lastMoves = drag.targets.map((target) => ({
    taskId: target.taskId,
    dayIndex: target.dayIndex + dayShift,
    startMinutes: target.startMinutes + minuteShift,
  }));
  drag.valid = planner.previewMoveTasks(drag.lastMoves);
  document.body.style.cursor = drag.valid ? "grabbing" : "not-allowed";
}

function dayFromEvent(event: PointerEvent): number | null {
  const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
  const column = element?.closest<HTMLElement>("[data-day-index]");
  if (!column) return null;
  const index = Number(column.dataset.dayIndex);
  return Number.isNaN(index) ? null : index;
}

function onPointerUp(): void {
  if (!drag) return;
  const state = drag;
  drag = null;
  finishDrag();

  if (state.kind === "selection") return;
  if (!state.valid) {
    planner.clearPreview();
    return;
  }
  if (state.kind === "move") {
    if (state.moved) planner.moveTasks(state.lastMoves);
    return;
  }
  planner.applyEdge(state.edge, state.mode, state.lastDelta, state.laneBlocks);
}

function minDay(targets: MoveTarget[]): number {
  return Math.min(...targets.map((target) => target.dayIndex));
}

function maxDay(targets: MoveTarget[]): number {
  return Math.max(...targets.map((target) => target.dayIndex));
}

function minStart(targets: MoveTarget[]): number {
  return Math.min(...targets.map((target) => target.startMinutes));
}

function maxEnd(targets: MoveTarget[]): number {
  return Math.max(...targets.map((target) => target.startMinutes + target.durationMinutes));
}

function finishDrag(): void {
  dragging.value = false;
  marquee.value = null;
  dragMode.value = null;
  document.body.style.cursor = "";
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
}

function applyMarqueeSelection(state: SelectionDrag): void {
  const left = Math.min(state.startX, state.x);
  const top = Math.min(state.startY, state.y);
  const right = Math.max(state.startX, state.x);
  const bottom = Math.max(state.startY, state.y);
  if (right - left < 3 && bottom - top < 3) return;

  const taskIds: string[] = [];
  for (const element of root.value?.querySelectorAll<HTMLElement>("[data-task-id]") ?? []) {
    const rect = element.getBoundingClientRect();
    if (rect.right < left || rect.left > right || rect.bottom < top || rect.top > bottom) continue;
    const taskId = element.dataset.taskId;
    if (taskId && !taskIds.includes(taskId)) taskIds.push(taskId);
  }
  planner.selectMany(taskIds, state.additive);
}

function modeFromEvent(event: PointerEvent): EdgeMode {
  if (event.altKey) return "overlap";
  if (event.ctrlKey || event.metaKey) return "stretch";
  if (event.shiftKey) return "pull";
  return "push";
}

function syncModifiers(event: KeyboardEvent): void {
  shiftHeld.value = event.shiftKey;
  ctrlHeld.value = event.ctrlKey;
  altHeld.value = event.altKey;
  metaHeld.value = event.metaKey;
}

function resetModifiers(): void {
  shiftHeld.value = false;
  ctrlHeld.value = false;
  altHeld.value = false;
  metaHeld.value = false;
}

onMounted(() => {
  window.addEventListener("keydown", syncModifiers);
  window.addEventListener("keyup", syncModifiers);
  window.addEventListener("blur", resetModifiers);
});

onBeforeUnmount(() => {
  finishDrag();
  window.removeEventListener("keydown", syncModifiers);
  window.removeEventListener("keyup", syncModifiers);
  window.removeEventListener("blur", resetModifiers);
});
</script>

<template>
  <section
    ref="root"
    class="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
  >
    <div
      v-if="marqueeActive"
      class="pointer-events-none fixed z-50 rounded border border-sky-500 bg-sky-400/20 dark:border-sky-400 dark:bg-sky-400/25"
      :style="marqueeStyle"
    ></div>
    <header class="flex shrink-0 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
      <div class="w-14 shrink-0"></div>
      <div class="grid flex-1 grid-cols-7 gap-px bg-slate-200 dark:bg-slate-800">
        <div
          v-for="(day, index) in days"
          :key="index"
          class="bg-slate-50 px-2 py-2 text-center text-xs font-semibold text-slate-600 dark:bg-slate-950 dark:text-slate-400"
        >
          {{ dayNames[index] }}
          <span class="ml-1 font-normal text-slate-400 dark:text-slate-500">{{ day.getDate() }}</span>
        </div>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 overflow-y-auto">
      <div class="w-14 shrink-0 border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
        <div v-for="hour in hours" :key="hour" class="relative" :style="{ height: `${HOUR_PX}px` }">
          <span class="absolute -top-2 right-2 text-[10px] tabular-nums text-slate-400 dark:text-slate-500">{{
            formatClock(hour * 60)
          }}</span>
        </div>
      </div>

      <div class="grid flex-1 grid-cols-7 gap-px bg-slate-200 dark:bg-slate-800">
        <div
          v-for="(day, dayIndex) in days"
          :key="dayIndex"
          class="relative bg-white dark:bg-slate-950"
          :data-day-index="dayIndex"
          :style="columnStyle()"
          @pointerdown.self.prevent="startSelection($event)"
          @dblclick.self="createAt($event, dayIndex)"
        >
          <div
            v-for="block in blocksForDay(dayIndex)"
            :key="block.taskId"
            class="absolute cursor-grab overflow-hidden rounded-md border border-slate-900/10 px-1.5 py-1 text-[11px] leading-tight shadow-sm transition-shadow hover:shadow-md dark:border-slate-100/15"
            :class="{
              'opacity-60': block.closed,
              'ring-2 ring-slate-900 dark:ring-slate-100': selectedIds.includes(block.taskId),
            }"
            :data-task-id="block.taskId"
            :style="blockStyle(block)"
            :title="`${block.title} · ${formatClock(block.startMinutes)}–${formatClock(block.startMinutes + block.durationMinutes)}`"
            @pointerdown.stop.prevent="startMove($event, block)"
          >
            <div class="truncate font-medium" :class="{ 'line-through': block.closed }">
              {{ block.title }}
            </div>
            <div class="truncate text-[10px] tabular-nums opacity-70">
              {{ formatClock(block.startMinutes) }}–{{ formatClock(block.startMinutes + block.durationMinutes) }}
            </div>
          </div>

          <div
            v-for="edge in edgesForDay(dayIndex)"
            :key="edge.id"
            class="absolute z-20 -translate-y-1/2 rounded-full transition-colors"
            :class="edgeClasses(edge)"
            :style="edgeStyle(edge)"
            :data-edge-minutes="edge.minutes"
            :data-edge-lane="edge.lane"
            :title="`${modeLabels[shownMode]} · ${formatClock(edge.minutes)}`"
            @pointerenter="enterEdge(edge)"
            @pointerleave="leaveEdge(edge)"
            @pointerdown.stop.prevent="startEdge($event, edge)"
          >
            <span
              v-if="hoveredEdgeId === edge.id"
              class="pointer-events-none absolute left-1/2 -top-5 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900/80 px-1.5 py-0.5 text-[9px] font-medium leading-none text-white dark:bg-slate-100/90 dark:text-slate-950"
            >
              {{ modeLabels[shownMode] }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
