<script setup lang="ts">
import { onMounted } from "vue";
import PlannerView from "./PlannerView.vue";
import { session } from "./stores/session";
import LoginView from "./views/LoginView.vue";

const { state, error } = session;

onMounted(() => {
  void session.check();
});

function retry(): void {
  void session.check();
}
</script>

<template>
  <LoginView v-if="state === 'anonymous'" />

  <main
    v-else-if="state === 'offline'"
    class="flex min-h-full items-center justify-center bg-slate-100 p-4 dark:bg-slate-950"
  >
    <div
      class="flex max-w-sm flex-col gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900"
    >
      <p class="text-sm font-medium text-slate-800 dark:text-slate-100">Cannot reach the planner server.</p>
      <p v-if="error" class="text-xs text-slate-500 dark:text-slate-400">{{ error }}</p>
      <button
        class="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        type="button"
        @click="retry"
      >
        Retry
      </button>
    </div>
  </main>

  <main
    v-else-if="state === 'checking'"
    class="flex min-h-full items-center justify-center bg-slate-100 p-4 dark:bg-slate-950"
  >
    <p class="text-sm text-slate-500 dark:text-slate-400">Checking session…</p>
  </main>

  <PlannerView v-else />
</template>
