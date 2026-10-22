import { ref, watch } from "vue";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "upl-weekplanner.theme.v1";

export function createTheme(initial: ThemeMode = loadTheme()) {
  const mode = ref<ThemeMode>(initial);
  apply(mode.value);

  watch(
    mode,
    (value) => {
      save(value);
      apply(value);
    },
    { flush: "sync" },
  );

  function toggle(): void {
    mode.value = mode.value === "dark" ? "light" : "dark";
  }

  return { mode, toggle };
}

export const theme = createTheme();

function loadTheme(): ThemeMode {
  const stored = storage()?.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return media()?.matches ? "dark" : "light";
}

function save(value: ThemeMode): void {
  storage()?.setItem(STORAGE_KEY, value);
}

function apply(value: ThemeMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", value === "dark");
  document.documentElement.style.colorScheme = value;
}

function storage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function media(): MediaQueryList | null {
  return typeof window === "undefined" || typeof window.matchMedia !== "function"
    ? null
    : window.matchMedia("(prefers-color-scheme: dark)");
}
