import { ref } from "vue";
import {
  loadAuditHistory,
  loadAuditHistoryDays,
  type AuditDay,
  type AuditEntry,
  type AuditStatus,
} from "../core/auditHistory";
import { ServerError } from "../core/server";
import { localDateKey } from "../core/week";
import { session } from "./session";

const PAGE_SIZE = 50;

export function createAuditHistory() {
  const selectedDay = ref(localDateKey(new Date()));
  const pathFilter = ref<string | null>(null);
  const statusFilter = ref<AuditStatus | null>(null);
  const loading = ref(false);
  const loadingMore = ref(false);
  const error = ref<string | null>(null);
  const unavailable = ref(false);
  const entries = ref<AuditEntry[]>([]);
  const days = ref<AuditDay[]>([]);
  const cursor = ref<string | null>(null);
  const weekPath = ref<string | null>(null);

  let followingWeek = true;
  let followingToday = true;
  let generation = 0;

  function open(currentWeekPath: string): Promise<boolean> {
    weekPath.value = currentWeekPath;
    followingWeek = true;
    followingToday = true;
    selectedDay.value = localDateKey(new Date());
    pathFilter.value = currentWeekPath;
    return reload();
  }

  function setDay(day: string): Promise<boolean> {
    if (!day) return Promise.resolve(false);
    followingToday = false;
    selectedDay.value = day;
    return reload();
  }

  function setPath(path: string): Promise<boolean> {
    const nextPath = path.trim() || null;
    followingWeek = nextPath !== null && nextPath === weekPath.value;
    pathFilter.value = nextPath;
    return reload();
  }

  function setStatus(status: AuditStatus | null): Promise<boolean> {
    statusFilter.value = status;
    return reload();
  }

  function setWeekPath(path: string): void {
    weekPath.value = path;
    if (!followingWeek || pathFilter.value === path) return;
    pathFilter.value = path;
    void reload();
  }

  async function reload(): Promise<boolean> {
    const current = ++generation;
    loading.value = true;
    loadingMore.value = false;
    error.value = null;
    unavailable.value = false;

    const query = {
      date: followingToday ? undefined : selectedDay.value,
      path: pathFilter.value,
      status: statusFilter.value,
      limit: PAGE_SIZE,
    };

    try {
      const [dayList, page] = await Promise.all([loadAuditHistoryDays(), loadAuditHistory(query)]);
      if (current !== generation) return false;
      days.value = dayList;
      if (followingToday && page.date) selectedDay.value = page.date;
      entries.value = filterAndSort(page.entries);
      cursor.value = page.cursor;
      return true;
    } catch (caught) {
      if (current !== generation) return false;
      return fail(caught, true);
    } finally {
      if (current === generation) loading.value = false;
    }
  }

  async function loadMore(): Promise<boolean> {
    if (!cursor.value || loading.value || loadingMore.value) return false;
    const current = generation;
    const before = cursor.value;
    loadingMore.value = true;
    error.value = null;

    const query = {
      date: selectedDay.value,
      path: pathFilter.value,
      status: statusFilter.value,
      limit: PAGE_SIZE,
      before,
    };

    try {
      const page = await loadAuditHistory(query);
      if (current !== generation) return false;
      entries.value = mergeEntries(entries.value, filterAndSort(page.entries));
      cursor.value = page.cursor;
      return true;
    } catch (caught) {
      if (current !== generation) return false;
      return fail(caught, false);
    } finally {
      if (current === generation) loadingMore.value = false;
    }
  }

  function fail(caught: unknown, reset: boolean): false {
    if (caught instanceof ServerError && caught.status === 401) {
      session.expire();
      return false;
    }
    if (caught instanceof ServerError && caught.status === 404) {
      unavailable.value = true;
      error.value = null;
      clear(reset);
      return false;
    }
    error.value = message(caught);
    clear(reset);
    return false;
  }

  function clear(reset: boolean): void {
    if (!reset) return;
    entries.value = [];
    cursor.value = null;
  }

  function filterAndSort(source: AuditEntry[]): AuditEntry[] {
    const selectedPath = pathFilter.value;
    const selectedStatus = statusFilter.value;
    const filtered = source.filter((entry) => {
      const matchesPath = !selectedPath || entry.path === selectedPath;
      const matchesStatus = !selectedStatus || entry.status === selectedStatus;
      return matchesPath && matchesStatus;
    });
    return sortEntries(dedupe(filtered));
  }

  function mergeEntries(existing: AuditEntry[], incoming: AuditEntry[]): AuditEntry[] {
    return sortEntries(dedupe([...existing, ...incoming]));
  }

  function dedupe(source: AuditEntry[]): AuditEntry[] {
    const byId = new Map<string, AuditEntry>();
    for (const entry of source) {
      if (!byId.has(entry.id)) byId.set(entry.id, entry);
    }
    return [...byId.values()];
  }

  function sortEntries(source: AuditEntry[]): AuditEntry[] {
    return [...source].sort((left, right) => timestampOf(right) - timestampOf(left));
  }

  function timestampOf(entry: AuditEntry): number {
    const timestamp = Date.parse(entry.timestamp);
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  function message(caught: unknown): string {
    return caught instanceof Error ? caught.message : String(caught);
  }

  return {
    selectedDay,
    pathFilter,
    statusFilter,
    loading,
    loadingMore,
    error,
    unavailable,
    entries,
    days,
    cursor,
    weekPath,
    open,
    reload,
    loadMore,
    setDay,
    setPath,
    setStatus,
    setWeekPath,
  };
}

export const auditHistory = createAuditHistory();

export type AuditHistoryStore = ReturnType<typeof createAuditHistory>;
