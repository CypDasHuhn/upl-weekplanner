import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const server = vi.hoisted(() => {
  class ServerError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
      this.name = "ServerError";
    }
  }
  return {
    loadDocumentFromServer: vi.fn(),
    loadTagsFromServer: vi.fn(),
    applyRequestsOnServer: vi.fn(),
    replaceDocumentOnServer: vi.fn(),
    ServerError,
  };
});

vi.mock("../core/server", () => server);

import { tagColors } from "../stores/tagColors";
import TagColorSettings from "./TagColorSettings.vue";

vi.mock("../stores/planner", async () => {
  const { ref } = await import("vue");
  return {
    planner: {
      tasks: ref([
        { id: "a", "std.tags": ["work", "urgent"] },
        { id: "b", "std.tags": ["work"] },
      ]),
    },
  };
});

enableAutoUnmount(afterEach);

beforeEach(() => {
  localStorage.clear();
  server.applyRequestsOnServer.mockResolvedValue({});
  server.replaceDocumentOnServer.mockResolvedValue({});
  tagColors.removeColor("work");
  tagColors.removeColor("urgent");
});

afterEach(async () => {
  tagColors.removeColor("work");
  tagColors.removeColor("urgent");
  await tagColors.flush();
  vi.clearAllMocks();
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("tag color settings", () => {
  it("lists task tags and updates their colors", async () => {
    const wrapper = mount(TagColorSettings, { attachTo: document.body });
    await wrapper.get("button").trigger("click");

    const row = wrapper.get("[data-tag='work']");
    const inputs = row.findAll("input[type='color']");
    const text = inputs[0];
    const background = inputs[1];
    if (!text || !background) throw new Error("missing tag color inputs");

    await text.setValue("#112233");
    await background.setValue("#aabbcc");

    expect(tagColors.colorFor("work")).toEqual({ text: "#112233", background: "#aabbcc" });
  });
});
