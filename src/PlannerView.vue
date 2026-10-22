<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import TaskSidebar from "./components/TaskSidebar.vue";
import WeekGrid from "./components/WeekGrid.vue";
import { addDays } from "./core/time";
import { planner } from "./stores/planner";
import { session } from "./stores/session";

const { weekStart, blocks, selectedId, selectedTask, error, loading, saving, syncError } = planner;
const fileInput = ref<HTMLInputElement | null>(null);

const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const weekLabel = computed(
  () => `${dateFormat.format(weekStart.value)} – ${dateFormat.format(addDays(weekStart.value, 6))}`,
);

function exportDocument(): void {
  const blob = new Blob([JSON.stringify(planner.document.value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "week.upl.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function openImport(): void {
  fileInput.value?.click();
}

async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) planner.importDocument(await file.text());
  input.value = "";
}

function reload(): void {
  void planner.load();
}

function signOut(): void {
  void session.logout();
}

function onKeydown(event: KeyboardEvent): void {
  const editing = isEditing(event.target);
  const appHistory = !editing || isPristineTaskName(event.target);

  if ((event.ctrlKey || event.metaKey) && !event.altKey && appHistory) {
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      if (planner.undo()) event.preventDefault();
      return;
    }
    if (key === "y" || (key === "z" && event.shiftKey)) {
      if (planner.redo()) event.preventDefault();
      return;
    }
  }

  if (editing) return;
  if (event.key !== "Delete" && event.key !== "Backspace") return;
  if (!selectedTask.value) return;
  planner.deleteTask(selectedTask.value.id);
}

function isEditing(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return element?.tagName === "INPUT" || element?.tagName === "TEXTAREA" || element?.isContentEditable === true;
}

function isPristineTaskName(target: EventTarget | null): boolean {
  const element = target as HTMLInputElement | null;
  return element?.dataset.role === "task-name" && element.value === selectedTask.value?.["std.name"];
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  void planner.load();
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <main class="flex h-full flex-col gap-3 bg-slate-100 p-4">
    <header class="flex flex-wrap items-center gap-3">
      <div class="mr-2">
        <h1 class="text-lg font-semibold tracking-tight text-slate-800">UPL Weekplanner</h1>
        <p class="text-xs text-slate-500">{{ weekLabel }}</p>
      </div>

      <div class="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white">
        <button
          class="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          type="button"
          @click="planner.shiftWeek(-1)"
        >
          Prev
        </button>
        <button
          class="border-x border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          type="button"
          @click="planner.goToday"
        >
          Today
        </button>
        <button
          class="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          type="button"
          @click="planner.shiftWeek(1)"
        >
          Next
        </button>
      </div>

      <div class="ml-auto flex items-center gap-2">
        <span v-if="saving" class="text-xs text-slate-400">Saving…</span>
        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          type="button"
          @click="openImport"
        >
          Import
        </button>
        <button
          class="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
          type="button"
          @click="exportDocument"
        >
          Export
        </button>
        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          type="button"
          @click="signOut"
        >
          Sign out
        </button>
        <input
          ref="fileInput"
          class="hidden"
          type="file"
          accept=".json,.upl.json,application/json"
          @change="importFile"
        />
      </div>
    </header>

    <p v-if="error" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{{ error }}</p>

    <p v-if="syncError" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      {{ syncError }}
      <button class="ml-2 font-medium underline" type="button" @click="reload">Reload</button>
    </p>

    <div v-if="loading" class="flex flex-1 items-center justify-center text-sm text-slate-500">Loading planner…</div>
    <div v-else class="flex min-h-0 flex-1 gap-4">
      <WeekGrid class="min-w-0 flex-1" :blocks="blocks" :selected-id="selectedId" />
      <TaskSidebar class="hidden lg:flex" />
    </div>

    <p class="text-[11px] text-slate-400">
      Double-click empty space to add. Drag an edge to push, Shift-drag to pull, Ctrl-drag to stretch, Alt-drag to
      overlap. Drag a block to move it. Ctrl-Z undoes, Ctrl-Y redoes. Data is stored in the server vault as UTC ISO
      times.
    </p>
  </main>
</template>
