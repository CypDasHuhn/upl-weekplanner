<script setup lang="ts">
import { ref } from "vue";
import { session } from "../stores/session";

const { error } = session;
const token = ref("");
const submitting = ref(false);

async function submit(): Promise<void> {
  if (!token.value.trim() || submitting.value) return;
  submitting.value = true;
  await session.login(token.value.trim());
  token.value = "";
  submitting.value = false;
}
</script>

<template>
  <main class="flex min-h-full items-center justify-center bg-slate-100 p-4 dark:bg-slate-950">
    <form
      class="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      @submit.prevent="submit"
    >
      <div>
        <h1 class="text-lg font-semibold tracking-tight text-slate-800 dark:text-slate-100">UPL Weekplanner</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Sign in with your planner token.</p>
      </div>

      <label class="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        Token
        <input
          v-model="token"
          class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-400"
          type="password"
          autocomplete="current-password"
          autofocus
        />
      </label>

      <p
        v-if="error"
        class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
      >
        {{ error }}
      </p>

      <button
        class="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        type="submit"
        :disabled="submitting || !token.trim()"
      >
        {{ submitting ? "Signing in…" : "Sign in" }}
      </button>
    </form>
  </main>
</template>
