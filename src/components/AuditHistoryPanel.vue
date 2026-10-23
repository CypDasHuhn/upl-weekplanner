<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  type AuditDocumentSummary,
  type AuditEntry,
  type AuditReplacement,
  type AuditStatus,
} from "../core/auditHistory";
import { weekDocumentPath } from "../core/week";
import { auditHistory } from "../stores/auditHistory";
import { planner } from "../stores/planner";

const { selectedDay, pathFilter, statusFilter, loading, loadingMore, error, unavailable, entries, days, cursor } =
  auditHistory;
const open = ref(false);
const expandedRaw = ref<string[]>([]);

const timestampFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const weekPath = computed(() => weekDocumentPath(planner.weekStart.value));

function togglePanel(): void {
  open.value = !open.value;
  if (open.value) void auditHistory.open(weekPath.value);
}

function selectDay(day: string): void {
  void auditHistory.setDay(day);
}

function selectPath(event: Event): void {
  void auditHistory.setPath((event.target as HTMLSelectElement).value);
}

function selectStatus(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  const status: AuditStatus | null = value === "applied" || value === "rejected" ? value : null;
  void auditHistory.setStatus(status);
}

function toggleRaw(id: string): void {
  expandedRaw.value = expandedRaw.value.includes(id)
    ? expandedRaw.value.filter((entryId) => entryId !== id)
    : [...expandedRaw.value, id];
}

function isRawOpen(id: string): boolean {
  return expandedRaw.value.includes(id);
}

function formatTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value || "unknown" : timestampFormat.format(timestamp);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function summaryLabel(summary: AuditDocumentSummary | null): string {
  if (!summary) return "unknown";
  const parts = [summary.id, summary.kind];
  if (summary.taskCount !== undefined) parts.push(`${summary.taskCount} tasks`);
  return parts.filter((part) => part !== undefined).join(" · ") || "document";
}

function replacementLabel(replacement: AuditReplacement): string {
  return `${summaryLabel(replacement.before)} → ${summaryLabel(replacement.after)}`;
}

function taskLabel(task: AuditEntry["removedTasks"][number]): string {
  const name = task["std.name"];
  return typeof name === "string" ? `${name} (${task.id})` : task.id;
}

function rawJson(entry: AuditEntry): string {
  return JSON.stringify(entry.raw ?? {}, null, 2);
}

watch(weekPath, (path) => {
  if (open.value) auditHistory.setWeekPath(path);
});
</script>

<template>
  <div>
    <button
      class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      type="button"
      data-action="history-toggle"
      :aria-expanded="open"
      @click="togglePanel"
    >
      History
    </button>

    <div v-if="open" class="fixed inset-0 z-40 flex justify-end" @keydown.esc="open = false">
      <div class="absolute inset-0 bg-slate-900/20" @click="open = false"></div>

      <aside
        class="relative flex h-full w-[30rem] max-w-full flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        data-role="history-panel"
      >
        <header class="flex items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
          <div>
            <h2 class="text-sm font-semibold text-slate-800 dark:text-slate-100">Mutation history</h2>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">
              Read-only audit of writes that reached the vault.
            </p>
          </div>
          <button
            class="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            type="button"
            data-action="history-close"
            @click="open = false"
          >
            Close
          </button>
        </header>

        <section class="flex flex-col gap-2 border-b border-slate-200 p-4 dark:border-slate-700">
          <label class="flex flex-col gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
            Day
            <input
              class="rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              type="date"
              :value="selectedDay"
              data-role="day-filter"
              @change="selectDay(($event.target as HTMLInputElement).value)"
            />
          </label>

          <div v-if="days.length > 0" class="flex max-h-16 flex-wrap gap-1 overflow-y-auto">
            <button
              v-for="day in days"
              :key="day.date"
              class="rounded border px-1.5 py-0.5 text-[10px]"
              :class="
                day.date === selectedDay
                  ? 'border-slate-700 bg-slate-800 text-white dark:border-slate-300 dark:bg-slate-100 dark:text-slate-900'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
              "
              type="button"
              :data-day="day.date"
              @click="selectDay(day.date)"
            >
              {{ day.date }} ({{ day.count }})
            </button>
          </div>

          <label class="flex flex-col gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
            Document
            <select
              class="rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              :value="pathFilter ?? ''"
              data-role="path-filter"
              @change="selectPath"
            >
              <option :value="weekPath">{{ weekPath }}</option>
              <option value="">All documents</option>
            </select>
          </label>

          <label class="flex flex-col gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
            Status
            <select
              class="rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              :value="statusFilter ?? ''"
              data-role="status-filter"
              @change="selectStatus"
            >
              <option value="">All statuses</option>
              <option value="applied">Applied</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
        </section>

        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <p
            v-if="loading && entries.length === 0"
            class="text-xs text-slate-500 dark:text-slate-400"
            data-role="history-loading"
          >
            Loading history…
          </p>
          <p
            v-else-if="unavailable"
            class="rounded-md border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
            data-role="history-unavailable"
          >
            History is unavailable on this server. The planner keeps working.
          </p>
          <p
            v-else-if="entries.length === 0 && error"
            class="text-xs text-red-600 dark:text-red-400"
            data-role="history-error"
          >
            {{ error }}
          </p>
          <p
            v-else-if="entries.length === 0"
            class="text-xs text-slate-500 dark:text-slate-400"
            data-role="history-empty"
          >
            No history entries for this day and filter.
          </p>

          <div v-else class="flex flex-col gap-2">
            <p v-if="error" class="text-xs text-red-600 dark:text-red-400" data-role="history-error">{{ error }}</p>
            <article
              v-for="entry in entries"
              :key="entry.id"
              class="rounded-lg border border-slate-200 p-3 dark:border-slate-700"
              :data-entry-id="entry.id"
            >
              <header class="flex flex-wrap items-center gap-2 text-[11px]">
                <span
                  class="rounded px-1.5 py-0.5 font-medium"
                  :class="
                    entry.status === 'rejected'
                      ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                      : entry.status === 'applied'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  "
                  data-role="status"
                >
                  {{ entry.status }}
                </span>
                <span class="text-slate-500 dark:text-slate-400">{{ formatTimestamp(entry.timestamp) }}</span>
                <span class="min-w-0 flex-1 truncate font-mono text-slate-600 dark:text-slate-300">{{
                  entry.path
                }}</span>
              </header>

              <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {{ entry.op }} · requester {{ entry.requester ?? "—" }} · principal {{ entry.principal ?? "—" }}
              </p>

              <p
                v-if="entry.reason || entry.status === 'rejected'"
                class="mt-1 text-[11px] text-red-600 dark:text-red-400"
                data-role="reason"
              >
                {{ entry.reason ?? "Rejected" }}
              </p>

              <p
                v-if="entry.op === 'replace' && entry.replacement"
                class="mt-1 text-[11px] text-slate-600 dark:text-slate-300"
                data-role="replacement"
              >
                {{ replacementLabel(entry.replacement) }}
              </p>

              <ul v-if="entry.changes.length > 0" class="mt-2 flex flex-col gap-1 text-[11px]" data-role="changes">
                <li
                  v-for="(change, index) in entry.changes"
                  :key="`${entry.id}-${index}`"
                  class="text-slate-600 dark:text-slate-300"
                >
                  <span class="font-mono">{{ change.field }}</span>
                  <span v-if="change.target" class="text-slate-500 dark:text-slate-400"> on {{ change.target }}</span
                  >: {{ formatValue(change.oldValue) }} → {{ formatValue(change.newValue) }}
                </li>
              </ul>

              <p
                v-if="entry.createdTaskIds.length > 0"
                class="mt-1 text-[11px] text-slate-600 dark:text-slate-300"
                data-role="created"
              >
                Created: {{ entry.createdTaskIds.join(", ") }}
              </p>
              <p
                v-if="entry.removedTasks.length > 0"
                class="mt-1 text-[11px] text-slate-600 dark:text-slate-300"
                data-role="removed"
              >
                Removed: {{ entry.removedTasks.map(taskLabel).join(", ") }}
              </p>

              <button
                class="mt-2 rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                type="button"
                :data-action="`raw-${entry.id}`"
                @click="toggleRaw(entry.id)"
              >
                {{ isRawOpen(entry.id) ? "Hide raw JSON" : "Raw JSON" }}
              </button>
              <pre
                v-if="isRawOpen(entry.id)"
                class="mt-1 max-h-64 overflow-auto rounded bg-slate-950 p-2 text-[10px] text-slate-100"
                data-role="raw-json"
                >{{ rawJson(entry) }}</pre>
            </article>
          </div>
        </div>

        <footer class="border-t border-slate-200 p-3 dark:border-slate-700">
          <button
            v-if="cursor && !unavailable"
            class="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            type="button"
            data-action="load-more"
            :disabled="loadingMore"
            @click="auditHistory.loadMore()"
          >
            {{ loadingMore ? "Loading older entries…" : "Load older entries" }}
          </button>
        </footer>
      </aside>
    </div>
  </div>
</template>
