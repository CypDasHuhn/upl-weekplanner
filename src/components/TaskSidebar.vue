<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { parseTags, readTags } from "../core/tags";
import { formatClock, parseIsoDuration } from "../core/time";
import { planner } from "../stores/planner";

const { selectedTask, selectedId, blocks, nameFocusId } = planner;
const title = ref("");
const tags = ref("");
const nameInput = ref<HTMLInputElement | null>(null);

watch(
  selectedTask,
  (task) => {
    title.value = typeof task?.["std.name"] === "string" ? task["std.name"] : "";
    tags.value = readTags(task).join(", ");
  },
  { immediate: true },
);

watch(nameFocusId, async (taskId) => {
  if (!taskId) return;
  await nextTick();
  if (nameFocusId.value !== taskId) return;
  nameInput.value?.focus();
  nameInput.value?.select();
  planner.clearNameFocus();
});

const start = computed(() => {
  const value = selectedTask.value?.["std.time.start"];
  return typeof value === "string" ? new Date(value) : null;
});

const duration = computed(() => parseIsoDuration(selectedTask.value?.["std.time.duration"]));

const dayLabel = computed(() => {
  if (!start.value) return "";
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(start.value);
});

const timeLabel = computed(() => {
  if (!start.value || duration.value === null) return "";
  const from = formatClock(start.value.getHours() * 60 + start.value.getMinutes());
  const to = formatClock(start.value.getHours() * 60 + start.value.getMinutes() + duration.value);
  return `${from}–${to}`;
});

function commitTitle(): void {
  if (selectedTask.value) planner.renameTask(selectedTask.value.id, title.value);
}

function commitTags(): void {
  if (selectedTask.value) planner.setTags(selectedTask.value.id, parseTags(tags.value));
}

function toggleClosed(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  if (selectedTask.value) planner.setClosed(selectedTask.value.id, checked);
}

function remove(): void {
  if (selectedTask.value) planner.deleteTask(selectedTask.value.id);
}
</script>

<template>
  <aside
    class="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
  >
    <section v-if="selectedTask" class="flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-700 dark:text-slate-300">Task</h2>
        <button
          class="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
          type="button"
          @click="remove"
        >
          Delete
        </button>
      </div>

      <label class="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        Name
        <input
          ref="nameInput"
          v-model="title"
          data-role="task-name"
          class="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-400"
          type="text"
          @change="commitTitle"
          @keyup.enter="commitTitle"
        />
      </label>

      <label class="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        Tags
        <input
          v-model="tags"
          class="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-400"
          placeholder="work, urgent"
          type="text"
          @change="commitTags"
          @keyup.enter="commitTags"
        />
      </label>

      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt class="text-slate-400 dark:text-slate-500">When</dt>
        <dd class="text-slate-700 dark:text-slate-300">{{ dayLabel }} · {{ timeLabel }}</dd>
        <dt class="text-slate-400 dark:text-slate-500">Duration</dt>
        <dd class="text-slate-700 dark:text-slate-300">{{ duration === null ? "—" : `${duration} min` }}</dd>
      </dl>

      <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          class="h-4 w-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-950"
          :checked="selectedTask['std.status.closed'] === true"
          @change="toggleClosed"
        />
        Closed
      </label>
    </section>

    <section
      v-else
      class="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
    >
      Select a block to edit it.
    </section>

    <section class="flex min-h-0 flex-col gap-2">
      <h2 class="text-sm font-semibold text-slate-700 dark:text-slate-300">This week</h2>
      <button
        v-for="block in blocks"
        :key="block.taskId"
        type="button"
        class="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors"
        :class="
          selectedId === block.taskId
            ? 'border-slate-400 bg-slate-100 dark:border-slate-500 dark:bg-slate-800'
            : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
        "
        @click="planner.select(block.taskId)"
      >
        <span class="truncate" :class="{ 'line-through opacity-60': block.closed }">{{ block.title }}</span>
        <span class="shrink-0 tabular-nums text-slate-400 dark:text-slate-500">{{
          formatClock(block.startMinutes)
        }}</span>
      </button>
    </section>
  </aside>
</template>
