<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { normalizeTag, readTags, type TagColor } from "../core/tags";
import { planner } from "../stores/planner";
import { tagColors } from "../stores/tagColors";

const open = ref(false);
const newTag = ref("");
const root = ref<HTMLElement | null>(null);
const { error: saveError, saving } = tagColors;

const tags = computed(() => {
  const names = new Set<string>(tagColors.tags.value);
  for (const task of planner.tasks.value) {
    for (const tag of readTags(task)) names.add(tag);
  }
  for (const tag of Object.keys(tagColors.colors.value)) names.add(tag);
  return [...names].sort((left, right) => left.localeCompare(right));
});

function color(tag: string): TagColor {
  return tagColors.colorFor(tag);
}

function updateColor(tag: string, channel: keyof TagColor, event: Event): void {
  tagColors.setColor(tag, { [channel]: (event.target as HTMLInputElement).value });
}

function addTag(): void {
  const tag = normalizeTag(newTag.value);
  if (!tag) return;
  tagColors.setColor(tag, {});
  newTag.value = "";
}

function resetTag(tag: string): void {
  tagColors.removeColor(tag);
}

function closeOnOutside(event: PointerEvent): void {
  if (!open.value || root.value?.contains(event.target as Node)) return;
  open.value = false;
}

onMounted(() => document.addEventListener("pointerdown", closeOnOutside));
onBeforeUnmount(() => document.removeEventListener("pointerdown", closeOnOutside));
</script>

<template>
  <div ref="root" class="relative">
    <button
      class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      type="button"
      :aria-expanded="open"
      @click="open = !open"
    >
      Tag colors
    </button>

    <section
      v-if="open"
      class="absolute right-0 z-30 mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      @keydown.esc="open = false"
    >
      <header class="mb-3 flex items-center justify-between">
        <div>
          <h2 class="text-sm font-semibold text-slate-800 dark:text-slate-100">Tag colors</h2>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">
            Text and block color per tag, shared through the planner workspace. Multiple tags stripe the block.
          </p>
          <p v-if="saving" class="text-[11px] text-slate-400 dark:text-slate-500">Saving…</p>
          <p v-else-if="saveError" class="text-[11px] text-red-600 dark:text-red-400">{{ saveError }}</p>
        </div>
        <button
          class="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          type="button"
          @click="open = false"
        >
          Close
        </button>
      </header>

      <div
        v-if="tags.length === 0"
        class="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
      >
        Add tags to a task first, or create a tag color below.
      </div>

      <div v-else class="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
        <div
          v-for="tag in tags"
          :key="tag"
          :data-tag="tag"
          class="flex items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700"
        >
          <span class="min-w-0 flex-1 truncate text-xs font-medium text-slate-700 dark:text-slate-300">#{{ tag }}</span>
          <label class="flex items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
            Text
            <input
              class="h-7 w-8 cursor-pointer rounded border border-slate-300 bg-white p-0.5 dark:border-slate-600 dark:bg-slate-950"
              type="color"
              :value="color(tag).text"
              @input="updateColor(tag, 'text', $event)"
            />
          </label>
          <label class="flex items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
            Block
            <input
              class="h-7 w-8 cursor-pointer rounded border border-slate-300 bg-white p-0.5 dark:border-slate-600 dark:bg-slate-950"
              type="color"
              :value="color(tag).background"
              @input="updateColor(tag, 'background', $event)"
            />
          </label>
          <button
            class="rounded px-1.5 py-1 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            type="button"
            title="Reset to default"
            @click="resetTag(tag)"
          >
            Reset
          </button>
        </div>
      </div>

      <form class="mt-3 flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-700" @submit.prevent="addTag">
        <input
          v-model="newTag"
          class="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-400"
          placeholder="new tag"
          type="text"
        />
        <button
          class="rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          type="submit"
        >
          Add
        </button>
      </form>
    </section>
  </div>
</template>
