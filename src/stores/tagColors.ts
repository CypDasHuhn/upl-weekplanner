import { ref } from "vue";
import {
  applyRequestsOnServer,
  loadDocumentFromServer,
  loadTagsFromServer,
  replaceDocumentOnServer,
  ServerError,
} from "../core/server";
import { defaultTagColor, normalizeTag, type TagColor, type TagColors } from "../core/tags";
import { PLANNER_DIRECTORY } from "../core/week";
import {
  emptyWorkspaceDocument,
  readTagColors,
  serializeTagColors,
  TAG_COLORS_FIELD,
  WORKSPACE_PATH,
} from "../core/workspace";
import { session } from "./session";

const STORAGE_KEY = "upl-weekplanner.tag-colors.v1";
const SAVE_DELAY = 300;

export function createTagColors(initial: TagColors = loadTagColors()) {
  const colors = ref<TagColors>(initial);
  const tags = ref<string[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  let missing = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queue: Promise<void> = Promise.resolve();
  let pending = 0;

  async function load(): Promise<boolean> {
    loading.value = true;
    const tagsRequest = loadKnownTags();
    try {
      const document = await loadDocumentFromServer(WORKSPACE_PATH);
      colors.value = readTagColors(document[TAG_COLORS_FIELD]);
      missing = false;
      saveTagColors(colors.value);
      error.value = null;
      return true;
    } catch (caught) {
      if (caught instanceof ServerError && caught.status === 404) {
        missing = true;
        if (Object.keys(colors.value).length > 0) scheduleSave();
        return true;
      }
      if (caught instanceof ServerError && caught.status === 401) {
        session.expire();
        return false;
      }
      error.value = message(caught);
      return false;
    } finally {
      await tagsRequest;
      loading.value = false;
    }
  }

  async function loadKnownTags(): Promise<void> {
    try {
      tags.value = await loadTagsFromServer(PLANNER_DIRECTORY);
    } catch (caught) {
      if (caught instanceof ServerError && caught.status === 401) session.expire();
    }
  }

  function colorFor(tag: string): TagColor {
    return colors.value[tag] ?? defaultTagColor(tag);
  }

  function setColor(tag: string, patch: Partial<TagColor>): void {
    const name = normalizeTag(tag);
    if (!name) return;
    colors.value = { ...colors.value, [name]: { ...colorFor(name), ...patch } };
    scheduleSave();
  }

  function removeColor(tag: string): void {
    const name = normalizeTag(tag);
    if (!name || !(name in colors.value)) return;
    const next = { ...colors.value };
    delete next[name];
    colors.value = next;
    scheduleSave();
  }

  function scheduleSave(): void {
    saveTagColors(colors.value);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, SAVE_DELAY);
  }

  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pending += 1;
    saving.value = true;
    queue = queue
      .then(async () => {
        try {
          if (missing) {
            await replaceDocumentOnServer(WORKSPACE_PATH, emptyWorkspaceDocument());
            missing = false;
          }
          await applyRequestsOnServer(WORKSPACE_PATH, [
            {
              requester: "weekplanner",
              mutations: [{ field: TAG_COLORS_FIELD, value: serializeTagColors(colors.value) }],
            },
          ]);
          error.value = null;
        } catch (caught) {
          if (caught instanceof ServerError && caught.status === 401) {
            session.expire();
          }
          error.value = message(caught);
        }
      })
      .finally(() => {
        pending -= 1;
        saving.value = pending > 0;
      });
    return queue;
  }

  return { colors, tags, loading, saving, error, load, colorFor, setColor, removeColor, flush };
}

export const tagColors = createTagColors();

function loadTagColors(): TagColors {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) return {};

  try {
    return readTagColors(JSON.parse(raw));
  } catch {
    storage()?.removeItem(STORAGE_KEY);
    return {};
  }
}

function saveTagColors(colors: TagColors): void {
  storage()?.setItem(STORAGE_KEY, JSON.stringify(colors));
}

function storage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function message(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}
