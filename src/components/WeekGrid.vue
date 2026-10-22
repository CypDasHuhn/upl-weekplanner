<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { buildEdges, type EdgeMode, type PlanEdge } from "../core/edges";
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
import { planner } from "../stores/planner";

const props = defineProps<{
  blocks: PlanBlock[];
  selectedId: string | null;
}>();

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = Array.from({ length: 24 }, (_, hour) => hour);
const palette = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#e0e7ff", "#ccfbf1"];
const modeLabels: Record<EdgeMode, string> = {
  push: "Push",
  pull: "Pull",
  stretch: "Stretch",
  overlap: "Overlap",
};
const dragging = ref(false);
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

interface MoveDrag {
  kind: "move";
  taskId: string;
  startY: number;
  startDay: number;
  startMinutes: number;
  durationMinutes: number;
  lastDay: number;
  lastMinutes: number;
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

type DragState = MoveDrag | EdgeDrag;

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
    backgroundColor: palette[block.lane % palette.length],
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
    "bg-slate-900/10": !active,
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
    backgroundImage: "repeating-linear-gradient(to bottom, #e2e8f0 0, #e2e8f0 1px, transparent 1px, transparent 100%)",
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
  planner.select(block.taskId);
  drag = {
    kind: "move",
    taskId: block.taskId,
    startY: event.clientY,
    startDay: block.dayIndex,
    startMinutes: block.startMinutes,
    durationMinutes: block.durationMinutes,
    lastDay: block.dayIndex,
    lastMinutes: block.startMinutes,
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

function beginDrag(): void {
  dragging.value = true;
  document.body.style.cursor = "grabbing";
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
}

function onPointerMove(event: PointerEvent): void {
  if (!drag) return;
  const delta = snap(((event.clientY - drag.startY) / HOUR_PX) * MINUTES_PER_HOUR);

  if (drag.kind === "edge") {
    drag.lastDelta = delta;
    drag.valid = planner.previewEdge(drag.edge, drag.mode, delta, drag.laneBlocks);
    document.body.style.cursor = drag.valid ? "grabbing" : "not-allowed";
    return;
  }

  const dayIndex = dayFromEvent(event) ?? drag.startDay;
  const start = clamp(drag.startMinutes + delta, 0, MINUTES_PER_DAY - drag.durationMinutes);
  drag.lastDay = dayIndex;
  drag.lastMinutes = start;
  drag.valid = planner.previewMove(drag.taskId, dayIndex, start);
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

  if (!state.valid) {
    planner.clearPreview();
    return;
  }
  if (state.kind === "move") {
    planner.moveTask(state.taskId, state.lastDay, state.lastMinutes);
    return;
  }
  planner.applyEdge(state.edge, state.mode, state.lastDelta, state.laneBlocks);
}

function finishDrag(): void {
  dragging.value = false;
  dragMode.value = null;
  document.body.style.cursor = "";
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
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
  <section class="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
    <header class="flex shrink-0 border-b border-slate-200 bg-slate-50">
      <div class="w-14 shrink-0"></div>
      <div class="grid flex-1 grid-cols-7 gap-px bg-slate-200">
        <div
          v-for="(day, index) in days"
          :key="index"
          class="bg-slate-50 px-2 py-2 text-center text-xs font-semibold text-slate-600"
        >
          {{ dayNames[index] }}
          <span class="ml-1 font-normal text-slate-400">{{ day.getDate() }}</span>
        </div>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 overflow-y-auto">
      <div class="w-14 shrink-0 border-r border-slate-200 bg-slate-50">
        <div v-for="hour in hours" :key="hour" class="relative" :style="{ height: `${HOUR_PX}px` }">
          <span class="absolute -top-2 right-2 text-[10px] tabular-nums text-slate-400">{{
            formatClock(hour * 60)
          }}</span>
        </div>
      </div>

      <div class="grid flex-1 grid-cols-7 gap-px bg-slate-200">
        <div
          v-for="(day, dayIndex) in days"
          :key="dayIndex"
          class="relative bg-white"
          :data-day-index="dayIndex"
          :style="columnStyle()"
          @dblclick.self="createAt($event, dayIndex)"
        >
          <div
            v-for="block in blocksForDay(dayIndex)"
            :key="block.taskId"
            class="absolute cursor-grab overflow-hidden rounded-md border border-slate-900/10 px-1.5 py-1 text-[11px] leading-tight shadow-sm transition-shadow hover:shadow-md"
            :class="{
              'opacity-60': block.closed,
              'ring-2 ring-slate-900': selectedId === block.taskId,
            }"
            :style="blockStyle(block)"
            :title="`${block.title} · ${formatClock(block.startMinutes)}–${formatClock(block.startMinutes + block.durationMinutes)}`"
            @pointerdown.stop.prevent="startMove($event, block)"
          >
            <div class="truncate font-medium text-slate-800" :class="{ 'line-through': block.closed }">
              {{ block.title }}
            </div>
            <div class="truncate text-[10px] tabular-nums text-slate-500">
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
              class="pointer-events-none absolute left-1/2 -top-5 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900/80 px-1.5 py-0.5 text-[9px] font-medium leading-none text-white"
            >
              {{ modeLabels[shownMode] }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
