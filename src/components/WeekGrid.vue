<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
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
const resizeHandleStyle = { height: "clamp(6px, 15%, 20px)" };
const dragging = ref(false);

const days = computed(() => Array.from({ length: 7 }, (_, index) => addDays(planner.weekStart.value, index)));

interface DragState {
  taskId: string;
  mode: "move" | "resize" | "resize-start";
  startY: number;
  startDay: number;
  startMinutes: number;
  durationMinutes: number;
  lastDay: number;
  lastMinutes: number;
  lastDuration: number;
  valid: boolean;
}

let drag: DragState | null = null;

function blocksForDay(dayIndex: number): PlanBlock[] {
  return props.blocks.filter((block) => block.dayIndex === dayIndex);
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

function columnStyle(): Record<string, string> {
  return {
    height: `${24 * HOUR_PX}px`,
    backgroundImage: "repeating-linear-gradient(to bottom, #e2e8f0 0, #e2e8f0 1px, transparent 1px, transparent 100%)",
    backgroundSize: `100% ${HOUR_PX}px`,
  };
}

function createAt(event: PointerEvent, dayIndex: number): void {
  if (dragging.value) return;
  const element = event.currentTarget as HTMLElement;
  const rect = element.getBoundingClientRect();
  const minutes = ((event.clientY - rect.top) / HOUR_PX) * MINUTES_PER_HOUR;
  planner.createTask(dayIndex, clamp(minutes, 0, MINUTES_PER_DAY - MIN_DURATION_MINUTES));
}

function startMove(event: PointerEvent, block: PlanBlock): void {
  planner.select(block.taskId);
  beginDrag(event, block, "move");
}

function startResize(event: PointerEvent, block: PlanBlock): void {
  planner.select(block.taskId);
  beginDrag(event, block, "resize");
}

function startResizeStart(event: PointerEvent, block: PlanBlock): void {
  planner.select(block.taskId);
  beginDrag(event, block, "resize-start");
}

function beginDrag(event: PointerEvent, block: PlanBlock, mode: "move" | "resize" | "resize-start"): void {
  drag = {
    taskId: block.taskId,
    mode,
    startY: event.clientY,
    startDay: block.dayIndex,
    startMinutes: block.startMinutes,
    durationMinutes: block.durationMinutes,
    lastDay: block.dayIndex,
    lastMinutes: block.startMinutes,
    lastDuration: block.durationMinutes,
    valid: true,
  };
  dragging.value = true;
  document.body.style.cursor = "grabbing";
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
}

function onPointerMove(event: PointerEvent): void {
  if (!drag) return;
  const delta = snap(((event.clientY - drag.startY) / HOUR_PX) * MINUTES_PER_HOUR);

  if (drag.mode === "move") {
    const dayIndex = dayFromEvent(event) ?? drag.startDay;
    const start = clamp(drag.startMinutes + delta, 0, MINUTES_PER_DAY - drag.durationMinutes);
    drag.lastDay = dayIndex;
    drag.lastMinutes = start;
    drag.valid = planner.previewMove(drag.taskId, dayIndex, start);
  } else if (drag.mode === "resize-start") {
    const end = drag.startMinutes + drag.durationMinutes;
    const start = clamp(drag.startMinutes + delta, 0, end - MIN_DURATION_MINUTES);
    const duration = end - start;
    drag.lastMinutes = start;
    drag.lastDuration = duration;
    drag.valid = planner.previewResizeStart(drag.taskId, drag.startDay, start, duration);
  } else {
    const duration = clamp(drag.durationMinutes + delta, MIN_DURATION_MINUTES, MINUTES_PER_DAY - drag.startMinutes);
    drag.lastDuration = duration;
    drag.valid = planner.previewResize(drag.taskId, duration);
  }

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
  dragging.value = false;
  document.body.style.cursor = "";
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);

  if (!state.valid) {
    planner.clearPreview();
    return;
  }
  if (state.mode === "move") {
    planner.moveTask(state.taskId, state.lastDay, state.lastMinutes);
  } else if (state.mode === "resize-start") {
    planner.resizeStart(state.taskId, state.lastDay, state.lastMinutes, state.lastDuration);
  } else {
    planner.resizeTask(state.taskId, state.lastDuration);
  }
}

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  document.body.style.cursor = "";
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
          @pointerdown="createAt($event, dayIndex)"
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
            <div
              class="absolute inset-x-0 top-0 cursor-ns-resize bg-slate-900/5"
              data-resize="start"
              :style="resizeHandleStyle"
              @pointerdown.stop.prevent="startResizeStart($event, block)"
            ></div>
            <div
              class="absolute inset-x-0 bottom-0 cursor-ns-resize bg-slate-900/5"
              data-resize="end"
              :style="resizeHandleStyle"
              @pointerdown.stop.prevent="startResize($event, block)"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
