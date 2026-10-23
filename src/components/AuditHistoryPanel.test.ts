import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../stores/planner", async () => {
  const { ref } = await import("vue");
  return { planner: { weekStart: ref(new Date(2026, 3, 6)) } };
});

vi.mock("../stores/auditHistory", async () => {
  const { ref } = await import("vue");
  return {
    auditHistory: {
      selectedDay: ref("2026-10-23"),
      pathFilter: ref<string | null>("01-personal/planner/2026-W15.upl.json"),
      statusFilter: ref<string | null>(null),
      loading: ref(false),
      loadingMore: ref(false),
      error: ref<string | null>(null),
      unavailable: ref(false),
      entries: ref([]),
      days: ref([]),
      cursor: ref<string | null>(null),
      open: vi.fn(),
      reload: vi.fn(),
      loadMore: vi.fn(),
      setDay: vi.fn(),
      setPath: vi.fn(),
      setStatus: vi.fn(),
      setWeekPath: vi.fn(),
    },
  };
});

import type { AuditEntry } from "../core/auditHistory";
import { auditHistory } from "../stores/auditHistory";
import AuditHistoryPanel from "./AuditHistoryPanel.vue";

const WEEK = "01-personal/planner/2026-W15.upl.json";

enableAutoUnmount(afterEach);

beforeEach(() => {
  vi.clearAllMocks();
  auditHistory.selectedDay.value = "2026-10-23";
  auditHistory.pathFilter.value = WEEK;
  auditHistory.statusFilter.value = null;
  auditHistory.loading.value = false;
  auditHistory.loadingMore.value = false;
  auditHistory.error.value = null;
  auditHistory.unavailable.value = false;
  auditHistory.entries.value = [];
  auditHistory.days.value = [];
  auditHistory.cursor.value = null;
});

describe("audit history panel", () => {
  it("opens from the header and closes again", async () => {
    const wrapper = mount(AuditHistoryPanel, { attachTo: document.body });
    expect(wrapper.find("[data-role='history-panel']").exists()).toBe(false);

    await wrapper.get("[data-action='history-toggle']").trigger("click");

    expect(wrapper.find("[data-role='history-panel']").exists()).toBe(true);
    expect(auditHistory.open).toHaveBeenCalledWith(WEEK);

    await wrapper.get("[data-action='history-close']").trigger("click");

    expect(wrapper.find("[data-role='history-panel']").exists()).toBe(false);
  });

  it("renders changes, task labels and rejected reasons", async () => {
    auditHistory.entries.value = [
      entry({
        id: "entry-1",
        status: "rejected",
        reason: "Task would overlap",
        changes: [{ field: "std.name", target: "task-1", oldValue: "Old", newValue: "New" }],
        createdTaskIds: ["task-2"],
        removedTasks: [{ id: "task-3", "std.name": "Gone" }],
        raw: { id: "entry-1", status: "rejected" },
      }),
    ];

    const wrapper = mount(AuditHistoryPanel, { attachTo: document.body });
    await wrapper.get("[data-action='history-toggle']").trigger("click");

    const article = wrapper.get("[data-entry-id='entry-1']");
    expect(article.get("[data-role='reason']").text()).toBe("Task would overlap");
    expect(article.text()).toContain("std.name");
    expect(article.text()).toContain("Old → New");
    expect(article.get("[data-role='created']").text()).toContain("task-2");
    expect(article.get("[data-role='removed']").text()).toContain("Gone (task-3)");
  });

  it("renders unknown outcomes neutrally and keeps their reason visible", async () => {
    auditHistory.entries.value = [entry({ id: "entry-unknown", status: "unknown", reason: "unclear server response" })];

    const wrapper = mount(AuditHistoryPanel, { attachTo: document.body });
    await wrapper.get("[data-action='history-toggle']").trigger("click");

    const article = wrapper.get("[data-entry-id='entry-unknown']");
    expect(article.get("[data-role='status']").text()).toBe("unknown");
    expect(article.get("[data-role='reason']").text()).toBe("unclear server response");
  });

  it("renders replacement summaries", async () => {
    auditHistory.entries.value = [
      entry({
        id: "entry-replace",
        op: "replace",
        replacement: {
          before: { id: "week", kind: "container", taskCount: 3 },
          after: { id: "week", kind: "container", taskCount: 0 },
        },
      }),
    ];

    const wrapper = mount(AuditHistoryPanel, { attachTo: document.body });
    await wrapper.get("[data-action='history-toggle']").trigger("click");

    expect(wrapper.get("[data-role='replacement']").text()).toBe(
      "week · container · 3 tasks → week · container · 0 tasks",
    );
  });

  it("expands and collapses raw JSON per entry", async () => {
    auditHistory.entries.value = [entry({ id: "entry-1", raw: { id: "entry-1", status: "applied" } })];

    const wrapper = mount(AuditHistoryPanel, { attachTo: document.body });
    await wrapper.get("[data-action='history-toggle']").trigger("click");

    const article = wrapper.get("[data-entry-id='entry-1']");
    expect(article.find("[data-role='raw-json']").exists()).toBe(false);

    await article.get("[data-action='raw-entry-1']").trigger("click");
    expect(article.get("[data-role='raw-json']").text()).toContain('"status": "applied"');

    await article.get("[data-action='raw-entry-1']").trigger("click");
    expect(article.find("[data-role='raw-json']").exists()).toBe(false);
  });

  it("shows the unavailable state without hiding the panel", async () => {
    auditHistory.unavailable.value = true;

    const wrapper = mount(AuditHistoryPanel, { attachTo: document.body });
    await wrapper.get("[data-action='history-toggle']").trigger("click");

    expect(wrapper.get("[data-role='history-unavailable']").text()).toContain("unavailable");
    expect(wrapper.find("[data-action='history-close']").exists()).toBe(true);
  });
});

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "entry",
    serverId: "entry",
    timestamp: "2026-10-23T10:00:00.000Z",
    op: "mutation",
    status: "applied",
    path: WEEK,
    document: null,
    principal: "alice",
    requester: "gantt",
    request: {},
    changes: [],
    createdTaskIds: [],
    removedTasks: [],
    replacement: null,
    reason: null,
    raw: {},
    ...overrides,
  };
}
